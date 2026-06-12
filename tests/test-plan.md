# Test Plan — Spine Shelf View + Sort/Dimming Search

**Feature:** Spine Shelf View + Sort/Dimming Search (Feature #1 + #2 + view-pref persistence)
**Spec (source of truth):** `docs/superpowers/specs/2026-06-12-spine-view-sort-search-design.md`
**App under test:** single-file `src/App.jsx` (Vite + React + Supabase)
**Author:** QA / bookbee team
**Status:** drafted while Backend + Frontend dev in progress (no app code reviewed/edited yet)

## How to read this plan

- Each row carries a concrete **PASS** criterion; the test FAILS if the criterion is not met.
- IDs: `B-` backend/data layer, `F-` frontend behavior, `U-` pure-function unit, `E-` edge/fallback.
- "Schema match" cells answer the spec's standing question: **does what `src/App.jsx` references match the actual Supabase schema?**
- Verification methods: `MCP` (Supabase MCP: `list_tables` / `execute_sql` / `list_migrations`), `Unit` (Vitest/Jest on extracted pure fns), `Manual` (Chrome — voice/canvas features are Chrome/Edge only per CLAUDE.md), `Code` (read-only inspection of mapping/upsert shapes).

### Known structural baseline (from current `src/App.jsx`, for reference only)

These are pre-feature facts the implementation must extend; the tests below assert the extension landed:

- Books fetch + map: `:327` (`order created_at desc`), mapping `:341-346` — **currently omits `spineColor`**.
- Avatar fetch: `:329` (`maybeSingle`), map `:347-351` — **currently omits `pref_layout`/`pref_sort`**.
- Avatar upsert shape: `:1133` — **currently writes name/gender/hair_color/skin_tone/robe_color only** (no prefs; full-object upsert, so a naive prefs upsert risks clobbering these).
- `addBook` insert: `:480`. Cover change: `CoverEditor.save` `:2232`.

---

## 1. Backend / Data Layer

Verify migrations, schema, RLS, and that every column the app *references* actually *exists with the right type/constraint*.

### 1.1 Migrations & schema

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | Migration 1 applied | MCP `list_migrations` | A migration adding `books.spine_color` is listed and shows as applied. |
| B-02 | `books.spine_color` exists, correct type/nullability | MCP `list_tables` / `execute_sql` on `information_schema.columns` | Column `spine_color` exists on `books`, `data_type = text`, `is_nullable = YES`. |
| B-03 | Migration 2 applied | MCP `list_migrations` | A migration adding `avatars.pref_layout` + `pref_sort` is listed and applied. |
| B-04 | `avatars.pref_layout` exists, NOT NULL, default `'grid'` | MCP `execute_sql` on `information_schema.columns` | `data_type = text`, `is_nullable = NO`, `column_default` resolves to `'grid'`. |
| B-05 | `avatars.pref_sort` exists, NOT NULL, default `'recent'` | MCP `execute_sql` | `data_type = text`, `is_nullable = NO`, `column_default` resolves to `'recent'`. |
| B-06 | Existing book rows unaffected by Migration 1 | MCP `execute_sql` `SELECT count(*) FROM books WHERE spine_color IS NULL` after migrate, before backfill | Pre-existing rows have `spine_color = NULL` (nullable lets them load); no error, no default backfilled at migrate time. |
| B-07 | Existing avatar rows get the NOT-NULL defaults | MCP `execute_sql` `SELECT pref_layout, pref_sort FROM avatars` | Every existing avatar row reads `pref_layout='grid'`, `pref_sort='recent'` (defaults applied to existing rows). |
| B-08 | Allowed-value sanity (no DB-level CHECK required, but app must only write valid values) | Code + Manual | Only `grid`/`spines` ever written to `pref_layout`; only `recent`/`author`/`title`/`verdict`/`spice` to `pref_sort`. No other strings reach the DB. |

### 1.2 RLS / access

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-09 | `books` RLS still owner-only after new column | MCP `get_advisors` (security) + `execute_sql` on `pg_policies` | RLS enabled on `books`; policies still scope by `user_id = auth.uid()`; new column inherits row access; no new permissive policy added. |
| B-10 | `avatars` RLS still owner-only after new columns | MCP `pg_policies` + `get_advisors` | RLS enabled on `avatars`; policies scope by `user_id`; prefs columns inherit row access. |
| B-11 | Cross-user isolation of new columns | Manual (two accounts) | User A cannot read/update User B's `spine_color` or prefs; update of another user's row returns 0 rows affected / blocked. |
| B-12 | No new security advisor warnings | MCP `get_advisors` | Advisor count for security category unchanged vs. pre-migration (no "RLS disabled", no "policy allows all"). |

### 1.3 Persistence paths (does app write match schema?)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-13 | `addBook` persists `spine_color` | Code (`:480`) + Manual + MCP | Insert payload includes key `spine_color` (DB column name, snake_case). After adding a book with a cover, `SELECT spine_color` is a non-null `rgb(...)`. Sampling failure inserts `spine_color = NULL` (B-19), still a valid insert. |
| B-14 | Cover change resamples + persists | Code (`:2232`) + Manual + MCP | After `CoverEditor.save` with a different cover, `spine_color` in DB differs from prior value and matches the new cover sample. |
| B-15 | Lazy backfill writes back via update | Manual + MCP | First spine render of a `spine_color IS NULL` book issues exactly one `update({ spine_color }).eq('id', ...)`; DB row transitions NULL → `rgb(...)`. |
| B-16 | Backfill is one-shot (idempotent) | Manual + MCP `get_logs` | A given book is updated **at most once** per the backfill path; re-render / re-scroll does not issue a second write; reload reads stored color and issues **zero** writes. |
| B-17 | Prefs upsert does NOT clobber other avatar fields | Code (`:1133` shape) + Manual + MCP | After a layout/sort change, `SELECT name, gender, hair_color, skin_tone, robe_color` are **unchanged**. Pref upsert must merge (read-modify-write or partial upsert keyed on `user_id`), not overwrite the row with a prefs-only object. |
| B-18 | Pref upsert creates row when avatar absent | Manual (fresh account, never customized) + MCP | First pref write creates an `avatars` row keyed on `user_id` with the chosen pref and defaults for the rest; no NOT-NULL violation on `pref_layout`/`pref_sort`. |

### 1.4 Fetch mappings expose new fields

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-19 | Books map exposes `spineColor` | Code (`:341-346`) | Mapped book object includes `spineColor: b.spine_color`. (Baseline currently omits it — must be added.) |
| B-20 | Avatar map exposes prefs | Code (`:347-351`) | Loaded avatar/prefs include `pref_layout` and `pref_sort`. (Baseline currently omits them — must be added.) |
| B-21 | Column-name fidelity | Code | App reads snake_case DB columns (`spine_color`, `pref_layout`, `pref_sort`) and exposes camelCase to UI where the codebase convention does so; no reference to a column that does not exist in schema (cross-check against B-02/B-04/B-05). |

---

## 2. Frontend Behavior

### 2.1 Spine rendering (`Spine`)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-01 | Deterministic height | Manual / DOM inspect | Spine height = `122 + hashStr(title) % 48` px; same title ⇒ same height every render/reload. |
| F-02 | Deterministic width | Manual / DOM inspect | Spine width = `17 + hashStr(author+title) % 12` px; deterministic per book. |
| F-03 | Verdict gem color thresholds | Manual | `overall === 5` → gold `#fbbf24`; `overall` 1–4 → periwinkle `#a5b4fc`; `overall` 0/null → faint. Boundary at exactly 5 vs 4 respected. |
| F-04 | Spice band intensity | Manual / computed style | Foot band = `rgba(244,114,182, 0.2 + smut*0.16)`; `smut=0` → faint (0.2 alpha); higher `smut` → visibly stronger; null `smut` treated as 0. |
| F-05 | Unread-proud offset | Manual | Book that is owned & `!read` renders with `-translate-y-1.5` (sits proud); read/owned does not. |
| F-06 | Wishlist ghost + dashed | Manual | `shelf === 'wishlist'` spine is `opacity-60` + dashed border. |
| F-07 | Dimmed state precedence | Manual | `dimmed` prop drops spine to `opacity-20`; applies in spine view during active search for non-matches without removing it from layout. |
| F-08 | Vertical truncated title | Manual | Title rendered `writing-mode: vertical-rl`, truncated at 24 chars (25th+ not shown / ellipsised). |
| F-09 | Audio ring dormant | Manual / DOM | Audio-ring markup renders only if `book.formats?.includes('audio')`; with no `formats` present today it is a harmless no-op (not visible, no error). |
| F-10 | Hover transform | Manual | Hover applies `-translate-y-2 -rotate-3` and raised z-index; returns to rest on mouse-out. |

### 2.2 Responsive shelf rows (`SpineShelf`)

| ID | Width | Method | PASS criterion |
|---|---|---|---|
| F-11 | 360px (mobile) | Manual (Chrome devtools) | Each wooden board sits under **exactly one** full visual row; no spine straddles two boards; `perRow = clamp(floor(360/(29+5)),6,14)` honored (clamps to floor 6). |
| F-12 | 768px (tablet) | Manual | One board per row; perRow recomputed for width; rows reflow cleanly. |
| F-13 | 1024px (desktop) | Manual | One board per row; perRow honored; no orphan board with no row / row with no board. |
| F-14 | Live resize re-chunk | Manual (drag viewport) | Changing width re-chunks rows; boards realign; no stale row counts after `ResizeObserver` fires. |

### 2.3 Controls: layout, sort, search

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-15 | Layout toggle switches view | Manual | Covers/Spines segmented control swaps grid ↔ spine shelf; ControlsBar shown only in `library` view (not Oracle/Kindle). |
| F-16 | Sort key — Recent | Manual | Default; order = incoming (newest-first, `created_at` desc + in-session prepends). |
| F-17 | Sort key — Author | Manual | `localeCompare` on author, then title tiebreak; A→Z. |
| F-18 | Sort key — Title | Manual | `localeCompare` on title; A→Z. |
| F-19 | Sort key — Verdict | Manual | `overall` descending; equal overall keeps recent order (stable). |
| F-20 | Sort key — Spice | Manual | `smut` descending; equal smut keeps recent order (stable). |
| F-21 | Sort stability for equal keys | Manual + Unit (U-03) | Items with equal sort key retain their relative recent order (no reshuffle). |
| F-22 | Search HIDES in grid | Manual | Typing a query removes non-matching covers from the grid and reflows cleanly (no gaps/placeholders). |
| F-23 | Search DIMS in spines | Manual | Typing a query dims non-matching spines to `opacity-20` and **keeps them in place** (no reflow — bookcase preserved). |
| F-24 | Search live on keystroke | Manual | Hide/dim updates on each keystroke; clearing the query restores all. |
| F-25 | Search field scope | Manual | Matches by title, author, or genre (see U-04 for exhaustive cases). |
| F-26 | Sort × search compose | Manual | In grid: sort applied, then non-matches hidden. In spines: sort applied to full list, non-matches dimmed (matches keep sorted positions). Order is sort-then-filter per spec pipeline. |

### 2.4 Lazy backfill UX (no "pop")

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-27 | No color pop on reload | Manual | After backfill persists, reloading shows the stored color immediately on first paint (initial = `book.spineColor`), with no flash from fallback → sampled color. |
| F-28 | Cache dedupe within session | Manual | Module-level `spineColorCache` prevents re-sampling the same `coverUrl` twice in one session (no duplicate canvas work / DB writes). |
| F-29 | Fallback shown while sampling | Manual | Before a sample resolves, the genre fallback (or hsl) color shows; transition to sampled color happens once, only for not-yet-persisted books. |

### 2.5 Preference round-trip

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-30 | Persist on layout toggle | Manual + MCP | Toggling layout writes `pref_layout` immediately; DB reflects new value. |
| F-31 | Debounced sort persist | Manual + MCP `get_logs` | Rapid sort changes coalesce (~400ms debounce) into a single final write of `pref_sort`; final DB value = last selection. |
| F-32 | Round-trip across reload | Manual | Reload restores last layout + sort from `avatars.pref_layout/pref_sort` (not defaults). |
| F-33 | Cross-device round-trip | Manual (second browser/device, same account) | Second session loads the same saved prefs (cross-device persistence). |
| F-34 | Defaults when no avatar row | Manual (fresh account) | UI initializes to `grid` / `recent`; first change creates the row (ties to B-18). |
| F-35 | Write failure never blocks UI | Manual (simulate offline / forced error) | Pref write failure logs quietly; UI still reflects the in-session choice; no thrown error, no frozen control. |

---

## 3. Pure-Function Unit Cases

Extract pure utils for direct unit testing (no React). Each row is one assertion group.

### 3.1 `sortBooks(list, key)`

| ID | Case | PASS criterion |
|---|---|---|
| U-01 | recent | Returns a **shallow copy** in original incoming order; input array not mutated. |
| U-02 | author / title | Sorted by `localeCompare`; author breaks ties by title. |
| U-03 | Stability | Equal-key items retain incoming relative order for every key (verdict/spice/author/title). |
| U-04 | verdict / spice descending | Higher `overall` / `smut` first; recent order as tiebreak. |
| U-05 | null/missing `overall`/`smut` → 0 | A book with `overall=null|undefined` sorts as 0 for verdict; same for `smut`/spice; no NaN, no throw. |
| U-06 | case-insensitive author/title | `"bronte"` and `"Brontë"`/`"BRONTE"` order consistently; mixed case does not split ordering (case-insensitive compare). |
| U-07 | empty list / single item | `[]` → `[]`; `[x]` → `[x]`; no throw. |
| U-08 | unknown key | Falls back gracefully (recent/identity), no throw. |

### 3.2 `matchesQuery(book, q)`

| ID | Case | PASS criterion |
|---|---|---|
| U-09 | title match | Substring of title (case-insensitive) → true. |
| U-10 | author match | Substring of author (case-insensitive) → true. |
| U-11 | genre match | Substring of **any** genre in `genres[]` (case-insensitive) → true. |
| U-12 | empty query | `""` → true for all books (matches everything). |
| U-13 | whitespace-only query | `"   "` → true for all (treated as empty after trim). |
| U-14 | non-match | Query matching no field → false. |
| U-15 | partial substring | Mid-word substring (e.g. `"ight"` in `"Twilight"`) → true. |
| U-16 | missing fields | `author`/`genres` null/undefined → no throw; matches only on present fields. |

### 3.3 `genreFallbackColor(book)`

| ID | Case | PASS criterion |
|---|---|---|
| U-17 | vampire/blood | Maps to `#5b1f3f`. |
| U-18 | fae | Maps to `#33306e`. |
| U-19 | romance | Maps to `#7c2a5e`. |
| U-20 | witch/magic | Maps to `#46246b`. |
| U-21 | dark academia/mystery | Maps to `#3b2f4e`. |
| U-22 | gothic/horror | Maps to `#2a1f3d`. |
| U-23 | dragon/epic/fantasy | Maps to `#1f3a5c`. |
| U-24 | regex semantics | Case-insensitive; matches substring within a genre string; first-match-wins order is deterministic for multi-genre books. |
| U-25 | unknown genre → hsl from title hash | `hsl(hashStr(title) % 360, 35%, 24%)`; **same title ⇒ same color** (deterministic). |
| U-26 | no genres at all | Falls through to the title-hash hsl branch; no throw. |

### 3.4 `hashStr(s)`

| ID | Case | PASS criterion |
|---|---|---|
| U-27 | deterministic | `hashStr(x) === hashStr(x)` across calls; stable 32-bit integer. |
| U-28 | distinct inputs differ | Different strings produce (practically always) different hashes; spot-check a set of titles/authors yields no collisions in the sample. |
| U-29 | edge inputs | `""`, single char, very long string, unicode → returns a number, no throw, non-negative when used with `% n`. |

---

## 4. Edge Cases & Fallbacks

| ID | Scenario | Method | PASS criterion |
|---|---|---|---|
| E-01 | Cover missing (no `coverUrl`) | Manual + Unit | `useSpineColor` returns `genreFallbackColor`; no fetch attempted; **no DB write**; no crash. |
| E-02 | Cover fetch fails (404 / network) | Manual (block URL) | Falls to genre fallback; no write; error caught quietly; render unaffected. |
| E-03 | `sampleCoverColor` throws (CORS taint / decode error) | Manual | Caught; genre fallback used; **no bad/partial DB write** (never writes a malformed `spine_color`); no crash. |
| E-04 | `spine_color` write fails | Manual (force update error) | Sampled color kept in session + cache; failure logged to console; render not blocked; DB stays NULL; opportunistic retry deferred to next session (no infinite retry loop). |
| E-05 | Backfill write race / double-fire guard | Manual + MCP `get_logs` | Even with fast re-renders, no second update fires for the same book (local-state guard holds); ties to B-16. |
| E-06 | Empty library in spine view | Manual | Shows exact copy: "This bookcase stands empty." / "Inscribe a tome to begin the collection." No empty boards, no JS error. |
| E-07 | `ResizeObserver` unsupported | Manual (shim removed / older engine) | Falls back to fixed `perRow = 10` + window resize listener; shelf still renders one board per row; no thrown ReferenceError. |
| E-08 | Avatar row absent then first pref write | Manual (fresh account) | Defaults grid/recent shown; first write upserts a new row without NOT-NULL violations; ties to B-18/F-34. |
| E-09 | Malformed/legacy `spine_color` in DB | Manual (manually set odd value via MCP) | A non-`rgb()` or empty string value does not crash the spine; either renders as-given or falls back; never throws. |
| E-10 | Sampling produces too-bright color | Unit/Manual | `sampleCoverColor` darkens so brightest channel ≤150 ("library light"); verify a white-cover sample is darkened, not left near-white. |
| E-11 | Very large library (100+) | Manual | Spine view still chunks correctly; no virtualization expected (deferred); no layout break (perRow clamp upper bound 14 respected). |
| E-12 | Audio/`formats` absent everywhere | Manual | Dormant audio-ring path never errors given no book has `formats`; ties to F-09. |

---

## Out of scope (per spec — do NOT test here)

- Audiobooks feature (#3): `formats`/`audioHours`/listening card/🎧 filter (audio-ring markup dormant only).
- "Conjure sample tomes" demo generator.
- Virtualized rows / A–Z jump rail.
- Note `source`/`isTime` persistence (bundled with later audiobook migration).

## Open verification questions for devs (resolve during execution)

1. Confirm whether prefs upsert is implemented as read-modify-write or a true partial upsert (drives the exact B-17 assertion).
2. Confirm the avatar fetch will also surface the row `id`/prefs (baseline map omits both) so the round-trip tests (F-30–F-35) have data to assert against.
3. Confirm debounce interval for sort persistence (spec says ~400ms) to calibrate F-31.
