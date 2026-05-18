# Agapita: local, Multimodal AAC Bedside Assistant for Stroke Patients Using Gemma 4 and 5D RAG

## 1. Introduction: The Silent Confinement

Agapita is not just an acronym or a technical construct. It is the Greek word for "beloved," but more importantly, it is the name of the grandmother of Agapita's lead developer. 

Ten years ago, Agapita suffered a severe, debilitating left-hemisphere stroke. The clinical recovery was grueling, but the emotional scars of her confinement ran deeper. During her stay in a under-resourced local hospital ward, there were many nights when she found herself completely alone in the dark, with no caretakers in the room. When asked years later how she called for help or communicated her needs during those terrifying nocturnal hours, her response was heartbreaking:

> *"Wala, maghihintay lang ako hanggang bukas."* 
> ("Nothing, I would just wait until tomorrow.")

This is the silent reality of millions of stroke survivors worldwide suffering from chronic Broca's aphasia and hemiparesis. They retain high cognitive comprehension, but their voice is locked behind a barrier of verbal dysfluency and motor paralysis. 

Standard Augmentative and Alternative Communication (AAC) devices are fundamentally broken for this demographic. They rely on high-density grids of tiny, visually cluttered buttons. For a stroke patient lying in a dark room, attempting to target a 20-pixel button with severe right-sided hemiparesis is a physical impossibility. If they cannot move their fingers with high precision, standard AACs are useless.

Agapita was built to shatter this barrier. Instead of demanding high-precision motor coordination, Agapita presents a **gross-motor communication canvas**. A bedside stroke patient can make a single, crude, shaky swipe across a tablet screen using a finger or a stylus. The system accepts these highly ambiguous shapes—a wobbly circle, a generic stick figure, or an uneven cup—and dynamically translates them into specific, highly localized, human voice requests. 

By running **Gemma 4** entirely on a localized edge server, Agapita restores the most fundamental human right to the most vulnerable: the power to speak, without relying on a cloud internet connection or expensive hardware.

---

## 2. How It Works: Hub-and-Spoke Edge Architecture & 5D RAG

### The Hub-and-Spoke Model
Agapita is architected to address the stark reality of digital equity in developing nations (such as the Philippines). Internet access in provincial medical wards is notoriously slow, expensive, and prone to blackouts. Sending high-resolution video frames or canvas drawings to expensive cloud APIs like Claude or GPT-4 is financially and logistically impossible.

To solve this, Agapita implements a fully offline, local **Hub-and-Spoke Edge Architecture**:

```mermaid
graph TD
    subgraph Hospital Room (Spokes)
        A[Bedside Tablet - Patient Canvas] -->|Socket.IO JSON/Base64| C[Central Local Edge Hub]
        B[Mobile Phone - Caretaker Scanner] -->|Socket.IO Binary/JSON| C
    end
    
    subgraph Central Local Edge Hub (Offline Laptop/PC)
        C -->|Local IPC| D[Ollama Server]
        D -->|gemma4:e4b VLM| E[Sketch Interpretation]
        D -->|gemma4:e4b LLM| F[5D RAG Context Synthesis]
        C -->|Local SQLite| G[Grounding Database]
    end
    
    C -->|Synthesized Speech Alert| H[Caretaker Phone / Bedside Audio]
```

* **The Spoke (Legacy Devices):** The patient drawing canvas and the caretaker room scanner run as lightweight web clients inside standard browsers on legacy hardware—budget Android tablets, older iPads, or refurbished smartphones.
* **The Hub (Local Server):** A single mid-range consumer computer or laptop located in the ward acting as a centralized intranet server. The Hub runs a local FastAPI/Socket.IO backend and an offline Ollama instance serving a quantized **Gemma 4** model (`gemma4:e4b`).

Zero external internet bytes are required. The entire bedside communication ecosystem operates autonomously over a standard, offline Wi-Fi router.

---

### The 5-Dimensional RAG (5D RAG)
A shaky circle drawn by a hemiparetic patient could represent a glass of water, a medication bottle, a clock, or a round plate of food. To resolve this extreme semantic ambiguity under a second, Agapita implements a specialized **5-Dimensional Retrieval-Augmented Generation (5D RAG)** pipeline. 

Rather than treating the sketch in isolation, the local **Gemma 4** model interprets the VLM's visual predictions by cross-referencing patient records, real-time contexts, and environmental observations across five distinct dimensions:

```
                  ┌──────────────────────────────────────────┐
                  │          1. Clinical Dimension           │
                  │   (Broca's Aphasia, Med Schedules)       │
                  └────────────────────┬─────────────────────┘
                                       │
┌──────────────────────────┐           ▼           ┌──────────────────────────┐
│   2. Temporal Dimension  ├───────────────────────┤ 3. Environmental Dim.    │
│   (Current Time vs Meds) │   5D RAG SYNTHESIS    │ (AR Camera Room Scanner) │
└──────────────────────────┘           ▲           └──────────────────────────┘
                                       │
                  ┌────────────────────┴─────────────────────┐
                  │          4. Relational Dimension         │
                  │     (Verbatim Family Profiles)           │
                  └──────────────────────────────────────────┘
                                       │
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │          5. Behavioral Dimension         │
                  │   (Former Musician, Habits, Prefs)       │
                  └──────────────────────────────────────────┘
```

1. **Clinical Dimension:** Integrates direct patient diagnoses and clinical directives. For example, the backend seeds the database with:
   `"CLINICAL DIAGNOSIS: Chronic Broca's Aphasia following left-hemisphere stroke. Patient retains high comprehension but lacks verbal fluency."` and `"MEDICAL NEED: Patient requires blood pressure medication (Lisinopril) at 9:00 AM and 9:00 PM daily."`
2. **Temporal Dimension:** Synchronizes the patient’s intent with the precise time of day. If the patient draws a wobbly cylinder at 8:45 AM, the temporal booster matches the schedule and translates it to: *"I need my morning Lisinopril medication."* If the same cylinder is drawn at 11:30 PM, it bypasses the medication schedule and resolves to: *"Can I please have a glass of water?"*
3. **Environmental Dimension:** Fed dynamically by the caretaker using their smartphone camera. By scanning the room, the caretaker's **Ambient Scanner** identifies objects and uploads coordinates, automatically injecting spatial facts into the RAG database:
   `"[Room Environment] A smart TV is mounted on the wall opposite the bed."` and `"[Room Environment] The thermostat is located next to the door."`
4. **Relational Dimension:** Personalizes generic sketches. If the VLM detects a "stick figure" or "person," standard models would output "I want a person." Agapita queries the relational database, finding: `"FAMILY: Married to 'Martha' for 45 years. Two children: 'Leo' (Architect) and 'Sarah' (Nurse). Martha visits every Tuesday at 2:00 PM."` Gemma 4 instantly synthesizes this into: *"I would like to call my wife, Martha."* or *"Can you ask Leo if he is coming?"*
5. **Behavioral Dimension:** Captures personal habits and sensory profiles:
   `"PATIENT TRAITS: Former Jazz musician. Extremely fond of Miles Davis."` and `"PERSONAL PREFERENCE: Strong dislike for hospital oatmeal; prefers rye toast with honey."`

---

## 3. Technical Challenges & Production Solutions

During the engineering of Agapita's offline system, we encountered significant hardware constraints and model alignment hurdles. Here is how we solved them inside the codebase:

### 1. VRAM Contiguity & Model Thrashing
* **The Challenge:** Running a Multimodal Vision-Language Model (VLM) for sketch and scan analysis alongside a Large Language Model (LLM) for RAG synthesis on a low-end local GPU (e.g., a laptop GTX 1650 or RTX 3050) created a major bottleneck. Ollama was forced to repeatedly swap the VLM and LLM in and out of the GPU's VRAM. This "model thrashing" spiked processing latency from **1.2 seconds to over 22 seconds**—a critical delay in bedside care.
* **The Solution:** We consolidated our pipeline into a single, unified, multi-capable quantized model: **Gemma 4** (`gemma4:e4b`). Both the visual sketch interpreter (`interpret_sketch`) and the text RAG compiler (`apply_rag`) share the exact same model weights. Additionally, we locked the context window size at `num_ctx: 1024` and configured a strict model keep-alive of `10m` across both visual and textual generation calls:
  ```python
  response = ollama.generate(
      model=ai_config.llm_model,
      prompt=prompt,
      images=[image_bytes],
      format="json",
      keep_alive="10m",
      options={"num_ctx": 1024} # MUST match warmup to prevent cache eviction
  )
  ```
  By keeping the KV cache contiguous and preventing model swaps, we achieved a **95% reduction in latency**, maintaining a sub-second response time offline.

### 2. High-Resiliency Coordinate Multi-Scale Normalization
* **The Challenge:** The VLM's object-detection scanner outputs 2D bounding boxes (`box_2d`). However, different quantized weights and runtimes output coordinates in varying formats: normalized decimals (`0.0 to 1.0`), standard percentages (`0 to 100`), or absolute 1000-scale ranges (`0 to 1000`). If coordinates were parsed incorrectly, the frontend's AR bounding box layout collapsed.
* **The Solution:** We implemented an active, server-side multi-scale coordinate normalizer. The pipeline detects the maximum bounding box values, auto-detects the VLM's scale, normalizes coordinates to standard percentage integers, and falls back to a random central dispersion grid if coordinates are corrupt:
  ```python
  raw_vals = [float(x) for x in obj["box_2d"][:4]]
  max_val = max(raw_vals) if raw_vals else 0.0
  is_decimal = (max_val <= 1.0 and any(x > 0 for x in raw_vals))
  is_1000 = (max_val > 100.0)
  for val in raw_vals:
      num = val
      if is_decimal: num = num * 100.0
      elif is_1000: num = num / 10.0
      coords.append(int(round(min(100.0, max(0.0, num)))))
  ```

### 3. Server-Side Canvas Offload & Wi-Fi Latency
* **The Challenge:** Uploading uncompressed high-resolution images from older tablets saturated local hospital Wi-Fi networks, causing Socket.IO connection time-outs.
* **The Solution:** We built a dual-tier image optimization pipeline. The React canvas downsamples drawings before transmission. In addition, the FastAPI server implements a high-speed PIL downscaler (`downscale_image_bytes`) utilizing Lanczos resampling to compress incoming frames to `224x224` pixels—the native input resolution of Gemma 4's vision adapter:
  ```python
  img = Image.open(io.BytesIO(image_bytes))
  img.thumbnail((224, 224))
  ```

### 4. Self-Signed SSL Certificates for Offline Local Intranets
* **The Challenge:** To access the tablet and phone cameras, standard browsers mandate a secure HTTPS origin. However, because our central Edge Hub is completely offline (acting as a local intranet IP like `172.20.10.3`), standard Let's Encrypt certificates cannot be generated or validated.
* **The Solution:** We integrated an automated Python SSL certificate generator using the `cryptography` library. When started in HTTPS mode, the backend automatically generates a local certificate containing a detailed **Subject Alternative Name (SAN)** list representing standard offline IPs and loopbacks:
  ```python
  x509.SubjectAlternativeName([
      x509.DNSName(u"localhost"),
      x509.IPAddress(ipaddress.ip_address(u"127.0.0.1")),
      x509.IPAddress(ipaddress.ip_address(u"172.20.10.3")),
  ])
  ```
  This allowed budget Android and iOS devices to establish encrypted local WebSocket channels without requiring an active internet connection.

---

## 4. The Wins: Achievements in Digital Equity & Accessibility

Agapita represents a substantial achievement in balancing deep human empathy with rigid, high-performance system design:

* **Real-time, Fully Offline Multimodal Translation:** By locking KV cache contexts and deploying optimized 4-bit quantization, we proved that DeepMind's Gemma 4 can serve as an incredibly accurate visual interpreter and logical RAG synthesizer on consumer-grade hardware under a second.
* **Aesthetic Focus Mode for Motor Impairments:** Stripped of standard web headers, navigational tabs, and descriptive text, Agapita's **Focus Mode** provides a dark, high-contrast, edge-to-edge canvas. It maximizes screen real estate and minimizes distractions, accommodating patients with high visual fatigue and spastic motor control.
* **Zero-Config AR Caregiver Room Scanner:** A simple, web-based viewfinder that lets caretakers dynamically update a patient's grounding database in real time. It detects medications, appliances, and personal items, bringing the surrounding environment directly into the RAG model's awareness.
* **Active Pre-Warm RAG Caching:** While the patient is looking at the primary interpretation result, the server asynchronously pre-warms alternative intents in the background:
  ```python
  asyncio.create_task(ai_engine.prewarm_rag(alt_tags, patient_id))
  ```
  If the patient selects a secondary alternative intent, the RAG result loads **instantly (0ms)** from the local cache.

---

## 5. Future Implementations: The Path Forward

With the solid technical foundation established, we have mapped out three logical next steps to extend Agapita’s impact:

### 1. Tremor-Filtering Kalman Canvas
Patients with hemiparesis or Parkinsonian tremors produce highly jagged, shaky lines that can confuse standard visual classifiers. By incorporating a **Kalman Filter** directly into the drawing canvas, the frontend can mathematically smooth out high-frequency hand tremors in real time before sending the canvas data to Gemma 4, resulting in highly clean, interpretable sketch representations.

### 2. Mesh Routing for Multi-Patient Wards
By migrating the server communication layer to a decentralized **intranet mesh network** (using protocols like 802.11s), we can enable multiple bedside tablets to act as intermediary nodes. In rural hospital wards with thick concrete walls and poor Wi-Fi penetration, a patient's sketch can hop across adjacent bedside devices to reach the central Gemma 4 Edge Hub, expanding the physical range of care without additional wiring.

### 3. Voice Cloning via Kokoro-82M
To restore a deep sense of dignity to stroke survivors, we aim to integrate local, high-speed text-to-speech voice cloning. By utilizing a local voice model like **Kokoro-82M** trained on short, pre-stroke voice recordings provided by family members, the caretaker's synthesized voice alert will speak the intent using the patient's **original voice**, rather than a generic robotic speech generator.

---

Agapita is proof that when state-of-the-art AI meets clinical empathy and rigorous system optimization, we can build a world where no stroke patient is left alone in the dark to simply wait until tomorrow. We can finally give them back their voice.
