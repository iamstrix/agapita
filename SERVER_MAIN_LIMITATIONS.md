# server/main.py Known Limitations and Possible Fixes

Date: 2026-06-08

Scope: static review of the current `server/main.py` plus nearby context in `server/auth.py`, `server/models.py`, and `README.md`. This is not a full security audit or production readiness certification.

## Summary

`server/main.py` currently works as a prototype-style edge server, but it concentrates authentication, admin APIs, Socket.IO events, database access, VLM/LLM inference, RAG cache, TTS, startup seeding, and HTTPS bootstrap into one 1,906-line module. The largest risks are unauthenticated admin HTTP routes, weak patient/caretaker authorization boundaries, one concrete runtime bug in record assignment, unbounded model calls, and RAG state that can go stale or diverge from the database.

## Highest Priority Fixes

1. Add authentication and role enforcement to every `/api/admin/*` route and every sensitive Socket.IO event.
2. Fix `assign_record()` calling missing `ai_engine.reload_vector_store(db)`; the implemented method is `reload_record_store()`.
3. Validate patient/caretaker access against database assignments before allowing a caretaker-supplied `patient_id`.
4. Add request validation, size limits, timeouts, and concurrency limits around image, LLM, VLM, and TTS work.
5. Replace hardcoded secrets and default seed credentials before any real deployment.
6. Split the module into routers/services so security, DB, inference, TTS, and realtime behavior can be tested independently.

## Security and Access Control

### Admin routes are unauthenticated

Affected code:

- `server/main.py:109` `/api/admin/patients`
- `server/main.py:113` `/api/admin/caretakers`
- `server/main.py:117` `/api/admin/assign`
- `server/main.py:129` `/api/admin/users`
- `server/main.py:134` `/api/admin/records`
- `server/main.py:306` `/api/admin/users/{user_id}`
- `server/main.py:487` `/api/admin/config/models`
- `server/main.py:497` `/api/admin/config/models`
- `server/main.py:519` `/api/admin/records`
- `server/main.py:534` `/api/admin/records/{record_id}/assign`

Limitation: these endpoints accept no bearer token and do not check role. Anyone who can reach the server can list users and patients, edit usernames/passwords, assign patients, add medical records, and swap model config.

Possible fix:

- Add `get_current_user()` and `require_role(models.UserRole.ADMIN)` dependencies.
- Apply the admin dependency to an `APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])`.
- Add tests asserting anonymous, patient, and caretaker tokens are rejected for every admin route.

### Socket.IO caretaker access is not scoped to assigned patients

Affected code:

- `server/main.py:1232`
- `server/main.py:1295`
- `server/main.py:1425`
- `server/main.py:1596`
- `server/main.py:1657`
- `server/main.py:1684`

Limitation: for non-patient users, event handlers accept `data.get("patient_id", "patient")`. A caretaker can request or process records for an arbitrary patient ID if they know or guess it. The code does not check the `assignments` table before allowing access.

Possible fix:

- Resolve the connected user to a `Caretaker`.
- Check `patient in caretaker.patients` before every patient-scoped event.
- Reject unauthorized patient IDs with a generic error.
- Prefer database patient primary keys or signed scoped patient IDs instead of free-form strings.

### `scan_frame` has no Socket.IO auth check

Affected code:

- `server/main.py:1710`

Limitation: unlike most Socket.IO handlers, `scan_frame()` does not verify that `sid` exists in `connected_users`. If the Socket.IO connection gate is bypassed or behavior changes, this event can run expensive image inference without user authorization.

Possible fix:

- Add the same `if sid not in connected_users: raise Exception("Unauthorized")` guard.
- Move Socket.IO auth checks into a shared helper to avoid drift.

### CORS and Socket.IO origins are wide open

Affected code:

- `server/main.py:639`
- `server/main.py:648`

Limitation: HTTP CORS and Socket.IO both allow all origins. HTTP also sets `allow_credentials=True`, which is unsafe with wildcard origins and can expose local-network services to unwanted browser contexts.

Possible fix:

- Configure allowed origins through environment variables.
- Use exact frontend HTTPS origins in production/local clinic deployments.
- Reject unknown Socket.IO origins in the `connect` handler or Socket.IO server config.

### Hardcoded JWT secret and default credentials

Affected code:

- `server/auth.py:7`
- `server/main.py:849`
- `server/main.py:852`
- `server/main.py:861`

Limitation: the JWT signing key is hardcoded, and the seed users use `admin/123`, `care/123`, and `patient/123`. `_upsert_user()` can also reset a broken hash back to the known seed password.

Possible fix:

- Load `SECRET_KEY` from an environment variable and fail startup when absent outside development.
- Generate first-run admin credentials or require explicit setup.
- Gate seed data behind `AGAPITA_SEED_DEMO_DATA=true`.
- Force password change for demo accounts before enabling real records.

## Concrete Runtime Bugs

### `assign_record()` calls a missing method

Affected code:

- `server/main.py:548`
- implemented method: `server/main.py:796`

Limitation: assigning or unassigning a record through `/api/admin/records/{record_id}/assign` will raise `AttributeError: 'AIEngine' object has no attribute 'reload_vector_store'`.

Possible fix:

- Replace `await ai_engine.reload_vector_store(db)` with `await ai_engine.reload_record_store(db)`.
- Add an integration test for assigning and unassigning a record.

### Patient lookup assumes username equals `Patient.patient_id`

Affected code:

- `server/main.py:575`
- `server/main.py:592`
- `server/main.py:614`
- `server/main.py:1217`

Limitation: JWT `sub` is the username, but patient endpoints query `Patient.patient_id == payload["sub"]`. This works only because seeded patient username and `patient_id` are both `"patient"`. Any patient whose username differs from their `patient_id` cannot read or mutate records correctly.

Possible fix:

- Put immutable `user.id` in the token and query `Patient.user_id == payload["id"]`.
- Keep `patient_id` as display/business identifier only.
- Add tests for patient username not equal to patient ID.

### `delete_patient_record()` can crash when patient profile is missing

Affected code:

- `server/main.py:613`
- `server/main.py:618`

Limitation: this endpoint does not check `if not patient` before using `patient.id`. A valid patient-role token without a matching `Patient` row causes a 500 instead of a controlled 404/403.

Possible fix:

- Add the same profile existence check used by the GET/POST patient record endpoints.
- Centralize patient resolution in one dependency/helper.

## Data and RAG Limitations

### Global records are seeded but not loaded into RAG

Affected code:

- global seed records: `server/main.py:890`
- reload skips null `patient_id_fk`: `server/main.py:801`
- RAG reads only in-memory patient records: `server/main.py:1033`

Limitation: records inserted with `patient_id_fk=None` are treated as library/global records in admin APIs, but `reload_record_store()` only loads patient-specific records. README architecture says environmental context feeds the AI, yet global room/environment records will not reach RAG unless assigned to a patient.

Possible fix:

- Define explicit semantics for global records.
- Either load global records into every patient's context or add `record_store.global_records`.
- In RAG prompts, separate `Patient Records` from `Global/Room Records`.

### RAG cache is stale after record changes

Affected code:

- cache fields: `server/main.py:735`
- append record: `server/main.py:740`
- reload record store: `server/main.py:796`
- patient add/delete: `server/main.py:600`, `server/main.py:624`

Limitation: `_rag_cache` is not cleared when records are added, assigned, unassigned, or deleted. A patient can receive an old intent until the hour changes.

Possible fix:

- Invalidate cache by patient ID on any record mutation.
- Include a per-patient record version in `_rag_cache_key`.
- Clear `_rag_futures` for the patient when records change.

### Cache miss path does not populate the cache

Affected code:

- `server/main.py:754`
- `server/main.py:770`

Limitation: `get_rag_cached()` returns `apply_rag()` on a miss but does not store the result. Only prewarm paths fill `_rag_cache`. This means direct explicit selections may repeatedly call the LLM.

Possible fix:

- On miss, create and store an in-flight future, await the LLM, then store the result in `_rag_cache`.
- Use one shared cache/future implementation for prewarm and direct lookup.

### In-memory record store will diverge with multiple workers

Affected code:

- `server/main.py:665`
- `server/main.py:733`

Limitation: `SimpleRecordStore` is process-local. Running multiple Uvicorn workers or multiple server instances means each process has separate records and cache state.

Possible fix:

- Query records from the database at request time for small record sets, or use a shared cache such as Redis.
- If keeping in-memory state, force single-worker mode and document it.

### SQLite and synchronous DB access limit concurrency

Affected code:

- `server/main.py:25`
- `server/main.py:26`
- sync DB use throughout async endpoints

Limitation: synchronous SQLAlchemy sessions run inside async handlers and can block the event loop. SQLite with `check_same_thread=False` is convenient for local demos but fragile under concurrent writes and multi-process deployment.

Possible fix:

- Use SQLAlchemy async engine/session or move DB work into a bounded threadpool.
- Enable SQLite foreign keys if staying on SQLite.
- Add Alembic migrations instead of `Base.metadata.create_all()`.
- Move production deployments to Postgres if multi-user writes matter.

## Inference, Latency, and Reliability

### Ollama calls have no timeout, queue, or concurrency limit

Affected code:

- `server/main.py:207`
- `server/main.py:708`
- `server/main.py:956`
- `server/main.py:1002`
- `server/main.py:1081`
- `server/main.py:1157`
- `server/main.py:1342`
- `server/main.py:1469`
- `server/main.py:1752`

Limitation: expensive inference is run through `asyncio.to_thread()` with no timeout and no semaphore. Many clients or rapid sketch/frame requests can exhaust the default threadpool, saturate Ollama, and stall unrelated requests.

Possible fix:

- Wrap model calls with `asyncio.wait_for()`.
- Add bounded semaphores for VLM, LLM, and TTS classes of work.
- Return queue/backpressure responses when saturated.
- Track and cancel background tasks on disconnect.

### Background tasks are untracked and errors can be lost

Affected code:

- startup tasks: `server/main.py:65`, `server/main.py:67`
- option tasks: `server/main.py:1410`, `server/main.py:1537`, `server/main.py:1643`
- prewarm tasks: `server/main.py:1408`, `server/main.py:1535`

Limitation: tasks are created without lifecycle management. Startup failures are mostly logged but do not affect readiness; option/prewarm failures can become unobserved task exceptions.

Possible fix:

- Keep task handles in app state.
- Add callbacks that log exceptions with context.
- Cancel per-client background tasks on disconnect.
- Expose readiness state for DB seeded, model warm, and TTS assets ready.

### README model names differ from server defaults

Affected code:

- README says `gemma4:e4b`: `README.md:47`
- server default is `gemma4:12b-it-qat`: `server/main.py:657`

Limitation: setup instructions and runtime defaults disagree. A fresh install that follows README can fail model calls unless the server default is changed through the admin config route.

Possible fix:

- Move model names to environment variables with documented defaults.
- Align README, Docker config, and `AIConfig`.
- Validate model availability at startup and show a clear error.

### Output parsing is permissive and not schema validated

Affected code:

- `server/main.py:230`
- `server/main.py:237`
- `server/main.py:973`
- `server/main.py:1019`
- `server/main.py:1360`
- `server/main.py:1486`
- `server/main.py:1773`

Limitation: model responses are parsed with JSON fallback and sometimes `ast.literal_eval`, then loosely normalized. Invalid or unexpected outputs can silently become defaults.

Possible fix:

- Define Pydantic response models for scan objects, sketch tags, and person intents.
- Validate field types, coordinate lengths, and value ranges explicitly.
- Return a low-confidence status instead of silently manufacturing a confident result.

### Fake bounding-box fallback can mislead users

Affected code:

- `server/main.py:267`
- `server/main.py:295`
- `server/main.py:1799`
- `server/main.py:1817`

Limitation: when the VLM omits or corrupts `box_2d`, the server generates random central bounding boxes. In a care/medication context, false visual grounding can be worse than no box.

Possible fix:

- Return objects without boxes plus `low_confidence=true`, or return no objects.
- Let the UI show a retry/manual placement state.
- Log invalid model output separately for tuning.

### Scan prompt does not inject the requested mode

Affected code:

- request model field: `server/main.py:167`
- prompt text: `server/main.py:186`
- socket field: `server/main.py:1714`
- socket prompt text: `server/main.py:1733`

Limitation: the prompt says "If the mode is medication/environment" but does not tell the model what the actual current mode is. In `scan_frame()`, `mode` is assigned but never used. This can weaken medication vs environment behavior.

Possible fix:

- Add `Current mode: {request.mode}` / `Current mode: {mode}` to the prompt.
- Validate mode with a `Literal["medication", "environment"]`.

## Input Validation and Abuse Resistance

### Image payloads have no size or format limits

Affected code:

- `server/main.py:174`
- `server/main.py:1298`
- `server/main.py:1428`
- `server/main.py:1555`
- `server/main.py:1713`

Limitation: base64 images are decoded directly and passed into PIL/Ollama. Oversized, malformed, or decompression-heavy images can consume memory/CPU.

Possible fix:

- Reject payloads above a configured byte limit before decode.
- Set `PIL.Image.MAX_IMAGE_PIXELS`.
- Use `Image.verify()` and normalize to JPEG/PNG with known max dimensions.
- Prefer binary Socket.IO uploads for frames instead of repeated base64 strings.

### Event and endpoint payloads are mostly untyped

Affected code:

- `server/main.py:306` uses `data: dict`
- most Socket.IO handlers accept unvalidated `data`

Limitation: missing fields such as `image`, `tag`, `intent`, or `patient_id` can produce generic 500/error events. Types and lengths are not constrained.

Possible fix:

- Add Pydantic models for HTTP bodies.
- Add validation helpers for Socket.IO payloads.
- Return structured error codes the client can handle.

### TTS endpoint accepts arbitrary text and voice

Affected code:

- `server/main.py:320`
- `server/main.py:355`

Limitation: TTS is unauthenticated, has no text length limit, and uses `assert` for voice validation. Assertions can be disabled with optimized Python, and invalid voices become 500 errors.

Possible fix:

- Require auth for TTS or at least apply local-network/rate limits.
- Limit text length and normalize whitespace.
- Validate `voice` with an explicit `if voice not in model.voices: raise HTTPException(400, ...)`.
- Add a model-load lock to avoid concurrent first-load races.

## Privacy and Safety

### Clinical and personal data can be logged

Affected code:

- raw VLM response logging: `server/main.py:219`
- confirmed intent logging: `server/main.py:1686`
- telemetry around patient context and generated outputs throughout

Limitation: logs can contain patient records, inferred medical needs, family names, images encoded in client payloads indirectly, and model responses. For a healthcare-adjacent tool, logs should be treated as sensitive data.

Possible fix:

- Add structured logging with redaction.
- Avoid logging full model responses and final intents unless debug mode is explicitly enabled.
- Rotate logs and document retention.

### Prompt injection from records and tags is possible

Affected code:

- record content inserted directly into prompts: `server/main.py:1047`, `server/main.py:1066`, `server/main.py:1136`, `server/main.py:1328`
- sketch tags inserted directly into prompts: `server/main.py:1045`, `server/main.py:1063`, `server/main.py:1133`, `server/main.py:1326`

Limitation: medical records, environment records, and model-generated tags are interpolated directly into prompts. A malicious or accidental record can instruct the model to ignore rules, reveal context, or produce unsafe advice.

Possible fix:

- Delimit untrusted record text clearly and tell the model it is data, not instructions.
- Strip or flag instruction-like content in records.
- Validate outputs against allowed first-person request patterns.
- Keep human confirmation in the workflow and mark low-confidence outputs.

### The system can produce medical requests without clinical safeguards

Affected code:

- RAG prompts: `server/main.py:1042`, `server/main.py:1062`, `server/main.py:1132`

Limitation: prompts can produce medication-related statements from records and current time, but there is no dosage verification, medication safety rule engine, or caretaker acknowledgement requirement in server logic.

Possible fix:

- Treat generated text as communication assistance, not medical decision support.
- Add clear metadata such as `requires_caretaker_confirmation`.
- For medications, use structured schedule data instead of free-text-only records.
- Avoid generating dosage changes or medical advice; only request caretaker help.

## TTS Asset and Runtime Limitations

### Startup downloads conflict with offline/local-first claims

Affected code:

- `server/main.py:33`
- `server/main.py:67`

Limitation: the server auto-downloads Kokoro assets from GitHub if files are missing. This is convenient, but it creates a network dependency and may conflict with "100% offline" deployment expectations.

Possible fix:

- Make downloads an explicit setup step.
- Add `AGAPITA_ALLOW_ASSET_DOWNLOADS=true` for development only.
- Verify checksums for downloaded assets.
- Fail readiness for TTS until assets are present.

### TTS model loading can race

Affected code:

- `server/main.py:338`
- `server/main.py:340`

Limitation: concurrent first TTS requests can all observe `ai_engine.kokoro_model` as missing and try to load the model simultaneously.

Possible fix:

- Add an `asyncio.Lock` around first-load.
- Initialize `kokoro_model = None` in `AIEngine.__init__`.
- Expose TTS readiness state.

### WAV generation buffers full audio in memory

Affected code:

- `server/main.py:447`
- `server/main.py:473`

Limitation: the endpoint returns a `StreamingResponse`, but audio is fully generated and buffered before response. Long text can create high memory use and latency.

Possible fix:

- Enforce text length limits.
- Chunk long TTS requests.
- Consider real streaming only if the TTS library supports incremental generation.

## HTTPS and Deployment

### Self-signed certificate SANs are hardcoded

Affected code:

- `server/main.py:1867`
- `server/main.py:1870`
- `server/main.py:1871`
- `server/main.py:1872`

Limitation: local IP addresses are embedded in the generated cert. The cert will be wrong on other networks, and the server silently falls back to HTTP if HTTPS setup fails.

Possible fix:

- Generate SANs dynamically from configured hostnames/IPs.
- Store cert paths in environment variables.
- Fail closed when `AGAPITA_USE_HTTPS=true` and cert generation fails.

### Certificate/key paths are relative to process working directory

Affected code:

- `server/main.py:1829`
- `server/main.py:1896`
- `server/main.py:1897`

Limitation: running from the repo root vs `server/` changes where cert/key files are read or written.

Possible fix:

- Resolve cert/key relative to `Path(__file__).parent`.
- Add explicit config for cert directory.

### App entrypoint can be easy to misuse

Affected code:

- `server/main.py:654`
- `server/main.py:1899`
- `server/main.py:1903`
- `server/main.py:1906`

Limitation: Socket.IO is mounted through `socket_app`, not the plain FastAPI `app`. Running `uvicorn server.main:app` would omit Socket.IO behavior.

Possible fix:

- Document `uvicorn server.main:socket_app`.
- Rename exports clearly, for example `fastapi_app` and `asgi_app`.
- Move Uvicorn launch config into Docker/CLI scripts.

## Maintainability

### `server/main.py` is doing too much

Affected code:

- entire `server/main.py`

Limitation: unrelated responsibilities are tightly coupled through globals (`ai_config`, `ai_engine`, `sio`, `connected_users`, `SessionLocal`). This makes testing hard and increases the chance that a change in one workflow breaks another.

Possible fix:

- Split into modules:
  - `database.py`
  - `dependencies.py`
  - `routers/auth.py`
  - `routers/admin.py`
  - `routers/patient.py`
  - `services/inference.py`
  - `services/rag.py`
  - `services/tts.py`
  - `realtime/socket_handlers.py`
  - `settings.py`
- Inject dependencies through app state or service constructors.

### Duplicate scan parsing/normalization logic

Affected code:

- HTTP scan route: `server/main.py:170`
- Socket.IO scan handler: `server/main.py:1710`

Limitation: `scan_grounding()` and `scan_frame()` duplicate prompting, parsing, and coordinate normalization. Fixes can easily land in one path but not the other.

Possible fix:

- Extract `scan_image_for_objects(image_bytes, mode, scope)`.
- Extract `parse_scan_response(raw_response)` and `normalize_box_2d()`.
- Unit test the parser against malformed JSON, Python dict syntax, 0-1 coordinates, 0-1000 coordinates, and missing boxes.

### Lint/static issues indicate cleanup debt

Observed with `server/venv/bin/pyflakes server/main.py server/auth.py server/models.py`:

- unused top-level `numpy as np`
- unused variables such as `start_norm`, `start_decode`, `start_search`, `person_llm_time`, `mode`, `json_err`
- f-string without placeholders at `server/main.py:809`
- unused `Table` import in `server/models.py`

Limitation: these are mostly low risk, but they make real warnings easier to miss.

Possible fix:

- Add `ruff` or `pyflakes` to CI.
- Remove unused imports/variables or log the timing values they were intended to capture.

## Verification Performed

- `python3 -m py_compile server/main.py` passed.
- `server/venv/bin/pyflakes server/main.py server/auth.py server/models.py` reported lint issues only; it does not catch the dynamic missing-method bug.
- Manual symbol search confirmed `reload_vector_store` is called once and not defined, while `reload_record_store` is defined.

## Suggested Implementation Order

1. Fix the missing `reload_vector_store` call and add a regression test.
2. Add auth/role dependencies for HTTP routes.
3. Add patient assignment checks for every caretaker Socket.IO path.
4. Introduce request models and image/TTS size limits.
5. Add model-call timeout/semaphore wrappers.
6. Invalidate RAG cache on record mutations and decide how global records should behave.
7. Move secrets, model names, origins, DB path, HTTPS settings, and asset-download policy into configuration.
8. Extract scan, RAG, TTS, auth, and realtime services from `server/main.py`.
