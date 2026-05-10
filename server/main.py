import os
import base64
import json
import logging
import asyncio
from typing import List, Optional, Dict
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
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
    
    from datetime import timedelta
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role.value, "id": user.id},
        expires_delta=timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
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

@app.post("/api/admin/records")
async def add_record(content: str, patient_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Add a new medical record (global or patient-specific) and reload RAG."""
    new_record = models.MedicalRecord(content=content, patient_id_fk=patient_id)
    db.add(new_record)
    db.commit()
    await ai_engine.append_record(db, new_record)
    return {"message": "Record added and RAG updated", "id": new_record.id}

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

class ModelUpdate(BaseModel):
    vlm_model: Optional[str] = None
    llm_model: Optional[str] = None
    mock_time: Optional[str] = None
    use_real_time: Optional[bool] = None

@app.get("/api/admin/config/models")
async def get_models():
    return {
        "vlm_model": ai_config.vlm_model,
        "llm_model": ai_config.llm_model,
        "embed_model": ai_config.embed_model,
        "confidence_threshold": ai_config.confidence_threshold,
        "mock_time": getattr(ai_config, "mock_time", None)
    }

@app.post("/api/admin/config/models")
async def update_models(body: ModelUpdate):
    if body.vlm_model:
        ai_config.vlm_model = body.vlm_model
    if body.llm_model:
        ai_config.llm_model = body.llm_model
    if body.use_real_time:
        ai_config.mock_time = None
    elif body.mock_time is not None:
        ai_config.mock_time = body.mock_time
    return {"message": "Models updated successfully", "active_vlm": ai_config.vlm_model, "active_llm": ai_config.llm_model}


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


# Patient Self-Service Record Endpoints
# These use the Bearer token to identify the patient — no admin required.

class RecordCreate(BaseModel):
    content: str

@app.get("/api/patient/records")
async def get_patient_records(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Return all records assigned to the logged-in patient."""
    payload = auth.decode_access_token(token)
    if not payload or payload.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Not authorized")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_id == payload["sub"]
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return [{"id": r.id, "content": r.content} for r in patient.medical_records]

@app.post("/api/patient/records")
async def add_patient_record(
    body: RecordCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Add a new record for the logged-in patient and reload RAG immediately."""
    payload = auth.decode_access_token(token)
    if not payload or payload.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Not authorized")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_id == payload["sub"]
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    new_record = models.MedicalRecord(content=body.content, patient_id_fk=patient.id)
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    await ai_engine.append_record(db, new_record)
    return {"id": new_record.id, "content": new_record.content}

@app.delete("/api/patient/records/{record_id}")
async def delete_patient_record(
    record_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Delete one of the logged-in patient's records and reload RAG."""
    payload = auth.decode_access_token(token)
    if not payload or payload.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Not authorized")
    patient = db.query(models.Patient).filter(
        models.Patient.patient_id == payload["sub"]
    ).first()
    record = db.query(models.MedicalRecord).filter(
        models.MedicalRecord.id == record_id,
        models.MedicalRecord.patient_id_fk == patient.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    await ai_engine.reload_vector_store(db)
    return {"message": "Record deleted"}

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

# Initialize Socket.io — ping_timeout must exceed worst-case VLM inference time
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False,
    ping_timeout=300,   # 5 min — must be longer than VLM inference
    ping_interval=25
)
socket_app = socketio.ASGIApp(sio, app)

class AIConfig:
    vlm_model = "llava"
    llm_model = "gemma"
    embed_model = "nomic-embed-text"
    confidence_threshold = 0.70
    mock_time = None

ai_config = AIConfig()

class SimpleVectorStore:
    """Simple in-memory vector store using numpy."""
    def __init__(self):
        self.embeddings: Dict[str, List[Dict]] = {} # patient_id -> list of {text, vector}

    async def add_record(self, patient_id: str, text: str):
        response = ollama.embeddings(model=ai_config.embed_model, prompt=text)
        vector = np.array(response['embedding'])
        if patient_id not in self.embeddings:
            self.embeddings[patient_id] = []
        self.embeddings[patient_id].append({"text": text, "vector": vector})

    def clear(self):
        self.embeddings = {}

    def search(self, patient_id: str, query_text: str, top_k: int = 5) -> List[str]:
        if patient_id not in self.embeddings:
            return []
        
        query_resp = ollama.embeddings(model=ai_config.embed_model, prompt=query_text)
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

    async def append_record(self, db: Session, rec: models.MedicalRecord):
        """Appends a single record to the vector store without a full reload."""
        if rec.patient_id_fk:
            p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
            if p:
                await self.vector_store.add_record(p.patient_id, rec.content)
        logger.info(f"Appended new record {rec.id} to Vector Store.")

    async def reload_vector_store(self, db: Session):
        """Clears and re-populates the vector store from the database."""
        logger.info("Reloading vector store...")
        self.vector_store.clear()
        
        # Only load patient-specific assigned records
        all_records = db.query(models.MedicalRecord).all()
        for rec in all_records:
            if rec.patient_id_fk:
                p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
                if p:
                    await self.vector_store.add_record(p.patient_id, rec.content)
        
        logger.info(f"Reloaded assigned records into Vector Store.")

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
                # Medical records with specific clinical and personal context
                records = [
                    "CLINICAL DIAGNOSIS: Chronic Broca's Aphasia following a left-hemisphere stroke. Patient retains high comprehension but lacks verbal fluency.",
                    "PATIENT TRAITS: Former Jazz musician. Extremely fond of Miles Davis. Likes to tap fingers when hearing rhythm.",
                    "FAMILY: Married to 'Martha' for 45 years. Two children: 'Leo' (Architect) and 'Sarah' (Nurse). Martha visits every Tuesday at 2:00 PM.",
                    "SOCIAL CIRCLE: Member of the local 'Old Timers Jazz Club'. Friends often send recordings of live sessions.",
                    "PERSONAL PREFERENCE: Strong dislike for hospital oatmeal; prefers rye toast with honey.",
                    "MEDICAL NEED: Patient requires blood pressure medication (Lisinopril) at 9:00 AM and 9:00 PM daily.",
                    "MEDICAL NEED: Patient needs insulin injection 15 minutes before breakfast (approx 7:30 AM).",
                    "BEHAVIORAL NOTE: When frustrated with communication, patient may draw musical notes or abstract shapes.",
                    "COMMUNICATION STYLE: Responds best to 'Yes/No' questions or visual prompts. High reliance on sketching for nouns.",
                    "Patient requires assistance for bathroom trips every 3-4 hours due to right-side hemiparesis.",
                    "Patient takes a mild sedative for sleep at 10:00 PM; prefers the room to be completely dark.",
                    "Patient needs physical therapy exercise prompts at 2:00 PM to improve motor function in the right arm."
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
                    "Patient appreciates a visit from the local priest on Friday mornings at 10:30 AM.",
                    "[Room Environment] The hospital room has a large window facing east; curtains can be opened for sunlight.",
                    "[Room Environment] A smart TV is mounted on the wall opposite the bed; remote is on the bedside table.",
                    "[Room Environment] The room temperature can be adjusted using the digital thermostat near the door.",
                    "[Room Environment] A call button is located on the right side of the bed rail.",
                    "[Room Environment] There is a small refrigerator for patient use in the corner of the room."
                ]
                for r in library_records:
                    db.add(models.MedicalRecord(patient_id_fk=None, content=r))
                
                db.commit()

            # Populate Vector Store
            await self.reload_vector_store(db)
        finally:
            db.close()

    async def interpret_sketch(self, image_bytes: bytes) -> dict:
        """Calls VLM to interpret the sketch, returning multiple candidates."""
        logger.info(f"Interpreting sketch with {ai_config.vlm_model}...")
        
        if "moondream" in ai_config.vlm_model.lower():
            # Moondream is small and struggles with strict JSON structures.
            prompt = "What is drawn in this wobbly sketch? Reply with a comma-separated list of the 3 most likely objects."
            response = ollama.generate(
                model=ai_config.vlm_model,
                prompt=prompt,
                images=[image_bytes]
            )
            text = response['response'].strip()
            objects = [x.strip() for x in text.split(',') if x.strip()]
            if not objects:
                objects = [text] # Fallback to the whole text
            
            preds = [{"object": obj, "confidence": 0.8} for obj in objects[:5]]
            return {
                "predictions": preds if preds else [{"object": "unknown", "confidence": 0.0}],
                "top_confidence": 0.8
            }
        else:
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
                model=ai_config.vlm_model,
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
        
        from datetime import datetime
        current_time = ai_config.mock_time if getattr(ai_config, "mock_time", None) else datetime.now().strftime("%H:%M")
        
        prompt = f"""
        The user (a motor-impaired patient) drew a sketch that was interpreted as: "{tag}".
        The current time is: {current_time}.
        
        Here are some patient records for context:
        {context_str}

        Task: Translate the drawing ("{tag}") into a short, natural request to a caretaker (e.g., "I am thirsty" or "I need my glasses").
        
        Important Rules:
        1. Only use the Patient Records if they DIRECTLY and LOGICALLY relate to the drawing "{tag}".
        2. Consider the current time ({current_time}) when interpreting time-sensitive medical records (e.g., medication schedules).
        3. If the records are not relevant to "{tag}" or the time doesn't match, ignore them and make a logical guess based on the drawing itself.
        4. Answer ONLY with the final request string, nothing else.
        """
        
        response = ollama.generate(model=ai_config.llm_model, prompt=prompt)
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
