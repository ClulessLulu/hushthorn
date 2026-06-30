# Shared Library Feature — Implementation Spec

**Status:** Designed, not yet built. Hand this to Claude Code as the spec for
a new feature: letting a user share a library with friends/partners so
everyone can see the same shelf and who owns a copy of each book.

**Feature in one line:** A group (2+ people) shares one library. Every book
shows who owns it — "You own," "They own," "Both own," or "Neither (shared
wishlist)." Reading progress, ratings (Verdict/Smoulder), and notes stay
private to each person even on a shared book.

**Reference UI prototype:** see `prototype/hushthorn-shared-library.jsx`
(or wherever the prototype files live in this repo) for the chosen ownership-
badge UI, filter tabs (All / You own / They own / Both own / Neither), and
the mock data shape it expects. Build toward that UI; the badges map directly
to `book_ownership` rows below.

**Why this model, not "two libraries side by side":** an earlier prototype
compared two separate private libraries (a diff view: both-own/only-you/only-
them). That was rejected in favor of this one — one shared shelf is the
better fit for couples/friends who think of their books as a single
collection, while still needing to know whose physical copy is whose.

---

## Model: co-owned household library. A group of any size shares one shelf.
Every book is a single shared row (title, author, cover, genres, shelf status,
ownership tags) that any member can add or edit. Read status, progress, and
ratings/notes stay **personal per member**, even on a shared book.

## Why this shape (the seam)

Two different trust models live in one feature:
- **Group-visible, group-editable:** title, author, cover, genres, shelf
  (owned/wishlist at the *library* level), and *who owns a copy*.
- **Private to the individual, even within the shared book:** read/unread,
  per-format progress, Verdict (`overall`), Smoulder (`smut`), and notes.

Trying to keep both in one `books` row (today's shape: one row per book,
`user_id`-owned) doesn't work once two people touch the same book — whoever
edits last overwrites the other's rating. So a shared book becomes a `book`
row that's not user-owned at all, but *library*-owned, with personal data
split into its own table keyed by `(book_id, user_id)`.

## Schema

```sql
-- A group. Personal libraries need no row here — absence of library_id
-- on a book means "this user's solo book," preserving all existing data.
create table libraries (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- e.g. "Me & Maeve's Archive"
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Membership. A user can belong to multiple libraries (e.g. one with a
-- partner, one with a book club).
create table library_members (
  library_id uuid not null references libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

-- Invites: short-lived codes, not direct user-to-user grants, so you don't
-- need to know someone's internal ID to invite them.
create table library_invites (
  code text primary key default substr(md5(random()::text), 1, 8),
  library_id uuid not null references libraries(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 1,
  use_count int not null default 0
);

-- EXISTING `books` table gains one nullable column. NULL = personal book,
-- unchanged behavior. Non-null = this book belongs to a shared library.
alter table books add column library_id uuid references libraries(id);

-- Per-book, per-member ownership tags. A book can have 0, 1, or N owner rows
-- (N members can each own a copy). This is what renders "You own / They
-- own / Both own / Neither" in the UI.
create table book_ownership (
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  format text not null default 'print' check (format in ('print','ebook','audio')),
  created_at timestamptz not null default now(),
  primary key (book_id, user_id, format)
);

-- Personal facts on a shared book: read status, progress, ratings. One row
-- per (book, user). For a personal (non-shared) book, this table is unused —
-- those fields stay directly on `books` as today, to avoid touching existing
-- data/queries for the common case.
create table book_personal_state (
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read boolean not null default false,
  overall int check (overall between 0 and 5),     -- Verdict
  smut int check (smut between 0 and 5),            -- Smoulder
  progress jsonb,                                   -- same shape as today's per-format progress
  updated_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

-- `notes` already has user_id; for shared books, scope is enforced by RLS
-- below — no schema change needed, notes are already per-author.
```

### Why an `invite code` table instead of "share by email"

Inviting by raw user ID/email either leaks whether an email has an account or
requires a lookup table that's itself a privacy surface. A random code the
owner shares out-of-band (text, link) sidesteps both, expires on its own, and
is trivial to revoke (delete the row).

## RLS policies

```sql
alter table libraries enable row level security;
alter table library_members enable row level security;
alter table library_invites enable row level security;
alter table book_ownership enable row level security;
alter table book_personal_state enable row level security;

-- libraries: visible to members only
create policy "members can read their libraries"
  on libraries for select
  using (id in (select library_id from library_members where user_id = auth.uid()));

create policy "members can create libraries"
  on libraries for insert
  with check (created_by = auth.uid());

-- library_members: visible to other members of the SAME library (so you can
-- see who's in your shared library), but never across libraries you're not in.
create policy "members can see co-members"
  on library_members for select
  using (library_id in (select library_id from library_members where user_id = auth.uid()));

create policy "users can join via accepted invite only"
  on library_members for insert
  with check (user_id = auth.uid());
  -- actual invite validation happens in a SECURITY DEFINER function (see below),
  -- not by trusting the client to supply a valid library_id directly.

-- books: existing owner-only policy stays for user_id IS NOT NULL rows.
-- ADD a second policy, additive (OR'd), scoped strictly to library members:
create policy "library members can read shared books"
  on books for select
  using (
    library_id is not null
    and library_id in (select library_id from library_members where user_id = auth.uid())
  );

create policy "library members can write shared books"
  on books for insert with check (
    library_id is null  -- personal books: existing rule applies elsewhere
    or library_id in (select library_id from library_members where user_id = auth.uid())
  );

create policy "library members can update shared books"
  on books for update using (
    library_id in (select library_id from library_members where user_id = auth.uid())
  );
  -- Note: this intentionally allows any member to edit shared core fields
  -- (title/genres/shelf), per the "anyone can edit" decision. It does NOT
  -- grant access to book_personal_state or notes — those have their own
  -- policies below and are never widened by this one.

-- book_ownership: members of the book's library can read all ownership tags
-- (that's the whole point — seeing who owns what) but can only write their OWN.
create policy "library members read ownership tags"
  on book_ownership for select
  using (
    book_id in (
      select id from books where library_id in (
        select library_id from library_members where user_id = auth.uid()
      )
    )
  );

create policy "users manage only their own ownership tag"
  on book_ownership for insert with check (user_id = auth.uid());
create policy "users delete only their own ownership tag"
  on book_ownership for delete using (user_id = auth.uid());

-- book_personal_state: STRICTLY owner-only, even on a shared book. This is
-- the privacy boundary the whole feature depends on — never OR this with a
-- library-membership clause.
create policy "personal state is private to its owner"
  on book_personal_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notes: existing user_id-owner policy is UNCHANGED and sufficient — notes
-- were already personal, sharing a book doesn't widen who can read them.
```

### The one rule that must never be violated

> `book_personal_state` and `notes` policies are evaluated independently of
> library membership. **Never add an `OR library_id in (...)` clause to either
> policy.** That's the line between "we share a shelf" and "we share our
> diaries." If a future feature wants to reveal a rating (e.g. an opt-in
> "show my Verdict to the group" toggle), it must be a deliberate new policy
> with its own opt-in column — not a widening of the existing one.

## Invite flow (why a function, not a direct insert)

Letting the client `insert` into `library_members` directly, gated only by
`user_id = auth.uid()`, would let anyone insert themselves into ANY
`library_id` they can guess — UUIDs are unguessable in practice, but "in
practice" isn't a security boundary. Validate the invite server-side:

```sql
create or replace function accept_library_invite(invite_code text)
returns uuid  -- returns the library_id on success
language plpgsql security definer
as $$
declare
  v_library_id uuid;
begin
  select library_id into v_library_id
  from library_invites
  where code = invite_code
    and expires_at > now()
    and use_count < max_uses;

  if v_library_id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into library_members (library_id, user_id)
  values (v_library_id, auth.uid())
  on conflict do nothing;

  update library_invites set use_count = use_count + 1 where code = invite_code;

  return v_library_id;
end;
$$;
```

Client calls this via `supabase.rpc('accept_library_invite', { invite_code })`
— never inserts into `library_members` directly for the join path.

## Client-side shape (mirrors the prototype)

```js
// Fetching the shared shelf with per-book ownership, merged client-side:
const { data: books } = await supabase
  .from('books')
  .select('*, book_ownership(user_id, format)')
  .eq('library_id', currentLibraryId);

// Ownership badge logic (matches OwnerMark in the prototype):
function ownerBadge(book, myUserId, partnerUserId) {
  const owners = new Set(book.book_ownership.map(o => o.user_id));
  const y = owners.has(myUserId), t = owners.has(partnerUserId);
  if (y && t) return "both";
  if (y) return "you";
  if (t) return "them";
  return "none"; // shared wishlist
}

// Personal state (read/progress/ratings) fetched separately, per current user:
const { data: mine } = await supabase
  .from('book_personal_state')
  .select('*')
  .eq('user_id', myUserId)
  .in('book_id', books.map(b => b.id));
```

The UI merges `books` + `book_ownership` + the current user's
`book_personal_state` into the same in-memory shape the prototype already
uses (`{ ...book, read, overall, smut, progress }` for *me*), so most existing
components (`Spine`, cards, `ProgressEditor`) need zero changes — they just
get fed merged data instead of a flat row.

## Required test cases (QE checklist)

- [ ] User A in library L1 cannot read books where `library_id` is L2 (a
      library they're not a member of), even with a guessed UUID.
- [ ] User A can read `book_personal_state` rows only where `user_id = A` —
      confirm by attempting to select B's row directly via the API with A's
      session token; must return zero rows, not an error (RLS silently filters).
- [ ] User A can read all `book_ownership` rows for books in a shared library,
      but can only `insert`/`delete` rows where `user_id = A`.
- [ ] Editing a shared book's title as User B is visible to User A on next
      fetch (confirms "anyone can edit" works) — but B editing the book does
      NOT alter A's `book_personal_state` row (confirms the split holds).
- [ ] An expired or fully-used invite code fails `accept_library_invite`
      with a clear error, and does not create a `library_members` row.
- [ ] Removing a member from `library_members` immediately revokes their
      `select` on that library's books (test by re-querying with their token
      after deletion — should return empty, not cached/stale).
- [ ] A personal (non-shared) book — `library_id is null` — is completely
      unaffected by any of the above; existing owner-only behavior holds
      exactly as before this feature shipped.
- [ ] Two members editing the same book's genres concurrently: last-write-wins
      is acceptable (document this), but confirm no row corruption/partial write.

## Migration notes

- This is purely additive: one nullable column on `books`, three new tables,
  one new RLS policy pair on `books` (OR'd with existing), and two fully new
  tables' worth of policies. No existing data, query, or policy is modified.
- Apply via Supabase MCP, in the order above (libraries → members → invites →
  books.library_id → ownership → personal_state), since later tables
  reference earlier ones.
- Existing solo users are unaffected until they create or join a library —
  `library_id` stays null on every book they already have.

## Where this file lives

Suggested path: `docs/SHARED_LIBRARY_SPEC.md`, alongside `docs/PROTOTYPE_SPEC.md`.
Add a pointer line to `CLAUDE.md`'s "Features to add" section (or wherever
this repo tracks upcoming work) so Claude Code finds it without being told
each session, e.g.:

> **Shared/household libraries** — see `docs/SHARED_LIBRARY_SPEC.md` for full
> schema, RLS policies, and test cases. Reference UI: `prototype/hushthorn-
> shared-library.jsx`. Key invariant: `book_personal_state` and `notes`
> policies must never be OR'd with library membership — ratings/notes stay
> private even on a shared book.

