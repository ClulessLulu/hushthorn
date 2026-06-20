# Snap-to-update (AI progress capture) — Design Spec

**Status:** Approved, ready to build. 2026-06-20.
**Depends on:** per-format reading progress (shipped — `progress jsonb`, `formatPercent`, `ProgressEditor`).

## Goal

Let a user update a book's per-format progress by snapping a photo / screenshot of
their Kindle, Libby, or audiobook player. Claude vision reads the screen; a confirm
step shows the parsed value before it writes into `progress[fmt]`.

**Honest framing:** this is **"Snap to update," never "sync."** There is no public
Kindle/Libby/Audible progress API (verified 2026); camera capture is the state of
the art. UI copy must not imply automatic syncing.

## Flow

1. Each format row in `ProgressEditor` gets a **"📸 Snap to update"** affordance.
2. Tap → camera capture (mobile) OR screenshot upload (desktop) — reuse the existing
   capture/upload fallback (camera blocked → upload).
3. `readProgressShot(dataUrl, fmt)` sends the image to Claude with a **format-specific**
   prompt and returns the parsed values (or `null`).
4. A small **confirm strip** shows the parsed value: *"Snapped: 45% · Apply / Retry /
   Enter by hand."*
   - **Apply** → `onUpdate({ progress: { ...prog, [fmt]: parsed } })` (the live-persist
     path; auto-Read at 100% still fires).
   - **Retry** → re-snap. **Enter by hand** → dismiss to the existing number fields.

## `readProgressShot(dataUrl, fmt)` — vision helper [backend-dev]

Mirrors `scanCover` (src/App.jsx): split `dataUrl` → base64 + media_type; `callClaude`
with `model: "claude-sonnet-4-6"`, an `image` block + a text prompt demanding **ONLY**
a JSON object; strip ``` fences, slice to the outermost `{`…`}`, `JSON.parse` inside
try/catch; return `null` on any failure.

Per-format prompt → native progress shape (we know `fmt`, so the prompt is precise):

| Format | Prompt asks for | Returns |
|---|---|---|
| `print` | current page + total pages | `{ page, pages }` |
| `ebook` | percent complete (0–100) | `{ percent }` |
| `audio` | listened + total length in **decimal hours** (2h15m → 2.25) | `{ listened, hours }` |

Each numeric field is `number | null`; `null` = unreadable. A partial result (e.g.
`page` but not `pages`) is allowed — the confirm strip shows what was read and the user
completes/corrects it; `formatPercent` already coerces missing fields to 0.

## Snap UI in `ProgressEditor` [frontend-dev]

- Per-format "Snap to update" button + hidden file input + camera capture (reuse the
  AddBook capture/upload pattern).
- Loading state while the vision call runs ("Reading the screen…").
- The confirm strip (Apply / Retry / Enter by hand) renders the parsed values formatted
  for the format (print: `145 / 320 (45%)`; ebook: `45%`; audio: `2.25h / 8.5h`).
- One honest helper line near the snap entry, e.g. *"Reads the screen you show it —
  Hushthorn can't sync from Kindle or Libby."*

## Fallbacks (never a dead end)

- `readProgressShot` → `null` (unreadable): notice *"Couldn't read that screen — enter
  it by hand below,"* manual number fields remain.
- Camera blocked → upload a screenshot instead.
- AI/network failure: same manual fallback; no throw to the user.

## Build sequence

1. **backend-dev** — `readProgressShot` (callClaude vision + per-format prompts +
   defensive parse + null fallback).
2. **frontend-dev** — the snap UI + confirm strip + capture/upload + manual fallback +
   copy, wired to `onUpdate({ progress })`.
3. **design-guardian** + **qa-tester** — review (cyan/corners, honest copy) + QA.

## Test cases (QE bar)

- Clean read per format (print page/pages, ebook percent, audio listened/hours) → confirm
  strip shows it; Apply persists; 100% auto-marks Read via the centralized path.
- Unreadable screen → `null` → manual fallback notice, no write, no throw.
- Malformed/garbage AI response (fenced, trailing prose, non-JSON) → defensive slice →
  `null`, fallback.
- Partial read (page without pages) → Apply writes partial; `formatPercent` → 0 until
  completed; no throw.
- Camera blocked → upload path works.
- Idempotent: applying the same snap twice yields the same `progress[fmt]` (no dupes).
