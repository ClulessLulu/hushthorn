# Shared Library — Phase 2 Design (Shared shelf + ownership + private reading state)

**Status:** Approved 2026-06-30, ready to build.
**Builds on:** [Phase 1](2026-06-29-shared-library-phase1-design.md) (identity + membership, live) and
[`SHARED_LIBRARY_SPEC.md`](../../../SHARED_LIBRARY_SPEC.md).
**Reference UI:** [`prototype/hushthorn-shared-library.jsx`](../../../prototype/hushthorn-shared-library.jsx)
(ownership filter tabs) + the approved member-rows card mockup from brainstorming.

Phase 2 makes shared archives hold **actual books**: a shared shelf where every book
shows **who owns which edition**, while each person's ratings, progress, and notes stay
**private** — with a deliberate per-archive opt-in to reveal ratings/progress (never notes).
This folds in what was originally slated as Phase 3 (per-person state), because a shared
book isn't usable without it.

## Decisions locked (design Q&A, 2026-06-30)

| Decision | Choice |
|---|---|
| Scope | Full shared books — per-person state included (old Phase 2 + Phase 3) |
| Reveal | Per-archive opt-in (`library_members.share_reading`); **notes never revealed** |
| Navigation | Archive switcher on the existing shelf (reuses grid/spine/sort/search) |
| Adding books | Add-new **and** move-in, merging into an existing shared title as a co-owner |
| Ownership grain | **Per-format** (print/ebook/audio) |
| Shared card | Member rows ("Who has it") + aligned "Ratings & progress" reveal grid |

## The one rule that must never break

> A shared `books` row is readable by every member, so it **must not carry anyone's
> personal marks**. `overall`/`smut`/`progress`/`read` on a shared row are ignored;
> each person's marks live only in `book_personal_state`. When a personal book becomes
> shared, migrate its owner's marks into their `book_personal_state` row and **reset
> those columns on the `books` row to defaults**. This is the core privacy guarantee of
> Phase 2, alongside the Phase 1 invariant that `book_personal_state`/`notes` are never
> `OR`'d with plain library membership.

---

## Schema

```sql
-- shared books get a library; NULL = personal (unchanged behaviour)
alter table public.books add column library_id uuid references public.libraries(id);

-- per (book, member, format) ownership — drives "Who has it"
create table public.book_ownership (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  format  text not null check (format in ('print','ebook','audio')),
  created_at timestamptz not null default now(),
  primary key (book_id, user_id, format)
);

-- per (book, member) PRIVATE reading state on a shared book
create table public.book_personal_state (
  book_id  uuid not null references public.books(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  read     boolean not null default false,
  overall  int check (overall between 0 and 5),  -- Verdict
  smut     int check (smut between 0 and 5),      -- Smoulder
  progress jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

-- per-archive reveal opt-in
alter table public.library_members add column share_reading boolean not null default false;
```

Notes:
- `books.user_id` stays NOT NULL and is set to the **creator** on a shared book (provenance).
  Access is governed by the library policies below, not `user_id`. The personal shelf query
  must therefore filter `library_id is null` (see Read model) so a creator's shared books
  don't leak into their personal library.
- `books.formats` remains the group-level union of editions that exist for the book; when a
  member tags ownership of a format not yet in `formats`, add it so `ProgressEditor` shows
  that format's row.

## RLS policies

Reuses the Phase 1 SECURITY DEFINER helper `my_library_ids()` (no new recursion-prone
policies, no new functions).

```sql
alter table public.book_ownership      enable row level security;
alter table public.book_personal_state enable row level security;

-- books: existing owner-only policies stay for personal (library_id IS NULL) rows.
-- ADD member access for shared rows (additive / OR'd).
create policy "members read shared books" on public.books
  for select using (library_id is not null and library_id in (select public.my_library_ids()));
create policy "members insert shared books" on public.books
  for insert with check (library_id is not null and library_id in (select public.my_library_ids()));
create policy "members update shared books" on public.books
  for update using (library_id is not null and library_id in (select public.my_library_ids()))
          with check (library_id is not null and library_id in (select public.my_library_ids()));
create policy "members delete shared books" on public.books
  for delete using (library_id is not null and library_id in (select public.my_library_ids()));
  -- any member may remove a shared book from the archive (group action; UI confirms).

-- CRITICAL (added after real-JWT QA caught it): the pre-existing personal-books
-- policy is FOR ALL and checks only user_id. Left as-is it is OR'd at INSERT with the
-- member policy, so a NON-member could POST a book with any library_id (their own
-- user_id satisfies the personal policy) and inject it into any archive. Scope the
-- personal policy to personal rows so shared writes are governed solely by the member
-- policies above. (The move-in convert still works: the flip's WITH CHECK on the new
-- library_id-bearing row is satisfied by "members update shared books".)
alter policy "users manage own books" on public.books
  using      (auth.uid() = user_id and library_id is null)
  with check (auth.uid() = user_id and library_id is null);

-- book_ownership: members read all tags for their libraries' books; write only their own.
create policy "members read ownership" on public.book_ownership
  for select using (
    book_id in (select id from public.books where library_id in (select public.my_library_ids()))
  );
create policy "users insert own ownership" on public.book_ownership
  for insert with check (
    user_id = auth.uid()
    and book_id in (select id from public.books where library_id in (select public.my_library_ids()))
  );
create policy "users delete own ownership" on public.book_ownership
  for delete using (user_id = auth.uid());

-- book_personal_state: strict owner-only for everything (the Phase 1 invariant) ...
create policy "own personal state" on public.book_personal_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ... PLUS one deliberate, SELECT-only opt-in reveal, gated by the owner's per-archive
-- share_reading. This is a separate policy, never an OR bolted onto the strict one.
create policy "co-members read shared personal state (opt-in)" on public.book_personal_state
  for select using (
    exists (
      select 1 from public.books b
      join public.library_members me    on me.library_id = b.library_id and me.user_id = auth.uid()
      join public.library_members owner on owner.library_id = b.library_id
                                       and owner.user_id = book_personal_state.user_id
      where b.id = book_personal_state.book_id and owner.share_reading = true
    )
  );

-- notes: UNCHANGED owner-only. Never revealed, even with share_reading on.

-- library_members: `share_reading` is written by the per-archive reveal toggle, but
-- Phase 1 gave this table only SELECT + DELETE policies — so the UPDATE silently
-- matched 0 rows (PostgREST returns 200) and the reveal never turned on. Add UPDATE,
-- but restrict it to the OWNER's own row AND — via a column grant — to the
-- `share_reading` column only. A plain `using (user_id = auth.uid())` would also let a
-- member set their own `role = 'owner'` (privilege escalation); the column grant blocks
-- that before RLS is evaluated. (Added after real-JWT QA caught the dead toggle.)
revoke update on public.library_members from authenticated, anon;
grant  update (share_reading) on public.library_members to authenticated;
create policy "members update own share_reading" on public.library_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

After applying, run `get_advisors(security)` — expect no new findings (RLS enabled on both
new tables; no new SECURITY DEFINER functions).

## Read model (src/App.jsx)

- **Personal shelf** stays `books where user_id = uid` **AND `library_id is null`** (the new
  filter keeps shared books out of the personal library).
- **Archive switcher** state `currentLibraryId` (null = personal). On switch to an archive,
  fetch and merge:
  ```js
  books        where library_id = L
  book_ownership for those book_ids            // member×format, all members (read policy)
  book_personal_state for those book_ids       // returns MINE (owner policy) + revealed
                                               // co-members (opt-in policy), split by user_id
  ```
- **Merge into the existing in-memory book shape** so `Meter`/`ProgressEditor`/`CardProgress`/
  spine need no change. For a shared book:
  `{ ...groupFields, library_id, read/overall/smut/progress = MY personal_state (defaults if none),
     ownership:[{user_id,format}], reveals:[{user_id,username,overall,smut,progress,read}] }`.
  The "Who has it" + reveal block renders only when `library_id` is set.

## Write model — `updateBook` branches on `library_id`

- **Personal book** (`library_id` null) → today's path (the `books` row). Untouched.
- **Shared book** →
  - Verdict / Smoulder / read / progress → upsert **my `book_personal_state`** (private).
  - Group fields (title/author/cover/genres/formats) → the `books` row (members may edit).
  - "I own" format toggles → insert/delete **my `book_ownership`** rows (and ensure the
    format is present in `books.formats`).

## UX (src/App.jsx)

- **Archive switcher** near the library header: `My Library ▾ · ♥ Me & Maeve's · 📖 Book Club`.
  Switching swaps the shelf; **Inscribe** adds to the selected context. Defaults to personal.
- **Filter tabs adapt inside an archive**: the personal `Owned/Wishlist` tabs become ownership
  filters — **All · I own · Others own · Nobody (wishlist)** — keeping **Read/Unread** (from my
  private state) and **🎧 Audio**.
- **Ownership → shelf derivation**: a shared book with ≥1 owner reads as "owned"; **0 owners =
  the shared wishlist** ("Neither"). No separate owned/wishlist toggle on shared books.
- **Shared card** (approved mockup): "Who has it" = one row per member (avatar · name · owned
  format glyphs, audio cyan; or "wants it"); "Ratings & progress" = an aligned grid — you always
  see your own marks, co-members appear only if they enabled sharing for the archive, others read
  "hasn't shared." Notes never appear.
- **Detail panel (shared book)**: per-format "I own" toggles → ownership; my Verdict/Smoulder/
  progress editors → my private state; the "Who has it" roster + reveal grid; my notes stay
  private. "Remove" deletes the shared book from the archive (group action; confirm) — to drop
  just your copy, untick your "I own" formats.
- **Shared Archives panel (Phase 1) gains** a per-archive **"Share my ratings & progress in this
  archive"** toggle → `library_members.share_reading`.
- **Add-new**: Inscribe in an archive creates a shared book (`library_id` set, `user_id`=creator)
  and asks which formats you own → your `book_ownership` rows.
- **Move-in / merge**: a personal book's detail gets "Move into a shared archive" → pick one.
  - **Title not present** in the archive → convert the row in place: set `library_id`, migrate
    your marks (`overall/smut/progress/read`) into your `book_personal_state`, **reset those
    columns on the row to defaults**, create your `book_ownership` for the book's formats.
  - **Title already present** (case-insensitive, within that `library_id`) → **merge**: don't
    duplicate — add your `book_ownership`, migrate your marks into your `book_personal_state` on
    the existing shared row, re-point your `notes.book_id` to the shared book, delete your
    personal row.

## Build sequence

1. **supabase-migrator** — schema + RLS above; verify with `get_advisors`.
2. **backend-dev** — the read/merge fetch, `updateBook` branching, and the add-new /
   move-in / merge data operations (mark migration, case-insensitive merge dedupe, note
   re-pointing). This is the riskiest layer — pair with **parser-qe** for the merge/idempotency
   tests.
3. **frontend-dev** — archive switcher, adapted filter tabs, the shared card (member rows +
   reveal), the shared detail panel (I-own toggles + reveal), the add-new format prompt, the
   move-in UI, and the per-archive share toggle.
4. **design-guardian** + **qa-tester** — drift review (cyan=audio, sharp corners, themed copy)
   and full multi-account QA (real per-user JWTs, as in Phase 1).

## Test cases (QE bar)

**Privacy / no-leak (the headline)**
- [ ] Converting a *rated* personal book to shared resets `overall/smut/progress/read` on the
      `books` row to defaults; a co-member reading the shared row sees **no** rating.
- [ ] A co-member **cannot** read my `book_personal_state` when my `share_reading = false`
      (0 rows); **can** when `true`. Toggling it flips visibility immediately.
- [ ] `notes` are **never** returned to a co-member, even with `share_reading = true`.

**Ownership (per-format)**
- [ ] I own print+audio, a co-member owns ebook → `book_ownership` + badges reflect exactly.
- [ ] I can insert/delete only my **own** ownership rows, not another member's.
- [ ] Tagging ownership of a format adds it to `books.formats` if missing.
- [ ] 0 owners → book reads as wishlist ("Nobody"); ≥1 owner → owned (derivation).

**Move-in / merge (idempotency + correctness)**
- [ ] Move a rated personal book into an archive **without** that title → row converted,
      marks migrated to my private state, row columns reset, my ownership created, notes kept.
- [ ] Move a personal book into an archive that **already has** that title → merge: no
      duplicate row; my ownership added; my marks migrated to my private state; my notes
      re-pointed; my personal row deleted.
- [ ] **Idempotent**: repeating a move/merge doesn't duplicate ownership (PK), personal_state
      (upsert), or notes (fingerprint dedupe).
- [ ] Edge: moving a book with no formats defaults to print ownership; moving an unrated book
      creates no bogus personal_state.

**Isolation / read model**
- [ ] A personal (`library_id is null`) book is completely unaffected — still owner-only,
      marks on the row, absent from any archive.
- [ ] The personal shelf query excludes shared books (`library_id is null` filter).
- [ ] Selecting shared books / ownership / personal_state as a member is **recursion-free**.

**Permissions**
- [ ] Any member can edit a shared book's group fields (title/genres) and add/remove shared
      books; concurrent edits are last-write-wins with no row corruption.

## Deferred (not Phase 2)

- Blind-until-you-rate reveals (hide a co-member's rating until you've logged your own).
- Separate toggles for revealing ratings vs. progress (one `share_reading` covers both for now).
- Per-format ownership on the **spine** view beyond a simple indicator (grid is the primary
  shared view; spine still renders shared books, ownership detail on open).
