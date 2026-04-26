# Agapita: Technical Audit & Stack Proposal

## 1. Executive Summary
The proposed application aims to bridge the communication gap for non-verbal patients by interpreting their sketches using a combination of Vision Language Models (VLMs), Large Language Models (LLMs), and Retrieval-Augmented Generation (RAG). By grounding the VLM's interpretation in the patient's personalized medical records, the system provides context-aware communication to caretakers. The "Pinpointing" feature further refines ambiguous sketches. The core constraint is that the AI stack must run offline for maximum privacy.

## 2. Technology Stack Curation

### User-Defined Core
*   **Frontend / Client:** React Native (Cross-platform compatibility for tablets and phones, which are ideal form factors for sketching).
*   **AI Engine:** Gemma 4 (or equivalent local/offline LLM/VLM family). 

### Curated Additions
To realize this offline architecture, the following components are recommended:

*   **Local Inference Framework:** **MLC LLM** or **MediaPipe Tasks**. Running LLMs and especially VLMs natively on mobile hardware requires aggressive quantization (e.g., 4-bit) and hardware acceleration (NPU/GPU). Alternatively, an **Edge Server Architecture** (a local PC in the facility) running **Ollama** or **vLLM** might be necessary if mobile hardware is insufficient for VLM processing.
*   **Vector Database (Offline RAG):** **Orama** (runs natively in JS/React Native) or **SQLite with sqlite-vss**. These allow for on-device or local network vector search without cloud dependencies.
*   **Backend / Caretaker Communication:** **Node.js with Socket.io** or a local **Python FastAPI** server. If running entirely peer-to-peer on a local network, WebSockets or React Native Local Network capabilities can be used to send alerts to the caretaker's device.
*   **Pinpointing Image Source:** Due to the high computational cost of running image generation (like Stable Diffusion) alongside a VLM offline, the system should rely on a **Curated Local Image Library** indexed by tags, or a highly optimized tiny diffusion model (e.g., MobileDiffusion) if hardware permits.

## 3. Feasibility Analysis

### Technical Feasibility
*   **Moderate to Difficult.** The primary bottleneck is hardware. Running a high-quality VLM, an LLM for RAG, and potentially an image retrieval/generation system entirely *on a mobile device* offline is at the very edge of current consumer hardware capabilities. 
*   **Recommendation:** Adopt a "Local Edge" architecture. The patient uses a React Native tablet to sketch. The tablet sends the sketch over the local WiFi to a dedicated local machine (Edge Server) running the heavy Gemma models and Vector DB. The server processes it and sends the result to the caretaker's device. This maintains privacy (no internet required) while solving the compute bottleneck.

### UX / UI Feasibility
*   **High.** React Native provides excellent drawing libraries (e.g., `react-native-skia` or `react-native-svg`) capable of handling wobbly strokes. Smoothing algorithms can be applied before the sketch is sent to the VLM to improve recognition.

## 4. Potential Impact

*   **High Value for Niche Demographics:** This solves a critical problem for patients with ALS, severe cerebral palsy, post-stroke aphasia, or those who are intubated.
*   **Personalized Care Paradigm:** Using RAG to contextualize generic drawings (e.g., cylinder = medication vs. water) is a highly innovative use of AI in healthcare, significantly reducing caretaker fatigue and patient frustration.
*   **Data Privacy:** By committing to an offline-first architecture, the application bypasses many severe regulatory hurdles (HIPAA compliance is easier when data never leaves the local network).

## 5. Possible Hurdles & Risks

1.  **Hardware Limitations & Thermal Throttling:** If attempted purely on-device (tablet), running VLMs will drain the battery extremely fast and cause device overheating, leading to throttled performance and slow response times.
2.  **VLM Accuracy on Jittery Sketches:** VLMs are typically trained on clear images or standard datasets. Wobbly, abstract sketches from patients with impaired motor control might confuse the model, leading to high error rates before RAG even applies.
3.  **RAG Hallucinations & Critical Errors:** If the LLM incorrectly synthesizes the medical record and the sketch, it might request the wrong medication or urgent care action. The UI *must* ensure the caretaker knows this is an AI interpretation and requires human verification.
4.  **Cold Start Problem:** Creating the initial vector embeddings for all medical records requires processing time. Managing updates to medical records offline without a centralized cloud database requires careful synchronization logic.
5.  **Pinpointing UX Friction:** Generating or finding relevant images for "pinpointing" must be near-instantaneous. If the patient has to wait 10 seconds for clarification images to load, they may abandon the communication attempt.

## 6. Conclusion
The concept is highly innovative and addresses a genuine medical communication gap. However, the requirement for offline privacy combined with heavy AI workloads dictates a pivot from pure "on-device mobile" to a "local edge network" architecture to ensure reliability, speed, and usability.

## 7. Implementation Notes (Environmental Setup)

### Mobile Client Compatibility
*   **Java Versioning:** The project requires **JDK 17** for Gradle 8.6 and React Native compatibility. To maintain system stability on developer machines that may have newer versions (e.g., Java 25), the project utilizes a **Local JDK Architecture**.
*   **Local JDK Strategy:** A portable JDK 17 is stored in `client/android/jdk17`. The `gradlew.bat` script is modified to prioritize this local version, ensuring builds are deterministic and isolated from system-wide environment variables.
*   **FastAPI / Python:** The server-side requires `ollama` and `fastapi`. To avoid environment conflicts, the seeding of initial patient data is handled via the FastAPI `lifespan` event, ensuring the server is fully initialized before async tasks begin.