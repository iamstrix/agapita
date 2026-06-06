# Agapita: AI-Powered Communication Assistant

<div align="center">
  <img src="https://img.shields.io/badge/Edge_AI-100%25_Offline-blue?style=for-the-badge" alt="Edge AI" />
  <img src="https://img.shields.io/badge/VLM-Gemma_4_E4B-green?style=for-the-badge" alt="VLM" />
  <img src="https://img.shields.io/badge/RAG-Gemma_4_E4B-orange?style=for-the-badge" alt="RAG" />
  <img src="https://img.shields.io/badge/Latency-~3s_E2E-brightgreen?style=for-the-badge" alt="Latency" />
  <img src="https://img.shields.io/badge/Accessibility-Motor_Optimized-red?style=for-the-badge" alt="Accessibility" />
</div>

> "Giving a voice back to the beloved, one sketch at a time."

---

## 🕯️ The Origin: A Promise to my Grandmother
Ten years ago, when I was a child, my grandmother suffered a severe stroke. Years later, when she recounted her hospital confinement to me, she described the terrifying loneliness of the night shift. When there were no caretakers in the room, she was left entirely non-verbal, unable to call for help, and had no choice but to wait in absolute silence until morning.

**Agapita** was born from that memory. It is a 100% offline, private, local-first communication bridge built to give non-verbal stroke patients their voice back — ensuring they are never left alone in the dark.

---

## 🎨 The Intranet Workflow

Agapita splits the workload into two highly focused interfaces designed to run privately on the local facility network:

### 1. The Patient's Drawing Canvas (The Core Interface)
Built with an ultra-accessible, mobile-first design, this canvas is the patient's voice. Patients with post-stroke aphasia or limited motor control trace simple paths, arrows, or crude shapes on an iPad/tablet. The local **Gemma 4 Vision** model decodes these gestures, translating imperfect motor traces into highly accurate intent requests (e.g., *"I need a drink of water"* or *"I want to see Martha"*).

### 2. The Caretaker's Ambient Scanner (The Grounding Engine)
Before the patient’s shift begins, the caregiver uses a Leica-inspired **Ambient Scanner** to snap a quick photo of the room. Running locally, the model automatically detects room layouts and physical anchors (like a water cup on the nightstand or a pill bottle). These environmental grounding anchors are written directly to `agapita.db`, feeding the AI the visual vocabulary it needs to know exactly what the patient's drawings point to!

---


## 🚀 Quick Start

Agapita is designed for **Edge Deployment** on consumer hardware (tested on RTX 5060, 8GB VRAM).

### Standard Installation (Local)

1. **Install Ollama**: Download from [ollama.com](https://ollama.com). Ensure the Ollama app is running.
2. **Pull the unified model** (one model powers everything):
    ```bash
    ollama pull gemma4:e4b
    ```
3. **Run the server**:
    ```bash
    cd server
    python main.py
    ```
4. **Run the frontend**:
    ```bash
    cd desktop
    npm install && npm run dev
    ```

### Docker Deployment (Recommended for Teams)

We provide a fully containerized environment for consistent development across different machines.

1. **Install Ollama** and pull the model as described above. Ensure Ollama is running natively on your host machine.
2. **Run the Docker launcher script**:
    ```bash
    ./docker-dev.sh
    ```
    This script will automatically detect your Mac's Wi-Fi IP, inject it so mobile devices can access the web app, and start both the frontend and backend via `docker-compose`. 

**Applying Future Code Updates in Docker:**
Because we map your local `./server` and `./desktop` folders directly into the containers as volumes, any changes you make to the Python or TypeScript source code will **hot-reload automatically**! You don't need to do anything special for day-to-day coding.

However, if you add new dependencies (i.e. modifying `requirements.txt` or installing new npm packages in `package.json`), you must rebuild the Docker images to bake the new dependencies into the environment:
```bash
docker-compose up --build
```

For demo credentials and a full walkthrough, see [**SETUP.md**](./SETUP.md).

---

## ⚡ Performance

Agapita is optimized for near-instantaneous inference on edge hardware:

| Pipeline Stage | Duration |
|---|---|
| Image normalization (224×224) | ~0.01s |
| VLM sketch recognition (Gemma 4 E4B) | ~1.7s |
| Full-context RAG synthesis (Gemma 4 E4B) | ~0.9s |
| **End-to-end pipeline** | **~2.5 – 3.5s** |

> Gemma 4 E4B remains permanently resident in VRAM (~4.5GB), eliminating model-swap penalties entirely.

---

## 🏗️ Architecture

Agapita runs as a **Centralized Edge Hub** — a FastAPI + Socket.IO server backed by a single unified Ollama inference engine.

### Unified Gemma 4 Strategy
Unlike conventional multi-model pipelines, Agapita uses a **single model** (`gemma4:e4b`) for all inference tasks:

- **VLM Stage**: Gemma 4's native Vision Adapter interprets the patient's sketch and returns the top 3 candidate objects.
- **RAG Stage**: Gemma 4 (text-only) performs Full-Context Injection — all patient records are injected directly into the prompt's 32k context window, eliminating the need for a separate embedding model.

This approach was specifically chosen to prevent **VRAM thrashing** on low-VRAM edge hardware. Switching between a VLM, an embedding model, and an LLM at inference time would cause 20+ second model eviction penalties on an 8GB GPU.

### RAG Grounding Dimensions
The RAG engine cross-references the sketch against five contextual layers:

- **Clinical**: Medication names, dosages, and schedules (e.g., *"circle"* + 9PM → *"I need my Paracetamol"*)
- **Temporal**: Time-of-day awareness with a 60-minute lookahead window for upcoming events
- **Relational**: Named people from family/care records (e.g., *"stickman"* → *"I want to see Martha"*)
- **Environmental**: Room features (TV, window, thermostat) mapped to patient requests
- **Behavioral**: Personal habits and preferences (e.g., *"cup"* → *"I would like some herbal tea"*)

### Explicit Override Mode
When a patient selects an alternative interpretation from the confirmation screen, the system enters **Explicit Override Mode** — time-based grounding is fully suppressed and only semantic relevance to the chosen tag is used. This ensures the patient's intentional correction always takes priority.

---

## 🔑 Key Design Decisions

| Decision | Rationale |
|---|---|
| **Single model (Gemma 4 E4B)** | Prevents VRAM evictions on 8GB hardware; no embedding model needed |
| **Full-Context RAG over Vector Search** | Patient record sets are small (<50 records); vector search overhead exceeds brute-force injection at this scale |
| **224×224 sketch resolution** | Optimal balance between vision token count and recognition accuracy for rough line drawings |
| **`num_ctx: 1024` (unified)** | Consistent KV cache allocation prevents Ollama from reloading model weights between calls |
| **`think=False`** | Disables Chain-of-Thought reasoning for latency-critical paths |

---

## 🛡️ Privacy & Compliance

- **100% Offline**: No clinical data leaves the local network. All inference runs on-device via Ollama.
- **No Cloud Dependency**: Works in zero-connectivity hospital environments.
- **HIPAA-Compliant by Design**: Patient records never touch an external API.

---

## 🏆 Competition Alignment

### Gemma 4 Good Hackathon
Demonstrates a real-world accessibility application of Gemma 4's multimodal capabilities in an edge-constrained, safety-critical healthcare environment.

### SEA CIC-SIC 2026 (Undergraduate Track)
Addresses the regional challenge of understaffed rehabilitative wards in Southeast Asia through affordable, offline-first AI infrastructure.

---

*An educational outcome demonstrating the integration of AI research, medical ethics, and innovative engineering.*
