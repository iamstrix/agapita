# Product Requirements Document (PRD) - Agapita MVP

## 1. Goal
Provide a reliable, offline, and private communication bridge for non-verbal patients using sketch interpretation contextualized by their medical history.

## 2. Target Audience
*   **Primary Users:** Patients with motor-impairing conditions (ALS, Stroke, CP) who are non-verbal but can use a stylus or finger to sketch.
*   **Secondary Users:** Caretakers (nurses, family members) who receive interpreted alerts on their mobile devices.

## 3. User Journeys

### Journey 1: Successful Intent Communication
1.  **Opening:** Patient opens the Agapita app on a tablet.
2.  **Sketching:** Patient draws a wobbly "L" shape on the canvas.
3.  **Submission:** Patient taps a large "Interpret" button.
4.  **Processing:**
    *   The tablet sends the image to the Local Edge Server.
    *   The Server VLM identifies the shape as potentially a "cane" or "walking aid."
    *   The Server LLM queries the Vector DB for the patient's records.
    *   RAG identifies that the patient has "Mobility assistance required for bathroom visits."
5.  **Result:** The server synthesizes the interpretation: "I need help getting to the bathroom."
6.  **Notification:** Caretaker's phone rings with the message and a thumbnail of the original sketch.

### Journey 2: Pinpointing (Ambiguity Handling)
1.  **Sketching:** Patient draws a wobbly circle.
2.  **Submission:** Patient taps "Interpret."
3.  **Ambiguity Detection:** VLM returns low confidence for three possibilities: "Water," "Pill," "Fruit."
4.  **Pinpointing Display:**
    *   The patient's screen clears the canvas but keeps their sketch in a small corner.
    *   A grid of 3-4 high-contrast, clear icons/photos appears (a glass of water, a medicine blister pack, an apple).
5.  **Selection:** Patient taps the icon for "Water."
6.  **Notification:** Caretaker receives "Patient is thirsty (Water)."

## 4. Functional Requirements

### Core Features
*   **Canvas Component:** Full-screen drawing area with high-sensitivity touch support and "Clear" / "Undo" buttons.
*   **VLM Interpretation:** Must handle low-fidelity, jittery sketches.
*   **RAG Integration:** Personalized interpretation based on locally stored `.txt` or `.pdf` medical summaries.
*   **Caretaker Alerting:** Local network push notifications or WebSocket-based "ringing" interface.

### Pinpointing Logic
*   **Trigger:** If VLM confidence for the top prediction is < 70% OR the top 3 predictions are within 15% confidence of each other.
*   **Output:** Display a grid of 4 images.
*   **Default Option:** "Something else / None of these" button to alert the caretaker that the patient needs general attention.

## 5. Non-Functional Requirements
*   **Offline Operation:** 0% dependency on external APIs.
*   **Latency:** Interpretation should return within < 5 seconds on a local edge network.
*   **Privacy:** All data stays within the facility's local WiFi.

## 6. MVP Out of Scope
*   Voice-to-speech for patients.
*   Complex medical record management (CRUD). Initial records will be manually imported as text files.
*   Cloud-based backup or multi-facility syncing.