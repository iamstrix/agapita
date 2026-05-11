# iPad Finger & Apple Pencil Support Design

**Date:** 2026-05-11  
**Scope:** `desktop/src/pages/PatientDashboard.tsx` — canvas drawing surface only  
**Dependencies added:** none

---

## Problem

The PatientDashboard drawing canvas only wires up mouse events (`onMouseDown`, `onMouseMove`, `onMouseUp`, `onMouseLeave`). On iPad, finger and Apple Pencil input is not recognized, making the canvas unusable for the primary patient interaction.

---

## Approach: Pointer Events API

Replace mouse event handlers with the unified Pointer Events API, which handles mouse (`pointerType === 'mouse'`), finger (`pointerType === 'touch'`), and Apple Pencil (`pointerType === 'pen'`) through a single set of handlers.

---

## Input Handling

**Event handlers on the canvas element:**

| Old (mouse only) | New (pointer events) |
|---|---|
| `onMouseDown` | `onPointerDown` |
| `onMouseMove` | `onPointerMove` |
| `onMouseUp` | `onPointerUp` |
| `onMouseLeave` | `onPointerLeave` |
| _(none)_ | `onPointerCancel` |

**Coordinate extraction:** Read `e.clientX` / `e.clientY` directly from the pointer event — same values as mouse events, no `touches[0]` branch needed.

**Pointer capture:** Call `canvas.setPointerCapture(e.pointerId)` in `startDrawing` so the stroke continues tracking correctly if the pointer briefly exits the canvas bounds mid-stroke.

**Pressure:** Fixed at 4px stroke width regardless of `e.pressure`. No pressure-sensitive behavior.

---

## Palm Rejection

A `useRef<number | null>` (`activePenPointerIdRef`) tracks the pointerId of any active Apple Pencil contact.

**Logic in `startDrawing` (pointerdown):**
- If `pointerType === 'pen'`: store `e.pointerId` in `activePenPointerIdRef`, begin stroke normally.
- If `pointerType === 'touch'` AND `activePenPointerIdRef.current !== null`: call `e.preventDefault()` and return — the touch is ignored (palm rejection).
- Otherwise (finger with no pen active, or mouse): begin stroke normally.

**Logic in `endDrawing` (pointerup / pointercancel / pointerleave):**
- If the lifted pointer matches `activePenPointerIdRef.current`, clear the ref to `null`.

This means: once the Pencil touches the screen, resting-palm finger touches are rejected until the Pencil lifts.

---

## Scroll Prevention

Add `touchAction: 'none'` to the canvas inline style object. This instructs Safari/WebKit not to interpret touches on the canvas as scroll gestures, which is required for reliable touch interception on iPad. Without it, `preventDefault()` calls are ignored on passive listeners.

---

## Files Changed

- `desktop/src/pages/PatientDashboard.tsx`
  - Update `startDrawing` signature and body
  - Update `draw` signature and body
  - Update `endDrawing` signature and body
  - Add `activePenPointerIdRef` ref
  - Replace mouse event props with pointer event props on the `<canvas>` element
  - Add `touchAction: 'none'` to `styles.canvas`

No new files. No new dependencies.

---

## Out of Scope

- Pressure-sensitive stroke width
- Tilt/azimuth effects
- Multi-touch gestures (pinch to zoom, two-finger rotate)
- Apple Pencil double-tap detection
