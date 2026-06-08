# Agapita: Strategic Improvement Plan (PLAN.md)

## 🎯 Objective
Evolve Agapita from a single-word translation tool into a sequential communication engine (Multi-Sketch Synthesis). Maintain the strict ~3s end-to-end edge inference latency while expanding the patient's expressive vocabulary, optimizing the frontend canvas, and sharpening the project's competitive positioning.

---

## Phase 1: Frontend Canvas Architecture (The "Storyboard" UI)
The user experience must remain ultra-accessible for patients with limited motor control. We cannot clutter the screen. 

* **Sequential State Management:** Update the core state logic to handle an array of strokes/images rather than a single canvas override.
* **Auto-Advancing UI:** Implement a gesture or auto-timeout (e.g., 1.5 seconds of inactivity) that smoothly slides the current drawing to the left, presenting a fresh, blank canvas block on the right.
* **Visual Queue:** Display a minimal thumbnail row of the current "sentence" (Drawing 1 + Drawing 2) so the patient can visually track their thought process.
* **Clear/Undo Controls:** Add a highly visible, large hit-box button to pop the last drawing off the array without clearing the entire sentence.

## Phase 2: Backend Composite Inference Engine
This phase mitigates the "latency stacking" trap. We must process the storyboard in a single VLM pass.

* **Payload Restructuring:** Modify the frontend-to-backend WebSocket payload to send an array of Base64 image strings instead of a single image.
* **Image Pre-processing (The Stitch):** On the Python server, write a lightweight OpenCV or PIL script that horizontally concatenates the 224x224 sketches into a single composite image strip (e.g., 672x224 for three drawings) before passing it to the vision adapter.
* **Unified Vision Prompting:** Update the Gemma 4 E4B system prompt to explicitly expect a left-to-right sequence of images. (e.g., *"Analyze this sequence of drawings from left to right. What cohesive intent is the patient communicating?"*)

## Phase 3: RAG Grounding & Prompt Synthesis
The text-generation stage must now synthesize a relationship between multiple detected objects, rather than just matching one object to a database row.

* **Relational Injection:** Update the RAG prompt template to prioritize relational logic. If the VLM detects `["Window", "Arrow Down", "Thermometer"]`, the prompt must cross-reference the environmental database (room thermostat) and synthesize: *"I am cold, please turn down the AC."*
* **Confidence Thresholds:** Implement a fallback mechanism. If the sequence is too abstract and the model's confidence is low, default to explicitly listing the items so the caretaker can interpret them human-to-human.
* **Explicit Override Handling:** Ensure the custom UI override tags scale to sequences, allowing a caretaker to manually correct one drawing in the sequence without deleting the others.

## Phase 4: Pitch & Deployment Readiness
Positioning the technical architecture as a massive advantage for understaffed facilities.

* **Latency Benchmarking:** Re-run and document the end-to-end latency tests with 2-part and 3-part composites. Prove mathematically that the stitching method saves seconds compared to sequential processing.
* **Narrative Framing:** Update all pitch decks to highlight "Edge-Native Storyboarding." Contrast this against cloud-dependent solutions that would suffer network timeouts when sending multiple images.
* **Accessibility Stress-Test:** Ensure the new UI components map perfectly to the motor-optimized design philosophy. No small buttons, no complex menus.