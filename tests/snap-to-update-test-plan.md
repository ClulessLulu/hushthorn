# Test Plan — Snap-to-update (AI progress capture)

**Feature:** Snap-to-update — vision-based per-format progress capture
**Spec (source of truth):** `docs/superpowers/specs/2026-06-20-snap-to-update-design.md`
**App under test:** single-file `src/App.jsx` (Vite + React + Supabase) — change uncommitted
**Author:** qa-tester (bookbee method)
**Status:** drafted before judging the code; backend-dev + frontend-dev reported `completed`

## How to read this plan

- Each row carries a concrete **PASS** criterion; the test FAILS if the criterion is not met.
- IDs: `B-` backend/data, `F-` frontend behavior, `U-` pure-function unit, `E-` edge/fallback.
- Methods: `MCP` (Supabase), `Unit` (Node ESM snippet on extracted pure fns with a STUBBED
  `callClaude`), `Manual`/Playwright (Chrome — vision/camera features are Chrome/Edge only),
  `Code` (read-only inspection of mapping/write shapes).
- A live vision call (real screenshot → real API) **cannot be auto-run** here (no API key /
  no real screen image in CI). Those rows are marked **DEFERRED to developer** and called out
  in the report's manual-test section.

### Structural baseline (current `src/App.jsx`, for reference)

- `readProgressShot(dataUrl, fmt)` — `:580`. Calls `callClaude({ model:"claude-sonnet-4-6", … })`
  with an `image` + per-format text prompt; strips fences, slices outer `{…}`, `JSON.parse`,
  → `shapeProgressShot(parsed, fmt)`; `try/catch` returns `null` on ANY failure.
- `shapeProgressShot` — `:566`; `coerceShotNum` — `:556`; `PROGRESS_SHOT_PROMPTS` — `:535`.
- `ProgressEditor` snap UI — `:659`. `handleSnap` `:681` (local state only), `applySnap` `:704`
  (the ONLY `onUpdate` write), `clearSnap` `:710`.
- Centralized auto-Read — `updateBook` `:1397-1400` (`maxPercent(merged) >= 100 → read`).
- `progress` persists as a `books.progress` jsonb column via `FIELD_MAP` `:1403`.

---

## 1. Backend / Data Layer

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | `books.progress` jsonb column exists | MCP `list_tables` | `progress` column present on `books`, type `jsonb`. (Shipped with the prior per-format feature; snap reuses it.) |
| B-02 | `progress` write goes through the existing centralized path | Code (`:1403`,`:1408`) | `applySnap`'s `onUpdate({ progress })` reaches `updateBook`, which maps `progress`→`progress` and issues `supabase.from('books').update({progress}).eq('id', id)`. No new column/table introduced; RLS owner-only inherited unchanged. |
| B-03 | No new RLS surface / advisor regressions | MCP `get_advisors` (security) | Feature adds no table/column/policy → security-advisor set unchanged. |

## 2. Pure-Function Unit — defensive parse (`readProgressShot` + helpers)

Extract `coerceShotNum`, `shapeProgressShot`, and the parse path of `readProgressShot`
into a Node ESM snippet with a **STUBBED `callClaude`** returning canned API shapes.
Every case asserts **no throw** and the documented return.

| ID | Case (fmt) | PASS criterion |
|---|---|---|
| U-01 | clean JSON — print | `{"page":145,"pages":320}` → `{page:145, pages:320}` |
| U-02 | clean JSON — ebook | `{"percent":45}` → `{percent:45}` |
| U-03 | clean JSON — audio (decimal hours) | `{"listened":2.25,"hours":8.5}` → `{listened:2.25, hours:8.5}` |
| U-04 | ```-fenced (bare) JSON | fenced ```\n{…}\n``` → parsed object (fences stripped) |
| U-05 | ```json-fenced JSON | ` ```json\n{…}\n``` ` → parsed object |
| U-06 | leading + trailing prose around `{…}` | `"Here you go: {…}. Hope that helps!"` → parsed object (sliced to outer braces) |
| U-07 | total garbage (no braces) | `"sorry I can't read this"` → `null` (no `{`/`}`) |
| U-08 | truncated JSON (`{"page":145,`) | malformed → `JSON.parse` throws → caught → `null` |
| U-09 | empty `content` array | `{content:[]}` → text "" → no braces → `null` |
| U-10 | missing `content` key | `{}` → `null` |
| U-11 | `callClaude` throws (network/HTTP non-2xx) | helper throws → caught → `null` (never propagates) |
| U-12 | non-numeric field → null | `{"page":"abc","pages":320}` → `{page:null, pages:320}` (string-but-numeric `"145"`→145; pure-garbage→null) |
| U-13 | partial read returned as-is | `{"page":145}` (no `pages`) → `{page:145, pages:null}` — partial allowed, no throw |
| U-14 | unknown fmt | `readProgressShot(url,"comic")` → `null` (no prompt) before any call |
| U-15 | bad dataUrl (no comma / empty b64) | `"notadataurl"` / `"data:image/png;base64,"` → `null`, no call attempted |
| U-16 | `null`/non-object parsed | AI returns `"null"` or `"[]"` → `shapeProgressShot` guards → `null` |

## 3. Frontend Behavior

### 3.1 Confirm-first (the key invariant) — proven by code inspection

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-01 | `handleSnap` writes NOTHING to `progress` | Code (`:681-700`) | `handleSnap` only calls `setSnapState`/`setSnapResult` (local React state). No `onUpdate`, no `writeFmt`, no `supabase` in its body. |
| F-02 | `applySnap` is the ONLY snap write | Code (`:704-708`) | Exactly one `onUpdate({ progress })` in the snap code path, inside `applySnap`, guarded by `if (parsed)`. `Retry`(`openSnap`) and `Enter by hand`(`clearSnap`) call no `onUpdate`. |
| F-03 | Apply merges one fmt, leaves others | Code (`:706`) | Payload is `{ progress: { ...prog, [fmt]: parsed } }` — spreads existing `prog`, replaces only `[fmt]`. |
| F-04 | Apply routes through centralized auto-Read | Code (`:1397-1400`) | `onUpdate`→`updateBook`; a snap reaching 100% on any format flips `read:true` via `maxPercent(merged)>=100`. Editor itself never sets `read`. |

### 3.2 Fallbacks (never a dead end)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-05 | `null` parse → error notice, no write | Code (`:690-693`,`:777-781`) | `!parsed` → state `"error"`, renders "Couldn't read that screen — enter it by hand below." No `onUpdate`. No throw. |
| F-06 | Manual fields persist alongside | Code (`:814-873`) | The number inputs render regardless of snap state; an error/confirm strip never removes them. |
| F-07 | Camera blocked → upload is the same input | Code (`:749-757`) | A single hidden `<input type="file" accept="image/*" capture="environment">`; on desktop/blocked-camera it is the screenshot/upload picker. One path, no dead-end. |
| F-08 | Honest copy, no "sync" claim | Code (`:771-773`) | Helper line states "Hushthorn can't sync from Kindle or Libby." No copy implies auto-sync. |
| F-09 | Loading state during the call | Code (`:687`,`:765-767`) | State `"loading"` shows "Reading the screen…" and disables the button while the vision call runs. |

### 3.3 Live drive (DEFERRED — needs real API + real screenshot)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-10 | Real ebook screenshot → confirm strip → Apply persists | Manual/Playwright (Chrome) | Upload a real Kindle screenshot; confirm strip shows the read %; Apply writes `progress.ebook.percent`; DB row + bar reflect it. **DEFERRED to developer** (no live API here). |
| F-11 | 100% real snap auto-marks Read | Manual + MCP | A real snap reading 100% flips the book to Read via the centralized path. **DEFERRED to developer.** |

## 4. Edge / Idempotency

| ID | Scenario | Method | PASS criterion |
|---|---|---|---|
| E-01 | Idempotent apply | Unit/Code | Applying the same parsed snap twice yields the identical `progress[fmt]` — replacement (`{ ...prog, [fmt]: parsed }`), never an append/dupe. |
| E-02 | Re-pick same file allowed (Retry) | Code (`:683`) | `e.target.value=""` after read, so re-selecting the identical file re-fires `onChange`. |
| E-03 | Partial snap → `formatPercent` coerces, no throw | Unit | `{page:145, pages:null}` → `formatPercent` reads `pages` as 0 → 0%, no NaN/throw; user completes by hand. |
| E-04 | Concurrent snaps per format isolated | Code (`:676-677`) | `snapState`/`snapResult` are keyed by `fmt`; a print snap-in-progress doesn't touch ebook/audio rows. |

## 5. Build

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| BLD-01 | Production build passes | `npm run build` | Exit 0, no errors. |

---

## Known notes for the report

- **Model id:** `readProgressShot` uses `model: "claude-sonnet-4-6"` (matches the spec line 33).
  CLAUDE.md names the in-app model `claude-sonnet-4-20250514`. Flag as a consistency question
  for the developer — not a functional QA failure of this feature.

## Out of scope

- The shipped per-format progress feature itself (bars, manual editor, audio listening card).
- The live vision model's reading accuracy (a model-quality concern, not parse correctness).
