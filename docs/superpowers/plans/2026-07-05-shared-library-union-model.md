# Shared Library Union-Model Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Phase 2 "explicit shared shelf" with a union-of-personal-libraries model: an archive shows the merged libraries of its members (deduped by title+author), ratings/progress/notes private with an opt-in reveal, plus a per-book hide.

**Architecture:** Books stay personal (owner-only, marks on the row — pre-Phase-2 behavior). Two `SECURITY DEFINER` views (`archive_shelf`, `archive_reveal`) are the only co-member read path. The client merges own books + the two views into a deduped union. Phase 2's `library_id`/`book_ownership`/`book_personal_state` are migrated off and dropped.

**Tech Stack:** Vite + React (single-file `src/App.jsx`), Tailwind + `ht-*`, Supabase, migrations via the Supabase MCP.

## Global Constraints

- **Spec is authoritative:** `docs/superpowers/specs/2026-07-05-shared-library-union-model-design.md`. Read it before any task.
- **No-leak rule:** `books` stays owner-only; co-members read ONLY via the two views. `archive_shelf` has NO marks columns; `archive_reveal` is gated on the owner's `share_reading`. **Notes are never exposed.**
- **Verification idiom (no unit runner):** every task ends with `npm run build` passing; DB tasks also run `get_advisors(security)`; behavior/RLS validated by qa-tester with real per-user JWTs.
- **Design system (do not drift):** near-black `#0c0714`, fuchsia/pink accents, **cyan = audio only**, sharp corners (`rounded-sm`/`rounded-md`), Cinzel/EB Garamond/Rozha One, themed copy with clear errors. Verdict=swords(`overall`), Smoulder=candles(`smut`).
- **Supabase ref:** `ujxsrcxbhcbihhdluzyl`. Reuse Phase-1 helpers; keep `library_members.share_reading` + its UPDATE policy.
- **Branch:** `union-model-shelf`. Commit per task.

## File structure

- **Supabase (via MCP)** — one migration `shared_library_union_model` (data migrate + teardown + `hidden_from_archives` + 2 views + grants).
- **`src/App.jsx`** — remove Phase 2 shared internals; add the union read model; restyle switcher; rebuild the shared card/detail. New/kept components: `ArchiveSwitcher` (restyle), `WhoHasIt`/`RevealGrid` (rebuilt for union), `MiniAvatar` (keep). Removed: `OwnFormatToggles`, `SharedCardBlock` (folded into the union card), `addBookToArchive`, `moveBookIntoArchive`, `toggleOwnership`, `loadArchiveBooks` (replaced).
- **`tests/`** — qa-tester adds `shared-library-union-model-test-plan.md` + appends `report.md`.

---

### Task 1: Database — migrate off Phase 2, add views (supabase-migrator)

**Files:** Supabase migration `shared_library_union_model` (MCP `apply_migration`); reads via `execute_sql`/`get_advisors`.

**Interfaces:**
- Produces: `books.hidden_from_archives boolean`; views `archive_shelf(library_id,owner_id,book_id,title,author,cover_url,genres,formats,shelf)` and `archive_reveal(library_id,owner_id,book_id,title,author,overall,smut,progress,read)`; dropped `book_ownership`, `book_personal_state`, `books.library_id`.

- [ ] **Step 1: Data-migrate the 6 shared books → personal.** For each `books` row with `library_id is not null`, for EACH owner in `book_ownership`: the creator (`books.user_id`) keeps the row (see step 2 for mark restore); each OTHER owner gets a cloned personal `books` row (`id=gen_random_uuid()`, their `user_id`, same title/author/cover_url/genres, their owned `formats` from `book_ownership`, `shelf='owned'`). Run as SQL via `execute_sql`; verify counts before/after.

- [ ] **Step 2: Restore marks + clear library_id.** For each (book,user) with a `book_personal_state` row, write `overall/smut/read/progress` onto that user's corresponding personal `books` row; for the creator's original row also `set library_id=null`. Unrated owners keep default marks. Verify a couple of rows by hand.

- [ ] **Step 3: Teardown migration** (`apply_migration` `shared_library_union_model`): revert `alter policy "users manage own books" ... using (auth.uid()=user_id) with check (auth.uid()=user_id)`; `drop policy` the 4 `members * shared books` policies on `public.books`; `drop table public.book_ownership`; `drop table public.book_personal_state`; `alter table public.books drop column library_id`.

- [ ] **Step 4: Add column + views** (same migration): `alter table public.books add column hidden_from_archives boolean not null default false;` then the two `create ... view ... with (security_invoker=false)` statements and `revoke all ... from public, anon; grant select ... to authenticated;` — SQL verbatim from the spec's "The secure seam" section.

- [ ] **Step 5: Verify.** `list_tables` (book_ownership/book_personal_state gone; books has no library_id, has hidden_from_archives). `get_advisors(security)`: expect the **two intentional `security_definer_view` WARNs** for `archive_shelf`/`archive_reveal` plus the unchanged pre-existing WARNs — and NO "RLS disabled"/"policy allows all"/new-anon-executable findings. `execute_sql`: `select count(*) from archive_shelf; select count(*) from archive_reveal;` run without error.

- [ ] **Step 6: Done** — DB is remote, no git commit. Report the migration name + before/after counts + advisor delta.

---

### Task 2: Backend — strip Phase 2 code, build the union read model (backend-dev)

**Files:** Modify `src/App.jsx` (locate everything by searching; Phase 2 added it).

**Interfaces:**
- Consumes: Task 1 views.
- Produces:
  - `loadArchiveUnion(uid, libraryId) -> Promise<UnionBook[]>`.
  - **UnionBook** = `{ key, title, author, coverUrl, genres, formats, mineBookId, read, overall, smut, progress, notes, hidden, shelf, owners:[{user_id,username,av,formats,shelf}], reveals:[{user_id,overall,smut,progress,read}] }`. `key = normTitle+'|'+normAuthor` (lowercased, trimmed). `read/overall/smut/progress/notes/hidden/mineBookId` come from MY copy of that title (defaults `false/0/0/{}/[]/false/undefined` if I don't own it).
  - `setHidden(bookId, hidden)`.

- [ ] **Step 1: Remove Phase 2 shared internals.** Delete `loadArchiveBooks`, `addBookToArchive`, `moveBookIntoArchive`, `toggleOwnership`, and the `updateBook` `if (target && target.library_id) { ... }` shared branch (revert `updateBook` to the single personal path). Remove `book_personal_state`/`book_ownership` reads. Remove the `.is('library_id', null)` filter on the personal books fetch (column is gone). Remove `GROUP_KEYS`/`PERSONAL_KEYS` split. Keep `currentLibraryId`/`setCurrentLibraryId`, `archives`, `sharedBooks`/`setSharedBooks`, `shelfBooks`.

- [ ] **Step 2: Implement `loadArchiveUnion(uid, libraryId)`.** Fetch in parallel: my `books` (`.eq('user_id',uid)`); `archive_shelf` (`.eq('library_id',libraryId)`); `archive_reveal` (`.eq('library_id',libraryId)`); roster (`library_members.select('user_id,role') .eq('library_id',libraryId)` then `profiles`+`avatars` by ids — Phase-1 idiom). Build a Map keyed by `key`. Seed from my books (only those NOT `hidden_from_archives`? — MY hidden books DO show to me but must not show to others; the view already excludes them for others, so include all my books here). For each `archive_shelf` row add its `owner_id` to that key's `owners` with `{formats,shelf}` + roster identity. My contribution: if I have the title, I'm an owner with my formats+shelf, and I fill `mineBookId`+marks+notes+hidden. `reveals` from `archive_reveal` rows matched by `key` (or owner_id+title). Return `[...map.values()]`. Defensive on every call.

- [ ] **Step 3: Wire the effect + `setHidden`.** The `[currentLibraryId, session]` effect calls `loadArchiveUnion` and sets `sharedBooks`. Add `const setHidden = async (bookId, hidden) => { setBooks(...optimistic...); const {error}=await supabase.from('books').update({hidden_from_archives:hidden}).eq('id',bookId); ... }` and mirror into `sharedBooks`. `updateBook` unchanged for `notes`/marks (personal path) and now also handles a `hidden` patch key → `books.update({hidden_from_archives})`.

- [ ] **Step 4: Build + QA gate.** `npm run build` passes. qa (Task 4) validates the union/no-leak with real JWTs. Commit: `feat(union): union read model, drop Phase 2 shared internals`.

---

### Task 3: Frontend — switcher, tabs, card, detail, hide (frontend-dev)

**Files:** Modify `src/App.jsx`.

**Interfaces:** Consumes UnionBook (Task 2), `setHidden`, `currentLibraryId`/`archives`.

- [ ] **Step 1: Themed archive-switcher dropdown (#8).** Replace the raw `<select>` in `ArchiveSwitcher` with a custom dropdown (a `ht-display` button + an absolutely-positioned menu of `My Library` + each archive) styled like `ControlsBar` (`rounded-sm`, purple/pink surfaces, no cyan). Same behavior: selecting sets `currentLibraryId` (null = My Library). Close on outside-click/Escape; keyboard-accessible.

- [ ] **Step 2: Filter tabs (#3).** In an archive, tabs are **All · I own · Others own · Wishlist · Read · Unread · 🎧 Audio**. Compute from `UnionBook.owners` + `me`: *I own* = owner me with `shelf==='owned'`; *Others own* = some owner `user_id!==me` with `shelf==='owned'`; *Wishlist* = no owner has `shelf==='owned'`; Read/Unread from `book.read`; Audio from `book.formats.includes('audio')`. Personal-library tabs unchanged.

- [ ] **Step 3: Rebuilt shared card (#6/#7).** For an archive entry render: cover · title · author · **WhoHasIt** (rebuilt: one row per `owners` entry — `MiniAvatar` + name + owned-format glyphs 📖/📱/🎧 audio-cyan, or "wants it" if `shelf==='wishlist'`) · **RevealGrid** (rebuilt: You from `book.overall/smut/progress/read` + each revealed co-member from `book.reveals`, else "hasn't shared"). **Contain the readOnly `Meter`s** so they never overflow the card (wrap in a `min-w-0`/`overflow-hidden` container; size the icons down). In **spine mode**, render a *compact* ownership dot/count only — NOT the full block (that was the #7 misalignment). Personal cards unchanged.

- [ ] **Step 4: Detail + hide toggle.** For an archive entry in `DetailPanel`: show WhoHasIt + RevealGrid. If it's MY book (`mineBookId`): my normal private Verdict/Smoulder/ProgressEditor (unchanged) + a themed **"Hide from shared archives"** switch → `setHidden(mineBookId, on)`. If NOT mine: read-only, with an **"Add to my library"** button that opens the normal AddBook flow prefilled with title/author/cover. **Remove** `OwnFormatToggles`, the archive format-chooser, and the Move-into-archive control. Keep the per-archive "Share my ratings & progress" toggle in `LibraryDetail`.

- [ ] **Step 5: Build + design-guardian + QA gate.** `npm run build` passes; design-guardian confirms no drift. Commit: `feat(union): switcher, wishlist tab, rebuilt card + hide toggle`.

---

### Task 4: QA (qa-tester, real JWTs) + design-guardian

**Files:** Create `tests/shared-library-union-model-test-plan.md`; append `tests/report.md`.

- [ ] **Step 1: Run the spec's QE checklist** with real per-user JWTs (A owner, B member, C outsider; Phase-1 method — create confirmed users via SQL + password-grant; service role only for setup/ground-truth/cleanup). Cover: union + dedup (A+B same title → one entry, both owners; distinct titles unioned), wishlist (wishlist book shows "wants it"; nobody-owns → Wishlist filter), **no-leak** (`archive_shelf` has no marks; B can't read A's marks with `share_reading=false`; reveal on→visible, off→hidden; **notes never** in either view; hidden book absent from both views for B; base `books` owner-only), outsider C sees nothing, personal library unchanged, the 6 migrated books intact.
- [ ] **Step 2: design-guardian** review of the switcher/card/detail (cyan=audio, sharp corners, themed copy, no overflow/misalignment).
- [ ] **Step 3: Report** PASS/FAIL per case + evidence; clean up test users/rows; confirm baseline restored. Commit artifacts.

---

## Self-review (against the spec)

- **Coverage:** migrate+teardown+views+hidden (T1) · union read model + strip Phase 2 + hidden write (T2) · switcher #8 + Wishlist #3 + card #6/#7 + detail hide + add-to-library, removed add/move UI (T3) · QA of every spec test case + design review (T4). All spec sections map to a task.
- **No-leak:** enforced by T1 views (no marks in `archive_shelf`; reveal gated), verified in T4.
- **Type consistency:** `UnionBook` shape defined in T2 and consumed in T3; `loadArchiveUnion`/`setHidden` names consistent; removed symbols (`loadArchiveBooks`/`addBookToArchive`/`moveBookIntoArchive`/`toggleOwnership`/`OwnFormatToggles`) are deleted in T2/T3, not referenced later.
- **Placeholders:** none — DB/backend carry concrete SQL/logic; UI carries exact component behavior + the design system; full JSX built to spec + the approved member-rows mockup by frontend-dev.
