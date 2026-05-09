import os
import base64
import json
import logging
import asyncio
from typing import List, Optional, Dict
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
import ollama
import numpy as np
from PIL import Image
import io
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import models
import auth

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./agapita.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgapitaServer")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    # Create tables
    models.Base.metadata.create_all(bind=engine)
    # Trigger seeding when the server starts and loop is running
    asyncio.create_task(ai_engine.seed_data())
    yield

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize FastAPI
app = FastAPI(title="Agapita Edge Server", lifespan=lifespan)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role.value, "id": user.id}
    )
    
    # Return additional info for convenience
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role.value,
        "username": user.username,
        "id": user.id
    }

# Admin Endpoints
@app.get("/api/admin/patients")
async def get_patients(db: Session = Depends(get_db)):
    return db.query(models.Patient).all()

@app.get("/api/admin/caretakers")
async def get_caretakers(db: Session = Depends(get_db)):
    return db.query(models.Caretaker).all()

@app.post("/api/admin/assign")
async def assign_patient(caretaker_id: int, patient_id: int, db: Session = Depends(get_db)):
    caretaker = db.query(models.Caretaker).filter(models.Caretaker.id == caretaker_id).first()
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not caretaker or not patient:
        raise HTTPException(status_code=404, detail="Caretaker or Patient not found")
    
    if patient not in caretaker.patients:
        caretaker.patients.append(patient)
        db.commit()
    return {"message": "Patient assigned successfully"}

@app.get("/api/admin/users")
async def get_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return [{"id": u.id, "username": u.username, "role": u.role.value} for u in users]

@app.patch("/api/admin/users/{user_id}")
async def update_user(user_id: int, data: dict, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if "username" in data:
        user.username = data["username"]
    if "password" in data:
        user.hashed_password = auth.get_password_hash(data["password"])
    
    db.commit()
    return {"message": "User updated successfully"}

# Record Management Endpoints
@app.get("/api/admin/records")
async def get_all_records(db: Session = Depends(get_db)):
    records = db.query(models.MedicalRecord).all()
    # Map patient names for easier UI display
    results = []
    for r in records:
        p = db.query(models.Patient).filter(models.Patient.id == r.patient_id_fk).first() if r.patient_id_fk else None
        results.append({
            "id": r.id,
            "content": r.content,
            "patient_id_fk": r.patient_id_fk,
            "patient_name": p.name if p else None
        })
    return results

@app.post("/api/admin/records/{record_id}/assign")
async def assign_record(record_id: int, patient_id: Optional[int] = None, db: Session = Depends(get_db)):
    record = db.query(models.MedicalRecord).filter(models.MedicalRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # If patient_id is 0 or -1, unassign (some UIs send 0 for null)
    if patient_id and patient_id > 0:
        record.patient_id_fk = patient_id
    else:
        record.patient_id_fk = None
        
    db.commit()
    # Reload vector store to reflect changes in RAG
    await ai_engine.reload_vector_store(db)
    
    # Notify patient client if they are connected
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if patient:
        records = [r.content for r in patient.medical_records]
        await sio.emit('records_update', {'records': records}, room=f"patient_{patient.patient_id}")
    
    return {"message": "Record assigned successfully"}

@app.get("/")
async def root():
    return {"message": "Agapita Edge Server is running", "version": "0.1.0"}

@app.get("/queue")
async def queue_status():
    """Health check endpoint for queue-based probes."""
    return {"status": "ready", "queue_depth": 0}

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.io
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Constants - Stable models for edge performance
VLM_MODEL = "llava" 
LLM_MODEL = "gemma"
EMBED_MODEL = "nomic-embed-text"
CONFIDENCE_THRESHOLD = 0.70

class SimpleVectorStore:
    """Simple in-memory vector store using numpy."""
    def __init__(self):
        self.embeddings: Dict[str, List[Dict]] = {} # patient_id -> list of {text, vector}

    async def add_record(self, patient_id: str, text: str):
        response = ollama.embeddings(model=EMBED_MODEL, prompt=text)
        vector = np.array(response['embedding'])
        if patient_id not in self.embeddings:
            self.embeddings[patient_id] = []
        self.embeddings[patient_id].append({"text": text, "vector": vector})

    def clear(self):
        self.embeddings = {}

    def search(self, patient_id: str, query_text: str, top_k: int = 2) -> List[str]:
        if patient_id not in self.embeddings:
            return []
        
        query_resp = ollama.embeddings(model=EMBED_MODEL, prompt=query_text)
        query_vec = np.array(query_resp['embedding'])
        
        results = []
        for record in self.embeddings[patient_id]:
            sim = np.dot(query_vec, record['vector']) / (np.linalg.norm(query_vec) * np.linalg.norm(record['vector']))
            results.append((sim, record['text']))
        
        results.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in results[:top_k]]

class AIEngine:
    """Interface for VLM, LLM and RAG operations via Ollama."""
    def __init__(self):
        self.vector_store = SimpleVectorStore()
        # Seeding will be triggered by the FastAPI startup event

    async def reload_vector_store(self, db: Session):
        """Clears and re-populates the vector store from the database."""
        logger.info("Reloading vector store...")
        self.vector_store.clear()
        all_records = db.query(models.MedicalRecord).filter(models.MedicalRecord.patient_id_fk != None).all()
        for rec in all_records:
            p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
            if p:
                await self.vector_store.add_record(p.patient_id, rec.content)
        logger.info(f"Reloaded {len(all_records)} records into Vector Store.")

    def _upsert_user(self, db, username: str, plain_password: str, role) -> "models.User":
        """
        Upsert a seed user: create them if they don't exist, or re-hash their
        password if the stored hash is broken/missing (i.e. verify fails).
        This prevents a corrupt early-development DB from permanently locking
        users out across server restarts.
        """
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            user = models.User(
                username=username,
                hashed_password=auth.get_password_hash(plain_password),
                role=role,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"Seed: created user '{username}'.")
        else:
            # Verify the stored hash is valid for the expected seed password.
            # If it's not (e.g. hash was empty/corrupted from an early run),
            # overwrite it with a fresh hash.
            try:
                valid = auth.verify_password(plain_password, user.hashed_password)
            except Exception:
                valid = False
            if not valid:
                user.hashed_password = auth.get_password_hash(plain_password)
                db.commit()
                logger.warning(f"Seed: fixed broken password hash for '{username}'.")
        return user

    async def seed_data(self):
        await asyncio.sleep(2) # Wait for server to start
        logger.info("Seeding initial patient records from database...")
        db = SessionLocal()
        try:
            # Upsert admin
            self._upsert_user(db, "admin", "123", models.UserRole.ADMIN)

            # Upsert caretaker
            ct_user = self._upsert_user(db, "care", "123", models.UserRole.CARETAKER)
            caretaker = db.query(models.Caretaker).filter(models.Caretaker.user_id == ct_user.id).first()
            if not caretaker:
                caretaker = models.Caretaker(user_id=ct_user.id, name="Primary Caretaker")
                db.add(caretaker)
                db.commit()
                db.refresh(caretaker)

            # Upsert patient
            p_user = self._upsert_user(db, "patient", "123", models.UserRole.PATIENT)
            patient = db.query(models.Patient).filter(models.Patient.user_id == p_user.id).first()
            if not patient:
                patient = models.Patient(user_id=p_user.id, patient_id="patient", name="John Doe")
                db.add(patient)
                db.commit()
                db.refresh(patient)
                # Assignment
                if patient not in caretaker.patients:
                    caretaker.patients.append(patient)
                # Medical records with specific time periods
                records = [
                    "Patient requires blood pressure medication at 9:00 AM and 9:00 PM daily.",
                    "Patient needs insulin injection 15 minutes before breakfast (approx 7:30 AM).",
                    "Patient frequently asks for water due to dry mouth side effects in the late evening.",
                    "Patient requires assistance for bathroom trips every 3-4 hours.",
                    "Patient takes a mild sedative for sleep at 10:00 PM.",
                    "Patient needs physical therapy exercise prompts at 2:00 PM.",
                    "Patient experiences chronic lower back pain and needs repositioning every 2 hours.",
                    "Patient has a history of allergies to dust; keep window closed during cleaning hours (10 AM - 11 AM)."
                ]
                for r in records:
                    db.add(models.MedicalRecord(patient_id_fk=patient.id, content=r))
                
                # Add library records with time-sensitive characteristics
                library_records = [
                    "Patient requires a nebulizer treatment at 8:00 AM and 8:00 PM.",
                    "Patient needs a high-protein snack at 3:30 PM.",
                    "Patient has sensitive hearing; reduce noise levels after 9:00 PM.",
                    "Patient uses a CPAP machine for sleep apnea starting at 11:00 PM.",
                    "Patient is prone to sundowning; requires extra reassurance between 5:00 PM and 7:00 PM.",
                    "Patient has a scheduled telehealth call with their family every Sunday at 4:00 PM.",
                    "Patient needs eye drops for dry eyes at 8:00 AM, 12:00 PM, and 6:00 PM.",
                    "Patient prefers natural light and likes to have the curtains open between 7:00 AM and 6:00 PM.",
                    "Patient has a strong preference for herbal tea over coffee, especially before bed.",
                    "Patient often asks for their reading glasses to look at family photos in the morning.",
                    "Patient is undergoing physical therapy and needs encouragement during the 11:00 AM session.",
                    "Patient appreciates a visit from the local priest on Friday mornings at 10:30 AM."
                ]
                for r in library_records:
                    db.add(models.MedicalRecord(patient_id_fk=None, content=r))
                
                db.commit()

            # Populate Vector Store
            await self.reload_vector_store(db)
        finally:
            db.close()

    async def interpret_sketch(self, image_bytes: bytes) -> dict:
        """Calls VLM (LLaVA) to interpret the sketch, returning multiple candidates."""
        logger.info(f"Interpreting sketch with {VLM_MODEL}...")
        
        prompt = """
        Analyze this wobbly sketch from a motor-impaired patient. 
        Identify the top 5 most likely objects intended to be drawn.
        Return a JSON object with this exact structure:
        {
          "predictions": [
            {"object": "primary object", "confidence": 0.95},
            {"object": "second choice", "confidence": 0.80},
            {"object": "third choice", "confidence": 0.70},
            {"object": "fourth choice", "confidence": 0.60},
            {"object": "fifth choice", "confidence": 0.50}
          ]
        }
        """
        
        response = ollama.generate(
            model=VLM_MODEL,
            prompt=prompt,
            images=[image_bytes],
            format="json"
        )
        
        try:
            data = json.loads(response['response'])
            preds = data.get('predictions', [])
            if not preds:
                raise ValueError("No predictions found")
            return {
                "predictions": preds,
                "top_confidence": preds[0].get('confidence', 0.0)
            }
        except Exception as e:
            logger.error(f"VLM Parsing Error: {e}")
            return {"predictions": [{"object": "unknown", "confidence": 0.0}], "top_confidence": 0.0}

    async def apply_rag(self, tag: str, patient_id: str) -> str:
        """Queries context and synthesizes final intent."""
        logger.info(f"Applying RAG for '{tag}'...")
        
        context = self.vector_store.search(patient_id, tag)
        context_str = "\n".join(context)
        
        prompt = f"""
        User drew: {tag}
        Patient Records: {context_str}

        Translate the drawing into a short request to a caretaker.
        Example: "I need my pills" or "I am thirsty".
        If the drawing is related to medication, mention it.
        Answer only with the final request string.
        """
        
        response = ollama.generate(model=LLM_MODEL, prompt=prompt)
        return response['response'].strip()

ai_engine = AIEngine()

# Socket.IO state
connected_users = {} # sid -> user_info

@sio.event
async def connect(sid, environ, auth_data):
    token = auth_data.get('token') if auth_data else None
    if not token:
        logger.warning(f"Connection rejected: No token provided (sid: {sid})")
        return False # Reject connection
    
    payload = auth.decode_access_token(token)
    if not payload:
        logger.warning(f"Connection rejected: Invalid token (sid: {sid})")
        return False
    
    connected_users[sid] = payload
    logger.info(f"Client connected: {sid} (User: {payload['sub']}, Role: {payload['role']})")
    
    # If caretaker, join their personal room for notifications
    if payload['role'] == "caretaker":
        await sio.enter_room(sid, f"caretaker_{payload['id']}")
    
    # If patient, join their patient_id room
    if payload['role'] == "patient":
        await sio.enter_room(sid, f"patient_{payload['sub']}")

@sio.event
async def disconnect(sid):
    if sid in connected_users:
        user = connected_users.pop(sid)
        logger.info(f"Client disconnected: {sid} (User: {user['sub']})")

@sio.event
async def request_records(sid, data):
    try:
        if sid not in connected_users:
            return
            
        user = connected_users[sid]
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        db = SessionLocal()
        try:
            patient = db.query(models.Patient).filter(models.Patient.patient_id == patient_id).first()
            if patient:
                records = [r.content for r in patient.medical_records]
                await sio.emit('records_update', {'records': records}, room=sid)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in request_records: {e}")

@sio.event
async def process_sketch(sid, data):
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        image_data = data.get('image').split(',')[1] if ',' in data.get('image') else data.get('image')
        image_bytes = base64.b64decode(image_data)
        
        interpretation = await ai_engine.interpret_sketch(image_bytes)
        preds = interpretation['predictions']
        top_tag = preds[0].get('object', 'unknown')
        
        # Always synthesize the top prediction
        final_intent = await ai_engine.apply_rag(top_tag, patient_id)
        
        # Prepare pinpointing options from top 5 visual predictions
        options = [p.get('object') for p in preds if p.get('object')]
        
        # Send everything back to the patient for confirmation
        logger.info(f"Interpretation ready for confirmation: {final_intent}")
        await sio.emit('interpretation_received', {
            'intent': final_intent,
            'options': options,
            'original_sketch': data.get('image'),
            'top_tag': top_tag
        }, room=sid)
        
    except Exception as e:
        logger.error(f"Error in process_sketch: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def pinpoint_selection(sid, data):
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        tag = data.get('tag')
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        # Synthesize the new selection and send back for confirmation
        final_intent = await ai_engine.apply_rag(tag, patient_id)
        
        logger.info(f"Pinpoint selection synthesized: {final_intent}")
        await sio.emit('interpretation_received', {
            'intent': final_intent,
            'options': ["water", "medication", "bathroom", "food"], # Standard defaults
            'original_sketch': data.get('original_sketch'),
            'top_tag': tag
        }, room=sid)

    except Exception as e:
        logger.error(f"Error in pinpoint_selection: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def send_interpretation(sid, data):
    """Final step: Patient has confirmed the intent and wants to notify the caretaker."""
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        intent = data.get('intent')
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        logger.info(f"Confirmed intent being sent to caretakers: {intent}")
        
        db = SessionLocal()
        try:
            patient = db.query(models.Patient).filter(models.Patient.patient_id == patient_id).first()
            if patient:
                for ct in patient.caretakers:
                    logger.info(f"Notifying caretaker_{ct.user_id}")
                    await sio.emit('interpretation_complete', {
                        'intent': intent,
                        'patient_id': patient_id,
                        'patient_name': patient.name
                    }, room=f"caretaker_{ct.user_id}")
            
            # Notify patient that it's officially dispatched
            await sio.emit('interpretation_dispatched', {'intent': intent}, room=sid)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in send_interpretation: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
