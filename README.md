# Agapita: AI-Powered Communication Assistant

<div align="center">
  <img src="https://img.shields.io/badge/Edge_AI-100%25_Offline-blue?style=for-the-badge" alt="Edge AI" />
  <img src="https://img.shields.io/badge/VLM-LLaVA-green?style=for-the-badge" alt="VLM" />
  <img src="https://img.shields.io/badge/RAG-Gemma_2-orange?style=for-the-badge" alt="RAG" />
  <img src="https://img.shields.io/badge/TTS-Kokoro_82M-blueviolet?style=for-the-badge" alt="TTS" />
  <img src="https://img.shields.io/badge/Accessibility-Motor_Optimized-red?style=for-the-badge" alt="Accessibility" />
</div>

> "Giving a voice back to the beloved, one sketch at a time."

Agapita is an **offline, Edge AI-powered communication assistant** that restores agency to stroke survivors by using a **Multi-Dimensional RAG pipeline** to translate their hand-drawn sketches into highly personalized, empathetic spoken requests based on their clinical records, personal relationships, and physical environment.

---

## 🚀 Quick Start (Setup)

Agapita is designed for **Edge Deployment**. To get the system running locally:

1.  **Install Ollama**: Download from [ollama.com](https://ollama.com).
2.  **Pull Models**: 
    ```bash
    ollama pull gemma2:2b
    ollama pull llava
    ollama pull nomic-embed-text
    # Kokoro-82M is bundled with the server for offline TTS
    ```
3.  **Run Server**: 
    ```bash
    cd server
    python main.py
    ```
4.  **Run Caretaker Dashboard**:
    ```bash
    cd desktop
    npm install && npm run dev
    ```

For a detailed walkthrough and demo credentials, see the [**SETUP.md**](./SETUP.md).

---

## 🏗️ Technical Architecture

Agapita is built as a **Centralized Edge Hub** (FastAPI Server + Ollama) designed for high-integrity, private clinical environments.

- **Offline Sovereignty**: No clinical data ever leaves the local network, ensuring 100% HIPAA compliance by design.
- **Asymmetric Inference**: Shifts the cognitive burden from the patient (rough visual input) to the machine (complex natural language synthesis).
- **Multi-Dimensional RAG Engine**: A proprietary clinical reasoning pipeline that injects layers of patient-specific context (Clinical, Temporal, Relational, Environmental, Behavioral) into every inference cycle using **Gemma 2**.
- **Voice Modality (TTS)**: Integrated with **Kokoro-82M** to provide high-fidelity, empathetic spoken feedback.

---

## 🧠 Innovation Outcomes & Strategic Moat

### 1. Multi-Dimensional RAG Grounding
Agapita doesn't just guess what a sketch is; it dynamically cross-references visual input with:
- **Clinical/Medical**: Correlates drawings with history (e.g., Circle + Medication Schedule = *"I need my heart medicine"*).
- **Temporal**: Uses the clock to resolve intent (e.g., Pill drawn at 8 AM vs 9 PM).
- **Relational**: Suggests specific people based on family records (e.g., Stickman -> *"I want to see Martha"*).
- **Environmental**: Maps requests to the physical room (e.g., Square -> *"Turn on the TV"*).
- **Behavioral**: Factors in personal habits and recorded dislikes (e.g., Drawing a cup -> *"I would like some herbal tea"*).

### 2. The "Medical Interceptor" Safeguard
Unlike general-purpose LLMs, Agapita acts as a clinical interceptor. It can verify **NPO status** (fasting) before allowing a patient to request water, or alert a caretaker if a request contradicts a medical note.

---


## 🛡️ Industrial Value & Competition Alignment

### SEA CIC-SIC 2026 (Undergraduate Track)
Validated for technical feasibility and social impact. Addresses the massive regional pain point of understaffed rehabilitative wards in Southeast Asia through affordable, low-connectivity edge infrastructure.

---
*An educational outcome demonstrating the integration of AI research, medical ethics, and innovative engineering.*
