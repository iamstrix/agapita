# Agapita

Agapita is an offline-first communication assistant for non-verbal patients with motor impairments. It uses wobbly sketches, local VLMs (LLaVA), and personalized medical record RAG (Gemma) to interpret patient needs.

## Project Structure
- `/client`: React Native (TypeScript) tablet application.
- `/server`: FastAPI + Socket.io Edge Server handling AI inference.
- `/.ai`: Project blueprints (PRD, Architecture, Audit).

## Setup & Running

### 1. Edge Server Requirements
- **Ollama** installed and running.
- Pull the necessary models:
  ```bash
  ollama pull llava
  ollama pull gemma
  ollama pull nomic-embed-text
  ```
- Install server dependencies:
  ```bash
  cd server
  python -m venv venv
  venv\Scripts\activate  # Windows
  pip install -r requirements.txt
  ```
- Run the server:
  ```bash
  python main.py
  ```

### 2. Tablet Client Requirements
- **Node.js** and **React Native** dev environment set up.
- Install client dependencies:
  ```bash
  cd client
  npm install --legacy-peer-deps
  ```
- Update the `SERVER_URL` in `client/App.tsx` to match your server's local IP.
- Run the app:
  ```bash
  npx react-native run-android  # or run-ios
  ```

## How it Works
1. **Patient Sketches:** The patient draws on the Skia canvas.
2. **VLM Interpretation:** The sketch is sent to the Edge Server. LLaVA identifies the object.
3. **Personalized RAG:** The identified object is contextualized against the patient's medical history (stored in a local vector DB).
   - *Example:* A "cylinder" sketch + "heart condition" record = "I need my medication."
4. **Pinpointing:** If the VLM is unsure, a grid of options appears for the patient to choose from.
5. **Caretaker Alert:** The final interpreted intent is sent to the caretaker.
