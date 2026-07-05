# Shared Library — Union Model Redesign

**Status:** Approved 2026-07-05, ready to build. **Supersedes the Phase 2 "explicit shared
shelf" model** (docs/superpowers/specs/2026-06-30-shared-library-phase2-design.md) after
manual testing: the explicit add/move-in shelf is replaced by an automatic union of
members' personal libraries.

**Builds on:** Phase 1 (identity + membership, live: `profiles`, `libraries`,
`library_members`, `library_invites`).

## What changes and why

Manual testing showed the explicit "add books to the archive / move-in" model was the
wrong UX. New model: **an archive is a lens that merges its members' personal libraries** —
every member's books show up automatically, tagged with who owns which edition. This is
*simpler* than Phase 2: there are no "shared books," so `books.library_id`,
`book_ownership`, and `book_personal_state` all go away.

## Decisions locked (design Q&A, 2026-07-05)

| Decision | Choice |
|---|---|
| Shelf model | Union of members' personal libraries, deduped by **title + author** (case-insensitive) |
| Exposure | Share all books by default; a per-book **"hide from shared archives"** toggle |
| Ownership | "Has the book" = owns it; a book on your *wishlist* shelf = you *want* it |
| Ratings/progress/notes | Stay **private** on your own book row; per-archive opt-in **reveal** (kept from Phase 2) |
| Removed | add-to-archive, move-in, the format chooser, `library_id`/ownership/personal-state plumbing |

## The model

- **An archive = a Phase 1 group** (libraries/members/invites/usernames unchanged).
- **The shared shelf = the union of members' personal libraries.** Dedup by normalized
  `title + author`. If A and B both have *Fourth Wing*, it's one entry owned by both, each
  showing their own `formats`.
- **Ownership = having the book.** Owned shelf → owns it; wishlist shelf → wants it. A title
  where everyone who has it has it on wishlist = the shared **Wishlist** ("nobody owns").
- **Per-format** falls out for free: each owner's book carries its own `formats`.
- **Private by default:** co-members see title/author/cover/genres/who-has-it, **never** your
  `overall`/`smut`/`progress`/`read`/notes — unless you enable the per-archive reveal.
- **Per-book hide:** `hidden_from_archives` removes a book from the union entirely (metadata
  *and* reveal).

## Schema

```sql
-- ADD: the per-book hide flag.
alter table public.books add column hidden_from_archives boolean not null default false;
```

### The secure seam — two SECURITY DEFINER views

The base `books` table stays **owner-only** (marks never leave your own row). The ONLY way a
co-member reads your books is through these two read-only views, which structurally cannot
leak marks (the shelf view has no marks columns) and are gated by co-membership.

```sql
-- Co-members' shareable book metadata (NO marks columns exist here).
create or replace view public.archive_shelf
with (security_invoker = false) as
  select m_owner.library_id, b.user_id as owner_id, b.id as book_id,
         b.title, b.author, b.cover_url, b.genres, b.formats, b.shelf
  from public.books b
  join public.library_members m_owner on m_owner.user_id = b.user_id
  join public.library_members m_me
    on m_me.library_id = m_owner.library_id and m_me.user_id = auth.uid()
  where b.hidden_from_archives = false
    and b.user_id <> auth.uid();   -- co-members only; the caller adds their own books

-- Co-members' MARKS, only where that owner opted into sharing for the library.
create or replace view public.archive_reveal
with (security_invoker = false) as
  select m_owner.library_id, b.user_id as owner_id, b.id as book_id, b.title, b.author,
         b.overall, b.smut, b.progress, b.read
  from public.books b
  join public.library_members m_owner
    on m_owner.user_id = b.user_id and m_owner.share_reading = true
  join public.library_members m_me
    on m_me.library_id = m_owner.library_id and m_me.user_id = auth.uid()
  where b.hidden_from_archives = false
    and b.user_id <> auth.uid();

revoke all on public.archive_shelf, public.archive_reveal from public, anon;
grant select on public.archive_shelf, public.archive_reveal to authenticated;
```

Notes:
- `security_invoker = false` (definer) is deliberate: the view runs with its owner's rights
  (bypassing base-table RLS) and its `WHERE` clause is the security boundary. `auth.uid()`
  still resolves to the **caller** (it reads the request JWT), so each caller sees only their
  own co-members. **`notes` never appear in either view.**
- This will raise a `security_definer_view` advisor WARN — **expected and intentional.** A
  `security_invoker` view + a co-member RLS policy on `books` would be *unsafe* (RLS is
  row-level, so it would grant full-row reads and leak marks to a direct query). The definer
  view keeps `books` owner-only and makes the view the only, column-limited, co-member path.

### Teardown of the Phase 2 apparatus (after data migration below)

```sql
-- revert the Phase 2 books policy scoping (library_id is going away)
alter policy "users manage own books" on public.books
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy "members read shared books"   on public.books;
drop policy "members insert shared books" on public.books;
drop policy "members update shared books" on public.books;
drop policy "members delete shared books" on public.books;

drop table public.book_ownership;         -- cascades its policies
drop table public.book_personal_state;    -- cascades its policies
alter table public.books drop column library_id;
```

**Keep:** `libraries`, `library_members`, `library_invites`, `profiles`,
`library_members.share_reading`, the Phase-1 `my_library_ids()`/`is_library_owner()` helpers,
and the Phase-2 `"members update own share_reading"` policy (still drives the reveal toggle).

### Data migration (the 6 test shared books)

Before the teardown, convert existing shared books back to personal so nothing is lost. For
each `books` row with `library_id is not null`, for **each** owner in `book_ownership`:
restore that owner's marks from their `book_personal_state` row onto a personal `books` row
they own (the creator keeps the original row with `library_id` cleared; any *other* owner
gets a cloned personal row with their formats + marks). Unrated owners get default marks.
Then run the teardown. (Live count: 6 shared books / 6 ownership / 8 personal-state rows.)

## Read model (src/App.jsx)

- **Personal library** (no archive selected): `books where user_id = me` — the Phase 2
  `.is('library_id', null)` filter is removed with the column. Behavior returns to pre-Phase-2.
- **Archive view** (archive `L` selected) — fetch in parallel, merge client-side:
  - my `books` (full, with my private marks),
  - `archive_shelf` where `library_id = L` (co-members' shareable books),
  - `archive_reveal` where `library_id = L` (co-members' opted-in marks),
  - the roster (`library_members` + `profiles` + `avatars`, Phase-1 idiom).
  - **Dedup by `norm(title)|norm(author)`** into union entries:
    ```
    { key, title, author, coverUrl, genres, formats(union),
      mineBookId?, read, overall, smut, progress, notes, hidden,   // from MY copy; defaults if I lack it
      owners:  [{ user_id, username, av, formats, shelf }],        // everyone who has it (me + co-members)
      reveals: [{ user_id, overall, smut, progress, read }] }      // co-members who shared
    ```
  - **"Who has it"** = `owners` (each shelf: owned → formats; wishlist → "wants it").
  - Filter tabs compute from `owners`: *I own* (me, shelf owned) · *Others own* (a co-member,
    shelf owned) · *Wishlist* (no owner is shelf=owned) · Read/Unread (my copy) · Audio.

## Write model

- **Marks stay on your own `books` row, owner-only** — unchanged from the personal path;
  `book_personal_state` is gone.
- **`hidden_from_archives`** toggled via `updateBook` (a normal group-ish field on your own
  book): `supabase.from('books').update({ hidden_from_archives }).eq('id', myBookId)`.
- **`updateBook` no longer branches on `library_id`** (the column is gone) — it reverts to the
  single personal path for every book. Ownership toggles / `addBookToArchive` /
  `moveBookIntoArchive` are removed.

## UI (src/App.jsx)

- **Archive switcher** stays, but **#8: replace the raw `<select>`** with a themed dropdown
  (button + menu) matching the `ControlsBar` controls (Cinzel, `rounded-sm`, purple/pink; no
  cyan). It sets `currentLibraryId`.
- **Filter tabs (archive):** All · I own · Others own · **Wishlist** (#3) · Read · Unread · 🎧 Audio.
- **Shared card, rebuilt** (fixes **#6** meter-overflow + **#7** cover/spine alignment): cover ·
  title · author · **Who has it** (member avatar + username + owned-format glyphs, audio cyan;
  or "wants it") · **reveal grid** (You from my copy + revealed co-members; "hasn't shared"
  otherwise). Contain the readOnly meters so they don't overflow. **Spine mode** shows the
  union titles with a *compact* ownership hint only (the full block was the alignment culprit).
- **Detail (an archive entry):** Who-has-it + reveal. If it's **my** book → my normal private
  rating/progress editors + a **"Hide from shared archives"** toggle. If I don't own the title
  (co-member only) → read-only, with an "Add to my library" affordance (adds to my personal
  library via the normal flow). **Removed:** "I own" format toggles, format chooser,
  Move-into-archive.
- **Adding books** always targets your own library via the normal flow (search/scan/Oracle);
  it appears in archives automatically. (This is what removes issues #1, #2, #4.)
- **Per-archive "Share my ratings & progress"** toggle stays (Phase-1 `LibraryDetail`), driving
  `archive_reveal`.

## Migration order

1. **Data migrate** the 6 shared books → personal (per owner, restoring marks).
2. **Teardown:** revert books policy, drop the 4 shared-books policies, drop `book_ownership` +
   `book_personal_state`, drop `books.library_id`.
3. **Add** `books.hidden_from_archives`.
4. **Create** `archive_shelf` + `archive_reveal` views + grants.
5. `get_advisors(security)` — expect exactly the two intentional `security_definer_view` WARNs
   (documented), no other new findings.

## Test cases (QE bar — real-JWT, as in Phase 2)

**Union + ownership**
- [ ] A (owns *Fourth Wing* print+audio) and B (owns *Fourth Wing* ebook) in one archive → both
      see ONE *Fourth Wing* entry, owners = {A: print+audio, B: ebook}.
- [ ] A book on A's *wishlist* shows in the archive as "A wants it," not owned; a title nobody
      owns lands in the **Wishlist** filter.
- [ ] A book only A has appears for B (and vice-versa); union count = A's + B's distinct titles.

**Privacy / no-leak (headline)**
- [ ] B querying `archive_shelf` gets A's book metadata but the view has **no marks columns**;
      B cannot read A's `overall/smut/progress/read` anywhere while A's `share_reading = false`.
- [ ] After A sets `share_reading = true`, B sees A's marks via `archive_reveal`; toggling off
      hides them again. **Notes never appear** in either view, sharing on or off.
- [ ] A book with `hidden_from_archives = true` appears in NEITHER `archive_shelf` nor
      `archive_reveal` for co-members (but is normal in A's own library).
- [ ] The base `books` table remains owner-only: B directly querying `books` for A's rows → 0.

**Isolation / regression**
- [ ] Outsider C (non-member) gets nothing from either view (0 rows).
- [ ] Personal library (no archive) is unchanged; a solo user is unaffected.
- [ ] The 6 migrated books are intact as personal books with their owners' marks restored; the
      Phase-2 tables/column are gone; `get_advisors` shows only the 2 intended definer-view WARNs.

## Build sequence

1. **supabase-migrator** — data migration + teardown + `hidden_from_archives` + the two views + grants; verify advisors.
2. **backend-dev** — rebuild the read model (archive fetch + union/dedup merge), strip `updateBook` branching / ownership / add-to-archive / move-in, add the `hidden_from_archives` write.
3. **frontend-dev** — themed switcher dropdown (#8), Wishlist tab (#3), rebuilt shared card + contained meters + spine hint (#6/#7), detail hide-toggle + "add to my library", remove the dead archive-add/move UI.
4. **design-guardian** + **qa-tester** (real-JWT, the checklist above).
