# Architecture Design - Agapita

## 1. System Overview
Agapita uses a **Client-Server Edge Architecture**. The "Client" (React Native Tablet) handles the UI and sketching, while the "Edge Server" (Local PC/Mac) handles the heavy AI inference (VLM, LLM, RAG).

## 2. Component Stack

### A. Tablet Client (React Native)
*   **UI Framework:** React Native with TypeScript.
*   **Drawing:** `react-native-skia` for high-performance, smooth canvas rendering.
*   **Networking:** Socket.io-client for real-time communication with the Edge Server.
*   **Discovery:** Simple manual IP entry or ZeroConf (Bonjour/Avahi) for locating the Edge Server on the local network.

### B. Edge Server (Python Backend)
*   **Runtime:** Python 3.10+
*   **Framework:** FastAPI.
*   **Inference Engine:** **Ollama** (running as a local service).
    *   **VLM:** `moondream2` (tiny, fast) or `llava-v1.5-7b` (quantized 4-bit) for sketch interpretation.
    *   **LLM:** `gemma:7b` (quantized) for RAG synthesis.
*   **Communication:** Socket.io (via `python-socketio`) for bi-directional communication with tablets and caretaker devices.

### C. Vector Database & RAG
*   **Database:** **SQLite** with the **sqlite-vss** extension (or **ChromaDB** running in persistent mode).
*   **Embedding Model:** `nomic-embed-text` (via Ollama) to keep everything in one inference ecosystem.
*   **Schema:**
    ```sql
    TABLE patients (
      id UUID PRIMARY KEY,
      name TEXT,
      medical_summary_vss VECTOR(768) -- Embeddings of the medical record
    );
    
    TABLE sketches (
      id UUID PRIMARY KEY,
      patient_id REFERENCES patients(id),
      image_path TEXT,
      interpretation TEXT,
      timestamp DATETIME
    );
    ```

## 3. Data Flow

1.  **Sketch Capture:** Tablet captures drawing as a PNG.
2.  **Transmission:** Tablet sends PNG + `patient_id` via WebSocket to FastAPI.
3.  **VLM Inference:** FastAPI passes PNG to Ollama (`llava`).
    *   *Prompt:* "This is a simple sketch by a patient with motor impairment. What object is this? List top 3 possibilities."
4.  **RAG Contextualization:**
    *   FastAPI generates a search query from VLM results.
    *   SQLite-VSS finds relevant snippets from the patient's medical history.
    *   FastAPI sends snippets + VLM results to Ollama (`gemma`).
    *   *Prompt:* "The patient drew [VLM Results]. Their records say [RAG Snippets]. What is their most likely intent?"
5.  **Response/Pinpointing:**
    *   If high confidence: Send final interpretation to Caretaker.
    *   If low confidence: Send 4 image tags back to Tablet for Pinpointing.

## 4. Hardware Requirements (Minimum)
*   **Edge Server:** PC with NVIDIA GPU (8GB+ VRAM) or Apple Silicon Mac (16GB+ RAM) for acceptable inference speeds.
*   **Tablet:** Android or iPad (2020+ models) with stylus support recommended.

## 5. Security & Privacy
*   **Local-Only:** The FastAPI server binds to local IP addresses only.
*   **No Auth (MVP):** Physical access to the local WiFi is the primary security layer.
*   **Encryption:** (Future) TLS for internal network traffic if required by facility policy.