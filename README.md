# Agapita: AI-Powered Communication Assistant

<div align="center">
  <img src="https://img.shields.io/badge/Edge_AI-100%25_Offline-blue?style=for-the-badge" alt="Edge AI" />
  <img src="https://img.shields.io/badge/VLM-Gemma_4_E4B-green?style=for-the-badge" alt="VLM" />
  <img src="https://img.shields.io/badge/RAG-Gemma_4_E4B-orange?style=for-the-badge" alt="RAG" />
  <img src="https://img.shields.io/badge/Latency-~3s_E2E-brightgreen?style=for-the-badge" alt="Latency" />
  <img src="https://img.shields.io/badge/Accessibility-Motor_Optimized-red?style=for-the-badge" alt="Accessibility" />
</div>

> "Giving a voice back to the beloved, one sketch at a time."

Agapita is an **offline, Edge AI-powered communication assistant** that restores agency to stroke survivors and motor-impaired patients by translating rough hand-drawn sketches into highly personalized, empathetic spoken requests — grounded in the patient's clinical records, personal relationships, time of day, and physical environment.

---

## 🚀 Quick Start

Agapita is designed for **Edge Deployment** on consumer hardware (tested on RTX 5060, 8GB VRAM).

1. **Install Ollama**: Download from [ollama.com](https://ollama.com).
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
