# Setup Guide - Agapita

This guide will help you get the Agapita Edge Server and Tablet Client running locally.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Ollama** (Download from [ollama.com](https://ollama.com))
- **Android Studio** (for Android emulator) or a physical Android/iOS device.

---

## 1. AI Models (Ollama)

Agapita requires three models to be pre-installed on your Edge Server. Open your terminal and run:

```bash
ollama pull llava
ollama pull gemma
ollama pull nomic-embed-text
```

Ensure the Ollama service is running in the background before starting the server.

---

## 2. Edge Server Setup

1. **Navigate to the server directory:**
   ```bash
   cd server
   ```

2. **Create and activate a virtual environment:**
   - **Windows:**
     ```bash
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **macOS/Linux:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the server:**
   ```bash
   python main.py
   ```
   The server will start on `http://0.0.0.0:8000`.

---

## 3. Tablet Client Setup

1. **Navigate to the client directory:**
   ```bash
   cd client
   ```

2. **Install dependencies:**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Configure the Server IP:**
   - Find your computer's local IP address (e.g., `192.168.1.XX`).
   - Open `client/App.tsx`.
   - Update the `SERVER_URL` constant:
     ```typescript
     const SERVER_URL = 'http://192.168.56.1:8000';
     ```

4. **Run the application:**
   - **Android:**
     ```bash
     npx react-native run-android
     ```
   - **iOS:**
     ```bash
     npx react-native run-ios
     ```

---

## 4. Usage Flow for MVP Demo

1. **Start the Server:** Ensure the console logs "Seeding initial patient records...".
2. **Open the App:** The app should say "Connected to server".
3. **Draw & Interpret:**
   - Draw something wobbly.
   - Tap **Interpret**.
   - If the VLM is unsure, the **Pinpointing** UI will appear with options (Water, Medication, Bathroom).
   - If the VLM is confident, or after you pinpoint, the app will show the final message synthesized by the RAG system (e.g., "I need my medication").

---

## Troubleshooting

- **Connection Error:** Ensure your tablet/emulator and server are on the same WiFi network. Check your firewall settings to allow port `8000`.
- **Ollama Error:** Verify `ollama list` shows all three required models.
- **Skia/Canvas issues:** Ensure you have performed a full `npx react-native run-android` after installing `@shopify/react-native-skia` to link native modules.
