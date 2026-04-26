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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AgapitaServer")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    # Trigger seeding when the server starts and loop is running
    asyncio.create_task(ai_engine.seed_data())
    yield

# Initialize FastAPI
app = FastAPI(title="Agapita Edge Server", lifespan=lifespan)

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

    async def seed_data(self):
        await asyncio.sleep(2) # Wait for server to start
        logger.info("Seeding initial patient records...")
        await self.vector_store.add_record("patient_001", "Patient requires strict medication schedule for heart condition.")
        await self.vector_store.add_record("patient_001", "Patient frequently asks for water due to dry mouth side effects.")
        await self.vector_store.add_record("patient_001", "Patient uses a walker for bathroom trips.")

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

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def process_sketch(sid, data):
    try:
        patient_id = data.get('patient_id', 'patient_001')
        image_data = data.get('image').split(',')[1] if ',' in data.get('image') else data.get('image')
        image_bytes = base64.b64decode(image_data)
        
        interpretation = await ai_engine.interpret_sketch(image_bytes)
        
        if interpretation['top_confidence'] < CONFIDENCE_THRESHOLD:
            # For MVP, we'll provide some fallback options for pinpointing
            options = [interpretation['predictions'][0]['tag'], "water", "medication", "bathroom"]
            await sio.emit('pinpointing_required', {
                'options': list(set(options)),
                'original_sketch': data.get('image')
            }, room=sid)
            return

        final_intent = await ai_engine.apply_rag(interpretation['predictions'][0]['tag'], patient_id)
        await sio.emit('interpretation_complete', {'intent': final_intent}, room=sid)
        
    except Exception as e:
        logger.error(f"Error: {e}")
        await sio.emit('error', {'message': str(e)}, room=sid)

@sio.event
async def pinpoint_selection(sid, data):
    tag = data.get('tag')
    patient_id = data.get('patient_id', 'patient_001')
    final_intent = await ai_engine.apply_rag(tag, patient_id)
    await sio.emit('interpretation_complete', {'intent': final_intent}, room=sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
