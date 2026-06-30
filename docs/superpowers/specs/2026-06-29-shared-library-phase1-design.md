# Shared Library — Phase 1 Design (Identity + Membership plumbing)

**Status:** Approved 2026-06-29, ready to build.
**Parent spec:** [`SHARED_LIBRARY_SPEC.md`](../../../SHARED_LIBRARY_SPEC.md) (full feature).
**Reference UI:** [`prototype/hushthorn-shared-library.jsx`](../../../prototype/hushthorn-shared-library.jsx) (Phase 2's shelf — not built here).

This is **Phase 1 of a phased rollout.** It ships a usable, testable slice with
**no books involved yet**: usernames, create a library, invite by code, join,
see members, leave. The shared *shelf*, ownership badges, and per-person
ratings/progress are **Phases 2 & 3** (separate specs).

## Decisions locked (design Q&A, 2026-06-29)

| Decision | Choice |
|---|---|
| Delivery | Phased horizontal; this is Phase 1 |
| Identity | A `username` chosen at sign-up (new `profiles` table). The ONE identity. `avatars.name` retired as identity. |
| Group size | N members per library |
| Permissions | Any member invites; owner-only remove/rename/delete; any member can leave |
| Invites | Reusable codes, shared out-of-band. Never a username/email lookup. |
| Existing users | Prompt everyone once (pre-filled from `avatars.name` when free). No silent backfill. |

## What Phase 1 does NOT touch

- The `books` table — untouched. No `library_id` column yet (Phase 2).
- `book_ownership`, `book_personal_state` tables — not created (Phases 2/3).
- The main library / shelf navigation — unchanged. Phase 1 UI lives entirely on
  the Profile page.

---

## Identity & username

- New `profiles` table; `username` is unique **case-insensitively**.
- **Sign-up** gains a username step (live availability check).
- **Existing accounts** have no `profiles` row → a one-time "choose your
  username" gate on next login, the field **pre-filled from `avatars.name` only
  when that name is currently free** (else blank). Nothing is written silently.
- `avatars.name` is **kept only as the pre-fill source** and retired as identity
  (its input is removed from the avatar editor; the profile header reads
  `profiles.username`).

**Why no DB backfill:** the `username` column is unique but avatar names are not
(duplicates + blanks exist). A blind "copy every name" migration would violate
the unique index. Acquiring usernames purely through the UI gate sidesteps that
and lets collisions resolve fairly (both parties pick).

## Schema

```sql
-- Identity: one username per user, chosen at sign-up.
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now()
);
-- case-insensitive uniqueness: "Maeve" and "maeve" can't both exist
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- A shared library (group of N).
create table public.libraries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Membership. role owner|member.
create table public.library_members (
  library_id uuid not null references public.libraries(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  joined_at  timestamptz not null default now(),
  primary key (library_id, user_id)
);

-- Reusable invite codes. Any member may create one for their library.
create table public.library_invites (
  code       text primary key default substr(md5(random()::text), 1, 8),
  library_id uuid not null references public.libraries(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses   int not null default 20,   -- group-friendly (parent spec default was 1)
  use_count  int not null default 0
);
```

## Recursion-breaking helpers

**The parent spec has a latent bug:** its `library_members` SELECT policy queries
`library_members` itself → Postgres raises *"infinite recursion detected in policy
for relation library_members"* at runtime. Fix: `SECURITY DEFINER` helpers that
read membership with RLS bypassed, referenced from the policies.

```sql
create or replace function public.my_library_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select library_id from public.library_members where user_id = auth.uid()
$$;

create or replace function public.is_library_owner(p_lib uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.library_members
    where library_id = p_lib and user_id = auth.uid() and role = 'owner'
  )
$$;
```

## RLS policies

```sql
alter table public.profiles         enable row level security;
alter table public.libraries        enable row level security;
alter table public.library_members  enable row level security;
alter table public.library_invites  enable row level security;

-- profiles: read own + read co-members; write own only
create policy "read own profile" on public.profiles
  for select using (user_id = auth.uid());
create policy "read co-member profiles" on public.profiles
  for select using (
    user_id in (
      select user_id from public.library_members
      where library_id in (select public.my_library_ids())
    )
  );
create policy "insert own profile" on public.profiles
  for insert with check (user_id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- libraries: members read; create/update/delete gated (creation via RPC only)
create policy "members read libraries" on public.libraries
  for select using (id in (select public.my_library_ids()));
create policy "owner updates library" on public.libraries
  for update using (public.is_library_owner(id)) with check (public.is_library_owner(id));
create policy "owner deletes library" on public.libraries
  for delete using (public.is_library_owner(id));
-- NOTE: no INSERT policy — libraries are created only via create_library() (SECURITY DEFINER).

-- library_members: read co-members; delete = leave self or owner removes.
create policy "read co-members" on public.library_members
  for select using (library_id in (select public.my_library_ids()));
create policy "leave or owner removes" on public.library_members
  for delete using (user_id = auth.uid() or public.is_library_owner(library_id));
-- NOTE: no INSERT policy — membership writes go only through SECURITY DEFINER RPCs,
-- closing the "insert myself into any library_id" hole.

-- library_invites: members read; any member creates; owner/creator revokes
create policy "members read invites" on public.library_invites
  for select using (library_id in (select public.my_library_ids()));
create policy "members create invites" on public.library_invites
  for insert with check (
    created_by = auth.uid() and library_id in (select public.my_library_ids())
  );
create policy "owner or creator revokes invite" on public.library_invites
  for delete using (created_by = auth.uid() or public.is_library_owner(library_id));

-- avatars: existing owner-only policy stays; ADD co-member read (appearance, for
-- showing each member's gothic avatar beside their username). Identity only —
-- avatars hold no private reading data.
create policy "co-members read avatars" on public.avatars
  for select using (
    user_id in (
      select user_id from public.library_members
      where library_id in (select public.my_library_ids())
    )
  );
```

## RPCs (the only write paths for membership)

```sql
-- Create a library + owner membership atomically.
create or replace function public.create_library(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Library name is required';
  end if;
  insert into public.libraries (name, created_by)
  values (trim(p_name), auth.uid()) returning id into v_id;
  insert into public.library_members (library_id, user_id, role)
  values (v_id, auth.uid(), 'owner');
  return v_id;
end; $$;

-- Validate an invite code and join. Idempotent: re-accepting when already a
-- member does NOT consume a use.
create or replace function public.accept_library_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_library_id uuid; v_inserted int;
begin
  select library_id into v_library_id
  from public.library_invites
  where code = p_code and expires_at > now() and use_count < max_uses
  for update;

  if v_library_id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  insert into public.library_members (library_id, user_id)
  values (v_library_id, auth.uid())
  on conflict (library_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.library_invites set use_count = use_count + 1 where code = p_code;
  end if;

  return v_library_id;
end; $$;

-- Username availability. A narrow boolean oracle (never reveals who owns it) —
-- needed because profiles RLS hides non-co-members' rows, so the client can't
-- check availability with a direct select.
create or replace function public.username_available(p_username text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(p_username))
  )
$$;

grant execute on function public.create_library(text)         to authenticated;
grant execute on function public.accept_library_invite(text)  to authenticated;
grant execute on function public.username_available(text)     to authenticated;
```

## Client integration (src/App.jsx)

- **Username availability:** `supabase.rpc('username_available', { p_username })`.
- **Claim username:** `supabase.from('profiles').insert({ user_id, username })`;
  map a `23505` unique-violation to *"That handle's already taken."*
- **Has-username check (gate):** `supabase.from('profiles').select('username').eq('user_id', uid).maybeSingle()`.
- **Create library:** `supabase.rpc('create_library', { p_name })`.
- **Join:** `supabase.rpc('accept_library_invite', { p_code })`.
- **List my libraries:** `supabase.from('libraries').select('*, library_members(user_id, role)')`.
- **Roster with names + avatars:**
  `supabase.from('library_members').select('user_id, role, profiles(username), avatars(gender,hair_color,skin_tone,robe_color)').eq('library_id', id)`.
- **Create invite:** `supabase.from('library_invites').insert({ library_id, created_by })` → returns the generated `code`.
- **Leave:** `delete from library_members where user_id = me` (RLS allows self).
- **Owner remove member:** `delete from library_members where library_id, user_id` (RLS allows owner).
- **Rename / delete library:** `update`/`delete` on `libraries` (RLS owner-only).

## UI (Profile page)

A themed **"Shared Archives"** panel on the Profile/Avatar page:

- **Library list** — name, member count, your role.
- **Create** (name → `create_library`) · **Join** (code → `accept_library_invite`,
  with clear "invalid or expired" errors).
- **Library detail** — member roster (gothic avatar + username + role), **Invite**
  (creates a code; shows it with expiry + copy button), owner-only **rename /
  remove member / delete**, **Leave** for everyone.
- **Username surfaces** — sign-up field with live availability; the one-time
  choose-username gate after login when a profile is missing (pre-filled from
  `avatars.name` when free); the avatar editor with its name input removed
  (username shown read-only).
- Themed copy ("Bind a shared archive", "Invite a fellow reader"); errors always
  say what to do next. Fallbacks: bad code → clear message; offline → retry.

## Migration order

Tables → helper functions → enable RLS + policies → RPCs → grants.
(Helpers and policies reference `library_members`, so tables come first.)
Purely additive: no existing table, column, query, or policy is modified except
**adding** one co-member SELECT policy to `avatars`. Existing solo users are
unaffected until they create or join a library.

## Test cases (QE bar)

**Identity**
- [ ] Claiming a free username succeeds; claiming a taken one (case-insensitive,
      "Maeve" vs "maeve") fails with the unique violation → "handle taken."
- [ ] `username_available` returns false for a taken handle, true for a free one,
      and is case-insensitive.
- [ ] A user with no `profiles` row is shown the gate; after claiming, the gate
      does not reappear.

**Sharing (the headline two-account test)**
- [ ] User A creates a library via `create_library` → A is an `owner` member and
      can read the library back.
- [ ] A creates an invite; **User B** accepts via `accept_library_invite` → B is a
      `member`; B can read the library and see A in the roster; A can see B.
- [ ] B can read A's `profiles.username` and `avatars` appearance (co-member); a
      **non-member C cannot** read the library, A's profile, or A's avatar
      (RLS returns 0 rows, not an error).
- [ ] Selecting `library_members` as a member returns rows with **no "infinite
      recursion" error** (proves the helper-function fix).

**Permissions**
- [ ] A non-owner member's `update`/`delete` on `libraries` is rejected/0 rows;
      the owner's succeeds.
- [ ] Owner can delete another member's `library_members` row; a member can delete
      only their own (leave).
- [ ] Any member can insert a `library_invites` row for their library; a
      non-member cannot.

**Invites**
- [ ] An expired or fully-used code → `accept_library_invite` raises a clear error
      and creates no membership.
- [ ] Idempotent: B accepting the same valid code twice leaves B a single member
      and consumes only **one** use (`get diagnostics` guard).

**Isolation**
- [ ] A personal user who never joins a library is completely unaffected; their
      `books`/`avatars` behavior is identical to before.
- [ ] Direct client `insert` into `libraries` or `library_members` (bypassing the
      RPCs) is denied by RLS.

## Phase boundaries (for later specs)

- **Phase 2** — `books.library_id`, `book_ownership`, the shared shelf view +
  ownership badges (N-member: badges must show *which* members own a copy) +
  "I own this" tagging. The reference prototype targets this phase.
- **Phase 3** — `book_personal_state`: split read/progress/ratings per member on
  shared books, merged into existing `Spine`/cards/`ProgressEditor`. **Invariant:**
  never OR the `book_personal_state`/`notes` RLS with library membership.