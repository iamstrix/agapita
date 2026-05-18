# 🏆 Agapita: Gemma 4 Good Hackathon Pitch & Demo Script

This script is a premium, high-impact narrative designed for a **3-to-4 minute video presentation** submission for the **Gemma 4 Good** hackathon. It strategically balances deep empathy with absolute technical rigor, detailing how the unified offline `gemma4:e4b` model enables seamless, zero-latency clinical communication.

---

## 🎬 Video Overview & Timing Structure
* **Total Duration:** 3:30 - 4:00 Minutes
* **Tone:** Empathetic, innovative, state-of-the-art, and technically authoritative.
* **Visuals:** Desktop/tablet app split-screen, terminal logs, code snippets, and live demo captures.

---

## 🎙️ The Narrative Script

### 1. The Hook: Restoration of Dignity (0:00 - 0:30)
* **Visual:** Close-up of a patient's hand using a stylus, drawing a shaky, wobbly circle on a clean tablet canvas. 
* **Presenter Voiceover:** 
  > *"Every year, millions of stroke survivors and ALS patients experience a sudden, devastating loss: their voice. Augmentative communication systems today are slow, clinical, and high-friction. They require high motor precision or a constant, unreliable cloud connection that compromises patient privacy. What if a wobbly doodle could instantly translate into a highly personalized, empathetic spoken request?"*
* **Visual:** The wobbly circle is interpreted. The screen reveals a clean prompt: *"Can I please have my Lisinopril medication?"*
* **Presenter Voiceover:**
  > *"This is Agapita. An offline, edge AI-powered communication assistant that gives a voice back to the beloved, one wobbly sketch at a time."*

---

### 2. The Core Problem: The Edge-AI Constraint (0:30 - 1:00)
* **Visual:** Technical slide showing VRAM usage spikes and eviction penalties.
* **Presenter Voiceover:**
  > *"Deploying generative AI in a clinical or home care setting faces severe constraints: it must be 100% offline for HIPAA compliance and run on accessible, consumer-grade hardware. Conventionally, chaining a Vision-Language Model, an Embedding model, and an LLM causes massive VRAM thrashing on an 8GB GPU, leading to 20-second model eviction delays. Agapita breaks this bottleneck by employing a highly optimized, single-model architecture."*

---

### 3. The Tech: The Unified Gemma 4 Strategy (1:00 - 1:40)
* **Visual:** Interactive architectural diagram detailing the unified `gemma4:e4b` pipeline.
* **Presenter Voiceover:**
  > *"Everything in Agapita is powered by a single, unified model resident in VRAM: Gemma 4 E4B. 
  > 
  > First, the wobbly sketch is downscaled to a native 224x224 resolution and evaluated by Gemma 4's native Vision Adapter.
  > 
  > Second, we completely bypass traditional vector search. Since a patient's daily context is compact, we inject the entire clinical database directly into Gemma 4's extensive context window. By keeping KV cache allocations identical between VLM and RAG stages, we prevent VRAM thrashing entirely, achieving an end-to-end latency of under 3 seconds."*

---

### 4. The Live Demo: The Grounded RAG Pipeline (1:40 - 2:50)
* **Visual:** Split screen showing the **Patient Canvas** on the left and the **Caretaker Dashboard** on the right.
* **Presenter Voiceover:**
  > *"Let's see this in action. A patient draws a wobbly star.
  > 
  > Often, vision models predict generic placeholders first, like 'Abstract Object.' Agapita's Concrete Tag Promotion algorithm intercepts this, promoting the first real noun—'star'—to the primary tag.
  > 
  > The RAG engine then fuses five layers of grounding: clinical schedules, temporal context, relational records, personal behaviors, and the physical room environment. Since it is afternoon, Agapita resolves the 'star' to a temporal clinical record: 'I need my 4 PM medication, please.'
  > 
  > When the patient confirms, Socket.IO instantly transmits both the synthesized intent and the raw visual sketch to the Caretaker's real-time alerts stream."*
* **Visual:** Zoom in on the Caretaker Dashboard as a notification card slides in showing the intent next to a beautiful rounded thumbnail of the patient's sketch.
* **Presenter Voiceover:**
  > *"This gives caretakers visual verification in real time, bridging text interpretation with the patient's actual motor strokes."*

---

### 5. Advanced Features: Room Grounding & Override Fallback (2:50 - 3:30)
* **Visual:** Caretaker interface switching to 'scanner' tab, identifying a remote on a bedside table, and hitting "Add to Grounding".
* **Presenter Voiceover:**
  > *"Our environmental scanner allows caretakers to capture room objects on the fly, saving them directly to the patient's Room Config grounding database. 
  > 
  > And if the patient explicitly overrides the VLM's top guess—for instance, selecting 'water bottle' from the alternative options grid—Gemma 4 bypasses temporal bounds, automatically invoking direct commonsense inference to ask: 'Can I please have a bottle of water?'"*

---

### 6. The Impact & Outro (3:30 - 4:00)
* **Visual:** Fast montage of desktop UI, clean code blocks, and the logo.
* **Presenter Voiceover:**
  > *"Agapita represents more than just a smart RAG pipeline. It is a proof-of-concept that high-impact, accessible, and HIPAA-compliant healthcare infrastructure can run entirely offline on the edge—bringing affordable, empathetic rehabilitation to clinical wards worldwide.
  > 
  > Agapita: Giving a voice back to the beloved, one wobbly sketch at a time. Thank you."*
* **Visual:** Fade to black with the logo, GitHub link, and "Powered by Gemma 4" badge.

---

## 🎬 Tips for Video Recording
1. **Highlight Latency:** Make sure the screen capture showing the sketch-to-intent pipeline highlights the 2.5-second speed.
2. **Showcase the Code:** Zoom in briefly on `main.py` where we implemented `clean_and_filter_options` and the `explicit_override` commonsense prompts to demonstrate rigorous engineering.
3. **Split-Screen Interaction:** Having two active browser tabs (one patient, one caretaker) reacting in real time over Socket.IO will wow the hackathon judges!
