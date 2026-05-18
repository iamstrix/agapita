# 🛡️ Agapita: Gemma 4 Good Hackathon Guidelines & SSOT

This document serves as the official architectural Single Source of Truth (SSOT) and guidelines file for **Agapita**'s submission to the **Gemma 4 Good** hackathon. It outlines the technical, ethical, and design principles underpinning our implementation of the offline `gemma4:e4b` model.

---

## 🎯 1. Core Purpose & Mission
Agapita is an offline, Edge AI communication assistant designed to restore autonomy and a personal voice to stroke survivors, ALS patients, and motor-impaired individuals. By interpreting shaky, hand-drawn sketches on touch devices and grounding them in clinical, temporal, relational, and environmental context, Agapita synthesizes highly empathetic, first-person spoken requests.

---

## 🏗️ 2. Architectural Pillars

### A. Unified Single-Model Strategy (`gemma4:e4b`)
To deploy securely on consumer edge hardware (e.g., standard RT-class GPUs with 8GB VRAM in understaffed clinical wards), Agapita runs **exclusively** on a single unified model instance:
1. **Multimodal Stage (VLM):** Gemma 4's Vision Adapter interprets the patient's visual sketches.
2. **Generative Stage (RAG):** Gemma 4 (text mode) queries clinical history, time, and environment to synthesize personalized intent sentences.

> [!IMPORTANT]
> **VRAM Thrashing Prevention:** In edge environments, swapping between separate vision, embedding, and text models at inference time causes massive weight eviction penalties (often exceeding 20 seconds). By maintaining a single unified `gemma4:e4b` instance permanently resident in VRAM (~4.5GB) with consistent KV cache allocations (`num_ctx: 1024`), we complete end-to-end inference in **under 3 seconds**.

### B. Vector-Free Full-Context Injection (RAG)
* Rather than implementing heavy semantic vector databases, Agapita leverages Gemma 4's generous context window.
* Since a patient's active daily clinical records are compact (under 50 items), we inject the entire relational record store directly into the prompt.
* This eliminates the need for an active embedding model running in VRAM, lowering computational overhead and memory footprint.

---

## 💡 3. Key Technical Innovations

### I. Concrete Tag Promotion
To prevent visual confusion from ruining clinical communications, Agapita inspects the VLM candidates:
* If the VLM outputs generic visual placeholders first (like `"Abstract Object"`, `"abstract shape"`, or `"drawing"`), Agapita's promotion loop sweeps the predictions and **promotes** the first concrete physical noun (e.g. `"star"` or `"cup"`) to be the `top_tag`.

### II. Case-Insensitive Alternative Sanitization
To ensure the patient confirmation touch grid remains highly legible for motor-impaired users:
* **Deduplication:** Normalizes prediction strings to drop duplicates case-insensitively (`"star"` vs `"Star"`).
* **Trash Clean-up:** Automatically filters out abstract tags (`"unknown"`, `"scribble"`, `"doodle"`) and the primary `top_tag` itself to avoid redundant button rendering.
* **Smart UI Fallback:** If all options are filtered, the system dynamically injects high-priority health defaults (`["water", "medication", "bathroom", "food"]`).

### III. Override Commonsense RAG Reasoning
* When a patient explicitly overrides the VLM's top guess by tapping an alternative choice (e.g., selecting `"water bottle"`), the system suppresses temporal clinical boundaries.
* It invokes a dedicated **Commonsense Prompt** instructing Gemma 4 to formulate a logical first-person request based on the tag alone when no explicit database context exists (e.g., formulating `"Can I please have a bottle of water?"`).

### IV. Real-Time Sketch Delivery
* To provide caretakers with visual verification, the canvas's raw Base64 data URL is transmitted alongside the text alert over Socket.IO.
* The Caretaker Dashboard renders the patient's wobbly doodle inline, enabling caretakers to verify Gemma 4's generated interpretations against the patient's raw visual strokes.

---

## 🛡️ 4. Privacy, Compliance & Ethics
* **100% Offline Edge AI:** No clinical data, image base64, or synthesized prompts ever leave the local local network. All generation is processed on-device via Ollama.
* **HIPAA Compliance by Design:** Agapita is completely insulated from third-party cloud data leaks, making it safe for deployment in hospitals, clinics, and private care.
* **Low-Infrastructure Accessibility:** Designed to run without high-speed internet connections, enabling usage in remote or understaffed healthcare wards.

---

> "Giving a voice back to the beloved, one sketch at a time."
