# iPad Finger & Apple Pencil Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas drawing surface's mouse-only event handlers with the Pointer Events API so finger touch and Apple Pencil both work on iPad, with palm rejection when the Pencil is in use.

**Architecture:** All changes are in `PatientDashboard.tsx`. The three drawing handlers (`startDrawing`, `draw`, `endDrawing`) are updated to accept `React.PointerEvent` instead of `React.MouseEvent | React.TouchEvent`. A `useRef` tracks the active Pencil pointer ID so incoming finger touches can be rejected while the Pencil is down.

**Tech Stack:** React 18, TypeScript, HTML Canvas Pointer Events API (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onPointerLeave`), `canvas.setPointerCapture()`

---

## File Map

| File | Change |
|---|---|
| `desktop/src/pages/PatientDashboard.tsx` | Add `activePenPointerIdRef`; update `startDrawing`, `draw`, `endDrawing`; replace canvas mouse event props with pointer event props |

---

### Task 1: Add `activePenPointerIdRef` and update `startDrawing`

**Files:**
- Modify: `desktop/src/pages/PatientDashboard.tsx`

The ref tracks the `pointerId` of an in-progress Apple Pencil stroke. When a pen pointer goes down, we store its ID. When it lifts, we clear it. If a `touch` pointer tries to start while the ref is set, we ignore it.

- [ ] **Step 1: Add the ref**

In `PatientDashboard.tsx`, find the existing refs near line 124:

```tsx
const canvasRef = useRef<HTMLCanvasElement>(null);
const socketRef = useRef<any>(null);
```

Add one line immediately after:

```tsx
const canvasRef = useRef<HTMLCanvasElement>(null);
const socketRef = useRef<any>(null);
const activePenPointerIdRef = useRef<number | null>(null);
```

- [ ] **Step 2: Replace `startDrawing`**

Find the current `startDrawing` function (starts around line 212):

```tsx
const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
  const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

  ctx.beginPath();
  ctx.moveTo(x, y);
  setIsDrawing(true);
};
```

Replace it entirely with:

```tsx
const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (e.pointerType === 'touch' && activePenPointerIdRef.current !== null) return;

  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (e.pointerType === 'pen') {
    activePenPointerIdRef.current = e.pointerId;
  }

  canvas.setPointerCapture(e.pointerId);

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.beginPath();
  ctx.moveTo(x, y);
  setIsDrawing(true);
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/klydu/Personal Projects/agapita/desktop" && npx tsc --noEmit
```

Expected: no errors related to `startDrawing`.

---

### Task 2: Update `draw` and `endDrawing`

**Files:**
- Modify: `desktop/src/pages/PatientDashboard.tsx`

- [ ] **Step 1: Replace `draw`**

Find the current `draw` function (starts around line 227):

```tsx
const draw = (e: React.MouseEvent | React.TouchEvent) => {
  if (!isDrawing) return;
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
  const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

  ctx.lineTo(x, y);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
};
```

Replace it entirely with:

```tsx
const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (!isDrawing) return;
  if (e.pointerType === 'touch' && activePenPointerIdRef.current !== null) return;

  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.lineTo(x, y);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
};
```

- [ ] **Step 2: Replace `endDrawing`**

Find the current `endDrawing` function (starts around line 246):

```tsx
const endDrawing = () => {
  setIsDrawing(false);
};
```

Replace it entirely with:

```tsx
const endDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (e.pointerType === 'pen' && activePenPointerIdRef.current === e.pointerId) {
    activePenPointerIdRef.current = null;
  }
  setIsDrawing(false);
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/klydu/Personal Projects/agapita/desktop" && npx tsc --noEmit
```

Expected: no errors.

---

### Task 3: Wire pointer events onto the canvas element

**Files:**
- Modify: `desktop/src/pages/PatientDashboard.tsx`

- [ ] **Step 1: Replace canvas event props**

Find the `<canvas>` element in `renderContent()` (around line 327–336):

```tsx
<canvas
  ref={canvasRef}
  width={1100}
  height={800}
  style={styles.canvas}
  onMouseDown={startDrawing}
  onMouseMove={draw}
  onMouseUp={endDrawing}
  onMouseLeave={endDrawing}
/>
```

Replace it with:

```tsx
<canvas
  ref={canvasRef}
  width={1100}
  height={800}
  style={styles.canvas}
  onPointerDown={startDrawing}
  onPointerMove={draw}
  onPointerUp={endDrawing}
  onPointerCancel={endDrawing}
  onPointerLeave={endDrawing}
/>
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd "/Users/klydu/Personal Projects/agapita/desktop" && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Build to verify no bundler errors**

```bash
cd "/Users/klydu/Personal Projects/agapita/desktop" && npm run build
```

Expected: build succeeds, no warnings about missing types.

---

### Task 4: Manual verification and commit

**Files:**
- No code changes — verification only, then commit.

- [ ] **Step 1: Start the dev server**

```bash
cd "/Users/klydu/Personal Projects/agapita/desktop" && npm run dev
```

- [ ] **Step 2: Test mouse drawing (regression)**

Open the patient dashboard in a desktop browser. Draw on the canvas with a mouse. Verify strokes appear and the Send / Clear buttons work as before.

- [ ] **Step 3: Test finger drawing on iPad**

Open the app on iPad Safari. Draw with a finger. Verify:
- Strokes appear on the canvas
- The page does not scroll while drawing

- [ ] **Step 4: Test Apple Pencil on iPad**

Draw with the Apple Pencil. Verify:
- Strokes appear with the Pencil
- While Pencil is down, resting a palm or finger on the canvas produces no stray marks (palm rejection)
- After the Pencil lifts, finger drawing works normally again

- [ ] **Step 5: Commit**

```bash
cd "/Users/klydu/Personal Projects/agapita" && git add desktop/src/pages/PatientDashboard.tsx && git commit -m "feat: add iPad finger and Apple Pencil support with palm rejection"
```
