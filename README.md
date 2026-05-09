# Agapita: AI Communication Assistant

Agapita is a privacy-first, offline-ready communication bridge for non-verbal patients suffering from **Broca’s Aphasia** (common in stroke survivors). It interprets wobbly sketches and contextualizes them using the patient's local medical records to provide fast, accurate, and dignified communication with caretakers.

## 🌟 The Vision
Agapita moves beyond the close-ended "button-board" AAC systems. It uses a **Local Edge AI** to bridge the gap between a patient's simple sketch and their specific medical needs. 

### The Scenario
It is 8 PM. A patient with Broca’s Aphasia is in a hospital room. Their record says they need heart medication at 9 PM. They draw a wobbly circle. Agapita identifies the "circle/pill" and cross-references it with the upcoming medication schedule. 

Instead of just saying "Pill," it asks: **"Do you need your 9 PM heart medicine?"** The patient confirms with one tap, and the caretaker is notified instantly.

## 🛠️ Tech Stack
- **AI Core:** 100% Offline Edge Server (Ollama)
  - **VLM:** LLaVA for sketch recognition.
  - **LLM + RAG:** Gemma/Gemma 2 for medical record synthesis.
- **Client:** React Native (Android/iOS Tablet) + React (Desktop Dashboard).
- **Backend:** FastAPI + Socket.io + SQLAlchemy.
- **Security:** Fully local deployment to comply with **SEA CIC-SIC** data privacy mandates.

## 🚀 Key Features
- **Wobbly Sketch Interpretation:** VLM designed to handle motor-impaired jitter.
- **Contextual RAG:** Real-time synthesis of medical records for precise intent.
- **Admin Hot-Swapping:** Drag-and-drop medical records to patients to instantly update the AI's "understanding" of their needs.
- **Real-Time Monitor:** Patients can see the active "Context Cards" the AI is using for interpretation.
- **Pinpointing System:** If the AI is unsure, it offers high-contrast options alongside the original sketch for confirmation.

## 🛡️ Privacy & Compliance
Agapita is designed for high-stakes healthcare environments like **SEA CIC-SIC**. It uses local inference exclusively—no patient data (sketches or records) ever leaves the facility's local network.
