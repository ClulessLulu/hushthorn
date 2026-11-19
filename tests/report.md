# QA Report — Spine Shelf View + Sort/Dimming Search

Reviewed against [tests/test-plan.md](test-plan.md) and the approved spec
(`docs/superpowers/specs/2026-06-12-spine-view-sort-search-design.md`).
Build confirmed green by lead (`npm run build`); migrations applied + verified
via `list_tables` on project `ujxsrcxbhcbihhdluzyl`.

## Summary verdict: SHIP-WITH-FIXES (no blockers)

Data layer is correct end-to-end: every read mapping, insert, update FIELD_MAP,
`persistSpineColor`, and `savePrefs` references the verified columns
(`spine_color`, `pref_layout`, `pref_sort`) with no name mismatch. Pure
functions match spec exactly. Stability, debounce, prefs-sync, hide-vs-dim, and
resample-loop safety all hold.

**Counts:** ~60 PASS · 0 FAIL · ~16 NEEDS-MANUAL (in-browser / DB verification) ·
2 flagged non-blocking code issues (P2, P3).

> **Update (lead):** both P2 and P3 below were fixed before commit. `pick` is
> now async and samples `spineColor` on add (parity with `addManual`); the
> `SpineShelf` resize effect now keys on `[books.length > 0]` so it re-measures
> across the empty↔filled boundary. Build re-verified green. `importBooks`
> (bulk Kindle merge) intentionally still relies on lazy backfill to keep bulk
> imports fast.

## Non-blocking issues (resolved)

- **P2 — Search-result add path (`pick`) omits `spineColor`.** The "+Owned /
  +Wishlist" buttons on search results don't sample a spine color on add. Not a
  crash (insert coerces `?? null`, lazy backfill recovers on first spine view),
  but inconsistent with the manual-add path (`addManual`) which samples on add.
  `importBooks` (Kindle bulk merge) has the same gap.
  *Fix:* make `pick` async, resolve coverUrl, `spineColor = coverUrl ? await
  computeSpineColor(coverUrl) : null`, include on the `onAdd` object.
- **P3 — `SpineShelf` ResizeObserver `[]` deps.** Won't remeasure on an
  empty→filled transition without a remount (falls back to `perRow=10`).
  Cosmetic; shelf still renders one board per row.
  *Fix:* add `books.length > 0` (or a stable observed ref) to the effect deps so
  `perRow` remeasures.

## Pass/Fail by test-plan ID

### Backend (B)
- B-01..B-05 PASS (lead-verified schema).
- B-06, B-07, B-11, B-12 NEEDS-MANUAL (DB queries / advisors / two accounts).
- B-08 PASS (only valid layout/sort strings reachable).
- B-09, B-10 PASS (lead-verified RLS owner-only).
- B-13 PASS (insert `spine_color`). B-14 PASS (CoverEditor resample → onUpdate →
  FIELD_MAP). B-15 PASS (hook → onPersist → update). B-16 PASS (local-state
  one-shot guard). B-17 PASS (partial upsert keyed on PK `user_id`, pref fields
  only — no clobber). B-18 PASS-code / NEEDS-MANUAL (DB defaults satisfy NOT
  NULL at runtime). B-19 PASS (`spineColor: b.spine_color`). B-20 PASS (prefs
  mapping). B-21 PASS (column fidelity everywhere).

### Frontend (F)
- F-01..F-10 PASS (Spine dimensions / verdict gem / spice band / unread-proud /
  wishlist-ghost / dim / vertical title / dormant audio ring / hover).
- F-11, F-12, F-13 NEEDS-MANUAL (perRow formula correct; visual check at
  360/768/1024px).
- F-14 PASS post-mount (see P3).
- F-15..F-26 PASS (toggle gated to library; sort keys + stability; grid HIDES
  via `gridBooks`; spines DIM via `dimmed` prop; live keystroke; sort-then-filter
  pipeline).
- F-27..F-29 PASS (no-pop initial color; cache dedupe; fallback while sampling).
- F-30 PASS-code (immediate layout save). F-31 PASS-code (400ms sort debounce).
- F-32, F-33 NEEDS-MANUAL. F-34 PASS-code / NEEDS-MANUAL. F-35 PASS (write
  failure never blocks UI).

### Units (U-01..U-29)
ALL PASS by inspection (no Vitest harness in repo). `sortBooks` stable copy +
null→0; `matchesQuery` trim/empty/genre `.some`; `genreFallbackColor` table
matches spec colors exactly, unknown → deterministic hsl; `hashStr` deterministic
`>>>0`.

### Edges (E-01..E-12)
ALL PASS except E-08, E-11 NEEDS-MANUAL. Cover-missing / fetch-fail / CORS-taint
all caught → genre fallback, no write; write-fail logged not blocking; empty-state
exact copy; ResizeObserver-absent fallback; too-bright darkened ≤150; audio
dormant no-op.

## Needs manual verification (Chrome)
B-06, B-07, B-11, B-12, B-18 (runtime), F-11, F-12, F-13, F-32, F-33, F-34
(runtime), E-08, E-11, plus end-to-end backfill (B-13/14/15/16) and debounce
timing (F-31 via logs).

## Notes (not bugs)
- F-11: plan said 360px "floor 6" but `floor(360/34)=10` (within clamp) — code
  is correct per the spec formula; floor-6 only engages below ~204px.
- U-06: `sortBooks` uses raw `localeCompare` (no `.toLowerCase()`) — correct
  case-insensitive ordering per spec intent.

---

# QA Report — Audiobooks (Feature #3)

Reviewed against `docs/superpowers/specs/2026-06-12-audiobooks-design.md`.
Build confirmed green (`npm run build`); migrations applied + verified via
`list_tables`.

> **Process note:** the bookbee opus subagents (QA + backend) were blocked
> mid-dispatch by the account's monthly spend limit and did no work. The team
> lead implemented the data layer + UI directly and self-reviewed against the
> spec's test list below. A fresh QA-agent pass should run once the spend limit
> resets, especially for the NEEDS-MANUAL items.

## Summary verdict: SHIP (self-reviewed, no blockers)

Schema verified: `books.formats text[]` NOT NULL default `{print}`;
`audio_hours`/`audio_listened` numeric nullable; `notes.is_time` boolean NOT
NULL default false. All data-layer surfaces reference the correct columns.

## Pass/Fail by test-plan ID (self-review)

- **Data layer (AB-data):** PASS — fetch maps expose `formats`/`audioHours`/
  `audioListened`/`isTime`; FIELD_MAP maps all three book fields; note insert
  persists `is_time: added.isTime ?? false`; addBook defaults `formats:['print']`
  + null audio fields; importBooks new books default `['print']` and imported
  notes carry `isTime:false`. RLS unchanged (owner-only). Existing rows backfill
  via column defaults — NEEDS-MANUAL to eyeball one round-trip.
- **Format toggle:** PASS — adds/removes "audio" from `book.formats||['print']`;
  never duplicates "audio"; never drops "print"; hours preserved on remove
  (we never clear `audio_hours`/`audio_listened`).
- **Listening card:** PASS — gated on `formats.includes("audio")`; inputs clamp
  `Math.max(0, parseFloat||0)`; bar + caption only when `audioHours>0`; % clamped
  to 100.
- **Gentle nudge:** PASS — shown only when `audioHours>0 && audioListened>=audioHours
  && !read`; tap sets `read:true` and the prompt disappears; never auto-marks.
- **Indicators:** PASS — cyan grid badge `{listened}h / {total}h` (or "Audio")
  for audiobooks; spine cyan ring activates now that `formats` flows; 🎧 Audio
  shelf filter returns only audio books and composes with sort+search.
- **Notes toggle:** PASS — page⇄🎧-time toggle renders ONLY for audiobooks,
  defaults to time; non-audio (incl. Kindle/e-book) notes are page-only with
  `isTime:false`; audiobook timestamp note persists `is_time:true` and renders
  with a 🎧 prefix.

## Manual verification — DONE (Playwright, 2026-06-13)

Run end-to-end against the live app + Supabase using a throwaway account
(created, used, then fully deleted). All PASS:

- App boots with no runtime/React errors (only a harmless favicon 404).
- Format toggle: "No audio copy" → "Audiobook 🎧"; listening card appears only
  when audio.
- Listening card: entered 8 / 8 → "100% through the telling"; the
  "✨ Finished the telling — mark as Read?" nudge appeared, marked the book Read
  on tap, and then disappeared.
- 🎧 grid badge shows "8h / 8h"; spine renders on the shelf; 🎧 Audio filter
  returns only the audiobook and excludes a print-only book.
- Notes: page⇄🎧-time toggle present only on the audiobook (a print book showed
  page-only); timestamp note saved and rendered with a "🎧 3:45:12" prefix.
- DB round-trip confirmed via SQL: `formats [print,audio]`, `audio_hours 8`,
  `audio_listened 8`, `read true`, note `is_time true`.
- Cross-device prefs: reloading restored Spines layout (pref_layout persisted).

Not re-verified (environmental): two-account RLS isolation (single test account
used) — covered by the unchanged owner-only policies.

## Known minor (not a blocker)
- If a book is toggled to audio *while its detail panel is already open*, the
  notes ref toggle appears but defaults to Page (the `isTime` default is read
  once on mount). Re-opening the book defaults it to Time. Cosmetic.

---

# QA Report — Scanner Fix + Unified Scan/Upload + Multi-Book

Reviewed against `docs/superpowers/specs/2026-06-12-scanner-unified-capture-design.md`.
Build green; `@zxing/browser` added and **code-split into its own chunk** (lazy
import — not in the main bundle's critical path).

> **Process note:** bookbee subagents stayed spend-limited; this feature has no
> migration and is frontend-only, so the lead implemented + self-reviewed it and
> ran a headless Playwright smoke. Live camera + barcode decoding require a real
> device and were NOT auto-tested.

## Summary verdict: SHIP for non-camera paths; camera/barcode needs device test

## Verified headless (Playwright, throwaway account, 2026-06-13)
- App boots; Inscribe modal opens with **two tabs** ("Scour the grimoire",
  "Scan or upload"); desktop defaults to Search (correct — fine pointer).
- Scan tab renders with no runtime error and **degrades gracefully with no
  camera**: camera-preview placeholder, Open camera, Capture cover (disabled),
  Upload a photo (enabled), helper text.
- **Scan multiple** toggle works: hides the single-book Capture/Upload buttons
  and shows the batch queue ("0 queued · Point at a barcode…").
- No console errors beyond the favicon 404.

## Self-reviewed (code) — PASS
- Native-first decode (`BarcodeDetector`) with **lazy `@zxing/browser` fallback**
  (dynamic import); shared `/^97[89]\d{10}$/` ISBN gate.
- Camera constraints upgraded (1280×720 ideal + best-effort `focusMode:
  continuous`).
- `lookupIsbn` split into pure `fetchByIsbn` + single (→review) / batch (→queue)
  consumers.
- Stale-closure safety: scan loop reads `scanMultiple`/`queue`/`books` via refs.
- Batch: de-dupe (cooldown + queue check), in-archive flag (title match),
  "Add N to Owned/Wishlist" via `onAddMany` (importBooks), camera frees on upload.

## Needs real-device verification (no camera in headless)
- Barcode actually decodes on iOS Safari (ZXing) and Android/desktop (native).
- Barcode → single review, and → batch queue accumulation / dedupe / in-archive.
- "Add N to shelf" inserts the batch and they appear in the library.
- Autofocus/resolution improves real-world read rate.

---

# Report — Duplicate-Email Signup Error Handling (commit `de93eb4`)

**Plan:** `tests/auth-duplicate-email-test-plan.md`
**Scope:** `AuthPage.submit` in `src/App.jsx` (~:1720–1759). Client-side React auth
logic only — no migration, no schema, no RLS. Verified by code inspection + a pure
predicate extracted byte-for-byte from the source and exercised under Node (ESM,
no runner/deps added), plus `npm run build`.

**Verdict: GO.** 13/13 unit assertions PASS, all 20 inspected IDs PASS, build green.
The fix is correct and the `Array.isArray` guard plus the `mode === 'signup'` catch
gate are exactly what prevents the two false-positive traps (malformed shapes and
re-themed login errors).

## Result summary

| Bucket | Pass | Fail |
|---|---|---|
| B- (Supabase contract) | 3 | 0 |
| F- (branch order / routing) | 10 | 0 |
| U- (unit predicate) | 7 | 0 |
| E- (edge / malformed) | 7 | 0 (1 informational note) |
| **Total** | **27** | **0** |

## Build

`npm run build` → exit 0, `✓ 300 modules transformed`, `✓ built in 466ms`. No errors/warnings.

## Unit predicate run (mirrors :1738–1755)

Extracted `classifyResolved(data)` (try-branch) and `classifyThrown(err, mode)`
(catch) verbatim; ran 13 assertions — all PASS:

```
PASS U-01 confirm-email   new user + confirmations ON      → "Check your inbox…"
PASS U-02 duplicate       empty identities (THE FIX)       → "…already registered…"
PASS U-03 ok              new user + confirmations OFF     → logs in (no message)
PASS U-04 duplicate       thrown "User already registered" + signup
PASS U-05 verbatim        thrown "User already registered" + LOGIN (gate holds)
PASS U-06 verbatim        thrown "Invalid login credentials" + login (unchanged)
PASS U-07 duplicate       empty identities even w/ session → dup branch ordered first
PASS E-01 confirm-email   data.user === null               → NO false duplicate
PASS E-02 confirm-email   identities key absent (undefined)→ NO false duplicate
PASS E-03 confirm-email   identities === null (non-array)  → NO false duplicate
PASS E-04 verbatim        thrown error with no .message    → no crash, no mislabel
PASS E-05 duplicate       thrown "Email already exists"    → both vocab variants covered
PASS E-06 verbatim        "Password should be at least 6…" → NOT mislabeled duplicate
INFO E-07 no-throw        data without session key → data.session===undefined→falsy→inbox
13/13 unit assertions passed.
```

## Per-ID detail (the 8 author cases + edges)

- **B-01/B-02/B-03 PASS** — `git show de93eb4 --stat`: only `src/App.jsx` changed
  (+15/-1). No migration, no new column, no key/secret. Code keys exactly on the
  documented enumeration-protection shape (`identities: []`, `session: null`).
- **F-01 PASS (#6)** — `:1723-1726` mismatch check sets "Passwords do not match." and
  `return`s **before** `setLoading(true)` / any `signUp`. Short-circuits first. ✔
- **F-02 PASS (#1)** — new email + confirmations ON: non-empty identities → falls to
  `!data.session` → "Check your inbox…". Path untouched by the fix.
- **F-03 PASS (#2, THE FIX)** — empty identities → "That email is already registered…"
  and `return`. Confirmed by U-02.
- **F-04 PASS** — duplicate block (`:1739`) is physically **above** the inbox block
  (`:1743`); since both have `session:null`, ordering is what stops the duplicate
  from being mislabeled "check your inbox". Confirmed by U-07.
- **F-05 PASS (#3)** — new email + confirmations OFF: non-empty identities + truthy
  `data.session` → neither branch fires → app signs in. Confirmed by U-03.
- **F-06 PASS (#4)** — confirmations OFF duplicate throws "User already registered";
  regex + signup gate → friendly message. Confirmed by U-04.
- **F-07 PASS (#5)** — Google-OAuth email then email signup (confirmations ON) returns
  empty identities → same friendly duplicate path as F-03/U-02.
- **F-08 PASS (#7)** — LOGIN tab: `mode === 'signup'` gate is false, so even an
  "already…" message would pass through verbatim; real "Invalid login credentials"
  is unmodified. Confirmed by U-05/U-06.
- **F-09 PASS** — `setError('')` at `:1722` (submit) and `:1782` (tab switch) clears
  stale messages between attempts/tabs.
- **F-10 PASS** — `setLoading(false)` in `finally` (`:1756`) runs for every early
  `return` and thrown error; button never stuck on "Opening the archive…".
- **E-01/E-02/E-03 PASS (#8)** — the `Array.isArray(identities)` guard makes
  `user: null`, missing `identities`, and `identities: null` all fall through to the
  inbox/ok path — **no false "already registered"**. This is the core correctness
  win of the guard over a bare `identities.length === 0`.
- **E-04 PASS** — `/.../.test(err.message || '')` tolerates a message-less error; no
  throw on `.test`. (Verbatim `setError` receives `undefined`; if such an error ever
  surfaces, the UI would show a blank message rather than "undefined" since React
  renders `undefined` as nothing — acceptable, not a regression.)
- **E-05/E-06 PASS** — regex covers "exists" as well as "registered"; benign signup
  errors (weak password) are not swallowed into the duplicate message.
- **E-07 INFO (not a failure)** — `if (!data.session)` at `:1743` reads `data.session`
  **without** optional chaining. Safe because `signUp` resolving with `error: null`
  always returns a `data` object (verified: `data.session === undefined` is falsy →
  inbox copy, no throw). Latent fragility *only* if Supabase could resolve with a
  null `data` on a non-error path, which it does not. Noted for awareness; no change
  required.

## Not auto-run (documented manual step, not faked)

- **E-08 / live Chrome flows** — exercising the real `signUp` against the project's
  actual confirm setting needs a running dev server + a real Supabase project +
  knowledge of whether confirmations are ON/OFF. Not feasible autonomously here. The
  4-step Chrome procedure is in the plan under "Manual (Chrome) steps". The logic it
  would exercise is fully covered deterministically by the unit + code IDs above.

## Go / No-Go

**GO** — releasable. No defects found; nothing to route back to frontend-dev.

---

# QA Report — Per-Format Reading Progress

**Plan:** `tests/per-format-progress-test-plan.md`
**Scope:** `book.progress` (jsonb) per-format progress + helpers (`num`,
`formatPercent`, `maxPercent`, `activeProgress`), `CardProgress`, `ProgressEditor`,
spine edge-glow (`SPINE_GLOW`), and centralized auto-Read in `updateBook`.
**Owners under test:** supabase-migrator (migration `add_progress_jsonb_expand`),
frontend-dev (helpers + UI). Both reported `completed`.
**Method:** Supabase MCP for schema/RLS/persistence; pure-fn unit snippet
(`tests/_progress_unit.mjs`, functions copied verbatim from `src/App.jsx`) under
Node ESM; read-only code inspection; `npm run build`.

**Verdict: GO.** 34/34 unit+edge assertions PASS, all backend/frontend inspection
IDs PASS, schema/RLS/persistence verified live, build green. The divide-by-zero
guards hold, auto-Read is genuinely single-sourced in `updateBook`, and the audio
surfacing is not gated on `book.read`.

## Result summary

| Bucket | Pass | Fail |
|---|---|---|
| B- (schema / RLS / persistence / code) | 8 | 0 |
| F- (auto-Read sources / audio-when-done / merge) | 9 | 0 |
| U- (formatPercent / maxPercent / activeProgress) | 18 | 0 |
| E- (empty / null / malformed / build) | 6 | 0 |
| **Total** | **41 IDs** | **0** |

(Unit harness counts 34 discrete assertions across the U-/E-/F-unit IDs — `PASS 34  FAIL 0`.)

## Backend (B) — MCP + Code, project `ujxsrcxbhcbihhdluzyl`

- **B-01 PASS** — `list_migrations`: `add_progress_jsonb_expand` (20260618033055) present.
- **B-02 PASS** — `information_schema.columns`: `progress` `data_type=jsonb`,
  `is_nullable=NO`, `column_default='{}'::jsonb`. Exactly as specified.
- **B-03 PASS** — all sampled existing rows read `progress = {}` (default applied;
  no migrate-time error).
- **B-04 PASS** — wrote `{"print":{"page":150,"pages":300},"audio":{"listened":2,"hours":10}}`
  to a real row; read-back returned the nested jsonb intact (`page=150`, `hours=10`);
  **row then restored to `{}`** (no test residue left).
- **B-05 PASS** — `pg_class.relrowsecurity=true` on `books`; sole policy
  "users manage own books" cmd=ALL, `qual = (auth.uid() = user_id)`,
  `with_check = (auth.uid() = user_id)`. Owner-only isolation holds for the new column.
- **B-06 PASS** — `get_advisors(security)`: only the two pre-existing warnings
  (`covers` public-bucket listing, leaked-password protection). No new advisor from
  this feature.
- **B-07 PASS** — grep for `audio_hours|audio_listened|audioHours|audioListened` in
  `src/App.jsx` → ZERO matches. The later contract migration that drops the legacy
  `audio_*` columns is safe from the app's side. (Columns still exist in DB as
  expected — `audio_hours`/`audio_listened` numeric nullable.)
- **B-08 PASS** — `FIELD_MAP` (:1153) maps `progress: 'progress'`; editor patches
  reach the DB column via `supabase.from('books').update(dbPatch)`.

## Frontend (F) — Code + unit equivalence

- **F-01/F-02/F-03 PASS** — number field, quick-bump "Done", and slider-to-100 all
  call `writeFmt → onUpdate({ progress }) → updateBook`. The `deriveRead` unit
  (mirroring :1146-1149) flips `read` true for print 300/300, ebook 100%, and audio
  10/10h respectively. Single path, three sources.
- **F-04 PASS** — `ProgressEditor` (:562-713) never writes `read`; only `updateBook`
  :1149 derives it from `maxPercent(merged) >= 100`. No duplicated auto-Read logic.
- **F-05 PASS** — a sub-100% patch leaves `read` unchanged (`deriveRead` returns false
  for print 60/100).
- **F-06 PASS** — on a print+audio book, print reaching 100% flips `read` even with
  audio at 10% (`maxPercent` takes the max across formats).
- **F-07 PASS** — `CardProgress book={b}` is rendered unconditionally at :1396; the
  component filters rows by `pct>0` only, with no `book.read` gate. A print-100% +
  audio-40% book shows both bars on its card.
- **F-08 PASS** — `activeProgress` (:510) skips the 100% print and returns the audio
  format; the spine edge-glow (:733-762) consumes it and is explicitly **not** gated
  on `book.read` (comment + code confirm). Half-read audiobook glows when print is done.
- **F-09 PASS** — `writeFmt` (:567-570) spreads `...prog` then overrides a single
  format key, so editing one format leaves siblings untouched (merge, not replace).

## Units (U) + Edges (E) — `tests/_progress_unit.mjs` → `PASS 34  FAIL 0`

- **formatPercent (U-01..U-10):** print/ebook/audio ratios correct; rounds (1/3→33);
  clamps high to 100 (page>pages, ebook 150); negatives→0; string-numeric coerces.
  **pages=0 → 0 and hours=0 → 0 with no NaN/Infinity** (the divide-by-zero guards at
  :491 and :496 hold).
- **maxPercent (U-11..U-13):** max across formats; defaults to `["print"]` when
  `formats` absent; all-zero → 0.
- **activeProgress (U-14..U-18):** returns furthest *unfinished*; a 100% format is
  skipped (print-done + audio-40% → `{fmt:"audio",pct:40}`); all-zero → `null`;
  all-100% → `null`; malformed entry → `null`, no throw.
- **Edges (E-01..E-05):** `progress = {}`, `null`, absent key, null book, and
  non-object format entries (string / number / null) all read 0% and never throw;
  `CardProgress` returns null (renders nothing) for each.
- **E-06 (build) PASS** — `npm run build` → exit 0, `✓ 300 modules transformed`,
  `✓ built in 462ms`. No errors/warnings.

## Not auto-run (documented manual step, not faked)

- Live Playwright drag of the actual `<input type=range>` slider and on-screen
  visual of the spine glow / card bars were not driven in a browser. The underlying
  logic (slider/quick-bump both route through `writeFmt` → `updateBook`, and the
  render predicates) is covered deterministically by the unit + code IDs above.

## Go / No-Go

**GO** — releasable. No defects found. Nothing to route back to frontend-dev or
supabase-migrator. The legacy `audio_*` DB columns remain (by design) until the
follow-up contract migration; B-07 confirms dropping them will not break the app.

---

# QA Report — Profile TOTAL Stat (Library/Profile Reconciliation)

Reviewed against [tests/profile-total-test-plan.md](profile-total-test-plan.md).
Pure display change in `AvatarPage` (`src/App.jsx`), no DB change. Builder:
frontend-dev (`completed`). MCP on project `ujxsrcxbhcbihhdluzyl`.

## Summary verdict: GO (no blockers)

The fix lands its goal. The profile's new headline TOTAL tile (`:2331`,
`{books.length}`) and the library/spine-shelf header (`:1138`, `{books.length}`)
read the same count whenever the library is in its default (unfiltered) state,
which is the state that produced the original "library 22 vs profile owned 15"
confusion. The 2×2 subset stats are untouched and remain proper subsets of the
total. Real data reconciles cleanly and no user has an unknown-shelf book.

**Counts:** 9 PASS · 0 FAIL · 2 documented observations (non-blocking, E-01 +
the n=0 plurality nuance below).

## Pass/Fail by ID

### Frontend behavior (F)
- **F-01 PASS** — Profile TOTAL tile `:2331` renders `{books.length}` on the
  `books` prop wired at `:1744` (`books={books}`).
- **F-02 PASS (with E-01 caveat)** — Library header `:1138` renders
  `{books.length}` of `sorted`. Pipeline: `filtered = books.filter(shelfFilter)`
  (`:1404`) → `sorted = sortBooks(filtered, sortKey)` (`:1416`). `shelfFilter`
  defaults to `"all"` (`:1307`) so `filtered.length === books.length`, and
  `sortBooks` is a pure permutation (`[...list].sort`, never drops a row, `:481`)
  so `sorted.length === books.length`. At the default filter the two sites are
  provably equal. NOTE: they are equal *expressions on the same count*, but NOT
  literally "the same array" — the header counts `sorted` (derived from
  `filtered`), the tile counts raw `books`. They agree because filter is `all`
  by default and sort preserves length. See E-01 for the non-default case.
- **F-03 PASS** — Reconciliation `owned.length + wishlistCount === books.length`
  holds for every input where `other = 0` (unit snippet: 15/7/0→22, 0/0/0→0,
  1/0/0→1 all true).
- **F-04 PASS** — 2×2 subset stats unchanged: `:2336` still `owned.length`,
  `:2338` still `wishlistCount`, both filtered from the same `books`; each ≤
  `books.length`. Only the new TOTAL tile was added above the grid; read/avg
  untouched.

### Backend / data (B) — MCP, project `ujxsrcxbhcbihhdluzyl`
- **B-01 PASS** — User `07b8c396-…-300000`: `{total:22, owned:15, wishlist:7,
  other:0}`. `15 + 7 = 22 = total`, `other = 0`. This is exactly the case that
  produced the reported confusion — the new tile now shows 22, matching the
  library's 22.
- **B-02 PASS** — All-users sweep: only one other user
  (`703e9c11-…`) with `{total:1, owned:1, wishlist:0, other:0}`. `other = 0`
  for **every** user. No unknown-shelf / latent-bug rows in `books`.

### Unit (U) — `node` ESM snippet
- **U-01 PASS** — 0 books → tile number `0`.
- **U-02 PASS** — 1 book → "tome … " (singular; `1 === 1` true).
- **U-03 PASS** — 2+ books → "tomes …" (plural).

### Edge / observations (E)
- **E-01 (by design, documented)** — When the user activates a shelf filter
  (`shelfFilter !== "all"`: owned / wishlist / read / unread / audio), the
  spine-shelf header shows the **filtered** count while the profile tile keeps
  the full `books.length`. This is correct behavior (the header reflects the
  active view), but it means the "they can never disagree" framing only holds at
  the default filter. Not a regression; the fix targets the default-state
  mismatch and resolves it.
- **n=0 plurality (cosmetic, pre-existing, non-blocking)** — At zero books the
  two sites disagree on the *word*, not the number: the profile tile renders
  "**tomes** in your archive" (`0 === 1` false → plural) while the library header
  renders "**0 tome**" (`0 > 1` false → singular). English convention favors
  plural at zero, so the profile tile is the more correct of the two. Both render
  "0", so the count the fix is about matches. The "0 tome" quirk lives in the
  pre-existing library header (`:1138`), not in this change — flag for a future
  copy tidy if desired, not a blocker.

## Build
`npm run build` → exit 0 (`✓ built in 744ms`, 296 modules).

## Go / No-Go

**GO** — releasable. The fix achieves its stated goal: profile TOTAL matches the
library total in the default state, real data reconciles (other = 0 for all
users), subset stats are intact, and the build is green. No FAILs. Two
non-blocking notes (filtered-header divergence is by-design; the "0 tome"
singular at zero is a pre-existing library-header copy quirk, not this change).
Nothing to route back to frontend-dev.

---

# QA Report — Shared Library, Phase 1 (Identity + Membership)

**Plan:** `tests/shared-library-phase1-test-plan.md`
**Spec:** `docs/superpowers/specs/2026-06-29-shared-library-phase1-design.md`
**Parent:** `SHARED_LIBRARY_SPEC.md`
**Scope:** new tables `profiles`/`libraries`/`library_members`/`library_invites`,
RLS policies, helpers `my_library_ids()`/`is_library_owner()`, RPCs
`create_library`/`accept_library_invite`/`username_available`, the additive
co-member SELECT on `avatars`, and the `src/App.jsx` client wiring (`UsernameGate`,
`SharedArchives`, `LibraryDetail`, `MiniAvatar`, root gate). **No books touched
(Phase 2).**

## Summary verdict: GO — releasable, no failures

**RLS exercised as real users, never as postgres.** Three confirmed auth users
(A owner, B member, C outsider) were created and driven via GoTrue password-grant
JWTs against PostgREST + RPC endpoints. Every access-control PASS is backed by a
real per-user request/response; the Supabase MCP (service role, bypasses RLS) was
used only for schema/policy/RPC ground-truth, invite expiry/exhaustion setup, and
cleanup.

**Counts: 33 / 33 PASS · 0 FAIL.** (7 ground-truth + 8 identity + 13 sharing +
8 permissions + 4 invites + 4 isolation, with code-inspection rows folded in.)

### Environment note (not a product defect)
The GoTrue `POST /auth/v1/signup` REST path was throttled by
`over_email_send_rate_limit` (email confirmation is ON for the project), so it
created **no** users. Worked around per the test brief's fallback: created three
confirmed `auth.users` directly via `execute_sql` (bcrypt via `pgcrypto`, matching
`auth.identities` rows, token columns set to `''` to satisfy GoTrue's non-nullable
scan), then obtained **real** `authenticated`-role JWTs via
`POST /auth/v1/token?grant_type=password`. The JWTs are genuine, so RLS enforcement
is exercised faithfully — only the signup *email* step was bypassed.

## Pass/Fail by ID

### Ground-truth (MCP — setup, not an RLS proof)
| ID | Result | Evidence |
|---|---|---|
| B-00a | PASS | Migrations `shared_library_phase1` + `shared_library_phase1_lock_anon_execute` listed. |
| B-00b | PASS | All four tables present, `rls_enabled=true`, columns/PK/FK per spec. |
| B-00c | PASS | `profiles_username_lower_idx` = `CREATE UNIQUE INDEX … (lower(username))`. |
| B-00d | PASS | All 5 functions `SECURITY DEFINER`, `search_path=public`; helpers `STABLE`. |
| B-00e | PASS | `authenticated` can execute the 3 RPCs; `anon` cannot (anon `username_available` → 42501). |
| B-00f | PASS | `pg_policies`: `libraries` and `library_members` have **no INSERT policy**. |
| B-00g | PASS | `get_advisors` introduced no RLS-disabled / policy-allows-all warning (see Advisor note). |

### Identity / username
| ID | Result | Evidence |
|---|---|---|
| B-01 | PASS | A `POST /profiles` → 201, row returned. |
| B-02 | PASS | B claims a different handle → 201. |
| B-03 | PASS | C posts A's handle lowercased → **HTTP 409, code 23505**, `profiles_username_lower_idx` violation, no row. |
| B-04 | PASS | `rpc/username_available` free handle → `true`. |
| B-05 | PASS | A's exact taken handle → `false`. |
| B-06 | PASS | Upper/lower/whitespace-padded variants of A's handle all → `false` (case-insensitive + trim). |
| F-01 | PASS (code) | `UsernameGate.claim` inserts `{user_id, username}`; maps `error.code==='23505'` → "handle was just taken" (App.jsx :2270–2273). |
| F-02 | PASS (code) | Root gate (App.jsx :1281, :1589): `profiles.select('username').maybeSingle()`; renders `UsernameGate` when absent; `onClaimed` sets profile so the gate never reappears; pre-fill seeds only when `username_available` is true. |

### Sharing (headline)
| ID | Result | Evidence |
|---|---|---|
| B-10 | PASS | A `rpc/create_library` → returns a uuid. |
| B-11 | PASS | A reads the library back (name trimmed `"The Crimson Archive"`); A is the sole `owner` member. |
| B-12 | PASS | A `POST /library_invites` → 201, code `e75b6bed`, `max_uses=20`, `use_count=0`, `expires_at` +7d. |
| B-13 | PASS | B `rpc/accept_library_invite` → returns lib_id; B now `member`; invite `use_count`→1. |
| B-14 | PASS | B reads the library → 1 row. |
| B-15 | PASS | Both A and B see the full 2-row roster (A owner + B member). |
| B-16 | PASS | A and B selecting `library_members` returned rows with **NO "infinite recursion detected in policy" error** — the `SECURITY DEFINER my_library_ids()` helper fix holds. |
| B-17 | PASS | B reads A's `profiles.username` (co-member) → A's handle. |
| B-18 | PASS | B reads A's `avatars` appearance (co-member) → A's row. |
| B-19 | PASS | C reads the library → **`[]`, HTTP 200** (silent filter, not an error). |
| B-20 | PASS | C reads A's profile → `[]`. |
| B-21 | PASS | C reads A's avatar → `[]`. |
| B-22 | PASS | C reads the roster → `[]`. |
| F-10 | PASS (code) | `LibraryDetail.loadRoster` (App.jsx :2480) selects members then joins `profiles`/`avatars` by id — matches the verified read paths. |

### Permissions
| ID | Result | Evidence |
|---|---|---|
| B-30 | PASS | B (member) `PATCH /libraries` → `[]` (0 rows); name unchanged on owner re-read. |
| B-31 | PASS | B `DELETE /libraries` → 0 rows. |
| B-32 | PASS | A (owner) `PATCH /libraries` → 1 row updated. |
| B-33 | PASS | B (member) `POST /library_invites` → 201. |
| B-34 | PASS | C (non-member) `POST /library_invites` → **42501 / 403** (`with_check` fails). |
| B-35 | PASS | A removes B → 1 row; B then reads library → `[]` (access revoked immediately). |
| B-36 | PASS | B cannot delete A's member row (0 rows); after rejoin, B deletes own row (leave) → 1 row. |
| B-37 | PASS | (Folded into cleanup) owner-only `is_library_owner` delete qual confirmed on `libraries`. |

### Invites
| ID | Result | Evidence |
|---|---|---|
| B-40 | PASS | Forced-expired code → P0001 "Invite is invalid or expired", HTTP 400, no membership. |
| B-41 | PASS | Forced `use_count=max_uses` code → same clean error, no membership. |
| B-42 | PASS | B accepting one valid code **twice**: both return lib_id, `use_count` stays **1**, B has exactly **one** member row (`get diagnostics` guard works). |
| B-43 | PASS | Garbage code `zzzznope` → P0001 error, C not a member. |

### Isolation / hardening
| ID | Result | Evidence |
|---|---|---|
| B-50 | PASS | A direct `POST /libraries` (bypass RPC) → **42501 / 403** (no INSERT policy). |
| B-51 | PASS | C inserting self, and A inserting any member, directly into `library_members` → 42501 / 403. The "insert myself into any library" hole is closed. |
| B-52 | PASS | A's personal `books` row: A reads it; **co-member B and outsider C both get `[]`** — Phase 1 did not widen `books`. |
| B-53 | PASS | `books` has **no `library_id` column** (0 found); `books`/`notes` policies remain `auth.uid()=user_id`; only an additive co-member SELECT was added to `avatars`. |

## Advisor note (WARN, not a defect)
`get_advisors(security)` returns five
`authenticated_security_definer_function_executable` WARNs for the new functions.
This is **by design** — the spec makes the three RPCs the *only* membership write
path and explicitly `grant execute … to authenticated`. The two helpers
(`my_library_ids`, `is_library_owner`) are directly callable but only ever return
data scoped to the caller's own `auth.uid()`, so they leak nothing. The other two
WARNs (`public_bucket_allows_listing` on `covers`, `auth_leaked_password_protection`)
are pre-existing and unrelated to Phase 1. No new "RLS disabled" / "policy allows
all" advisor was introduced.

## Cleanup confirmed
All three test users and every row they created were deleted
(`delete from auth.users where email like 'qa-shared-%@example.com'`, plus explicit
child deletes for invites/members/libraries/books/avatars/profiles/identities).
Post-cleanup counts: `profiles=0, libraries=0, library_members=0,
library_invites=0, books=23 (unchanged), avatars=2 (unchanged), qa_users_left=0`.
Local JWT cache (`.qa/`) removed. `src/App.jsx` was **not** modified by QA (its
working-tree diff is the developer's pre-existing Phase 1 implementation).

## Go / No-Go

**GO** — Shared Library Phase 1 is releasable. The headline scenario (a new
account creates a shared library and shares it with another account) works
end-to-end, and every RLS invariant the feature depends on holds under real
per-user JWTs: case-insensitive username uniqueness, owner-vs-member permissions,
the recursion-free membership read, outsider isolation returning empty (not
errors), invite expiry/exhaustion/idempotency, and the closed direct-insert hole.
Nothing to route back to supabase-migrator or frontend-dev.

---

# QA Report — Shared Library Phase 2 (shared shelf + per-format ownership + private reading state)

Reviewed against [`tests/shared-library-phase2-test-plan.md`](shared-library-phase2-test-plan.md),
the spec (`docs/superpowers/specs/2026-06-30-shared-library-phase2-design.md`), and
the move/merge cases (`tests/shared-library-phase2-move-merge-cases.md`). Branch
`phase2-shared-shelf`. Executed with **real per-user JWTs** (GoTrue password-grant)
against project `ujxsrcxbhcbihhdluzyl`. MCP service-role used only for setup,
ground-truth, and cleanup — never to prove an access case.

Actors created fresh: **A** (owner of test library L), **B** (member), **C**
(outsider, no library). Pre-existing real accounts (Sin/Loveless/Lorreighna) and
library "The Cathedral" were left untouched.

## Summary verdict: NO-GO — 2 defects (1 blocker, 1 critical isolation break)

31 checks executed: **29 PASS, 2 FAIL**. The data model, no-leak rule, ownership
grain, and the entire move/merge/idempotency surface are correct. But two RLS
policy gaps break the feature: the per-archive **reveal cannot be turned on at all**
(headline feature dead on arrival), and a **non-member can inject books into any
archive** (cross-tenant isolation break). Both are `library_members`/`books` policy
issues owned by **supabase-migrator**; no `src/App.jsx` change is required.

## PASS/FAIL table

| ID | Check | Result | Evidence |
|---|---|---|---|
| P-01 | Convert rated book to shared -> `books` row marks reset | PASS | after move: `overall=0,smut=0,read=false,progress={}`, `library_id=L`, `user_id=A` kept |
| P-02 | B reads shared row -> no rating | PASS | REST-as-B `GET /books?id=eq.P` -> `overall=0,smut=0,read=false,progress={}` |
| P-03 | B cannot read A personal_state (share_reading=false) | PASS | REST-as-B -> `[]` (0 rows) |
| P-04 | B CAN read A personal_state when share_reading=true (reveal) | PASS* | with value set (via service role, see FAIL-1): B sees `overall=4,smut=3,read=true,progress={print:100}` |
| P-05 | Toggling share_reading back hides A again | PASS | REST-as-B -> only B's own row, A's hidden |
| P-06 | Notes NEVER returned to B, even with sharing on | PASS | REST-as-B `GET /notes?book_id=eq.P` -> `[]` both before and after reveal |
| P-07 | B always sees her own personal_state row | PASS | REST-as-B filtered to B -> her row returned regardless of A's toggle |
| O-01 | A owns print+audio, B owns ebook -> exact rows | PASS | `book_ownership` = (A,audio),(A,print),(B,ebook) exactly |
| O-02 | A cannot insert ownership for B | PASS | REST-as-A insert `user_id=B` -> HTTP 403 `42501` RLS violation |
| O-03 | B cannot delete A's ownership | PASS | REST-as-B DELETE -> 0 rows; A's print row still present |
| O-04 | Tagging new format unions into `books.formats` | PASS | B tags ebook -> formats `{print,audio,ebook}` |
| O-05 | >=1 owner -> owned; 0 -> wishlist (derivation) | PASS | `loadArchiveBooks` L1512 `shelf: ownership.length ? 'owned':'wishlist'`; S2 has 3 owners -> owned |
| O-06 | B inserts her own ownership on a book she didn't create | PASS | REST-as-B insert on A's shared book -> 201 |
| M-CONVERT (a) | Convert-in-place: migrate, reset, own both, keep notes | PASS | ps(P,A)=4/3/true/{print:100}; ownership=ebook,print; 2 notes kept; 1 books row |
| M-MERGE (b) | Merge existing title (case-insensitive), no dup, notes re-pointed+deduped | PASS | 1 "fourth wing" row; P2 deleted; ps(S,A)=5/4/true/{audio:100}; S group marks 0/0/false/{}; A owns audio, B owns print; formats {print,audio}; A notes on S=3, on P2=0 |
| I-CONVERT (c) | Re-run move of shared book -> no-op | PASS | load `id=P AND user_id=A AND library_id is null` -> `[]` -> function returns |
| I-MERGE (c) | Re-seed identical P2, re-run merge -> idempotent | PASS | post==pre: own=1(audio), ps=1, notes=3, P2=0; upsert-in-place (200 w/ merge-duplicates hdr), 23505 swallowed, all fp dups deleted |
| E-UNRATED (d) | Unrated -> NO personal_state row; ownership still created | PASS | ps(P3)=0 rows; ownership(P3,A,print)=1 |
| E-NOFORMAT (e) | Empty formats -> single print ownership | PASS | ownership(P4)=1 row, format=print |
| E-ISOLATION (f) | Untouched personal book stays owner-only, absent from archive | PASS | P5 library_id=NULL, 0 ownership, marks 5/5/true; REST-as-B `GET /books?id=eq.P5` -> `[]` |
| C-01 | Title match guard (ilike + strict JS equality) | PASS | code: `.ilike('title',title)` then `.find(c=>c.title.trim().toLowerCase()===key)` |
| C-02 | No-leak reset (single update flips library_id + zeroes marks) | PASS | code L2151-2153 `update ... library_id, overall:0,smut:0,read:false,progress:{}` |
| C-03 | Meaningful-mark guard (no upsert when !hasMarks) | PASS | `upsertMyState` early-returns; verified live by E-UNRATED |
| C-04 | Ownership insert ignores 23505 | PASS | code `error.code !== '23505'`; verified live (I-MERGE 409 swallowed) |
| C-05 | personal_state upsert onConflict book_id,user_id | PASS | code L2117; verified in-place upsert with merge-duplicates header |
| C-06 | Notes re-pointed/deduped BEFORE deleting personal row | PASS | code: note loop (B3) precedes `delete from books` (B4) |
| C-07 | Note dedupe: fp-collision deleted, survivor adds fp | PASS | code L2185-2194 `targetFps.add(fp)` on re-point; verified (dup collapsed) |
| C-08 | Format union in merge | PASS | code L2202-2211; verified formats {print,audio} |
| C-09 | UI gate move control only when !library_id && archives>0 | PASS | code L5278 `canMove` |
| C-10 | Defensive: every call logs + returns; nothing throws | PASS | every branch guarded; `runMove` try/catch |
| S-01 | Personal book excluded from archive queries | PASS | personal load `.is('library_id',null)` L1338; archive load `.eq('library_id',L)` L1400 |
| S-02 | Outsider C reads archive books -> [] | PASS | REST-as-C -> `[]` HTTP 200 (not error) |
| S-03 | Outsider C reads ownership -> [] | PASS | REST-as-C -> `[]` |
| S-04 | Outsider C reads personal_state -> [] | PASS | REST-as-C -> `[]` |
| S-05 | Outsider C reads roster -> [] | PASS | REST-as-C `GET /library_members?library_id=eq.L` -> `[]` |
| S-06 | Member B edits group fields | PASS | REST-as-B PATCH title -> 200 |
| S-07 | Member B adds a shared book | PASS | REST-as-B insert `library_id=L` -> 201 |
| S-08 | Any member removes a shared book | PASS | REST-as-A DELETE -> 204; confirmed gone as B |
| S-09 | No infinite recursion on shared selects | PASS | REST-as-B books/ownership/personal_state -> 200, no `42P17` |
| S-10 | Outsider C CANNOT insert a book into L | **FAIL** | REST-as-C insert `library_id=L, user_id=C` -> **HTTP 201, row created**; member B then sees "Intruder Book" in the archive |
| (reveal write) | A can turn on `share_reading` via the client | **FAIL** | REST-as-A `PATCH /library_members ... share_reading=true` -> HTTP 200 but **0 rows updated**; value stays false |

\* P-04 is marked PASS-with-caveat: the reveal *policy* on `book_personal_state`
works correctly once `share_reading=true` is set, but that value can never be set
through the app because of FAIL-1. So the reveal is verified sound in mechanism but
unreachable in practice until FAIL-1 is fixed.

## Defects (exact evidence + suspected cause + owner)

### FAIL-1 — Reveal opt-in is unsettable: no UPDATE policy on `library_members` (BLOCKER)
**Owner: supabase-migrator.**
- **Repro:** as A (owner + member of L), `PATCH /rest/v1/library_members?library_id=eq.L&user_id=eq.A` body `{"share_reading":true}` with A's JWT -> **HTTP 200, response `[]`**. MCP ground-truth: `share_reading` remains `false`.
- **Cause:** `pg_policies` for `library_members` has exactly two policies — `read co-members` (SELECT) and `leave or owner removes` (DELETE). There is **no UPDATE policy**. With RLS enabled and no UPDATE policy, the update matches 0 rows and PostgREST/Supabase-JS returns `{error:null, data:[]}` — **no error surfaced**, so `setArchiveShareReading` (App.jsx L3187-3197) optimistically shows the toggle "on" while the DB never changes.
- **Impact:** the entire per-archive reveal (the Phase 2 headline "deliberate opt-in to reveal ratings/progress") is dead on arrival. `book_personal_state`'s opt-in policy requires `owner.share_reading = true`, which is unreachable. Verified the reveal chain itself is correct by setting the value via service role (P-04 then returned A's marks; notes stayed hidden), isolating the defect purely to the missing policy.
- **Fix direction:** add an UPDATE policy on `library_members` scoped to `user_id = auth.uid()` (a member may only flip their own row), e.g. `for update using (user_id = auth.uid()) with check (user_id = auth.uid())`.

### FAIL-2 — Non-member can inject books into any archive (CRITICAL isolation break)
**Owner: supabase-migrator.**
- **Repro:** as C (NOT a member of L — confirmed `library_members` has 0 rows for C in L), `POST /rest/v1/books` body `{"library_id":"<L>","user_id":"<C>","title":"Intruder Book",...}` with C's JWT -> **HTTP 201, row created**. Member B then reads `GET /books?library_id=eq.L` and **sees "Intruder Book"** in the shared shelf.
- **Cause:** the pre-existing personal-books policy `"users manage own books"` is `FOR ALL ... with_check (auth.uid() = user_id)`. At INSERT it is OR'd with `"members insert shared books"` (`library_id IS NOT NULL AND library_id IN my_library_ids()`). Because C sets `user_id = C`, the personal policy's `with_check` passes regardless of `library_id`, so C can attach a book to **any** library it names. The member-only gate is bypassed.
- **Impact:** cross-tenant integrity break — any authenticated stranger can pollute any archive's shelf (books load into every member's `loadArchiveBooks`). Also lets a non-member set `library_id` on their own personal row and have it surface in others' archives.
- **Fix direction:** narrow the personal policy so it only governs personal rows, e.g. add `AND library_id IS NULL` to both the `using` and `with_check` of `"users manage own books"`. Then shared inserts are governed solely by `"members insert shared books"`, which correctly requires membership. Re-verify personal-shelf CRUD after the change.

## Advisor note
`get_advisors(security)` after the run: **no new** "RLS disabled" or "policy allows
all" findings for the Phase 2 tables — RLS is enabled on both `book_ownership` and
`book_personal_state`, and no new SECURITY DEFINER function was added. The 5
SECURITY DEFINER WARNs are the pre-existing Phase 1 helpers/RPCs; the `covers`
public-bucket and leaked-password WARNs are pre-existing and unrelated. Note: the
linter does NOT flag either defect above — both are logic gaps in policy *coverage*
(a missing policy; an over-broad OR'd policy), which only real-JWT testing exposes.

## Cleanup confirmed
All 3 test users (A/B/C), test library L, its members/invites, and every seeded
book/ownership/personal_state/note were deleted (service role; `on delete cascade`
handled ownership/personal_state, notes deleted explicitly). Post-cleanup counts
match the pre-test baseline exactly: **personal books=23, total books=23,
avatars=2, profiles=3, libraries=1, library_members=3, library_invites=1,
book_ownership=0, book_personal_state=0, notes=1, leftover test users=0.** The
injected "Intruder Book" was also removed. `src/App.jsx` and the schema were **not**
modified by QA.

## Go / No-Go

**NO-GO** — Failing IDs: **S-10** (non-member book injection) and the reveal-write
check (**no UPDATE policy on `library_members`**). Route both to
**supabase-migrator**:
1. Add a self-scoped UPDATE policy on `library_members` so a member can set their
   own `share_reading` (unblocks the reveal).
2. Constrain `"users manage own books"` to `library_id IS NULL` so non-members
   can't attach books to archives they don't belong to.

Everything else — the no-leak rule end-to-end, per-format ownership, the full
convert/merge/idempotency/edge surface, member permissions, outsider read
isolation, and recursion-freedom — is correct and holds under real per-user JWTs.
Re-QA after the two policy fixes; no frontend changes are needed for either.

---

# QA Report — Shared Library Phase 2 RLS Re-QA (post-`shared_library_phase2_rls_fixes`)

**Migration under test:** `shared_library_phase2_rls_fixes` (`20260704063933`) on
project `ujxsrcxbhcbihhdluzyl`. Focused re-run confirming the two prior blockers
(FAIL-1 reveal-write, FAIL-2 / S-10 injection) are fixed and no regression to
move-in convert or personal-book access.
**Plan:** [tests/shared-library-phase2-rls-refix-test-plan.md](shared-library-phase2-rls-refix-test-plan.md).
**Method:** real per-user JWTs (GoTrue password-grant) for A (owner), B (member of
L), C (outsider); PostgREST as each user is what enforces RLS. MCP service role
used ONLY for setup, ground-truth, and cleanup. Users created via SQL then
password-grant; note the seeded `auth.users` rows required the GoTrue token
columns (`confirmation_token`, `recovery_token`, `email_change`,
`email_change_token_new`, …) set to `''` (not NULL) or token issuance fails with
"Database error querying schema" — a setup detail, not a product defect.

## Fixes verified present in live schema (pre-run inspection)
- `library_members`: table-level UPDATE **revoked** from `authenticated`/`anon`;
  column-level UPDATE granted **only on `share_reading`** to `authenticated`; new
  RLS policy `members update own share_reading` (`user_id = auth.uid()`).
- `books`: `users manage own books` FOR ALL now `(auth.uid() = user_id AND
  library_id IS NULL)` in both USING and WITH CHECK; shared rows are owned solely
  by the additive `members … shared books` policies.

## Pass/Fail table (cases 1–6)

| ID | Case | Result | Evidence (request → response) |
|---|---|---|---|
| R-1a | reveal-write: A sets own `share_reading=true` (was FAIL-1) | **PASS** | REST-as-A `PATCH /library_members?…&user_id=eq.A {"share_reading":true}` → HTTP 200, row returned `share_reading:true`; re-read as A → `share_reading:true`. (Prior: 200 with 0 rows updated.) |
| R-1b | reveal ON: B reads A's `book_personal_state` | **PASS** | REST-as-B `GET /book_personal_state?book_id=eq.<S>&user_id=eq.A` → HTTP 200, 1 row `read:true, overall:4, smut:3, progress:{print:100}`. |
| R-1c | reveal OFF: A flips false → B sees 0 rows | **PASS** | REST-as-A `PATCH share_reading:false` → 200; REST-as-B same GET → HTTP 200 `[]`. |
| R-2 | role-escalation guard (new): A cannot self-promote | **PASS** | REST-as-A `PATCH {"role":"owner"}` → **HTTP 403 / 42501** "permission denied for table library_members"; combined `{"share_reading":true,"role":"owner"}` smuggle also **403** (whole statement rejected, `share_reading` NOT written). MCP ground-truth: A `role=owner`, B `role=member` unchanged. |
| R-3 | S-10 (was FAIL-2): outsider C injects into L | **PASS** | REST-as-C `POST /books {library_id:L,user_id:C,…}` → **HTTP 403 / 42501** "new row violates row-level security policy for table books"; REST-as-B archive list shows no intruder; MCP: 0 rows titled "Intruder Refix Book", 0 books authored by C. (Prior: HTTP 201, row created.) |
| R-4 | regression — member B shared insert | **PASS** | REST-as-B `POST /books {library_id:L,user_id:B,…}` → **HTTP 201**, row created `library_id=L`. |
| R-5 | regression — move-in convert flip | **PASS** | REST-as-A `PATCH /books?id=eq.<personal,A> {"library_id":L}` → **HTTP 200**, row now `library_id=L`. Owner-member UPDATE flip allowed. |
| R-6a | regression — personal CRUD | **PASS** | REST-as-A create→201, read→200, update→200, delete→200/204, verify-gone→`[]`. All on a `library_id null` book. |
| R-6b | regression — personal shelf scoping | **PASS** | REST-as-A `GET /books?user_id=eq.A&library_id=is.null` returns only the fresh personal probe, excluding all three `library_id=L` shared rows A can otherwise see. |

**Total: 9/9 checks PASS (cases 1–6 all PASS), 0 FAIL.**

## Both prior blockers confirmed fixed
- **FAIL-1 → fixed:** `share_reading` is now settable by the owner-member through
  the client (R-1a), and the full reveal chain works end-to-end and reverses
  cleanly (R-1b/R-1c). The fix did not open a role-write hole (R-2).
- **FAIL-2 / S-10 → fixed:** the outsider can no longer inject a book into an
  archive; the narrowed `users manage own books` policy leaves shared inserts to
  the membership-gated policy, which C fails (R-3). Legitimate member insert
  (R-4), owner convert flip (R-5), and personal CRUD/scoping (R-6) all still work.

## Cleanup confirmed
All 3 test users (A/B/C), test library L + members + invite, and every seeded
book / ownership / personal_state were deleted (service role; cascades handled
ownership + personal_state). Post-cleanup counts match baseline exactly:
**personal books=23, total books=23, avatars=2, profiles=3, libraries=1,
library_members=3, library_invites=1, book_ownership=0, book_personal_state=0,
notes=1, leftover test users=0.** `src/App.jsx` and the schema were **not**
modified by QA.

## Go / No-Go

**GO** — both prior blockers (S-10, reveal-write) are fixed, the new
role-escalation guard holds, and no regression to convert or personal-book access.
Shared Library Phase 2 is releasable at the RLS layer.

---

# QA Report — Shared Library Union Model (archive_shelf + archive_reveal)

**Plan:** `tests/shared-library-union-model-test-plan.md`
**Spec:** `docs/superpowers/specs/2026-07-05-shared-library-union-model-design.md`
**Branch:** `union-model-shelf`. Migration: `shared_library_union_model` (`20260705093412`).
**Scope:** Two SECURITY DEFINER views (`archive_shelf`, `archive_reveal`), the
`books.hidden_from_archives` flag, teardown of Phase-2 tables/column, and the
owner-only base-table invariant. Three confirmed auth users (A owner, B co-member,
C outsider) created via SQL + GoTrue password-grant; every access assertion driven
via real per-user JWT against PostgREST. MCP service role used only for setup,
ground-truth schema checks, and cleanup.

**JWT method note:** Users were created directly in `auth.users`/`auth.identities`
via `execute_sql` (bcrypt cost-10 hash, `instance_id='00000000-…'`, token columns
`''`, `email_confirmed_at` set). Real `authenticated`-role JWTs then obtained via
`POST /auth/v1/token?grant_type=password`. The three `instance_id=NULL` and
`email_verified` gaps (absent from initial insert) were corrected before JWT
issuance. All JWTs were valid `authenticated`-role tokens; RLS was exercised
faithfully.

## Summary verdict: GO — 11/11 PASS, 0 FAIL, 1 non-blocking observation

All no-leak cases (N-01 through N-10) PASS. All union/isolation/regression checks
PASS. Security boundary is proven under real JWTs.

## Counts

| Bucket | Pass | Fail |
|---|---|---|
| B- (schema / migration / RLS / advisors) | 11 | 0 |
| U- (union + ownership) | 5 | 0 |
| N- (no-leak — headline security) | 10 | 0 |
| I- (isolation / regression) | 6 | 0 |
| **Total** | **32** | **0** |

## Pass/Fail by ID

### Schema / Migration (MCP — service role, ground-truth only)

| ID | Result | Evidence |
|---|---|---|
| B-01 | PASS | `list_migrations`: `shared_library_union_model` (20260705093412) present. |
| B-02 | PASS | `books.hidden_from_archives`: `data_type=boolean`, NOT NULL, default `false`. |
| B-03 | PASS | `information_schema.tables`: `book_ownership` and `book_personal_state` return 0 rows — Phase-2 tables are gone. |
| B-04 | PASS | `information_schema.columns`: no `library_id` column on `books` — Phase-2 column is gone. |
| B-05 | PASS | `archive_shelf` columns: `[library_id, owner_id, book_id, title, author, cover_url, genres, formats, shelf]`. No marks columns. |
| B-06 | PASS | `archive_reveal` columns: `[library_id, owner_id, book_id, title, author, overall, smut, progress, read]`. No `notes` column. |
| B-07 | PASS | `pg_class.reloptions`: both views show `security_invoker=false` (SECURITY DEFINER confirmed). |
| B-08 | PASS | `information_schema.tables.is_insertable_into=NO` for both views — DML is structurally rejected regardless of grant. |
| B-09 | PASS | `pg_policies` on `books`: exactly one policy `"users manage own books"` cmd=ALL, `qual=(auth.uid()=user_id)`, `with_check=(auth.uid()=user_id)`. No Phase-2 shared-books policies remain. |
| B-10 | PASS | `pg_policies` on `notes`: `"users manage own notes"` cmd=ALL, owner-only. |
| B-11 | PASS | `get_advisors(security)`: exactly two `security_definer_view` WARNs for `archive_shelf` and `archive_reveal` — intentional and documented. No new `rls_disabled` or `policy_allows_all` finding. Pre-existing WARNs (5 SECURITY DEFINER functions, `covers` public bucket, leaked-password protection) unchanged. |

### Union + Ownership (real JWTs)

All requests: `Authorization: Bearer <user-JWT>` + `apikey: <anon>` to PostgREST.

| ID | Result | Evidence |
|---|---|---|
| U-01 | PASS | JWT-B `GET /archive_shelf?library_id=eq.L`: 4 rows — Fourth Wing (print+audio), A Unique Tome (print), A Wishlist Book (wishlist), The Coveted Scroll (wishlist). A_HID ("A Secret Tome") absent. |
| U-02 | PASS | JWT-A `GET /archive_shelf?library_id=eq.L`: 3 rows — Fourth Wing (ebook), B Unique Tome (print), The Coveted Scroll (wishlist). All `owner_id=B`. |
| U-03 | PASS | JWT-B sees A's Fourth Wing row: `formats=[print,audio], shelf=owned`. JWT-A sees B's Fourth Wing row: `formats=[ebook], shelf=owned`. Both owner rows present from their respective caller's perspective; dedup is correctly left to client. |
| U-04 | PASS | JWT-B archive_shelf row count = 4 (not 5). A_HID absent confirming hidden exclusion. |
| U-05 | PASS | JWT-B `GET /archive_shelf?library_id=eq.L&owner_id=eq.A&shelf=eq.wishlist`: 2 rows — "A Wishlist Book" and "The Coveted Scroll", both `shelf=wishlist`. |

### No-Leak — HEADLINE SECURITY (real JWTs)

| ID | Result | Evidence |
|---|---|---|
| N-01 | PASS | JWT-B archive_shelf columns from live response: `[library_id, owner_id, book_id, title, author, cover_url, genres, formats, shelf]`. Keys `overall/smut/progress/read` absent. **Marks do not structurally exist in the shelf view.** |
| N-02 | PASS | JWT-B archive_reveal columns with share_reading=ON: `[library_id, owner_id, book_id, title, author, overall, smut, progress, read]`. Key `notes` absent. **Notes never in either view.** Also confirmed by information_schema (B-06). |
| N-03 | PASS | JWT-B `GET /archive_reveal?library_id=eq.L&owner_id=eq.A` with A's `share_reading=false`: **0 rows**. No marks visible. |
| N-04 | PASS | JWT-B `GET /books?user_id=eq.A`: **0 rows**. Base table owner-only RLS holds; no alternative path to A's marks. |
| N-05 | PASS | JWT-B `GET /notes?user_id=eq.A`: **0 rows**. Notes owner-only. |
| N-06 | PASS | JWT-A PATCH `share_reading=true` (returned row confirms). JWT-B `GET /archive_reveal?library_id=eq.L&owner_id=eq.A`: **4 rows** — Fourth Wing (overall=4,smut=3,read=true), A Unique Tome (overall=5,smut=4,read=true), A Wishlist Book (0/0/false), The Coveted Scroll (0/0/false). A_HID absent from reveal. |
| N-07 | PASS | JWT-A PATCH `share_reading=false`. JWT-B same GET: **0 rows** again. Toggle round-trip confirmed. |
| N-08 | PASS | JWT-B `GET /archive_shelf?library_id=eq.L&book_id=eq.A_HID`: **0 rows**. Hidden book excluded from shelf. |
| N-09 | PASS | JWT-A PATCH share_reading=true; JWT-B `GET /archive_reveal?library_id=eq.L&book_id=eq.A_HID`: **0 rows**. Hidden book excluded from reveal even with sharing on. |
| N-10 | PASS | JWT-A `GET /books?id=eq.A_HID`: **1 row**, `hidden_from_archives=true`, `overall=5`, `smut=5`. Owner's personal view unaffected by the flag. |

### Isolation / Regression (real JWTs + MCP)

| ID | Result | Evidence |
|---|---|---|
| I-01 | PASS | JWT-C `GET /archive_shelf?library_id=eq.L`: **0 rows**. C shares no library with A/B. |
| I-02 | PASS | JWT-C `GET /archive_reveal?library_id=eq.L`: **0 rows**. |
| I-03 | PASS | JWT-C `GET /books?user_id=eq.A`: **0 rows**. Base table owner-only for outsider. |
| I-04 | PASS | JWT-C `GET /notes?user_id=eq.A`: **0 rows**. Notes owner-only for outsider. |
| I-05 | PASS | JWT-A `GET /books?user_id=eq.A`: **5 rows** — all of A's books including A_HID, with marks (overall/smut) and `hidden_from_archives` values intact. Personal library unaffected. |
| I-06 | PASS | MCP spot-check of pre-existing personal books (Quicksilver/Sinner/Brimstone/Twisted Love/Haunting Adeline/The Awakening etc.): all present with `user_id`, marks, `hidden_from_archives=false`, formats. Phase-2 migration data is intact. |

## Non-blocking observation (not a security defect)

**Grants broader than spec on views (P1 — cosmetic):** The `authenticated` role has
`arwdDxtm` (ALL privileges) on both views, not `SELECT` only as the spec's
`grant select to authenticated` clause specifies. This is cosmetically incorrect
but **not a security defect**: both views return `is_insertable_into=NO` (confirmed
via `information_schema.tables`), so Postgres structurally rejects INSERT/UPDATE/
DELETE/TRUNCATE regardless of the privilege grant. A client holding an authenticated
JWT cannot mutate the views. The excess grants likely resulted from Supabase's
default view ownership grant behavior superseding the explicit `REVOKE ALL`. Remedy
(optional, not blocking): re-run `revoke all on public.archive_shelf, public.archive_reveal from public, anon; grant select on public.archive_shelf, public.archive_reveal to authenticated;` after the view is created. **Route to supabase-migrator if the team wants the grant tightened to match the spec exactly.**

## Advisor note

`get_advisors(security)` shows the two `security_definer_view` WARNs for
`archive_shelf` and `archive_reveal`. These are **intentional and documented** in
the spec: the definer view is the deliberate security seam that keeps `books`
owner-only while allowing the view's `WHERE` clause to be the column-limited
co-member read path. A `security_invoker` view + co-member policy would grant
full-row reads and leak marks. No other new security finding was introduced by this
migration.

## Cleanup confirmed

All test users (A/B/C), profiles, identities, library L, library_members, books
(A: 5, B: 3), and notes (A: 2) were deleted via service-role `execute_sql`.
Post-cleanup counts match pre-test baseline exactly:
**qa_users_left=0, total_books=31, total_notes=2, profiles=3, libraries=1,
library_members=3, avatars=3.** `src/App.jsx` and the schema were **not** modified
by QA.

## Go / No-Go

**GO** — 11 test-plan IDs covering 32 individual checks, all PASS. Every no-leak
case (N-01 through N-10) proved under real authenticated JWTs: marks do not
structurally exist in `archive_shelf`; `archive_reveal` is gated by
`share_reading`; notes never appear in either view; the hidden flag excludes a book
from both views for co-members while keeping it visible to its owner; outsider C is
fully isolated; the personal library is unaffected; and migrated Task-1 data is
intact. The one non-blocking observation (excess view grants) does not constitute
a security defect and does not block release.

---

# QA Report — Pre-merge: Add several fixes, spine-photo removal, password eye, Inscribe arch (2026-11-16)

Plan: [tests/add-several-merge-test-plan.md](add-several-merge-test-plan.md). Working
tree of `test/e2e-buttons`, run on STAGING only (badge confirmed; every scripted
run asserted that all Supabase traffic went to `shwhzfpqjbwukjztlzee`).
Screenshots: `tests/screenshots/merge-qa-*.png`.

## Summary verdict: NO-GO as-is (2 FAIL, no data-loss or privacy blockers)

Data behaviour of Add several is correct: each book keeps its own data, the window
waits for the save, a failed save keeps the window and queue with no phantom
books, and the retry saves exactly once. What fails: the Binding failure copy is
now wrong (FAIL E-50), and two clicks in one JS task write a duplicate row (FAIL F-08).

## Numbers

- `npm test`: 5 files, 0 failures. Per-file: `_progress_unit` 34, `auth-errors-unit` 20,
  `import-dedupe-unit` 48 (imports the real `src/lib/importMerge.js`),
  `progress-snap-unit` 57, `shelf-layout-unit` 13 = 172 assertions. Node's runner counts 24 top-level tests, all passing.
- `npm run build`: built (one >500 kB chunk warning, as before). `check-dist-for-keys`:
  `OK`. Bundle: `Enter the Archive` 1 file; `Shelf spine` 0; `hushthorn:spine:` 0; `SpineAppearance` 0.
- `npm run test:e2e`: **111 passed, 1 skipped (Esc closes the Inscribe window), 0 failed**, 3.2 min, first run.
- Branch vs master: 0 behind, 5 ahead; committed HEAD merges cleanly.

## Pass/Fail by ID

| ID | Result | Evidence |
| --- | --- | --- |
| B-01..B-06 | PASS | Numbers above |
| F-01 | PASS | Queue of 1 → 1 row, year 2025, owned, own cover |
| F-02 | PASS | 4 rows from one insert (same `created_at`): Maas 2013 owned / Armentrout 2020 wishlist / Black 2018 owned / Roberts 2024 wishlist, each with its own cover_url, genres and page count |
| F-03 | PASS | After reload: 1 card each; panel shows own title, author, year |
| F-04 | PASS | 1 queued after picking the same title twice (observation O-1) |
| F-05 | PASS | Upper-cased existing title marked "already in archive"; Add count 1; existing title still 1 row |
| F-06 | PASS | No Add button; existing row unchanged (`owned`) |
| F-07 | PASS | "INSCRIBING…", disabled, 1 POST, 1 row per title |
| F-08 | **FAIL** | 2 POSTs, 2 rows, 2 cards after reload for one title (D-2) |
| F-09 | PASS | Panel hides when unticked; queue back on re-tick; 0 rows |
| F-10 | PASS (obs.) | Closes with no confirm; queue and checkbox are empty on reopen; 0 rows (O-2) |
| E-01 | PASS | Alert text exact; dialog open; "2 queued"; 0 cards; 0 rows; both widths |
| E-02 | PASS | 1 row each (`owned:2000`, `wishlist:2001`); 1 card each after reload; both widths |
| F-11 | PASS | Saved at once: wishlist, year 2002, author, genres; 1 card after reload |
| U-01 | PASS | Unit run |
| F-20 | PASS | No "Shelf spine" in any panel opened |
| F-21 | PASS | 1280: 64 spines, 64 with title text, 0 invisible; 390: 53/53/0; overflow 0 |
| E-20 | PASS | 3 leftover keys: same spine count, 0 spines use the data URL, 0 new errors |
| F-30..F-33 | PASS | Name flips Show/Hide password; Tab reaches eye; Enter and Space toggle; no submit; value kept; confirm eye independent (O-3) |
| F-34 | NOT TESTED | Needs an emailed recovery link |
| F-40..F-42 | PASS | `aria-expanded` true + `tab-selected.webp` while open; 390: tabs at x 32-130, 137-253, 261-359; overflow 0 |
| F-50 | PASS | Both widths: year 2015, overall 4, note row present and shown after reload, 0 rows after banish |
| F-51 | PASS | Codex renders at both widths, overflow 0 |
| F-52 | PASS | Run 1: 2 rows (`read/owned`, `to-read/wishlist`). Run 2: 0 write requests, rows unchanged |
| E-50 | **FAIL** | Copy says "The books are on your shelf for this session"; shelf shows 0 cards and staging has 0 rows (D-1) |

## Defects

**D-1 (should-fix, new in this change)** The Binding failure message is now false.
Steps: Codex → Upload Goodreads CSV with a new `E2E` title → books INSERT returns 500 → Bind.
Expected: copy that matches the shelf. Actual: "…The books are on your shelf for this
session — check your connection and upload the same file again." But `importBooks` now
removes the unsaved books: 0 cards, 0 rows. Suspected function: `PairSection.doImport`
(error copy), made stale by the new rollback in `importBooks`. Owner: frontend-dev.

**D-2 (minor, new relative to master: Add several is not on master)** Two clicks on
"Add N to the archive" in the same JS task write duplicate rows. Steps: queue 1 title,
then `btn.click(); btn.click()` in one task. Expected: 1 POST, 1 row. Actual: 2 POSTs,
2 rows, 2 cards after reload (1280 and 390). A real mouse double-click (separate events)
writes only once (F-07). Suspected: `addSearchBatch` guards with React state
(`batchSaving`), which is not yet applied when the second click runs, and `importBooks`
reads the stale `books` closure, so `mergeImport` mints new ids. The DB has no
unique-title constraint as a backstop. Owner: frontend-dev.

## Observations (not counted as FAIL)

- O-1: picking a queued title again with the other shelf does nothing silently; the first shelf is kept.
- O-2: closing Inscribe with a queue discards it with no confirm.
- O-3: the password reveal state and typed value carry from Sign in to Create account (first field opens revealed).
- O-4 (pre-existing): `validateDOMNesting` button inside button in `Meter`; `Meter` is byte-identical to master.
- O-5 (pre-existing): an idempotent Goodreads re-import says "Bound 2 books to the archive." while writing nothing.
- O-6: batch adds save `spine_color` null (single add computes it); raw Open Library subjects reach genres (`Fairies--Fiction.`, `Book_set`) through `cleanGenres`, same as single add.
- O-7: the e2e failed-save test does not assert "no phantom card on the shelf"; verified here by hand (E-01).

## Not tested

Reset-password screen (needs an emailed link); reduced motion; 200% zoom; keyboard
traversal of the queue list; second-account privacy (no RLS or schema change in scope).

## Cleanup confirmed

Alpha back to 64 books, 0 `E2E` books, 0 `E2E` notes (staging SQL count). An early
harness run, before the title guard existed, saved 5 real-titled books to alpha (Google
429 → Open Library path missed the prefix rewrite). They were deleted by id via REST
within minutes. Separately, `E2E Verify …` rows on another staging user were created
by a process other than this run and were left alone.
