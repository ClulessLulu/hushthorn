# Test Plan — Per-Format Reading Progress

**Feature:** Unified per-format reading progress on `book.progress` (jsonb)
**App under test:** single-file `src/App.jsx` (Vite + React + Supabase)
**Migration:** `add_progress_jsonb_expand` (20260618033055) — `progress jsonb NOT NULL DEFAULT '{}'` on `books`
**Owners:** supabase-migrator (schema), frontend-dev (helpers + UI)
**Author:** QA / bookbee team

## How to read this plan

- Each row carries a falsifiable **PASS** criterion; the test FAILS if it is not met.
- IDs: `B-` backend/data, `F-` frontend behavior, `U-` pure-function unit, `E-` edge/fallback.
- Methods: `MCP` (Supabase MCP), `Unit` (Node ESM snippet on extracted pure fns), `Code` (read-only inspection), `Manual` (Chrome).

### Structural baseline (current `src/App.jsx`, reference)

- Pure helpers: `num` :478, `formatPercent` :484, `maxPercent` :502, `activeProgress` :510.
- UI: `CardProgress` :525 (rendered at :1396), `ProgressEditor` :562, `SPINE_GLOW` :718, spine edge-glow :751.
- Auto-Read centralized in `updateBook` :1146-1149 (`maxPercent(merged) >= 100 → read:true`); editor sends only `{ progress }`.
- `FIELD_MAP` :1153 maps `progress → progress` for the DB update.

---

## 1. Backend / Data Layer

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | Migration applied | MCP `list_migrations` | `add_progress_jsonb_expand` listed and applied. |
| B-02 | `books.progress` exists, correct type/constraint | MCP `execute_sql` on `information_schema.columns` | `data_type = jsonb`, `is_nullable = NO`, `column_default = '{}'::jsonb`. |
| B-03 | Pre-existing rows carry the default | MCP `execute_sql` | Existing books read `progress = {}` (default applied; no migrate-time error). |
| B-04 | A `{ progress: {...} }` write persists | MCP `execute_sql` (update + read-back, then restore) | Nested jsonb (`print.page`, `audio.hours`) round-trips intact; restored to `{}` after. |
| B-05 | `books` RLS still owner-only | MCP `pg_policies` + `pg_class` | RLS enabled; policy scopes `auth.uid() = user_id` for ALL with matching `with_check`; no new permissive policy. |
| B-06 | No new security advisor from this feature | MCP `get_advisors` (security) | Advisor set unchanged vs. baseline (only pre-existing `covers` bucket + leaked-password warnings). |
| B-07 | No legacy `audio_*` refs in app code | Code (grep) | ZERO matches for `audio_hours\|audio_listened\|audioHours\|audioListened` in `src/App.jsx` — contract migration that drops those columns is safe. |
| B-08 | `progress` wired into the update path | Code (`:1153`) | `FIELD_MAP` includes `progress: 'progress'`; editor patches reach the DB column. |

---

## 2. Frontend Behavior

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-01 | Auto-Read via number field | Unit (deriveRead) + Code | Editing print page to == pages funnels `{ progress }` through `updateBook`; `read` flips true. |
| F-02 | Auto-Read via quick-bump "Done" | Unit + Code | Quick-bump `Done` (ebook percent 100) flips `read` true via the same path. |
| F-03 | Auto-Read via slider-to-100 | Unit + Code | Slider to 100 (audio listened == hours) flips `read` true via the same path. |
| F-04 | Auto-Read NOT duplicated in editor | Code (`:562-713`) | `ProgressEditor` never writes `read`; only `updateBook` :1149 derives it. Single source of truth. |
| F-05 | Below 100% does not flip Read | Unit | A patch leaving `maxPercent < 100` keeps `read` unchanged. |
| F-06 | One finished format flips multi-format book | Unit | Print 100% on a print+audio book flips `read` even with audio at 10%. |
| F-07 | Audio surfaces on cards when print done | Code (`:525-530`, `:1396`) | `CardProgress` rendered unconditionally; rows filtered by `pct>0` only — NOT gated on `book.read`. Print 100% + audio 40% shows both bars. |
| F-08 | Audio surfaces on spines when print done | Code (`:510-518`, `:733-762`) | `activeProgress` skips the 100% print, returns audio; spine edge-glow uses it — NOT gated on `book.read`. |
| F-09 | Editor merge preserves sibling formats | Code (`:567-570`) | `writeFmt` spreads `...prog` then overrides one format; other formats untouched. |

---

## 3. Pure-Function Unit Cases (`tests/_progress_unit.mjs`)

### 3.1 `formatPercent(book, fmt)` → 0-100, clamped, rounded

| ID | Case | PASS criterion |
|---|---|---|
| U-01 | print 150/300 | 50. |
| U-02 | ebook 42% | 42. |
| U-03 | audio 5/10h | 50. |
| U-04 | rounding (1/3 print) | 33 (rounded). |
| U-05 | clamp high (page>pages, ebook>100) | 100. |
| U-06 | negative page | 0. |
| U-07 | **pages = 0** | 0 — no divide-by-zero / NaN. |
| U-08 | **hours = 0** | 0 — no divide-by-zero / NaN. |
| U-09 | pages key missing | 0. |
| U-10 | string-numeric value (`"30"`) | coerces to 30. |

### 3.2 `maxPercent(book)`

| ID | Case | PASS criterion |
|---|---|---|
| U-11 | max across print+audio | furthest format wins. |
| U-12 | no `formats` | defaults to `["print"]`. |
| U-13 | all zero | 0. |

### 3.3 `activeProgress(book)` → furthest **unfinished** format

| ID | Case | PASS criterion |
|---|---|---|
| U-14 | print 100% + audio 40% | `{fmt:"audio",pct:40}` (100% skipped). |
| U-15 | two unfinished | returns the furthest. |
| U-16 | all zero | `null`. |
| U-17 | all 100% | `null`. |
| U-18 | malformed entry | `null`, no throw. |

---

## 4. Edge Cases & Fallbacks

| ID | Scenario | PASS criterion |
|---|---|---|
| E-01 | `progress = {}` | `formatPercent` 0; `CardProgress` returns null; editor empty; no throw. |
| E-02 | `progress = null` | coerced to `{}`; 0%; CardProgress null; no throw. |
| E-03 | no `progress` key | 0%; no throw. |
| E-04 | null book | 0%; no throw. |
| E-05 | non-object format entry (string/number/null) | 0%; CardProgress null; no throw. |
| E-06 | build | `npm run build` succeeds. |

---

## Out of scope

- Legacy `audio_hours`/`audio_listened` DB columns remain until a later contract migration (this plan only asserts the app no longer references them — B-07).
- Live Playwright drag of the slider deferred to manual smoke (slider/quick-bump logic covered by unit equivalence of the same `writeFmt` path).
