# Agapita - Detailed Architecture & Data Flow Guide

This guide provides a comprehensive technical overview of the Agapita application. It details the system architecture, database models, AI pipeline flows, and real-time communication protocols used between the frontend and backend. 

---

## 1. System Overview

Agapita is a full-stack, AI-powered communication tool designed for motor-impaired patients. The system allows patients to draw crude sketches on a web canvas, which are then analyzed by a local Vision-Language Model (VLM), enhanced with the patient's personal medical context via Retrieval-Augmented Generation (RAG), and transmitted in real-time to a caretaker's dashboard.

### Tech Stack
- **Frontend**: React + Vite (Typescript), HTML5 Canvas for drawing.
- **Backend**: FastAPI + Uvicorn, Socket.IO for real-time bidirectional communication.
- **Database**: SQLite, orchestrated by SQLAlchemy ORM.
- **AI/Inference**: Locally hosted models via Ollama. 

---

## 2. Backend Architecture (`server/`)

The backend is completely modularized. Below are the key components governing the server infrastructure.

### Database Models ([`models.py`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/models.py))
Agapita uses a relational SQLite database structure defined via SQLAlchemy. The primary schemas are:
- `User`: The base authentication layer containing `username`, `hashed_password`, and an `Enum` defining the role (`admin`, `caretaker`, `patient`).
- `Patient`: Linked to a `User`. Contains specific fields like `patient_id` and relationships to `MedicalRecord` and assigned `Caretakers`.
- `Caretaker`: Linked to a `User`. Connected to multiple `Patient` records via the `Assignment` association table.
- `MedicalRecord`: Holds contextual facts about a patient (e.g., "Patient usually asks for water at 3 PM").
- `Assignment`: The many-to-many join table mapping caretakers to their assigned patients.

### Authentication ([`auth.py`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/auth.py))
Authentication uses stateless JWT (JSON Web Tokens). Passwords are cryptographically hashed using direct `bcrypt` calls to ensure compatibility across modern Python environments. 

### The Core Server ([`main.py`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/main.py))
The FastAPI instance mounts both standard HTTP REST endpoints and an asynchronous Socket.IO server. The core logic of the application resides inside the `AIEngine` class, which manages Ollama API requests, telemetry, and memory.

---

## 3. The Core AI Pipeline & Data Flow

This is the "magic" of Agapita. When a patient submits a sketch, the data travels through a specialized pipeline. 

### Phase 1: Receiving the Sketch
When the patient clicks submit, the HTML5 Canvas data is encoded into a Base64 PNG and emitted via Socket.IO:
```typescript
socketRef.current.emit('process_sketch', {
  image: dataUrl,
  patient_id: user.username
});
```
The backend `process_sketch` event handler ([`main.py:L947`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/main.py#L947)) intercepts this payload, decodes the base64 string back into bytes, and triggers the `AIEngine`.

### Phase 2: Vision Interpretation (VLM)
The bytes are passed to `interpret_sketch` ([`main.py:L716`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/main.py#L716)). 
1. **Downscaling**: The image is downscaled to `224x224` JPEG. Large images severely bottleneck Vision Transformers, so resizing forces near-instant inference.
2. **Prompting**: The VLM is instructed to return exactly 3 guessed items formatted as a JSON array (`{"items": ["apple", "heart", "water"]}`). 
3. **Inference**: Using `ollama.generate(format="json")`, the VLM evaluates the image and returns predictions.

### Phase 3: RAG Context Retrieval
Once the VLM returns the primary guess (e.g., `"water"`), the backend calls `apply_rag` ([`main.py:L779`](file:///Users/klydu/PersonalProjects/Agapita/agapita/server/main.py#L779)).
It fetches the patient's assigned medical history from the in-memory `RecordStore` (which was seeded from the SQLite database at startup).

### Phase 4: Intent Synthesis (LLM)
The LLM receives the patient's medical history, the current time of day, and the VLM's tag (`"water"`).
The prompt enforces strict rules:
- **Semantic Match**: Find the record most directly related to the tag.
- **Time Boost**: Only use records if they align with the current time of day.
- **First Person**: Output a single sentence as if the patient is speaking.

*Example Output*: `"Can I please have a bottle of water?"*

---

## 4. Socket.IO Event Payloads

Real-time communication ensures caretakers are alerted instantly without polling the server.

### Client to Server (Frontend ➔ Backend)
- **`request_records`**: Requests the patient's context records on load.
  - Payload: `{}`
- **`process_sketch`**: Dispatches the drawn canvas for AI analysis.
  - Payload: `{ image: "data:image/png;base64,...", patient_id: "patient1" }`
- **`pinpoint_selection`**: If the VLM's first guess was wrong, the patient clicks an alternative option.
  - Payload: `{ tag: "television", patient_id: "patient1", original_sketch: "base64..." }`
- **`send_interpretation`**: The patient confirms the final sentence, routing it to the caretaker.
  - Payload: `{ intent: "I want to watch TV", patient_id: "patient1", image: "base64..." }`

### Server to Client (Backend ➔ Frontend)
- **`records_update`**: Broadcasts the current active RAG records to the dashboard.
  - Payload: `{ records: ["[Room Environment] TV is present", "Patient takes meds at 9am"] }`
- **`interpretation_received`**: Returns the AI's best guess back to the patient for confirmation.
  - Payload: `{ intent: "I need water", options: ["drink", "cup"], original_sketch: "base64..." }`
- **`interpretation_dispatched`**: Confirming to the patient that the message was sent to the caretaker.
  - Payload: `{ intent: "I need water" }`
- **`patient_alert`**: Pushed to the Caretaker Dashboard when a patient needs help.
  - Payload: `{ patient_id: "patient1", intent: "I need water", image: "base64...", timestamp: "2026-06-06T12:00" }`

---

## 5. Frontend Architecture (`desktop/src/`)

The frontend is built using React components organized by user roles.
- **`PatientDashboard.tsx`**: Features a robust, responsive HTML5 drawing canvas. Supports landscape/portrait orientation and full-screen Focus Modes for motor-impaired users. Includes a configuration panel for injecting live RAG records.
- **`CaretakerDashboard.tsx`**: A real-time monitoring interface. Connects to Socket.IO and listens for the `patient_alert` event. Displays incoming sketches, the parsed intent, and allows the caretaker to "Resolve" the alert.
- **`AdminDashboard.tsx`**: Allows administrators to assign patients to caretakers, manage database schemas, and actively switch which AI models the server is targeting.

---

## 6. Performance & Memory Optimizations

Running large multimodel setups locally on consumer hardware requires precise optimization. Agapita employs several advanced techniques documented in the codebase:

### KV Cache & Pre-Warming
When the FastAPI server starts, `seed_data` forces a background "Warmup" generation against Ollama using a dummy image. This ensures the Vision Adapter and model weights are fully loaded into VRAM before the user ever loads the web app. 

### Preventing CPU Spillover
Ollama is configured via `AIConfig` to use the **same model** (e.g., `gemma4:e2b` or `qwen3-vl:8b`) for both the Vision task (interpreting the sketch) and the Text task (RAG synthesis). If different models were used, their combined sizes would exceed standard GPU Unified Memory limits (e.g., 16GB), forcing the model layers onto the CPU and spiking inference times from ~2 seconds to >8 seconds. 

### Telemetry Pipeline
The `AIEngine` splits all Ollama measurements into phases for debugging:
- **Phase A**: Image Vision processing.
- **Phase B (Prefill)**: The time it takes to evaluate the text prompt and KV cache.
- **Phase C (Decode)**: Token generation speed.
This telemetry is aggressively logged in `main.py` to ensure performance remains within expected bounds.
