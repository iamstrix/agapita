# Agapita Hackathon Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Agapita into a reliable, judge-ready hackathon submission with a clear demo, resilient backend behavior, polished documentation, and measurable proof of the offline Gemma-powered architecture.

**Architecture:** Preserve the current three-role flow: patient canvas, caretaker dashboard, and admin/RAG control console. Prioritize the golden demo path and backend fixes that protect that path over broad new features. Treat every task as a small, testable improvement that either reduces demo risk or improves judging clarity.

**Tech Stack:** React 19, TypeScript, Vite, Socket.IO client, Tailwind/CSS, FastAPI backend, SQLAlchemy/SQLite, Socket.IO server, Ollama/Gemma, local TTS.

---

## North Star Demo

The final hackathon demo should show this sequence without explanation gaps:

1. Patient logs in and draws a simple, shaky intent.
2. Gemma interprets the sketch.
3. RAG personalizes the intent using clinical, temporal, relational, environmental, and behavioral records.
4. The patient confirms the synthesized request.
5. Text-to-speech speaks the request.
6. The caretaker receives the realtime alert with the interpreted message and sketch image.
7. The caretaker scans or adds room context.
8. A second patient request demonstrates that the grounding context changes the interpretation.
9. The admin dashboard briefly shows RAG context assignment and mock time override.
10. The video closes with latency numbers and the offline/local-first claim.

---

## Priority Order

1. **Demo reliability:** Fix anything that can break the golden path.
2. **Backend correctness:** Patch high-risk server issues already identified in `../SERVER_MAIN_LIMITATIONS.md`.
3. **Submission clarity:** Replace boilerplate docs and write a judge-friendly walkthrough.
4. **Evidence:** Capture benchmark numbers, screenshots, GIFs, and a short video.
5. **Polish:** Improve UI copy, loading/error states, and fallback flows only where they affect the demo.

---

## File Map

### Frontend Files

- `src/App.tsx`
  - Role-based routing and persisted login state.
- `src/pages/LoginPage.tsx`
  - Demo login entry point and first impression.
- `src/pages/PatientDashboard.tsx`
  - Core patient drawing canvas, interpretation flow, confirmation screen, records/config UI, TTS controls, telemetry HUD.
- `src/pages/CaretakerDashboard.tsx`
  - Realtime alerts, environment scanner, grounding record creation, patient context view.
- `src/pages/AdminDashboard.tsx`
  - RAG record assignment, staff assignment, user management, mock time override.
- `src/api/auth.ts`
  - HTTP auth helper and API base URL.
- `README.md`
  - Currently Vite boilerplate; replace with project-specific desktop instructions.

### Backend Files One Directory Up

- `../server/main.py`
  - FastAPI routes, Socket.IO events, inference calls, RAG cache, record loading, TTS endpoints, seed data.
- `../server/auth.py`
  - JWT secret, token generation, auth helpers.
- `../server/models.py`
  - SQLAlchemy models and role definitions.
- `../server/requirements.txt`
  - Backend dependencies.
- `../SERVER_MAIN_LIMITATIONS.md`
  - Existing backend risk register.

### Project-Level Docs

- `../README.md`
  - Main product README with pitch, architecture, setup, and competition alignment.
- `../SETUP.md`
  - Setup and demo credentials.
- `../gemma4_good_pitch_script.md`
  - Submission video script.
- `../.ai/GEMMA_4_GOOD_SUBMISSION.md`
  - Long-form submission narrative.

---

## Phase 1: Freeze the Golden Demo

### Task 1: Define the exact demo script

**Files:**
- Modify: `tasks.md`
- Modify later if writable/desired: `../gemma4_good_pitch_script.md`

- [ ] Write the exact five-minute rehearsal flow:
  - login credentials for patient, caretaker, and admin
  - exact sketch shapes to draw
  - expected first interpretation
  - expected caretaker alert
  - exact grounding record to add
  - expected changed interpretation after grounding
  - exact mock time value to use in admin

- [ ] Add a short "demo reset" checklist:
  - clear browser local storage
  - restart backend
  - confirm Ollama model is loaded
  - confirm frontend `VITE_SERVER_URL`
  - confirm patient/caretaker sockets connect
  - confirm camera permission on the demo device

- [ ] Acceptance criteria:
  - A teammate can rehearse the full flow without asking what to click next.
  - Every screen shown in the pitch has one purpose and one expected result.

### Task 2: Create a no-network demo fallback

**Files:**
- Modify: `src/pages/PatientDashboard.tsx`
- Modify: `src/pages/CaretakerDashboard.tsx`
- Modify: `src/api/auth.ts`
- Modify: `README.md`

- [ ] Add a `VITE_DEMO_MODE=true` path that can replay known interpretation responses when the backend/model is unavailable.

- [ ] Patient fallback behavior:
  - after drawing and tapping interpret, return a known response such as `Can I please have my 9 PM Lisinopril medication?`
  - populate alternatives with `water`, `medicine`, and `call family`
  - show telemetry as `Demo replay`

- [ ] Caretaker fallback behavior:
  - provide a visible button or local simulated event for receiving the patient alert if Socket.IO is unavailable
  - label it internally as demo fallback, not as a production feature

- [ ] Acceptance criteria:
  - The demo can still be recorded if Ollama, camera, or Socket.IO fails during rehearsal.
  - Demo mode is opt-in through an environment variable and does not affect normal mode.

### Task 3: Rehearse and record failure points

**Files:**
- Modify: `tasks.md`

- [ ] Run the full golden path three times in a row.

- [ ] For each failure, record:
  - exact screen
  - exact action
  - console/backend error
  - whether it blocks judging
  - whether fallback mode covers it

- [ ] Acceptance criteria:
  - No unresolved blocker remains in the golden path.
  - Any non-blocking issue has a workaround documented in `tasks.md`.

---

## Phase 2: Backend Fixes That Protect the Demo

### Task 4: Fix record assignment reload bug

**Files:**
- Modify: `../server/main.py`
- Test manually through: `src/pages/AdminDashboard.tsx`

- [ ] Find the record assignment endpoint in `../server/main.py`.

- [ ] Replace the missing `reload_vector_store(db)` call with the implemented `reload_record_store(db)` call.

- [ ] Manual verification:
  - login as admin
  - drag one global record to a patient
  - confirm no backend `AttributeError`
  - refresh admin dashboard
  - confirm the record remains assigned
  - unassign the same record
  - confirm no backend error

- [ ] Acceptance criteria:
  - Drag/drop record assignment works every time.
  - RAG context reloads after assignment.

### Task 5: Invalidate RAG cache after record changes

**Files:**
- Modify: `../server/main.py`

- [ ] Add a small helper near the RAG cache implementation:
  - accepts optional patient identifier
  - clears cached RAG entries for that patient
  - clears all RAG cache if patient is unknown
  - clears in-flight futures for the affected patient

- [ ] Call the helper after:
  - patient record creation
  - patient record deletion
  - admin record creation
  - admin record assignment
  - admin record unassignment
  - caretaker scanner grounding additions

- [ ] Manual verification:
  - set mock time to a known value
  - run one sketch interpretation
  - add a new grounding record for the patient
  - run the same sketch again
  - confirm the result reflects the new record instead of the old cached response

- [ ] Acceptance criteria:
  - RAG updates are visible immediately after changing records.
  - No server restart is needed between demo steps.

### Task 6: Add auth and role enforcement to admin APIs

**Files:**
- Modify: `../server/main.py`
- Modify if needed: `../server/auth.py`
- Verify through: `src/pages/AdminDashboard.tsx`, `src/pages/CaretakerDashboard.tsx`

- [ ] Add or reuse a `require_admin` dependency.

- [ ] Apply it to every `/api/admin/*` HTTP endpoint:
  - patients
  - caretakers
  - assignments
  - users
  - records
  - model config

- [ ] Update frontend API calls to send the bearer token where needed:
  - `src/pages/AdminDashboard.tsx`
  - caretaker grounding calls in `src/pages/CaretakerDashboard.tsx`

- [ ] Manual verification:
  - anonymous request to `/api/admin/users` returns `401` or `403`
  - patient token cannot access admin users
  - caretaker token cannot edit users
  - admin dashboard still loads with admin token

- [ ] Acceptance criteria:
  - Admin routes are not open to every local network client.
  - The demo still works after adding enforcement.

### Task 7: Scope caretaker access to assigned patients

**Files:**
- Modify: `../server/main.py`
- Verify through: `src/pages/CaretakerDashboard.tsx`

- [ ] Add a backend helper that checks whether a caretaker is assigned to the requested patient.

- [ ] Use the helper for patient-scoped Socket.IO events and grounding actions.

- [ ] Manual verification:
  - caretaker can see assigned patient records
  - caretaker cannot request or mutate another patient by guessing an ID
  - admin can still assign caretaker-to-patient relationships

- [ ] Acceptance criteria:
  - Caretaker access is bounded by assignment.
  - The golden demo caretaker account is assigned to the golden demo patient.

### Task 8: Add model-call timeouts and demo-safe error responses

**Files:**
- Modify: `../server/main.py`
- Modify: `src/pages/PatientDashboard.tsx`
- Modify: `src/pages/CaretakerDashboard.tsx`

- [ ] Wrap expensive Ollama/VLM/RAG/TTS calls with timeouts.

- [ ] Add bounded concurrency with semaphores for:
  - sketch interpretation
  - grounding scanner interpretation
  - TTS generation

- [ ] Return user-facing error messages that are useful during a demo:
  - `Model is still warming up. Please try again.`
  - `Scanner analysis timed out. Capture a closer frame.`
  - `Server is busy. Please retry in a few seconds.`

- [ ] Acceptance criteria:
  - A hung model call does not freeze the entire app.
  - The patient screen recovers to a usable state after failure.
  - The caretaker scanner can cancel or retry.

---

## Phase 3: Frontend Demo Polish

### Task 9: Replace blocking alerts with inline states

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `src/pages/CaretakerDashboard.tsx`
- Modify: `src/pages/PatientDashboard.tsx`

- [ ] Replace `alert(...)` calls in demo paths with inline status messages.

- [ ] Minimum required states:
  - saving
  - saved
  - failed
  - retry available

- [ ] Acceptance criteria:
  - No browser alert interrupts the recorded demo.
  - Errors are visible on screen and recoverable.

### Task 10: Improve first-run login clarity

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `README.md`

- [ ] Add non-production demo credential hints in the login UI only if safe for hackathon/demo builds.

- [ ] Make sure the default credentials match `../SETUP.md`.

- [ ] Acceptance criteria:
  - Judges or teammates can enter the app quickly during review.
  - Demo credentials are clearly marked as demo-only.

### Task 11: Strengthen patient confirmation screen

**Files:**
- Modify: `src/pages/PatientDashboard.tsx`

- [ ] Ensure the patient can clearly:
  - accept the primary interpretation
  - choose an alternative
  - clear and redraw
  - hear TTS
  - see loading/progress while alternatives arrive

- [ ] Acceptance criteria:
  - The patient flow works on tablet-sized screens.
  - No critical button is small or hidden in landscape.
  - The confirmation moment is visually obvious in the demo video.

### Task 12: Make caretaker alerts visually undeniable

**Files:**
- Modify: `src/pages/CaretakerDashboard.tsx`

- [ ] Ensure new alerts visibly animate or appear at the top.

- [ ] Include:
  - patient name
  - synthesized intent
  - timestamp
  - sketch thumbnail
  - acknowledged/resolved state if simple to add

- [ ] Acceptance criteria:
  - A judge can understand the realtime handoff from a single screen recording.
  - The alert does not depend on reading terminal logs.

---

## Phase 4: Documentation and Submission Assets

### Task 13: Replace desktop README boilerplate

**Files:**
- Modify: `README.md`

- [ ] Replace the Vite template text with:
  - project name and one-sentence purpose
  - desktop app role in the larger Agapita system
  - prerequisites
  - environment variables
  - run commands
  - demo credentials
  - troubleshooting
  - link to project-level `../README.md`

- [ ] Acceptance criteria:
  - `desktop/README.md` no longer looks like a template.
  - A judge can run the frontend from the README alone.

### Task 14: Update project setup docs

**Files:**
- Modify if writable: `../SETUP.md`
- Modify if writable: `../README.md`

- [ ] Reconcile model names and credentials across docs.

- [ ] Confirm whether setup requires:
  - `gemma4:e4b`
  - `nomic-embed-text`
  - Kokoro model files
  - HTTPS certificates

- [ ] Acceptance criteria:
  - No contradictory credentials.
  - No contradictory model list.
  - Setup flow matches the actual current app.

### Task 15: Add benchmark evidence

**Files:**
- Modify: `tasks.md`
- Modify if writable: `../README.md`
- Create if writable: `../BENCHMARKS.md`

- [ ] Record hardware:
  - CPU
  - GPU
  - RAM
  - VRAM
  - OS
  - Ollama model tag

- [ ] Record at least five runs for:
  - sketch interpretation
  - RAG synthesis
  - TTS
  - total patient confirm flow
  - caretaker scanner grounding

- [ ] Add a simple table:
  - minimum
  - median
  - maximum
  - notes

- [ ] Acceptance criteria:
  - Performance claims in README and pitch have measured backing.
  - Any claim like `~3s` is traceable to a local test run.

### Task 16: Prepare submission screenshots and video captures

**Files:**
- Create if writable: `../media/`
- Modify if writable: `../gemma4_good_pitch_script.md`

- [ ] Capture screenshots:
  - login screen
  - patient canvas
  - interpretation confirmation
  - caretaker alert
  - caretaker scanner
  - admin RAG assignment
  - telemetry HUD

- [ ] Capture video clips:
  - patient drawing to interpretation
  - patient confirmation to caretaker alert
  - scanner adding room context
  - admin mock time changing interpretation

- [ ] Acceptance criteria:
  - Submission can be assembled without needing another live recording.
  - Every technical claim has a visual counterpart.

---

## Phase 5: Testing and Verification

### Task 17: Run frontend verification

**Files:**
- Read: `package.json`
- Verify: all frontend files touched

- [ ] Run lint:

```bash
npm run lint
```

- [ ] Run production build:

```bash
npm run build
```

- [ ] Acceptance criteria:
  - Lint passes or every remaining warning is documented.
  - Build completes successfully.

### Task 18: Run backend smoke checks

**Files:**
- Read: `../server/requirements.txt`
- Verify: `../server/main.py`

- [ ] Start backend:

```bash
cd ../server
python main.py
```

- [ ] Confirm expected startup behavior:
  - server binds to port `8000`
  - database opens
  - seed data is present
  - model warmup does not crash startup

- [ ] Smoke test:
  - login endpoint returns token
  - admin routes reject anonymous requests
  - patient records route accepts patient token
  - Socket.IO connects with valid token

- [ ] Acceptance criteria:
  - Backend can be restarted cleanly before a demo.
  - Authentication and core role flows behave as expected.

### Task 19: Full rehearsal checklist

**Files:**
- Modify: `tasks.md`

- [ ] Run full demo on desktop browser.

- [ ] Run patient flow on tablet-sized viewport.

- [ ] Run caretaker scanner on the actual camera device planned for recording.

- [ ] Run with fresh browser profile or cleared local storage.

- [ ] Run after restarting both frontend and backend.

- [ ] Acceptance criteria:
  - Three clean rehearsals in a row.
  - No manual database edits needed between rehearsals.
  - No terminal intervention needed during the recorded flow.

---

## Phase 6: Final Submission Readiness

### Task 20: Finalize pitch script

**Files:**
- Modify if writable: `../gemma4_good_pitch_script.md`
- Modify if writable: `../.ai/GEMMA_4_GOOD_SUBMISSION.md`

- [ ] Keep the script focused on:
  - stroke patient communication barrier
  - offline edge deployment
  - single Gemma model architecture
  - 5D RAG personalization
  - realtime caretaker handoff
  - measured latency

- [ ] Remove claims not demonstrated in the app or benchmark table.

- [ ] Acceptance criteria:
  - The script matches the recorded app behavior exactly.
  - The strongest technical differentiator is clear within the first 90 seconds.

### Task 21: Package the final demo state

**Files:**
- Modify: `tasks.md`
- Modify if writable: `../README.md`
- Modify if writable: `../SETUP.md`

- [ ] Record final known-good commit hash.

- [ ] Record final run commands:

```bash
cd server
python main.py
```

```bash
cd desktop
npm run dev
```

- [ ] Record final demo credentials.

- [ ] Record final local URLs:
  - frontend
  - backend
  - mobile LAN URL if applicable

- [ ] Acceptance criteria:
  - The project can be restored to the demo state from docs alone.
  - The final recording can be reproduced.

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---:|---|
| Ollama model warmup is slow | Demo stalls | Warm up before recording; add demo fallback mode |
| Camera permission fails on mobile | Scanner demo breaks | Use HTTPS; pre-record scanner clip; add fallback item |
| RAG cache returns stale answer | Grounding demo looks fake | Implement cache invalidation after record changes |
| Admin record assignment crashes | Admin demo breaks | Fix `reload_vector_store` call |
| Socket.IO disconnects | Caretaker alert missing | Add visible reconnect state; rehearse same network |
| Docs contradict current credentials | Judges cannot run app | Reconcile `README.md`, `SETUP.md`, and login defaults |
| Browser alerts interrupt screen recording | Demo feels brittle | Replace demo-path alerts with inline states |
| Claims exceed implementation | Credibility loss | Tie every claim to a demo moment or benchmark |

---

## Definition of Done

- [ ] Golden demo succeeds three times in a row.
- [ ] Frontend build passes with `npm run build`.
- [ ] Backend starts cleanly after a fresh restart.
- [ ] Admin record assignment works.
- [ ] RAG context changes appear without restarting the server.
- [ ] Caretaker receives realtime patient alert.
- [ ] README is no longer boilerplate.
- [ ] Benchmark table exists.
- [ ] Pitch script matches actual app behavior.
- [ ] Final submission video assets are captured.

---

## Recommended Execution Strategy

Use this order:

1. Task 4: fix record assignment reload bug.
2. Task 5: invalidate RAG cache after record changes.
3. Task 1: freeze exact demo script.
4. Task 19: run full rehearsal once and record blockers.
5. Task 9 through Task 12: polish only the demo-critical UI states.
6. Task 13 through Task 15: docs and benchmarks.
7. Task 16 and Task 20: record and align pitch.
8. Task 17, Task 18, Task 21: final verification and packaging.

Defer these unless time remains:

- Multi-patient production hardening beyond the judged demo.
- Major UI redesigns.
- New inference features.
- New mobile native client work.
- Large backend module refactors.

