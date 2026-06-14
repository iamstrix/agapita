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
from siglip_engine import SigLIPEngine
from aac_dictionary import AAC_LABELS

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./agapita.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgapitaServer")

def download_tts_assets():
    model_path = os.path.join(os.path.dirname(__file__), "kokoro-v1.0.onnx")
    voice_path = os.path.join(os.path.dirname(__file__), "voices-v1.0.bin")
    
    import urllib.request
    
    # Check and download model
    if not os.path.exists(model_path):
        logger.info("[TTS] Downloading Kokoro-82M ONNX model (v1.0)... This may take a moment.")
        url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
        try:
            urllib.request.urlretrieve(url, model_path)
            logger.info("[TTS] Kokoro model downloaded successfully.")
        except Exception as e:
            logger.error(f"[TTS] Failed to download Kokoro model: {e}")
            
    # Check and download voices
    if not os.path.exists(voice_path):
        logger.info("[TTS] Downloading Kokoro-82M voices-v1.0.bin... This may take a moment.")
        url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
        try:
            urllib.request.urlretrieve(url, voice_path)
            logger.info("[TTS] Kokoro voices downloaded successfully.")
        except Exception as e:
            logger.error(f"[TTS] Failed to download Kokoro voices: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    # Create tables
    models.Base.metadata.create_all(bind=engine)
    # Trigger seeding when the server starts and loop is running
    asyncio.create_task(ai_engine.seed_data())
    # Trigger TTS asset downloading in a background thread
    asyncio.create_task(asyncio.to_thread(download_tts_assets))
    # SigLIP2 is initialized synchronously in __main__ before uvicorn starts
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

def downscale_image_bytes(image_bytes: bytes, max_width: int = 640) -> bytes:
    """Downscales the image bytes using PIL to a maximum width of max_width, keeping aspect ratio."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        if width > max_width:
            scale = max_width / float(width)
            new_height = int(float(height) * scale)
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.ANTIALIAS
            img = img.resize((max_width, new_height), resample)
            output = io.BytesIO()
            fmt = img.format if img.format else "JPEG"
            if fmt == "MPO": fmt = "JPEG"
            img.save(output, format=fmt, quality=80)
            return output.getvalue()
    except Exception as e:
        logger.warning(f"PIL Server-Side Downscaling Failed: {e}")
    return image_bytes

class ScanRequest(BaseModel):
    image: str
    mode: str = "medication"
    scope: str = "targeted"

@app.post("/api/scan-grounding")
async def scan_grounding(request: ScanRequest):
    """Scan an image and return structured JSON based on the requested mode."""
    try:
        image_data = request.image.split(",")[1] if "," in request.image else request.image
        image_bytes = base64.b64decode(image_data)
        
        # Phase 2: Server-Side Canvas downscaling offload
        image_bytes = downscale_image_bytes(image_bytes)
        
        scope_instruction = "identify ONLY the single most central, prominent focal object." if request.scope == "targeted" else "identify ONLY the 2 to 4 most prominent, major objects in the foreground."
        
        prompt = f"""
        Analyze this image and {scope_instruction}
        Do NOT list minor background details or tiny items. Keep the response extremely fast and concise!
        
        If the mode is "medication", prioritize prominent medical supplies, prescription labels, or large pill bottles.
        If the mode is "environment", prioritize prominent furniture, large appliances, and clear focal objects.
        
        For each identified object, return its normalized 2D bounding box coordinate percentages from 0 to 100 in the format [ymin, xmin, ymax, xmax].
        ymin is top edge percent, xmin is left edge percent, ymax is bottom edge percent, and xmax is right edge percent.
        
        You MUST return a JSON object matching this exact structure:
        {{
          "objects": [
            {{
              "type": "medication",
              "name": "short name of the object (e.g., laptop, water bottle, blue mug)",
              "details": "color, state, location, or dosage context (e.g., resting on the wooden table)",
              "box_2d": [ymin, xmin, ymax, xmax]
            }}
          ]
        }}
        
        Important: "type" must be exactly "medication" or "environmental_object". All values in "box_2d" must be integers between 0 and 100 representing percentage coordinates. Do not return pipes or programming code.
        """

        response = await asyncio.to_thread(
            ollama.generate,
            model=ai_config.vlm_model,
            prompt=prompt,
            images=[image_bytes],
            format="json",
            think=ai_config.think_mode,
            keep_alive="24h",
            options={"num_ctx": 1024} # MUST match warmup to prevent KV cache eviction
        )
        
        raw_resp = response.get('response', '')
        logger.info("--- OLLAMA RAW VLM RESPONSE ---")
        logger.info(raw_resp)
        logger.info("-------------------------------")
        
        # Strip conversational preamble and markdown code blocks
        clean_resp = raw_resp.strip()
        start = min([clean_resp.find('{') if '{' in clean_resp else len(clean_resp), clean_resp.find('[') if '[' in clean_resp else len(clean_resp)])
        end = max([clean_resp.rfind('}'), clean_resp.rfind(']')])
        if start < len(clean_resp) and end >= 0:
            clean_resp = clean_resp[start:end+1]
            
        try:
            data = json.loads(clean_resp)
        except json.JSONDecodeError as json_err:
            logger.warning(f"Strict JSON parsing failed ({json_err}). Falling back to AST dictionary evaluation...")
            import ast
            try:
                # VLM might output Python dictionary syntax (single quotes) instead of strict JSON
                data = ast.literal_eval(clean_resp)
            except Exception as ast_err:
                logger.error(f"AST Fallback Parse Error: {ast_err}")
                data = {"objects": []}
        
        # 1. Structural Normalization
        if isinstance(data, list):
            data = {"objects": data}
        elif isinstance(data, dict) and "objects" not in data:
            if "name" in data or "type" in data or "box_2d" in data:
                data = {"objects": [data]}
            else:
                for k, v in data.items():
                    if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                        data["objects"] = v
                        break
                if "objects" not in data:
                    data = {"objects": []}
        
        # Post-process coordinate arrays for bulletproof frontend rendering
        if isinstance(data, dict) and "objects" in data:
            for obj in data["objects"]:
                # Ensure type is clean
                t = str(obj.get("type", "environmental_object")).strip().lower()
                if "med" in t:
                    obj["type"] = "medication"
                else:
                    obj["type"] = "environmental_object"
                
                # High-Resiliency Coordinate Multi-Scale Normalizer & Generative Fallback
                import random
                if "box_2d" not in obj or not isinstance(obj["box_2d"], list) or len(obj["box_2d"]) < 4:
                    # Fail-safe: Generate staggered beautiful central bounding boxes
                    ymin = random.randint(15, 30)
                    xmin = random.randint(15, 30)
                    obj["box_2d"] = [ymin, xmin, ymin + 45, xmin + 45]
                else:
                    coords = []
                    try:
                        # Extract numerical float representations
                        raw_vals = [float(x) for x in obj["box_2d"][:4]]
                        max_val = max(raw_vals) if raw_vals else 0.0
                        
                        # 1. Decimal float scale detection (0.0 to 1.0)
                        is_decimal = (max_val <= 1.0 and any(x > 0 for x in raw_vals))
                        # 2. 1000-scale detection (0 to 1000)
                        is_1000 = (max_val > 100.0)
                        
                        for val in raw_vals:
                            num = val
                            if is_decimal:
                                num = num * 100.0
                            elif is_1000:
                                num = num / 10.0
                            
                            coords.append(int(round(min(100.0, max(0.0, num)))))
                    except Exception as e:
                        logger.warning(f"Failed to normalize coord: {e}, using random fallback")
                        ymin = random.randint(15, 30)
                        xmin = random.randint(15, 30)
                        coords = [ymin, xmin, ymin + 45, xmin + 45]
                    
                    obj["box_2d"] = coords
        
        return data
    except Exception as e:
        logger.error(f"Scan Grounding Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to scan image")

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

@app.get("/api/patient/tts")
async def get_tts_audio(text: str, voice: Optional[str] = "af_sarah"):
    start_total = time.perf_counter()
    model_path = os.path.join(os.path.dirname(__file__), "kokoro-v1.0.onnx")
    voice_path = os.path.join(os.path.dirname(__file__), "voices-v1.0.bin")
    
    if not os.path.exists(model_path) or not os.path.exists(voice_path):
        raise HTTPException(
            status_code=503, 
            detail="TTS models are still downloading. Please try again in a moment."
        )
        
    try:
        from kokoro_onnx import Kokoro
        
        # 1. Model Loading / Verification Phase
        start_load = time.perf_counter()
        loaded = False
        if not hasattr(ai_engine, "kokoro_model") or ai_engine.kokoro_model is None:
            logger.info("[TTS] Loading Kokoro-82M model into memory...")
            ai_engine.kokoro_model = Kokoro(model_path, voice_path)
            loaded = True
        load_time = time.perf_counter() - start_load if loaded else 0.0
        
        def run_kokoro_pipeline(model, text, voice, speed=1.0, lang="en-us", trim=True):
            import time
            import numpy as np
            from kokoro_onnx.trim import trim as trim_audio
            from kokoro_onnx.config import MAX_PHONEME_LENGTH
            
            timings = {}
            
            # Fetch voice style
            start_style = time.perf_counter()
            if isinstance(voice, str):
                assert voice in model.voices, f"Voice {voice} not found in available voices"
                voice_style = model.get_voice_style(voice)
            else:
                voice_style = voice
            timings["style_fetch"] = time.perf_counter() - start_style

            # Phonemize
            start_phonemize = time.perf_counter()
            phonemes = model.tokenizer.phonemize(text, lang)
            timings["phonemize"] = time.perf_counter() - start_phonemize
            
            # Split phonemes into batches
            start_split = time.perf_counter()
            batched_phonemes = model._split_phonemes(phonemes)
            timings["split"] = time.perf_counter() - start_split
            
            audio = []
            total_tokenize = 0.0
            total_onnx = 0.0
            total_trim = 0.0
            
            for part_phonemes in batched_phonemes:
                # Tokenize
                start_tokenize = time.perf_counter()
                part_phonemes = part_phonemes[:MAX_PHONEME_LENGTH]
                tokens = np.array(model.tokenizer.tokenize(part_phonemes), dtype=np.int64)
                assert len(tokens) <= MAX_PHONEME_LENGTH
                
                voice_vector = voice_style[len(tokens)]
                tokens_input = [[0, *tokens, 0]]
                
                if "input_ids" in [i.name for i in model.sess.get_inputs()]:
                    inputs = {
                        "input_ids": tokens_input,
                        "style": np.array(voice_vector, dtype=np.float32),
                        "speed": np.array([speed], dtype=np.int32),
                    }
                else:
                    inputs = {
                        "tokens": tokens_input,
                        "style": voice_vector,
                        "speed": np.ones(1, dtype=np.float32) * speed,
                    }
                total_tokenize += time.perf_counter() - start_tokenize
                
                # ONNX Inference
                start_onnx = time.perf_counter()
                audio_part = model.sess.run(None, inputs)[0]
                total_onnx += time.perf_counter() - start_onnx
                
                # Trim silence
                start_trim = time.perf_counter()
                if trim:
                    audio_part, _ = trim_audio(audio_part)
                total_trim += time.perf_counter() - start_trim
                
                audio.append(audio_part)
                
            timings["tokenize"] = total_tokenize
            timings["onnx"] = total_onnx
            timings["trim"] = total_trim
            
            # Concatenate batches
            start_concat = time.perf_counter()
            if len(audio) > 1:
                final_audio = np.concatenate(audio)
            elif len(audio) == 1:
                final_audio = audio[0]
            else:
                final_audio = np.array([], dtype=np.float32)
            timings["concat"] = time.perf_counter() - start_concat
            
            return final_audio, 24000, len(batched_phonemes), timings
            
        # 2. ONNX Inference Phase with Detailed Telemetry
        samples, sample_rate, num_batches, timings = await asyncio.to_thread(
            run_kokoro_pipeline,
            ai_engine.kokoro_model,
            text,
            voice=voice,
            speed=1.0,
            lang="en-us"
        )
        
        # 3. PCM WAV Conversion Phase
        start_wav = time.perf_counter()
        import io
        import wave
        import numpy as np
        
        int_samples = (samples * 32767).astype(np.int16)
        
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(int_samples.tobytes())
            
        buffer.seek(0)
        wav_time = time.perf_counter() - start_wav
        
        total_time = time.perf_counter() - start_total
        logger.info(
            f"[TELEMETRY] Kokoro TTS completed in {total_time:.4f}s | "
            f"Chars: {len(text)} | "
            f"Batches: {num_batches} | "
            f"Phases: Load: {load_time:.4f}s | "
            f"Style: {timings['style_fetch']:.4f}s | "
            f"Phonemize: {timings['phonemize']:.4f}s | "
            f"Split: {timings['split']:.4f}s | "
            f"Tokenize: {timings['tokenize']:.4f}s | "
            f"ONNX Inference: {timings['onnx']:.4f}s | "
            f"Trim: {timings['trim']:.4f}s | "
            f"Concat: {timings['concat']:.4f}s | "
            f"WAV Conversion: {wav_time:.4f}s"
        )
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(buffer, media_type="audio/wav")
        
    except Exception as e:
        logger.error(f"[TTS] TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

class ModelUpdate(BaseModel):
    vlm_model: Optional[str] = None
    llm_model: Optional[str] = None
    think_mode: Optional[bool] = None
    mock_time: Optional[str] = None
    use_real_time: Optional[bool] = None

@app.get("/api/admin/config/models")
async def get_models():
    return {
        "vlm_model": ai_config.vlm_model,
        "llm_model": ai_config.llm_model,
        "think_mode": getattr(ai_config, "think_mode", False),
        "confidence_threshold": ai_config.confidence_threshold,
        "mock_time": getattr(ai_config, "mock_time", None)
    }

@app.post("/api/admin/config/models")
async def update_models(body: ModelUpdate):
    if body.vlm_model:
        ai_config.vlm_model = body.vlm_model
        ai_config.llm_model = body.vlm_model  # Unified: always keep VLM = LLM
        # Asynchronously preload and warm up model on hot-swap
        asyncio.create_task(warmup_model(body.vlm_model))
    elif body.llm_model:
        ai_config.llm_model = body.llm_model
        asyncio.create_task(warmup_llm(body.llm_model))
        
    if body.think_mode is not None:
        ai_config.think_mode = body.think_mode
        
    if body.use_real_time:
        ai_config.mock_time = None
    elif body.mock_time is not None:
        ai_config.mock_time = body.mock_time
    return {"message": "Models updated successfully", "active_vlm": ai_config.vlm_model, "active_llm": ai_config.llm_model, "think_mode": ai_config.think_mode}


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
    await ai_engine.reload_record_store(db)
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
    vlm_model = "gemma4:12b-it-qat"
    llm_model = "qwen2.5:3b"
    think_mode = False
    confidence_threshold = 0.70
    mock_time = None

ai_config = AIConfig()

# SigLIP2 sketch classification engine (initialized async at startup)
siglip_engine: SigLIPEngine | None = None

def _init_siglip():
    """Load SigLIP2 model and pre-compute AAC text embeddings (runs in background thread)."""
    global siglip_engine
    try:
        logger.info("[SigLIP2] Initializing SigLIP2 engine...")
        siglip_engine = SigLIPEngine()
        siglip_engine.precompute_text_embeddings(AAC_LABELS)
        logger.info(f"[SigLIP2] Ready — {len(AAC_LABELS)} AAC labels cached for zero-shot classification.")
    except Exception as e:
        logger.error(f"[SigLIP2] Failed to initialize: {e}")
        siglip_engine = None

from vector_store import EmbeddingEngine, VectorRecordStore

embedding_engine: EmbeddingEngine | None = None

async def warmup_model(model_name: str):
    """Warm up a specific VLM/LLM model in Ollama using a dummy image to compile layers/context."""
    try:
        from PIL import Image, ImageDraw
        import io
        img = Image.new('RGB', (224, 224), color='white')
        d = ImageDraw.Draw(img)
        d.text((10, 10), "Test Medication 10mg", fill=(0, 0, 0))
        
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        dummy_image = buf.getvalue()
        
        start_warmup = time.perf_counter()
        logger.info(f"[TELEMETRY] Preloading and warming up model '{model_name}' in the background...")
        
        prompt = """
        Analyze this image containing a prescription, medication label, or medical supply.
        Extract the structured information to be used as medical grounding.
        Return a JSON object with this exact structure:
        {
          "type": "medication",
          "name": "name of medication or supply",
          "details": "dosage, frequency, or relevant details"
        }
        """
        
        async_client = ollama.AsyncClient()
        response = await async_client.generate(
            model=model_name, 
            prompt=prompt, 
            images=[dummy_image],
            format="json",
            think=ai_config.think_mode,
            keep_alive="24h",
            options={"num_ctx": 1024} # MUST match inference to prevent eviction
        )
        
        warmup_time = time.perf_counter() - start_warmup
        prefill_s = response.get('prompt_eval_duration', 0) / 1e9
        decode_s = response.get('eval_duration', 0) / 1e9
        
        logger.info(f"[TELEMETRY] Warmup for model '{model_name}' completed in {warmup_time:.4f}s")
        logger.info(f"[TELEMETRY] ├─ Prefill: {prefill_s:.4f}s ({response.get('prompt_eval_count', 0)} tokens)")
        logger.info(f"[TELEMETRY] ├─ Decode: {decode_s:.4f}s ({response.get('eval_count', 0)} tokens)")
        logger.info(f"[TELEMETRY] └─ Total: {prefill_s + decode_s:.4f}s")
    except Exception as e:
        logger.warning(f"Warmup failed for model '{model_name}': {e}")

async def warmup_llm(model_name: str):
    """Warm up a specific LLM model in Ollama using a text prompt to compile layers/context."""
    try:
        start_warmup = time.perf_counter()
        logger.info(f"[TELEMETRY] Preloading and warming up LLM '{model_name}' in the background...")
        
        prompt = "Hello. Please acknowledge."
        
        async_client = ollama.AsyncClient()
        response = await async_client.generate(
            model=model_name, 
            prompt=prompt, 
            think=ai_config.think_mode,
            keep_alive="24h",
            options={"num_ctx": 1024} # MUST match inference to prevent eviction
        )
        
        warmup_time = time.perf_counter() - start_warmup
        prefill_s = response.get('prompt_eval_duration', 0) / 1e9
        decode_s = response.get('eval_duration', 0) / 1e9
        
        logger.info(f"[TELEMETRY] Warmup for LLM '{model_name}' completed in {warmup_time:.4f}s")
        logger.info(f"[TELEMETRY] ├─ Prefill: {prefill_s:.4f}s ({response.get('prompt_eval_count', 0)} tokens)")
        logger.info(f"[TELEMETRY] ├─ Decode: {decode_s:.4f}s ({response.get('eval_count', 0)} tokens)")
        logger.info(f"[TELEMETRY] └─ Total: {prefill_s + decode_s:.4f}s")
    except Exception as e:
        logger.warning(f"Warmup failed for LLM '{model_name}': {e}")

class AIEngine:
    """Interface for VLM, LLM and RAG operations via Ollama."""
    def __init__(self):
        self.record_store = VectorRecordStore(engine=None)
        # RAG pre-warm cache: (tag, patient_id, time_hour) -> intent string
        self._rag_cache: dict = {}
        # In-flight futures: (tag, patient_id, time_hour) -> asyncio.Future
        self._rag_futures: dict = {}
        # Seeding will be triggered by the FastAPI startup event

    async def append_record(self, db: Session, rec: models.MedicalRecord):
        """Appends a single record to the store without a full reload."""
        if rec.patient_id_fk:
            p = db.query(models.Patient).filter(models.Patient.id == rec.patient_id_fk).first()
            if p:
                await self.record_store.add_record(p.patient_id, rec.content)
        logger.info(f"Appended new record {rec.id} to Record Store.")

    def _rag_cache_key(self, tag: str, patient_id: str) -> tuple:
        """Cache key includes the current hour so time-sensitive results expire naturally."""
        from datetime import datetime
        hour = ai_config.mock_time.split(':')[0] if getattr(ai_config, 'mock_time', None) else datetime.now().strftime('%H')
        return (tag.lower(), patient_id, hour)

    async def get_rag_cached(self, tag: str, patient_id: str, explicit_override: bool = False) -> str:
        """Cache-first RAG lookup: hit → instant, in-flight → await, miss → fresh call."""
        key = self._rag_cache_key(tag, patient_id)

        # 1. Cache hit — instant
        if key in self._rag_cache:
            logger.info(f"[CACHE] HIT for tag='{tag}' — returning cached intent instantly")
            return self._rag_cache[key]

        # 2. In-flight — await existing future instead of spawning duplicate call
        if key in self._rag_futures:
            logger.info(f"[CACHE] AWAIT in-flight future for tag='{tag}'")
            return await self._rag_futures[key]

        # 3. Miss — fresh call
        logger.info(f"[CACHE] MISS for tag='{tag}' — executing fresh RAG call")
        return await self.apply_rag(tag, patient_id, explicit_override=explicit_override)

    async def prewarm_rag(self, tags: list, patient_id: str):
        """Fire RAG calls for alternative tags in the background and cache results."""
        for tag in tags:
            if not tag:
                continue
            key = self._rag_cache_key(tag, patient_id)
            if key in self._rag_cache or key in self._rag_futures:
                continue  # Already cached or in-flight
            loop = asyncio.get_event_loop()
            future = loop.create_future()
            self._rag_futures[key] = future
            try:
                logger.info(f"[CACHE] Pre-warming RAG for alternative tag='{tag}'")
                result = await self.apply_rag(tag, patient_id, explicit_override=True)
                self._rag_cache[key] = result
                if not future.done():
                    future.set_result(result)
            except Exception as e:
                logger.warning(f"[CACHE] Pre-warm failed for tag='{tag}': {e}")
                if not future.done():
                    future.set_exception(e)
            finally:
                self._rag_futures.pop(key, None)

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

            # Warm up the RAG LLM model (Qwen) at startup so it's instantly ready
            await warmup_llm(ai_config.llm_model)

            # Preload Kokoro model session if assets are downloaded
            # (DISABLED FOR NOW to save memory - will lazy-load on first TTS request)
            # model_path = os.path.join(os.path.dirname(__file__), "kokoro-v1.0.onnx")
            # voice_path = os.path.join(os.path.dirname(__file__), "voices-v1.0.bin")
            # if os.path.exists(model_path) and os.path.exists(voice_path):
            #     try:
            #         from kokoro_onnx import Kokoro
            #         logger.info("[TTS] Preloading Kokoro-82M model session into memory...")
            #         self.kokoro_model = Kokoro(model_path, voice_path)
            #         logger.info("[TTS] Kokoro-82M model successfully preloaded.")
            #     except Exception as tts_err:
            #         logger.error(f"[TTS] Failed to preload Kokoro model: {tts_err}")
        finally:
            db.close()

    async def interpret_sketch_fast(self, image_bytes: bytes) -> str:
        """Uses SigLIP2 zero-shot classification to identify the sketch, returning the top candidate."""
        logger.info("[TELEMETRY] Starting sketch interpretation (Fast Mode) with SigLIP2...")

        if siglip_engine is None:
            logger.warning("[SigLIP2] Engine not initialized yet, returning 'unknown'")
            return "unknown"

        results = await asyncio.to_thread(siglip_engine.classify, image_bytes, 1)

        if results:
            label, score = results[0]
            logger.info(f"[TELEMETRY] SigLIP2 fast result: '{label}' (score={score:.4f})")
            return label
        return "unknown"

    async def interpret_sketch_alternatives(self, image_bytes: bytes, top_tag: str) -> list:
        """Uses SigLIP2 to generate alternative classification candidates."""
        logger.info(f"[TELEMETRY] Starting sketch interpretation (Alternatives Mode) for '{top_tag}' with SigLIP2...")

        if siglip_engine is None:
            logger.warning("[SigLIP2] Engine not initialized yet, returning empty alternatives")
            return []

        results = await asyncio.to_thread(siglip_engine.classify, image_bytes, 6)

        # Return labels 2-6, excluding the top tag already returned by interpret_sketch_fast
        alternatives = [
            label for label, _score in results
            if label.lower() != top_tag.lower()
        ]
        return alternatives[:5]

    async def apply_rag(self, tag: str, patient_id: str, explicit_override: bool = False, emit_chunk_cb=None) -> str:
        """Queries context and synthesizes final intent."""
        logger.info(f"[TELEMETRY] Starting RAG intent synthesis for '{tag}'...")
        
        start_search = time.perf_counter()
        # TRUE RAG: Semantic search instead of returning all
        context = self.record_store.search(patient_id, query=tag, top_k=2)
        context_str = "\n".join(context)
        logger.info(f"[TELEMETRY] RAG Semantic Search completed in {time.perf_counter() - start_search:.4f}s (found {len(context)} top semantic matches)")
        
        from datetime import datetime
        current_time = ai_config.mock_time if getattr(ai_config, "mock_time", None) else datetime.now().strftime("%H:%M")
        time_source = "OVERRIDE" if getattr(ai_config, "mock_time", None) else "REAL"
        logger.info(f"[TELEMETRY] RAG temporal grounding using {time_source} time: {current_time}")
        
        if explicit_override:
            # Patient explicitly selected this tag — ignore time grounding, trust semantic match only
            prompt = f"""Task: Translate AAC symbol '{tag}' into a functional first-person request (e.g. "cup" -> "I'm thirsty, can I have water?").
Records:
{context_str}
Rules:
1. Output ONE first-person sentence.
2. Use specific names/details from records if semantically matching '{tag}'.
3. Answer ONLY with the request sentence."""
        else:
            prompt = f"""Task: Translate AAC sketch '{tag}' into a functional first-person request (e.g. "cup" -> "I'm thirsty, can I have water?").
Time: {current_time}
Records:
{context_str}
Rules:
1. Output ONE first-person sentence.
2. Use specific names/details from records if matching '{tag}', prioritizing records scheduled near {current_time}.
3. Answer ONLY with the request sentence."""
        
        start_llm = time.perf_counter()
        async_client = ollama.AsyncClient()
        response_text = ""
        prefill_s = 0
        decode_s = 0
        prompt_eval_count = 0
        eval_count = 0
        
        async for chunk in await async_client.generate(
            model=ai_config.llm_model,
            prompt=prompt,
            think=ai_config.think_mode,
            keep_alive="24h",
            stream=True,
            options={
                "temperature": 0.0,
                "top_k":  64,
                "top_p": 0.95,
                "num_predict": 50, # Patient requests are concise and should not exceed 50 tokens
                "num_ctx": 1024 # CRITICAL: MUST MATCH VLM TO PREVENT MODEL RELOADS
            }
        ):
            chunk_text = chunk.get('response', '')
            response_text += chunk_text
            if emit_chunk_cb and chunk_text:
                await emit_chunk_cb(chunk_text)
                
            if chunk.get('done'):
                prefill_s = chunk.get('prompt_eval_duration', 0) / 1e9
                decode_s = chunk.get('eval_duration', 0) / 1e9
                prompt_eval_count = chunk.get('prompt_eval_count', 0)
                eval_count = chunk.get('eval_count', 0)

        llm_time = time.perf_counter() - start_llm
        logger.info(f"[TELEMETRY] RAG LLM ollama.generate call completed in {llm_time:.4f}s")
        logger.info(f"[TELEMETRY] ├─ Prefill (Phase B): {prefill_s:.4f}s ({prompt_eval_count} tokens)")
        logger.info(f"[TELEMETRY] ├─ Decode (Phase C): {decode_s:.4f}s ({eval_count} tokens)")
        logger.info(f"[TELEMETRY] └─ Total (Phase B+C): {prefill_s + decode_s:.4f}s")
        return response_text.strip()

    async def apply_rag_relational(self, tags: list, patient_id: str, emit_chunk_cb=None) -> dict:
        """Multi-concept RAG: synthesizes a relational intent from an array of VLM-resolved tags."""
        logger.info(f"[TELEMETRY] Starting RELATIONAL RAG intent synthesis for tags={tags}...")

        # Confidence check: filter out unknown/generic tags
        useless = {'unknown', 'abstract', 'drawing', 'sketch', 'object', 'shape', 'line', 'scribble'}
        valid_tags = [t for t in tags if t.lower().strip() not in useless]
        low_confidence = len(valid_tags) < len(tags)

        if not valid_tags:
            # All tags are garbage — hard fallback
            return {
                'intent': 'I drew something but I\'m not sure how to describe it. Can you come take a look?',
                'low_confidence': True
            }

        start_search = time.perf_counter()
        start_search = time.perf_counter()
        # TRUE RAG: Search for the relational tags combined
        query_str = " ".join(valid_tags)
        context = self.record_store.search(patient_id, query=query_str, top_k=3)
        context_str = "\n".join(context)
        logger.info(f"[TELEMETRY] RAG Semantic Search completed in {time.perf_counter() - start_search:.4f}s (found {len(context)} top semantic matches)")

        from datetime import datetime
        current_time = ai_config.mock_time if getattr(ai_config, 'mock_time', None) else datetime.now().strftime('%H:%M')
        time_source = 'OVERRIDE' if getattr(ai_config, 'mock_time', None) else 'REAL'
        logger.info(f"[TELEMETRY] RAG temporal grounding using {time_source} time: {current_time}")

        tags_str = ', '.join(valid_tags)

        prompt = f"""Task: Translate the AAC sketch sequence {tags_str} into a SINGLE functional first-person request.
Time: {current_time}
Records:
{context_str}
Rules:
1. Output ONE first-person sentence connecting ALL concepts (e.g. "window"+"cold" -> "I'm cold, can you close the window?").
2. Use specific names/details from records if relevant, prioritizing those scheduled near {current_time}.
3. Answer ONLY with the request sentence."""

        start_llm = time.perf_counter()
        async_client = ollama.AsyncClient()
        response_text = ""
        prefill_s = 0
        decode_s = 0
        prompt_eval_count = 0
        eval_count = 0
        
        async for chunk in await async_client.generate(
            model=ai_config.llm_model,
            prompt=prompt,
            think=ai_config.think_mode,
            keep_alive="24h",
            stream=True,
            options={
                'temperature': 0.0,
                'top_k': 64,
                'top_p': 0.95,
                'num_predict': 60,
                'num_ctx': 1024
            }
        ):
            chunk_text = chunk.get('response', '')
            response_text += chunk_text
            if emit_chunk_cb and chunk_text:
                await emit_chunk_cb(chunk_text)
                
            if chunk.get('done'):
                prefill_s = chunk.get('prompt_eval_duration', 0) / 1e9
                decode_s = chunk.get('eval_duration', 0) / 1e9
                prompt_eval_count = chunk.get('prompt_eval_count', 0)
                eval_count = chunk.get('eval_count', 0)

        llm_time = time.perf_counter() - start_llm
        logger.info(f"[TELEMETRY] Relational RAG LLM completed in {llm_time:.4f}s")
        logger.info(f"[TELEMETRY] ├─ Prefill: {prefill_s:.4f}s ({prompt_eval_count} tokens)")
        logger.info(f"[TELEMETRY] ├─ Decode: {decode_s:.4f}s ({eval_count} tokens)")
        logger.info(f"[TELEMETRY] └─ Total: {prefill_s + decode_s:.4f}s")

        intent = response_text.strip()

        # If we had some unknown tags, append a note for the caretaker
        if low_confidence:
            unknown_count = len(tags) - len(valid_tags)
            intent += f" (Note: {unknown_count} drawing(s) could not be identified)"

        return {
            'intent': intent,
            'low_confidence': low_confidence
        }

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

def clean_and_filter_options(options: list, top_tag: str) -> list:
    """Case-insensitively cleans, filters out useless/abstract tags, removes top_tag, and deduplicates options."""
    cleaned = []
    seen = set()
    
    top_tag_norm = top_tag.strip().lower()
    
    useless_tags = {
        "abstract object", "abstract shape", "abstract", "drawing", "sketch",
        "unknown", "something", "object", "canvas", "image", "picture", "shape",
        "line", "lines", "doodle", "doodles", "scribble", "scribbles", "stroke", "strokes",
        "abstract art", "artwork"
    }
    
    for opt in options:
        if not opt:
            continue
        opt_str = str(opt).strip()
        opt_lower = opt_str.lower()
        
        # 1. Skip if it is a useless abstract concept
        if opt_lower in useless_tags:
            continue
            
        # 2. Skip if it matches the top tag case-insensitively
        if opt_lower == top_tag_norm:
            continue
            
        # 3. Skip if already processed (deduplication)
        if opt_lower in seen:
            continue
            
        seen.add(opt_lower)
        cleaned.append(opt_str)
        
    if not cleaned:
        # Standard default fallbacks to keep UI interactive and helpful
        cleaned = ["water", "medication", "bathroom", "food"]
        
    return cleaned

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
        
        raw_top_tag = await ai_engine.interpret_sketch_fast(image_bytes)
        
        useless_tags = {
            "abstract object", "abstract shape", "abstract", "drawing", "sketch",
            "unknown", "something", "object", "canvas", "image", "picture", "shape",
            "line", "lines", "doodle", "doodles", "scribble", "scribbles", "stroke", "strokes",
            "abstract art", "artwork"
        }
        
        top_tag = raw_top_tag if raw_top_tag.lower() not in useless_tags else "unknown"
        if top_tag == "unknown":
            top_tag = "water" # Fallback if totally abstract
            
        top_tag_lower = top_tag.lower()
        is_person = any(w in top_tag_lower for w in ['person', 'stick figure', 'man', 'woman', 'human', 'face', 'boy', 'girl'])
        
        if is_person:
            logger.info("[TELEMETRY] Person tag detected; executing family relationship RAG branch...")
            start_search = time.perf_counter()
            context = ai_engine.record_store.search(patient_id, query="family member friend relative visitor", top_k=3)
            context_str = "\n".join(context)
            logger.info(f"[TELEMETRY] Family records semantic search completed in {time.perf_counter() - start_search:.4f}s")
            
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
            async_client = ollama.AsyncClient()
            response_text = ""
            prefill_s = 0
            decode_s = 0
            prompt_eval_count = 0
            eval_count = 0
            
            async for chunk in await async_client.generate(
                model=ai_config.llm_model,
                prompt=prompt,
                format="json",
                think=ai_config.think_mode,
                keep_alive="24h",
                stream=True,
                options={
                    "temperature": 0.0,
                    "top_k":  64,
                    "top_p": 0.95,
                    "num_predict": 100,
                    "num_ctx": 1024 # CRITICAL: MUST MATCH VLM TO PREVENT MODEL RELOADS
                }
            ):
                chunk_text = chunk.get('response', '')
                response_text += chunk_text
                if chunk_text:
                    await sio.emit('stream_chunk', {'chunk': chunk_text}, room=sid)
                    
                if chunk.get('done'):
                    prefill_s = chunk.get('prompt_eval_duration', 0) / 1e9
                    decode_s = chunk.get('eval_duration', 0) / 1e9
                    prompt_eval_count = chunk.get('prompt_eval_count', 0)
                    eval_count = chunk.get('eval_count', 0)
                    
            person_llm_time = time.perf_counter() - start_person_llm
            logger.info(f"[TELEMETRY] Person RAG LLM completed in {person_llm_time:.4f}s")
            try:
                data_json = json.loads(response_text)
                final_intent = data_json.get('intent', "I would like some company.")
                raw_options = data_json.get('options', ["I want someone to talk to"])
                initial_options = clean_and_filter_options(raw_options, top_tag)
            except:
                final_intent = "I would like some company."
                initial_options = ["Can someone sit with me?"]
                
            pipeline_time = time.perf_counter() - pipeline_start
            await sio.emit('interpretation_received', {
                'intent': final_intent,
                'options': initial_options,
                'original_sketch': data.get('image'),
                'top_tag': top_tag,
                'telemetry': {
                    'model': f"{ai_config.llm_model}{' + think' if ai_config.think_mode else ''}",
                    'pipeline_time_s': pipeline_time
                }
            }, room=sid)
        else:
            async def emit_chunk(chunk_text):
                await sio.emit('stream_chunk', {'chunk': chunk_text}, room=sid)
                
            final_intent = await ai_engine.apply_rag(top_tag, patient_id, emit_chunk_cb=emit_chunk)
            
            pipeline_time = time.perf_counter() - pipeline_start
            await sio.emit('interpretation_received', {
                'intent': final_intent,
                'options': [], # Emit empty initially for perceived speed
                'original_sketch': data.get('image'),
                'top_tag': top_tag,
                'telemetry': {
                    'model': 'siglip2-so400m-patch14-384',
                    'pipeline_time_s': pipeline_time
                }
            }, room=sid)
            
            # Fetch alternatives in background and emit
            async def fetch_options():
                alt_start = time.perf_counter()
                alt_tags = await ai_engine.interpret_sketch_alternatives(image_bytes, top_tag)
                options = clean_and_filter_options(alt_tags, top_tag)
                alt_time = time.perf_counter() - alt_start
                await sio.emit('options_received', {
                    'options': options,
                    'request_id': data.get('request_id'),
                    'telemetry': {
                        'alt_time_s': alt_time
                    }
                }, room=sid)
                if alt_tags:
                    asyncio.create_task(ai_engine.prewarm_rag(alt_tags, patient_id))
            
            asyncio.create_task(fetch_options())
        
    except Exception as e:
        logger.error(f"Error in process_sketch: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def process_sketch_background(sid, data):
    pipeline_start = time.perf_counter()
    logger.info("[TELEMETRY] Incoming process_sketch_background request received via Socket.IO")
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        start_decode = time.perf_counter()
        image_data = data.get('image').split(',')[1] if ',' in data.get('image') else data.get('image')
        image_bytes = base64.b64decode(image_data)
        
        raw_top_tag = await ai_engine.interpret_sketch_fast(image_bytes)
        
        useless_tags = {
            "abstract object", "abstract shape", "abstract", "drawing", "sketch",
            "unknown", "something", "object", "canvas", "image", "picture", "shape",
            "line", "lines", "doodle", "doodles", "scribble", "scribbles", "stroke", "strokes",
            "abstract art", "artwork"
        }
        
        top_tag = raw_top_tag if raw_top_tag.lower() not in useless_tags else "unknown"
        if top_tag == "unknown":
            top_tag = "water" # Fallback if totally abstract
            
        top_tag_lower = top_tag.lower()
        is_person = any(w in top_tag_lower for w in ['person', 'stick figure', 'man', 'woman', 'human', 'face', 'boy', 'girl'])
        
        if is_person:
            start_search = time.perf_counter()
            context = ai_engine.record_store.get_all(patient_id)
            context_str = "\n".join(context)
            
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
            response = await asyncio.to_thread(
                ollama.generate,
                model=ai_config.llm_model,
                prompt=prompt,
                format="json",
                think=ai_config.think_mode,
                keep_alive="24h",
                options={
                    "temperature": 0.0,
                    "top_k":  64,
                    "top_p": 0.95,
                    "num_predict": 100,
                    "num_ctx": 1024
                }
            )
            person_llm_time = time.perf_counter() - start_person_llm
            try:
                data_json = json.loads(response['response'])
                final_intent = data_json.get('intent', "I would like some company.")
                raw_options = data_json.get('options', ["I want someone to talk to"])
                initial_options = clean_and_filter_options(raw_options, top_tag)
            except:
                final_intent = "I would like some company."
                initial_options = ["Can someone sit with me?"]
                
            pipeline_time = time.perf_counter() - pipeline_start
            await sio.emit('background_interpretation_received', {
                'intent': final_intent,
                'options': initial_options,
                'original_sketch': data.get('image'),
                'top_tag': top_tag,
                'request_id': data.get('request_id'),
                'telemetry': {
                    'model': f"{ai_config.llm_model}{' + think' if ai_config.think_mode else ''}",
                    'pipeline_time_s': pipeline_time
                }
            }, room=sid)
        else:
            final_intent = await ai_engine.apply_rag(top_tag, patient_id)
            
            pipeline_time = time.perf_counter() - pipeline_start
            await sio.emit('background_interpretation_received', {
                'intent': final_intent,
                'options': [],
                'original_sketch': data.get('image'),
                'top_tag': top_tag,
                'request_id': data.get('request_id'),
                'telemetry': {
                    'model': 'siglip2-so400m-patch14-384',
                    'pipeline_time_s': pipeline_time
                }
            }, room=sid)
            
            async def fetch_options_bg():
                alt_start = time.perf_counter()
                alt_tags = await ai_engine.interpret_sketch_alternatives(image_bytes, top_tag)
                options = clean_and_filter_options(alt_tags, top_tag)
                alt_time = time.perf_counter() - alt_start
                await sio.emit('options_received', {
                    'options': options,
                    'request_id': data.get('request_id'),
                    'telemetry': {
                        'alt_time_s': alt_time
                    }
                }, room=sid)
                if alt_tags:
                    asyncio.create_task(ai_engine.prewarm_rag(alt_tags, patient_id))
            
            asyncio.create_task(fetch_options_bg())
        
    except Exception as e:
        logger.error(f"Error in process_sketch_background: {e}")
        await sio.emit('background_error', {
            'message': str(e),
            'request_id': data.get('request_id') if data else None
        }, room=sid)

@sio.event
async def process_frame(sid, data):
    """Eager per-frame SigLIP2: interpret a single storyboard frame and return its tag immediately."""
    frame_start = time.perf_counter()
    logger.info(f"[TELEMETRY] Incoming process_frame request (frame_index={data.get('frame_index')})")
    try:
        if sid not in connected_users:
            raise Exception('Unauthorized')

        image_data = data.get('image', '').split(',')[1] if ',' in data.get('image', '') else data.get('image', '')
        image_bytes = base64.b64decode(image_data)

        raw_tag = await ai_engine.interpret_sketch_fast(image_bytes)

        useless_tags = {
            'abstract object', 'abstract shape', 'abstract', 'drawing', 'sketch',
            'unknown', 'something', 'object', 'canvas', 'image', 'picture', 'shape',
            'line', 'lines', 'doodle', 'doodles', 'scribble', 'scribbles', 'stroke', 'strokes',
            'abstract art', 'artwork'
        }
        tag = raw_tag if raw_tag.lower() not in useless_tags else 'unknown'

        frame_time = time.perf_counter() - frame_start
        logger.info(f"[TELEMETRY] process_frame completed in {frame_time:.4f}s → tag='{tag}'")

        await sio.emit('frame_interpreted', {
            'tag': tag,
            'frame_index': data.get('frame_index'),
            'request_id': data.get('request_id'),
            'frame_time_s': frame_time
        }, room=sid)

    except Exception as e:
        logger.error(f"Error in process_frame: {e}")
        await sio.emit('frame_error', {
            'message': str(e),
            'frame_index': data.get('frame_index'),
            'request_id': data.get('request_id')
        }, room=sid)

@sio.event
async def process_storyboard(sid, data):
    """Multi-sketch submit: takes pre-resolved tags and runs relational RAG synthesis."""
    pipeline_start = time.perf_counter()
    logger.info(f"[TELEMETRY] Incoming process_storyboard request with tags={data.get('tags')}")
    try:
        if sid not in connected_users:
            raise Exception('Unauthorized')

        user = connected_users[sid]
        patient_id = user['sub'] if user['role'] == 'patient' else data.get('patient_id', 'patient')
        tags = data.get('tags', [])
        images = data.get('images', [])

        if not tags:
            raise Exception('No tags provided for storyboard synthesis')

        # Run relational RAG synthesis
        async def emit_chunk(chunk_text):
            await sio.emit('stream_chunk', {'chunk': chunk_text}, room=sid)
            
        result = await ai_engine.apply_rag_relational(tags, patient_id, emit_chunk_cb=emit_chunk)
        final_intent = result['intent']
        low_confidence = result.get('low_confidence', False)

        pipeline_time = time.perf_counter() - pipeline_start
        logger.info(f"[TELEMETRY] process_storyboard completed in {pipeline_time:.4f}s → intent='{final_intent}'")

        # Use the first image as the representative sketch for the caretaker notification
        representative_image = images[0] if images else None

        await sio.emit('interpretation_received', {
            'intent': final_intent,
            'options': [],
            'original_sketch': representative_image,
            'top_tag': ' + '.join(tags),
            'low_confidence': low_confidence,
            'telemetry': {
                'model': f"{ai_config.llm_model}{' + think' if ai_config.think_mode else ''}",
                'pipeline_time_s': pipeline_time
            }
        }, room=sid)

        # Fetch alternative relational intents in the background
        async def fetch_storyboard_options():
            alt_start = time.perf_counter()
            # Generate alternatives by running RAG with shuffled/partial tag combos
            alt_options = []
            for i, tag in enumerate(tags):
                try:
                    single_intent = await ai_engine.apply_rag(tag, patient_id)
                    alt_options.append(single_intent)
                except Exception:
                    pass
            alt_time = time.perf_counter() - alt_start
            await sio.emit('options_received', {
                'options': alt_options[:3],
                'telemetry': {'alt_time_s': alt_time}
            }, room=sid)

        asyncio.create_task(fetch_storyboard_options())

    except Exception as e:
        logger.error(f"Error in process_storyboard: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def pinpoint_selection(sid, data):
    try:
        if sid not in connected_users:
            raise Exception("Unauthorized")
            
        user = connected_users[sid]
        tag = data.get('tag')
        patient_id = user['sub'] if user['role'] == "patient" else data.get('patient_id', 'patient')
        
        # Patient explicitly chose this tag — check cache first, then fall through
        final_intent = await ai_engine.get_rag_cached(tag, patient_id, explicit_override=True)
        
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
        image = data.get('image')
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
                        'patient_name': patient.name,
                        'image': image
                    }, room=f"caretaker_{ct.user_id}")
            
            # Notify patient that it's officially dispatched
            await sio.emit('interpretation_dispatched', {'intent': intent}, room=sid)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in send_interpretation: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def scan_frame(sid, data):
    """Realtime binary WebSocket listener for AR bounding boxes."""
    try:
        image_data = data.get('image')
        mode = data.get('mode', 'medication')
        scope = data.get('scope', 'targeted')
        
        # Native binary extraction or Base64 fallback decoding
        if isinstance(image_data, bytes):
            image_bytes = image_data
        else:
            b64 = image_data.split(",")[1] if "," in image_data else image_data
            image_bytes = base64.b64decode(b64)
            
        # Phase 2: Server-Side Canvas downscaling offload
        image_bytes = downscale_image_bytes(image_bytes)
            
        scope_instruction = "identify ONLY the single most central, prominent focal object." if scope == "targeted" else "identify ONLY the 2 to 4 most prominent, major objects in the foreground."
        
        prompt = f"""
        Analyze this image and {scope_instruction}
        Do NOT list minor background details or tiny items. Keep the response extremely fast and concise!
        
        If the mode is "medication", prioritize prominent medical supplies, prescription labels, or large pill bottles.
        If the mode is "environment", prioritize prominent furniture, large appliances, and clear focal objects.
        
        For each identified object, return its normalized 2D bounding box coordinate percentages from 0 to 100 in the format [ymin, xmin, ymax, xmax].
        ymin is top edge percent, xmin is left edge percent, ymax is bottom edge percent, and xmax is right edge percent.
        
        You MUST return a JSON object matching this exact structure:
        {{
          "objects": [
            {{
              "type": "medication",
              "name": "short name of the object (e.g., laptop, water bottle, blue mug)",
              "details": "color, state, location, or dosage context (e.g., resting on the wooden table)",
              "box_2d": [ymin, xmin, ymax, xmax]
            }}
          ]
        }}
        """
        
        response = await asyncio.to_thread(
            ollama.generate,
            model=ai_config.vlm_model,
            prompt=prompt,
            images=[image_bytes],
            format="json",
            think=ai_config.think_mode,
            keep_alive="24h",
            options={"num_ctx": 1024} 
        )
        
        raw_resp = response.get('response', '')
        
        # Preamble stripper
        clean_resp = raw_resp.strip()
        start = min([clean_resp.find('{') if '{' in clean_resp else len(clean_resp), clean_resp.find('[') if '[' in clean_resp else len(clean_resp)])
        end = max([clean_resp.rfind('}'), clean_resp.rfind(']')])
        
        if start < len(clean_resp) and end >= 0:
            clean_resp = clean_resp[start:end+1]
            
        try:
            parsed_data = json.loads(clean_resp)
        except json.JSONDecodeError as json_err:
            import ast
            try:
                parsed_data = ast.literal_eval(clean_resp)
            except Exception:
                parsed_data = {"objects": []}
                
        if isinstance(parsed_data, list):
            parsed_data = {"objects": parsed_data}
        elif isinstance(parsed_data, dict) and "objects" not in parsed_data:
            if "name" in parsed_data or "type" in parsed_data or "box_2d" in parsed_data:
                parsed_data = {"objects": [parsed_data]}
            else:
                for k, v in parsed_data.items():
                    if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict):
                        parsed_data["objects"] = v
                        break
                if "objects" not in parsed_data:
                    parsed_data = {"objects": []}
                    
        if isinstance(parsed_data, dict) and "objects" in parsed_data:
            for obj in parsed_data["objects"]:
                t = str(obj.get("type", "environmental_object")).strip().lower()
                obj["type"] = "medication" if "med" in t else "environmental_object"
                import random
                if "box_2d" not in obj or not isinstance(obj["box_2d"], list) or len(obj["box_2d"]) < 4:
                    ymin = random.randint(15, 30)
                    xmin = random.randint(15, 30)
                    obj["box_2d"] = [ymin, xmin, ymin + 45, xmin + 45]
                else:
                    coords = []
                    try:
                        raw_vals = [float(x) for x in obj["box_2d"][:4]]
                        max_val = max(raw_vals) if raw_vals else 0.0
                        is_decimal = (max_val <= 1.0 and any(x > 0 for x in raw_vals))
                        is_1000 = (max_val > 100.0)
                        for val in raw_vals:
                            num = val
                            if is_decimal: num = num * 100.0
                            elif is_1000: num = num / 10.0
                            coords.append(int(round(min(100.0, max(0.0, num)))))
                    except Exception as e:
                        ymin = random.randint(15, 30)
                        xmin = random.randint(15, 30)
                        coords = [ymin, xmin, ymin + 45, xmin + 45]
                    obj["box_2d"] = coords
        
        # Return result directly as an acknowledgement callback
        return parsed_data

    except Exception as e:
        logger.error(f"Error in scan_frame socket listener: {e}")
        return {'error': str(e)}

def generate_self_signed_cert(cert_path="cert.pem", key_path="key.pem"):
    import os
    if os.path.exists(cert_path) and os.path.exists(key_path):
        return

    from datetime import datetime, timedelta
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    import ipaddress

    logger.info("Generating self-signed SSL certificate for local secure network context...")
    
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Setup SAN extensions to satisfy iOS Safari security policy for local network IPs
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, u"Agapita Local Secure Server"),
    ])
    
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.utcnow()
    ).not_valid_after(
        datetime.utcnow() + timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName(u"localhost"),
            x509.IPAddress(ipaddress.ip_address(u"127.0.0.1")),
            x509.IPAddress(ipaddress.ip_address(u"172.20.10.3")),
            x509.IPAddress(ipaddress.ip_address(u"192.168.100.177")),
            x509.IPAddress(ipaddress.ip_address(u"192.168.100.145")),
        ]),
        critical=False,
    ).sign(key, hashes.SHA256())

    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    
    logger.info("Self-signed SSL certificate generated successfully.")

if __name__ == "__main__":
    import uvicorn
    use_https = os.environ.get("AGAPITA_USE_HTTPS", "false").lower() == "true"
    
    # Initialize SigLIP2 synchronously before starting the server
    # so the HuggingFace download progress bar is visible in the terminal
    _init_siglip()
    
    embedding_engine = EmbeddingEngine()
    ai_engine.record_store.engine = embedding_engine
    
    if use_https:
        try:
            generate_self_signed_cert()
            ssl_key = "key.pem"
            ssl_cert = "cert.pem"
            logger.info("Starting FastAPI server in SECURE HTTPS mode...")
            uvicorn.run(socket_app, host="0.0.0.0", port=8000, ssl_keyfile=ssl_key, ssl_certfile=ssl_cert)
        except Exception as e:
            logger.error(f"Failed to generate self-signed cert or run HTTPS, falling back to HTTP: {e}")
            logger.info("Starting FastAPI server in HTTP mode...")
            uvicorn.run(socket_app, host="0.0.0.0", port=8000)
    else:
        logger.info("Starting FastAPI server in HTTP mode...")
        uvicorn.run(socket_app, host="0.0.0.0", port=8000)
