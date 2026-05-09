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

# Constants
VLM_MODEL = "llava"  # or "moondream"
LLM_MODEL = "gemma"  # or "llama3"
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
            self._upsert_user(db, "admin", "admin123", models.UserRole.ADMIN)

            # Upsert caretaker
            ct_user = self._upsert_user(db, "caretaker1", "c123", models.UserRole.CARETAKER)
            caretaker = db.query(models.Caretaker).filter(models.Caretaker.user_id == ct_user.id).first()
            if not caretaker:
                caretaker = models.Caretaker(user_id=ct_user.id, name="Primary Caretaker")
                db.add(caretaker)
                db.commit()
                db.refresh(caretaker)

            # Upsert patient
            p_user = self._upsert_user(db, "PatientA", "a123", models.UserRole.PATIENT)
            patient = db.query(models.Patient).filter(models.Patient.user_id == p_user.id).first()
            if not patient:
                patient = models.Patient(user_id=p_user.id, patient_id="PatientA", name="John Doe")
                db.add(patient)
                db.commit()
                db.refresh(patient)
                # Assignment
                if patient not in caretaker.patients:
                    caretaker.patients.append(patient)
                # Medical records
                records = [
                    "Patient requires strict medication schedule for heart condition.",
                    "Patient frequently asks for water due to dry mouth side effects.",
                    "Patient uses a walker for bathroom trips.",
                    "Patient is on a soft food diet and often requests yogurt or apple sauce.",
                    "Patient feels cold easily and may ask for an extra blanket or to adjust the heater.",
                    "Patient experiences chronic lower back pain and needs to be repositioned in bed.",
                    "Patient enjoys listening to the radio or watching the news to stay occupied.",
                    "Patient has a history of allergies to dust and may request a window be closed."
                ]
                for r in records:
                    db.add(models.MedicalRecord(patient_id_fk=patient.id, content=r))
                
                # Add some unassigned "library" records
                library_records = [
                    "Patient requires a translator for non-English speakers.",
                    "Patient has sensitive hearing and needs a quiet environment.",
                    "Patient uses a motorized wheelchair and needs wide doorways.",
                    "Patient is prone to seizures and requires constant monitoring."
                ]
                for r in library_records:
                    db.add(models.MedicalRecord(patient_id_fk=None, content=r))
                
                db.commit()

            # Populate Vector Store
            await self.reload_vector_store(db)
        finally:
            db.close()

    async def interpret_sketch(self, image_bytes: bytes) -> dict:
        """Calls VLM (LLaVA) to interpret the sketch."""
        logger.info("Interpreting sketch with VLM...")
        
        # Call Ollama LLaVA
        response = ollama.generate(
            model=VLM_MODEL,
            prompt="Analyze this wobbly sketch from a motor-impaired patient. What is the most likely single object? Return only the object name and a confidence score between 0 and 1 in JSON format: {'object': 'name', 'confidence': 0.8}",
            images=[image_bytes],
            format="json"
        )
        
        try:
            data = json.loads(response['response'])
            # Since LLaVA doesn't always provide multiple options well in one go, 
            # we'll mock the 'predictions' list for the pinpointing demo if needed.
            return {
                "predictions": [{"tag": data.get('object'), "confidence": data.get('confidence', 0.5)}],
                "top_confidence": data.get('confidence', 0.5)
            }
        except Exception:
            return {"predictions": [{"tag": "unknown", "confidence": 0.0}], "top_confidence": 0.0}

    async def apply_rag(self, tag: str, patient_id: str) -> str:
        """Queries context and synthesizes final intent."""
        logger.info(f"Applying RAG for {tag}...")
        
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

@sio.event
async def disconnect(sid):
    if sid in connected_users:
        user = connected_users.pop(sid)
        logger.info(f"Client disconnected: {sid} (User: {user['sub']})")

@sio.event
async def process_sketch(sid, data):
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        # In a real scenario, patient_id should come from the auth payload
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'PatientA')
        
        image_data = data.get('image').split(',')[1] if ',' in data.get('image') else data.get('image')
        image_bytes = base64.b64decode(image_data)
        
        interpretation = await ai_engine.interpret_sketch(image_bytes)
        
        if interpretation['top_confidence'] < CONFIDENCE_THRESHOLD:
            options = [interpretation['predictions'][0]['tag'], "water", "medication", "bathroom"]
            logger.info(f"Confidence too low ({interpretation['top_confidence']}). Emitting pinpointing_required")
            await sio.emit('pinpointing_required', {
                'options': list(set(options)),
                'original_sketch': data.get('image')
            }, room=sid)
            return

        final_intent = await ai_engine.apply_rag(interpretation['predictions'][0]['tag'], patient_id)
        logger.info(f"Interpretation complete. Intent: {final_intent}")
        
        # Route to assigned caretakers
        db = SessionLocal()
        try:
            patient = db.query(models.Patient).filter(models.Patient.patient_id == patient_id).first()
            if patient:
                for ct in patient.caretakers:
                    logger.info(f"Emitting notification to caretaker room: caretaker_{ct.user_id}")
                    await sio.emit('interpretation_complete', {
                        'intent': final_intent,
                        'patient_id': patient_id,
                        'patient_name': patient.name
                    }, room=f"caretaker_{ct.user_id}")
            
            # Also send back to patient for confirmation
            await sio.emit('interpretation_complete', {'intent': final_intent}, room=sid)
        finally:
            db.close()
        
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
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'PatientA')
        
        final_intent = await ai_engine.apply_rag(tag, patient_id)
        
        # Route to assigned caretakers
        db = SessionLocal()
        try:
            patient = db.query(models.Patient).filter(models.Patient.patient_id == patient_id).first()
            if patient:
                for ct in patient.caretakers:
                    await sio.emit('interpretation_complete', {
                        'intent': final_intent,
                        'patient_id': patient_id,
                        'patient_name': patient.name
                    }, room=f"caretaker_{ct.user_id}")
            
            await sio.emit('interpretation_complete', {'intent': final_intent}, room=sid)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in pinpoint_selection: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
