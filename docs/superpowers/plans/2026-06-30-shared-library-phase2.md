# Shared Library Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shared archives hold books — a shared shelf with per-format, per-member ownership, where each person's ratings/progress/notes are private, with a per-archive opt-in to reveal ratings + progress.

**Architecture:** Additive Supabase schema (`books.library_id`, `book_ownership`, `book_personal_state`, `library_members.share_reading`) + RLS reusing the Phase 1 `my_library_ids()` helper. All app logic stays in the single-file `src/App.jsx`: an archive switcher swaps the shelf between the personal library and each shared archive; shared-book reads/writes are merged/branched so existing components (`Meter`, `ProgressEditor`, `CardProgress`, spine, cards) need minimal change.

**Tech Stack:** Vite + React (single-file `src/App.jsx`), Tailwind + `ht-*` classes, Supabase (`@supabase/supabase-js`), migrations via the Supabase MCP (no local migrations folder).

## Global Constraints

- **Spec is authoritative:** `docs/superpowers/specs/2026-06-30-shared-library-phase2-design.md`. Read it before any task.
- **The no-leak rule:** a shared `books` row must carry NO personal marks — `overall`/`smut`/`progress`/`read` on a shared row stay at defaults; personal marks live only in `book_personal_state`. On converting a personal book to shared, migrate marks into `book_personal_state` then reset those columns on the row.
- **The Phase 1 invariant:** never `OR` the `book_personal_state`/`notes` policy with plain library membership. Reveal is a *separate* SELECT-only policy gated on `share_reading`. Notes are never revealed.
- **Verification idiom (no unit runner in this repo):** every task ends with `npm run build` passing; DB tasks also run `get_advisors(security)` (expect no new findings) and SQL smoke checks; behavior/RLS is validated by qa-tester with real per-user JWTs (as in Phase 1).
- **Design system (do not drift):** near-black `#0c0714`, fuchsia/pink accents, **cyan reserved for audio only**, sharp corners (`rounded-sm`/`rounded-md`), fonts Cinzel/EB Garamond/Rozha One, themed copy with clear errors. Ratings: Verdict=swords (`overall`), Smoulder=candles (`smut`).
- **Supabase project ref:** `ujxsrcxbhcbihhdluzyl`. Reuse the Phase 1 helper `public.my_library_ids()`.
- **Commit after each task.** The developer commits features themselves too — keep commits focused and per-task.

## File structure

- **Supabase (via MCP)** — one migration `shared_library_phase2` (schema + RLS). No local files.
- **`src/App.jsx`** — all app changes:
  - Root `Hushthorn`: `currentLibraryId` + `archives` state; branch book loading; merged shared-book shape; `updateBook` branching; `addBookToArchive`, `moveBookIntoArchive`, `toggleOwnership`, `setArchiveShareReading`.
  - New components: `ArchiveSwitcher`, `WhoHasIt`, `RevealGrid`, `OwnFormatToggles`; additions to `DetailPanel`, the grid card, the shelf tabs, and the Phase 1 `LibraryDetail` (share toggle).
- **`tests/`** — qa-tester adds `shared-library-phase2-test-plan.md` and appends `report.md`.

---

### Task 1: Database — schema + RLS (supabase-migrator)

**Files:**
- Supabase migration `shared_library_phase2` (MCP `apply_migration`).

**Interfaces:**
- Produces: tables `book_ownership(book_id,user_id,format)`, `book_personal_state(book_id,user_id,read,overall,smut,progress,updated_at)`; columns `books.library_id`, `library_members.share_reading`; RLS policies incl. the opt-in reveal.

- [ ] **Step 1: Apply the migration** (exact SQL from the spec's "Schema" + "RLS policies" sections — copy verbatim). Order: `books.library_id` → `book_ownership` → `book_personal_state` → `library_members.share_reading` → `enable rls` → policies.

- [ ] **Step 2: Verify structure**

Run (MCP `list_tables`, schemas `["public"]`, verbose): confirm `book_ownership` and `book_personal_state` exist with `rls_enabled: true`, and `books.library_id` + `library_members.share_reading` columns exist.

- [ ] **Step 3: Verify security advisors**

Run (MCP `get_advisors`, type `security`). Expected: **no new findings** vs. the Phase 1 baseline (the two new tables have RLS; no new SECURITY DEFINER functions). Pre-existing WARNs (authenticated RPC execute, covers bucket, leaked-password) are unchanged and acceptable.

- [ ] **Step 4: SQL smoke check (no recursion)**

Run (MCP `execute_sql`): `select count(*) from public.book_ownership; select count(*) from public.book_personal_state;` Expected: `0` each, no error.

- [ ] **Step 5: Done** — no git commit (DB change is remote). Record the migration name in the task handoff.

---

### Task 2: Read/merge layer — load personal + archive books (backend-dev)

**Files:**
- Modify: `src/App.jsx` — the data-load effect (~line 1265), add `currentLibraryId`/`archives` state near `session`.

**Interfaces:**
- Produces:
  - state `currentLibraryId` (string|null; null = personal), `archives` (`[{id,name,role}]`).
  - `loadArchiveBooks(uid, libraryId) -> Promise<MergedBook[]>`.
  - **MergedBook (shared)** = personal book shape PLUS: `library_id`, `ownership: [{user_id,format}]`, `reveals: [{user_id, overall, smut, progress, read}]`, `members: [{user_id, username, av}]`, and `read/overall/smut/progress` sourced from **my** `book_personal_state` (defaults `false/0/0/{}` if none). `shelf` derived: `ownership.length ? 'owned' : 'wishlist'`.
  - Personal books keep today's shape and MUST be fetched with an added `.is('library_id', null)` filter.

- [ ] **Step 1: Add state + filter personal shelf.** Near `const [session,...]` add `const [currentLibraryId, setCurrentLibraryId] = useState(null);` and `const [archives, setArchives] = useState([]);`. In the personal `books` fetch add `.is('library_id', null)` so shared rows never appear in the personal library.

- [ ] **Step 2: Load the archive list.** In the session effect, after profile load, fetch `supabase.from('libraries').select('id,name,library_members(user_id,role)')`; map to `[{id,name,role: myRow.role}]`; `setArchives(...)`.

- [ ] **Step 3: Implement `loadArchiveBooks(uid, libraryId)`** — fetch in parallel:
```js
const [{data: rows}, {data: own}, {data: ps}, {data: mem}] = await Promise.all([
  supabase.from('books').select('*').eq('library_id', libraryId),
  supabase.from('book_ownership').select('book_id,user_id,format').in('book_id', /* ids after first fetch */ []),
  supabase.from('book_personal_state').select('*'),         // RLS returns mine + revealed
  supabase.from('library_members').select('user_id,role,profiles(username),avatars(gender,hair_color,skin_tone,robe_color)').eq('library_id', libraryId),
]);
```
Practical shape: fetch `rows` first to get `ids`, then fetch ownership/personal_state `.in('book_id', ids)` and the roster. Merge: for each row, `mine = ps.find(p=>p.book_id===row.id && p.user_id===uid)`; `reveals = ps.filter(p=>p.book_id===row.id && p.user_id!==uid)`; `ownership = own.filter(o=>o.book_id===row.id)`; build MergedBook with `read/overall/smut/progress` from `mine` (defaults if absent), `shelf` derived, `notes: []` (notes loaded as today for mine only). Return the array.

- [ ] **Step 4: Switch the shelf source.** Where `books` feeds the shelf, branch: `currentLibraryId === null` → personal `books`; else the loaded archive books. Trigger `loadArchiveBooks` in an effect on `[currentLibraryId]` and hold results in `sharedBooks` state; render whichever is active.

- [ ] **Step 5: Build + QA gate.** `npm run build` passes. qa-tester (later Task 8) confirms with real JWTs: a member sees the archive's books with correct ownership, their own marks, and reveals gated by `share_reading`. Commit: `feat(shared): load + merge shared-archive books`.

---

### Task 3: Write branching — `updateBook` for shared books (backend-dev)

**Files:**
- Modify: `src/App.jsx` — `updateBook` (~line 1428) and `FIELD_MAP`.

**Interfaces:**
- Consumes: MergedBook (Task 2), `currentLibraryId`.
- Produces: `updateBook(id, patch)` routes personal-state fields vs group fields for shared books; `toggleOwnership(bookId, format, own)`.

- [ ] **Step 1: Branch `updateBook`.** Look up the book; if it has `library_id`:
  - Split `patch` into `personal = {read,overall,smut,progress}` (present keys) and `group = {title,author,coverUrl,genres,formats}` (present keys).
  - If `personal` non-empty: `supabase.from('book_personal_state').upsert({ book_id:id, user_id:session.user.id, ...personal, updated_at:now })`.
  - If `group` non-empty: `supabase.from('books').update(mapGroup(group)).eq('id', id)` (reuse the existing `FIELD_MAP` for group keys only).
  - Update local merged state to match. Personal books (no `library_id`) keep today's single-row path unchanged.

- [ ] **Step 2: Implement `toggleOwnership(bookId, format, own)`.** `own` → `insert({book_id,user_id:me,format})` (ignore 23505) and ensure `format` is in the book's `books.formats` (update if missing); `!own` → `delete().eq('book_id',bookId).eq('user_id',me).eq('format',format)`. Update local `ownership` + derived `shelf`.

- [ ] **Step 3: Build + QA gate.** `npm run build` passes. qa (Task 8): rating a shared book writes `book_personal_state` (not the `books` row); a co-member without `share_reading` can't read it. Commit: `feat(shared): branch updateBook + ownership toggles for shared books`.

---

### Task 4: Add a new book directly to an archive (backend-dev + frontend-dev)

**Files:**
- Modify: `src/App.jsx` — `addBook` (~line 1531) / AddBook flow; add `addBookToArchive`.

**Interfaces:**
- Consumes: `currentLibraryId`, `toggleOwnership`.
- Produces: `addBookToArchive(book, libraryId, myFormats: string[])`.

- [ ] **Step 1: Implement `addBookToArchive`.** Insert the `books` row with `library_id: libraryId`, `user_id: session.user.id` (creator/provenance), group fields set, and `overall/smut/read/progress` at defaults (`0/0/false/{}`) — NEVER the adder's marks. Then insert one `book_ownership` row per selected format. Set `formats` to `myFormats` (at least `['print']`).

- [ ] **Step 2: Wire the Inscribe flow.** When `currentLibraryId` is set, the AddBook confirm routes to `addBookToArchive` and shows a small "Which formats do you own?" chooser (📖 Print / 📱 Ebook / 🎧 Audio — audio cyan) defaulting to Print.

- [ ] **Step 3: Build + QA gate.** `npm run build` passes. qa (Task 8): adding to an archive creates a shared row with no rating on the row + the adder's ownership rows. Commit: `feat(shared): add new book directly to an archive`.

---

### Task 5: Move-in / merge a personal book into an archive (backend-dev + parser-qe)

**Files:**
- Modify: `src/App.jsx` — add `moveBookIntoArchive`; a "Move into a shared archive" control in `DetailPanel` for personal books.

**Interfaces:**
- Consumes: `archives`, `book_personal_state`, `book_ownership`.
- Produces: `moveBookIntoArchive(bookId, libraryId) -> Promise<void>`.

- [ ] **Step 1: Implement `moveBookIntoArchive`.**
  - Load the personal book (must be `library_id null`, `user_id = me`).
  - Find an existing shared book in `libraryId` with the same title (case-insensitive): `supabase.from('books').select('id').eq('library_id',libraryId).ilike('title', title)`.
  - **Not present (convert in place):** `update books set library_id=libraryId` on the personal row; `upsert book_personal_state {book_id, user_id:me, read, overall, smut, progress}` from the row's current marks; then `update books set overall=0, smut=0, read=false, progress='{}'` on that row (reset); insert `book_ownership` for each format in `books.formats`.
  - **Present (merge into existing):** let `target = existing.id`. `upsert book_personal_state {book_id: target, user_id:me, ...marks}`; insert `book_ownership {target, me, format}` per format (ignore 23505); **re-point notes FIRST**: for each of my notes on `bookId`, `update notes set book_id=target` (dedupe by `noteFingerprint` against notes already on `target` for me — skip duplicates, delete the leftover); then `delete from books where id=bookId` (my personal row).
  - Refresh local state (remove the personal book; the archive view will show the shared one).

- [ ] **Step 2: Idempotency guards.** Ownership insert ignores `23505` (PK dedupe); `book_personal_state` uses upsert; notes re-point skips fingerprints already present. Re-running a move/merge must not duplicate ownership, personal_state, or notes.

- [ ] **Step 3: parser-qe test scenarios (real-JWT SQL, repo idiom).** Author `tests/` cases the qa run executes: (a) convert-in-place preserves marks in `book_personal_state` and zeroes the row; (b) merge into an existing title creates no duplicate row and re-points notes; (c) repeating either is idempotent; (d) unrated book creates no bogus `book_personal_state`; (e) no-format book defaults to print ownership.

- [ ] **Step 4: Build + QA gate.** `npm run build` passes. Commit: `feat(shared): move/merge a personal book into an archive`.

---

### Task 6: Archive switcher + adapted filter tabs (frontend-dev)

**Files:**
- Modify: `src/App.jsx` — header/nav (~line 1579–1675), shelf tabs (`shelfTabs` ~1555), `ControlsBar` area.

**Interfaces:**
- Consumes: `archives`, `currentLibraryId`, `setCurrentLibraryId`.
- Produces: `<ArchiveSwitcher current, archives, onSwitch />`; archive-aware `shelfTabs`.

- [ ] **Step 1: `ArchiveSwitcher`.** A themed selector by the library header: `My Library` + each archive name. Selecting sets `currentLibraryId` (null for personal). Sharp corners, Cinzel label, purple/pink; audio stays cyan-only.

- [ ] **Step 2: Adapt filter tabs in an archive.** When `currentLibraryId` set, replace `Owned/Wishlist` with ownership filters: **All · I own · Others own · Nobody (wishlist)** (non-exclusive), keeping **Read/Unread** (from merged `read`) and **🎧 Audio**. Filtering uses `ownership` + `read`.

- [ ] **Step 3: Build + design-guardian + QA gate.** `npm run build` passes; design-guardian confirms no drift. Commit: `feat(shared): archive switcher + ownership filter tabs`.

---

### Task 7: Shared card + shared detail panel + per-archive share toggle (frontend-dev)

**Files:**
- Modify: `src/App.jsx` — grid card (~1716–1755), `DetailPanel`, and the Phase 1 `LibraryDetail` (share toggle).

**Interfaces:**
- Consumes: MergedBook (`ownership`, `reveals`, `members`), `toggleOwnership`, `setArchiveShareReading`.
- Produces: `<WhoHasIt members, ownership, meId />`, `<RevealGrid mine, reveals />`, `<OwnFormatToggles book, onToggle />`.

- [ ] **Step 1: `WhoHasIt` + `RevealGrid`** matching the approved mockup (`.superpowers/brainstorm/.../ownership-card-v2.html`): member rows (avatar · name · owned-format glyphs 📖/📱/🎧 with **audio cyan**; else "wants it"), and a rigid aligned grid (name · ⚔ · 🕯 · %) — you always see your own marks; co-members appear only in `reveals`; a member absent from `reveals` reads "hasn't shared." Notes never rendered here.

- [ ] **Step 2: Render them on shared cards + detail.** In the grid card and `DetailPanel`, gate this block on `book.library_id`. In `DetailPanel`, add `<OwnFormatToggles>` (per-format "I own" → `toggleOwnership`); the existing `Meter`/`ProgressEditor` already write my private state via the branched `updateBook`. "Remove" on a shared book deletes it for the archive (confirm copy: it leaves everyone's shelf; to drop just your copy, untick your formats).

- [ ] **Step 3: Per-archive share toggle.** In `LibraryDetail` (Shared Archives panel), add a **"Share my ratings & progress in this archive"** switch → `setArchiveShareReading(libraryId, on)` = `update library_members set share_reading=on where library_id and user_id=me`. Reflect state from the roster load.

- [ ] **Step 4: Build + design-guardian + QA gate.** `npm run build` passes; design-guardian confirms no drift (cyan=audio, sharp corners, themed copy). Commit: `feat(shared): shared card, ownership toggles, reveal, per-archive share toggle`.

---

### Task 8: Full QA (qa-tester) + design review

**Files:**
- Create: `tests/shared-library-phase2-test-plan.md`; append `tests/report.md`.

- [ ] **Step 1: Run the spec's QE checklist** with three real, confirmed users (owner A, member B, outsider C) via real per-user JWTs (Phase 1 methodology; service role only for setup/cleanup, never to prove access). Cover: no-leak (shared row carries no marks; reveal on/off flips visibility; notes never revealed), per-format ownership + write-own-only, shelf derivation, move-in/merge correctness + idempotency, personal-book isolation + `library_id is null` filter, recursion-free selects, member edit/remove permissions.

- [ ] **Step 2: design-guardian drift review** of the shared card/detail/switcher.

- [ ] **Step 3: Report** PASS/FAIL per case with evidence; clean up all test users/rows; confirm counts restored. Commit test artifacts.

---

## Self-review (against the spec)

- **Coverage:** schema+RLS (T1) · read/merge + `library_id is null` filter (T2) · write branching + ownership (T3) · add-new (T4) · move/merge + idempotency (T5) · switcher + filter tabs (T6) · card + reveal + detail + share toggle (T7) · QA of every spec test case (T8). All spec sections map to a task.
- **No-leak rule:** enforced in T4 (defaults on add), T5 (reset on convert), verified in T8.
- **Reveal invariant:** RLS in T1, toggle in T7, on/off + notes-never verified in T8.
- **Type consistency:** MergedBook shape defined in T2 and consumed unchanged in T3/T6/T7; `toggleOwnership`/`moveBookIntoArchive`/`addBookToArchive`/`setArchiveShareReading` names used consistently.
- **Placeholders:** none — DB/backend steps carry concrete SQL/logic; UI steps carry exact component signatures + the approved mockup reference + design constraints (full JSX is built to the mockup by frontend-dev, following existing single-file patterns).
