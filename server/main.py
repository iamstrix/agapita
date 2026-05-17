import os
import base64
import json
import logging
import asyncio
import time
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
    vlm_model = "gemma4:e4b"
    llm_model = "gemma4:e4b"
    confidence_threshold = 0.70
    mock_time = None

ai_config = AIConfig()

class SimpleRecordStore:
    """Simple in-memory store for patient records."""
    def __init__(self):
        self.records: Dict[str, List[str]] = {} # patient_id -> list of text

    async def add_record(self, patient_id: str, text: str):
        if patient_id not in self.records:
            self.records[patient_id] = []
        self.records[patient_id].append(text)

    def clear(self):
        self.records = {}

    def get_all(self, patient_id: str) -> List[str]:
        return self.records.get(patient_id, [])

class AIEngine:
    """Interface for VLM, LLM and RAG operations via Ollama."""
    def __init__(self):
        self.record_store = SimpleRecordStore()
        # Seeding will be triggered by the FastAPI startup event

    async def append_record(self, db: Session, rec: models.MedicalRecord):
        """Appends a single record to the store without a full reload."""
        if rec.patient_id_fk:
            p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
            if p:
                await self.record_store.add_record(p.patient_id, rec.content)
        logger.info(f"Appended new record {rec.id} to Record Store.")

    async def reload_record_store(self, db: Session):
        """Clears and re-populates the record store from the database."""
        logger.info("Reloading record store...")
        self.record_store.clear()
        
        # Only load patient-specific assigned records
        all_records = db.query(models.MedicalRecord).all()
        for rec in all_records:
            if rec.patient_id_fk:
                p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
                if p:
                    await self.record_store.add_record(p.patient_id, rec.content)
        
        logger.info(f"Reloaded assigned records into Record Store.")

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

            # Populate Record Store
            await self.reload_record_store(db)

            # Warm up Gemma 4 E4B
            try:
                logger.info("Warming up Gemma 4 E4B with Vision Adapter and 1024 KV Cache...")
                # Create a 224x224 dummy image to safely force Vision Adapter loading
                img = Image.new('RGB', (224, 224), color = 'black')
                buf = io.BytesIO()
                img.save(buf, format="JPEG")
                dummy_image = buf.getvalue()
                
                ollama.generate(
                    model=ai_config.vlm_model, 
                    prompt="Hello", 
                    images=[dummy_image],
                    keep_alive="10m",
                    options={"num_ctx": 1024} # MUST match inference to prevent eviction
                )
                logger.info("Model warm. Server ready.")
            except Exception as e:
                logger.warning(f"Failed to warm up model: {e}")
        finally:
            db.close()

    async def interpret_sketch(self, image_bytes: bytes) -> dict:
        """Calls VLM to interpret the sketch, returning multiple candidates."""
        logger.info(f"[TELEMETRY] Starting sketch interpretation with {ai_config.vlm_model}...")
        
        # Normalize image (convert PNG with potential alpha, downscale to VLM native 224x224 format)
        start_norm = time.perf_counter()
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img.thumbnail((224, 224)) # Downscale canvas resolution to optimize VLM inference speed
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            image_bytes = buf.getvalue()
            logger.info(f"[TELEMETRY] Image normalization & downscale completed in {time.perf_counter() - start_norm:.4f}s")
        except Exception as e:
            logger.warning(f"Image normalization failed: {e}")

        prompt = """
        Identify the top 3 objects in this rough sketch.
        Return JSON: {"items": ["object1", "object2", "object3"]}
        """
        
        start_inference = time.perf_counter()
        response = ollama.generate(
            model=ai_config.vlm_model,
            prompt=prompt,
            images=[image_bytes],
            format="json",
            think=False,
            keep_alive="10m",
            options={
                "temperature": 0.0,
                "num_predict": 40, # Stop token generation once the short JSON array is generated
                "num_ctx": 1024 # Reduce KV cache allocation
            }
        )
        inference_time = time.perf_counter() - start_inference
        
        prefill_s = response.get('prompt_eval_duration', 0) / 1e9
        decode_s = response.get('eval_duration', 0) / 1e9
        logger.info(f"[TELEMETRY] VLM ollama.generate call completed in {inference_time:.4f}s")
        logger.info(f"[TELEMETRY] ├─ Prefill (Phase B): {prefill_s:.4f}s ({response.get('prompt_eval_count', 0)} tokens)")
        logger.info(f"[TELEMETRY] └─ Decode (Phase C): {decode_s:.4f}s ({response.get('eval_count', 0)} tokens)")
        
        try:
            data = json.loads(response['response'])
            items = data.get('items', [])
            if not items:
                # Fallback if VLM hallucinates keys like {"object1": "...", "object2": "..."}
                items = list(data.values())
            if not items or not isinstance(items, list):
                raise ValueError("Empty or invalid predictions list")
            
            preds = [{"object": str(obj), "confidence": 1.0} for obj in items[:3]]
            return {
                "predictions": preds,
                "top_confidence": 1.0
            }
        except Exception as e:
            logger.error(f"VLM Parsing Error: {e} | Raw: {response.get('response', '')[:200]}")
            return {"predictions": [{"object": "unknown", "confidence": 0.0}], "top_confidence": 0.0}

    async def apply_rag(self, tag: str, patient_id: str) -> str:
        """Queries context and synthesizes final intent."""
        logger.info(f"[TELEMETRY] Starting RAG intent synthesis for '{tag}'...")
        
        start_search = time.perf_counter()
        context = self.record_store.get_all(patient_id)
        context_str = "\n".join(context)
        logger.info(f"[TELEMETRY] RAG Record Store retrieval completed in {time.perf_counter() - start_search:.4f}s (found {len(context)} records)")
        
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
        
        start_llm = time.perf_counter()
        response = ollama.generate(
            model=ai_config.llm_model,
            prompt=prompt,
            think=False,
            keep_alive="10m",
            options={
                "temperature": 0.0,
                "num_predict": 50, # Patient requests are concise and should not exceed 50 tokens
                "num_ctx": 1024 # CRITICAL: MUST MATCH VLM TO PREVENT MODEL RELOADS
            }
        )
        llm_time = time.perf_counter() - start_llm
        logger.info(f"[TELEMETRY] RAG LLM ollama.generate call completed in {llm_time:.4f}s")
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
    pipeline_start = time.perf_counter()
    logger.info("[TELEMETRY] Incoming process_sketch request received via Socket.IO")
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        start_decode = time.perf_counter()
        image_data = data.get('image').split(',')[1] if ',' in data.get('image') else data.get('image')
        image_bytes = base64.b64decode(image_data)
        logger.info(f"[TELEMETRY] Image base64 decoding completed in {time.perf_counter() - start_decode:.4f}s")
        
        interpretation = await ai_engine.interpret_sketch(image_bytes)
        preds = interpretation['predictions']
        top_tag = preds[0].get('object', 'unknown')
        
        top_tag_lower = top_tag.lower()
        is_person = any(w in top_tag_lower for w in ['person', 'stick figure', 'man', 'woman', 'human', 'face', 'boy', 'girl'])
        
        if is_person:
            logger.info("[TELEMETRY] Person tag detected; executing family relationship RAG branch...")
            start_search = time.perf_counter()
            context = ai_engine.record_store.get_all(patient_id)
            context_str = "\n".join(context)
            logger.info(f"[TELEMETRY] Family records retrieval completed in {time.perf_counter() - start_search:.4f}s")
            
            prompt = f"""
            The user (a patient) drew a {top_tag}.
            Suggest who they might want to see based on their medical records.
            Patient Records:
            {context_str}
            
            Task:
            If the records mention relatives or friends, generate a JSON object with:
            "intent": a request to see the first relative (e.g. "I want to see my daughter Martha")
            "options": a list of requests for other relatives (e.g. ["I want to call John", "I want to see Leo"]).
            If NO relatives are mentioned in the records, generate exactly:
            "intent": "I would like some company."
            "options": ["I want someone to talk to", "Can someone sit with me?"]
            
            Respond ONLY with the JSON object.
            """
            start_person_llm = time.perf_counter()
            response = ollama.generate(
                model=ai_config.llm_model,
                prompt=prompt,
                format="json",
                think=False,
                keep_alive="10m",
                options={
                    "temperature": 0.0,
                    "num_predict": 100,
                    "num_ctx": 1024 # CRITICAL: MUST MATCH VLM TO PREVENT MODEL RELOADS
                }
            )
            person_llm_time = time.perf_counter() - start_person_llm
            logger.info(f"[TELEMETRY] Person RAG LLM completed in {person_llm_time:.4f}s")
            try:
                data_json = json.loads(response['response'])
                final_intent = data_json.get('intent', "I would like some company.")
                options = data_json.get('options', ["I want someone to talk to"])
            except:
                final_intent = "I would like some company."
                options = ["Can someone sit with me?"]
        else:
            final_intent = await ai_engine.apply_rag(top_tag, patient_id)
            options = [p.get('object') for p in preds if p.get('object')]
        
        # Send everything back to the patient for confirmation
        logger.info(f"[TELEMETRY] Full pipeline successfully finished in {time.perf_counter() - pipeline_start:.4f}s")
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
