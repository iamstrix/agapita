# Setup Guide - Agapita

This guide will help you get the Agapita Edge Server and Tablet Client running locally.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Ollama** (Download from [ollama.com](https://ollama.com))
- **Android Studio** (for Android emulator) or a physical Android/iOS device.

---

## 1. AI Models (Ollama)

Agapita requires the latest Gemma 4 family of models to be pre-installed. For the best balance of speed and accuracy on edge devices, we recommend the E2B variant:

```bash
ollama pull gemma4:e2b
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

## 3. Desktop Application Setup

The Desktop application is the primary interface for the MVP.

1. **Navigate to the desktop directory:**
   ```bash
   cd desktop
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 4. Tablet Client Setup (Optional/Mobile)

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
   - Update the `SERVER_URL` constant.

4. **Run the application:**
   ```bash
   npx react-native run-android  # or run-ios
   ```

---

## 5. Usage Flow for Desktop MVP Demo

1. **Start the Server:** Ensure it says "Seeding initial patient records...".
2. **Open the Desktop App:** Login using the demo credentials.
3. **Credentials:**
   - **Admin:** `admin` / `admin123`
   - **Caretaker:** `caretaker1` / `c123`
   - **Patient:** `PatientA` / `a123`
4. **Draw & Interpret:**
   - As **PatientA**, draw on the canvas.
   - Tap **Interpret**.
   - Use the **Pinpointing** UI if prompted.
   - View the final synthesized intent.
5. **Caretaker View:**
   - Login as **caretaker1** in another tab/window.
   - You will receive real-time notifications of patient requests.

---

## Troubleshooting

- **Connection Error:** Ensure your tablet/emulator and server are on the same WiFi network. Check your firewall settings to allow port `8000`.
- **Ollama Error:** Verify `ollama list` shows all three required models.
- **Skia/Canvas issues:** Ensure you have performed a full `npx react-native run-android` after installing `@shopify/react-native-skia` to link native modules.
