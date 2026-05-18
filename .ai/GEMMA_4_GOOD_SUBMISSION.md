AGAPITA: LOCAL, MULTIMODAL AAC BEDSIDE ASSISTANT FOR STROKE PATIENTS USING GEMMA 4 AND 5D RAG

1. INTRODUCTION: THE SILENT CONFINEMENT

Agapita is not just an acronym or a technical construct. It is the Greek word for beloved, but more importantly, it is the name of the grandmother of Agapitas lead developer. 

Ten years ago, Agapita suffered a severe, debilitating left-hemisphere stroke. The clinical recovery was grueling, but the emotional scars of her confinement ran deeper. During her stay in an under-resourced local hospital ward, there were many nights when she found herself completely alone in the dark, with no caretakers in the room. When asked years later how she called for help or communicated her needs during those terrifying nocturnal hours, her response was heartbreaking:

"Wala, maghihintay lang ako hanggang bukas." 
("Nothing, I would just wait until tomorrow.")

This is the silent reality of millions of stroke survivors worldwide suffering from chronic Brocas aphasia and hemiparesis. They retain high cognitive comprehension, but their voice is locked behind a barrier of verbal dysfluency and motor paralysis. 

Standard Augmentative and Alternative Communication (AAC) devices are fundamentally broken for this demographic. They rely on high-density grids of tiny, visually cluttered buttons. For a stroke patient lying in a dark room, attempting to target a 20-pixel button with severe right-sided hemiparesis is a physical impossibility. If they cannot move their fingers with high precision, standard AACs are useless.

Agapita was built to shatter this barrier. Instead of demanding high-precision motor coordination, Agapita presents a gross-motor communication canvas. A bedside stroke patient can make a single, crude, shaky swipe across a tablet screen using a finger or a stylus. The system accepts these highly ambiguous shapes—a wobbly circle, a generic stick figure, or an uneven cup—and dynamically translates them into specific, highly localized, human voice requests. 

By running Gemma 4 entirely on a localized edge server, Agapita restores the most fundamental human right to the most vulnerable: the power to speak, without relying on a cloud internet connection or expensive hardware.


2. HOW IT WORKS: HUB-AND-SPOKE EDGE ARCHITECTURE AND 5D RAG

THE HUB-AND-SPOKE MODEL

Agapita is architected to address the stark reality of digital equity in developing nations, such as the Philippines. Internet access in provincial medical wards is notoriously slow, expensive, and prone to blackouts. Sending high-resolution video frames or canvas drawings to expensive cloud APIs is financially and logistically impossible.

To solve this, Agapita implements a fully offline, local Hub-and-Spoke Edge Architecture:

- The Spoke (Legacy Devices): The patient drawing canvas and the caretaker room scanner run as lightweight web clients inside standard browsers on legacy hardware, such as budget Android tablets, older iPads, or refurbished smartphones.
- The Hub (Local Server): A single mid-range consumer computer or laptop located in the ward acting as a centralized intranet server. The Hub runs a local FastAPI and Socket.IO backend and an offline Ollama instance serving a quantized Gemma 4 model.

Zero external internet bytes are required. The entire bedside communication ecosystem operates autonomously over a standard, offline Wi-Fi router.

THE 5-DIMENSIONAL RAG (5D RAG)

A shaky circle drawn by a hemiparetic patient could represent a glass of water, a medication bottle, a clock, or a round plate of food. To resolve this extreme semantic ambiguity under a second, Agapita implements a specialized 5-Dimensional Retrieval-Augmented Generation (5D RAG) pipeline. 

Rather than treating the sketch in isolation, the local Gemma 4 model interprets the predictions by cross-referencing patient records, real-time contexts, and environmental observations across five distinct dimensions:

- 1. CLINICAL DIMENSION: Integrates direct patient diagnoses and clinical directives. For example, the database contains verbatim records detailing Brocas aphasia, hemiparesis, and medical schedules, such as requiring blood pressure medication (Lisinopril) at 9:00 AM and 9:00 PM daily.
- 2. TEMPORAL DIMENSION: Synchronizes the patient request with the precise time of day. If the patient draws a wobbly cylinder at 8:45 AM, the temporal booster matches the schedule and translates it to: "I need my morning Lisinopril medication." If the same cylinder is drawn at 11:30 PM, it bypasses the medication schedule and resolves to: "Can I please have a glass of water?"
- 3. ENVIRONMENTAL DIMENSION: Fed dynamically by the caretaker using their smartphone camera. By scanning the room, the caretakers Ambient Scanner identifies objects and uploads coordinates, automatically injecting spatial facts into the RAG database, such as the location of the smart TV or thermostat.
- 4. RELATIONAL DIMENSION: Personalizes generic sketches. If the visual interpreter detects a stick figure or person, standard models would output a generic statement. Agapita queries the relational database, finds family profiles (such as the patients wife, Martha), and instantly synthesizes this into: "I would like to call my wife, Martha."
- 5. BEHAVIORAL DIMENSION: Captures personal habits, hobbies, and sensory profiles. For example, records of a patients musical background as a former jazz musician or their dietary preferences (such as toast with honey) help Gemma 4 read between the lines.


3. TECHNICAL CHALLENGES AND PRODUCTION SOLUTIONS

During the engineering of Agapitas offline system, we encountered significant hardware constraints and model alignment hurdles. Here is how we solved them inside the codebase:

1. VRAM CONTIGUITY AND MODEL THRASHING
Running a Multimodal Vision-Language Model (VLM) for sketch and scan analysis alongside a Large Language Model (LLM) for RAG synthesis on a low-end local GPU (such as a laptop GTX 1650 or RTX 3050) created a major bottleneck. Ollama was forced to repeatedly swap the VLM and LLM in and out of the GPUs VRAM. This model thrashing spiked processing latency from 1.2 seconds to over 22 seconds—a critical delay in bedside care.
We resolved this by consolidating our pipeline into a single, unified, multi-capable quantized model: Gemma 4. Both the visual sketch interpreter and the text RAG compiler share the exact same model weights. Additionally, we locked the context window size at 1024 tokens and configured a strict model keep-alive of 10 minutes across both visual and textual generation calls to prevent KV cache eviction. By keeping the KV cache contiguous and preventing model swaps, we achieved a 95 percent reduction in latency, maintaining a sub-second response time offline.

2. HIGH-RESILIENCY COORDINATE MULTI-SCALE NORMALIZATION
The vision model scanner outputs 2D bounding boxes. However, different quantized weights and runtimes output coordinates in varying formats: normalized decimals (0.0 to 1.0), standard percentages (0 to 100), or absolute 1000-scale ranges (0 to 1000). If coordinates were parsed incorrectly, the frontend bounding box layout collapsed.
We implemented an active, server-side multi-scale coordinate normalizer. The pipeline detects the maximum bounding box values, auto-detects the vision models scale, normalizes coordinates to standard percentage integers, and falls back to a random central dispersion grid if coordinates are corrupt.

3. SERVER-SIDE CANVAS OFFLOAD AND WI-FI LATENCY
Uploading uncompressed high-resolution images from older tablets saturated local hospital Wi-Fi networks, causing connection time-outs.
We built a dual-tier image optimization pipeline. The patient canvas downsamples drawings before transmission. In addition, the server implements a high-speed downscaler utilizing Lanczos resampling to compress incoming frames to 224 by 224 pixels—the native input resolution of Gemma 4s vision adapter.

4. SELF-SIGNED SSL CERTIFICATES FOR OFFLINE LOCAL INTRANETS
To access the tablet and phone cameras, standard browsers mandate a secure HTTPS origin. However, because our central Edge Hub is completely offline (acting as a local intranet IP), standard Let's Encrypt certificates cannot be generated or validated.
We integrated an automated Python SSL certificate generator using the cryptography library. When started in HTTPS mode, the backend automatically generates a local certificate containing a detailed Subject Alternative Name (SAN) list representing standard offline IPs and loopbacks. This allowed budget Android and iOS devices to establish encrypted local WebSocket channels without requiring an active internet connection.


4. THE WINS: ACHIEVEMENTS IN DIGITAL EQUITY AND ACCESSIBILITY

Agapita represents a substantial achievement in balancing deep human empathy with rigid, high-performance system design:

- Real-time, Fully Offline Multimodal Translation: By locking KV cache contexts and deploying optimized 4-bit quantization, we proved that DeepMinds Gemma 4 can serve as an incredibly accurate visual interpreter and logical RAG synthesizer on consumer-grade hardware under a second.
- Aesthetic Focus Mode for Motor Impairments: Stripped of standard web headers, navigational tabs, and descriptive text, Agapitas Focus Mode provides a dark, high-contrast, edge-to-edge canvas. It maximizes screen real estate and minimizes distractions, accommodating patients with high visual fatigue and spastic motor control.
- Zero-Config AR Caregiver Room Scanner: A simple, web-based viewfinder that lets caretakers dynamically update a patients grounding database in real time. It detects medications, appliances, and personal items, bringing the surrounding environment directly into the RAG models awareness.
- Active Pre-Warm Caching: While the patient is looking at the primary interpretation result, the server asynchronously pre-warms alternative intents in the background. If the patient selects a secondary alternative intent, the RAG result loads instantly (0ms) from the local cache.


5. FUTURE IMPLEMENTATIONS: THE PATH FORWARD

With the solid technical foundation established, we have mapped out three logical next steps to extend Agapitas impact:

1. TREMOR-FILTERING KALMAN CANVAS
Patients with hemiparesis or Parkinsonian tremors produce highly jagged, shaky lines that can confuse standard visual classifiers. By incorporating a Kalman Filter directly into the drawing canvas, the frontend can mathematically smooth out high-frequency hand tremors in real time before sending the canvas data to Gemma 4, resulting in highly clean, interpretable sketch representations.

2. MESH ROUTING FOR MULTI-PATIENT WARDS
By migrating the server communication layer to a decentralized intranet mesh network, we can enable multiple bedside tablets to act as intermediary nodes. In rural hospital wards with thick concrete walls and poor Wi-Fi penetration, a patients sketch can hop across adjacent bedside devices to reach the central Gemma 4 Edge Hub, expanding the physical range of care without additional wiring.

3. VOICE CLONING VIA KOKORO-82M
To restore a deep sense of dignity to stroke survivors, we aim to integrate local, high-speed text-to-speech voice cloning. By utilizing a local voice model like Kokoro-82M trained on short, pre-stroke voice recordings provided by family members, the caretakers synthesized voice alert will speak the intent using the patients original voice, rather than a generic robotic speech generator.

Agapita is proof that when state-of-the-art AI meets clinical empathy and rigorous system optimization, we can build a world where no stroke patient is left alone in the dark to simply wait until tomorrow. We can finally give them back their voice.
