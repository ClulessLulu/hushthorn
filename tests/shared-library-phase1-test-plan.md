# Test Plan — Shared Library, Phase 1 (Identity + Membership)

**Feature:** Shared Library — Phase 1 (usernames, create library, invite by code, join, roster, leave). **No books involved.**
**Spec (source of truth):** `docs/superpowers/specs/2026-06-29-shared-library-phase1-design.md`
**Parent spec:** `SHARED_LIBRARY_SPEC.md`
**App under test:** single-file `src/App.jsx` (Vite + React + Supabase) — components `UsernameGate`, `SharedArchives`, `LibraryDetail`, `MiniAvatar`, root username-gate wiring.
**Supabase project:** `ujxsrcxbhcbihhdluzyl`
**Author:** QA / bookbee team
**Headline scenario:** a new account creates a shared library and shares it with another account.

## How to read this plan

- Each row carries a concrete **PASS** criterion; the test FAILS if the criterion is not met.
- IDs: `B-` backend/data layer (schema, RLS, RPC, persistence), `F-` frontend wiring (code inspection of mapping/insert/RPC shapes), `E-` edge/fallback.
- Verification methods:
  - **MCP** — Supabase MCP (`list_tables`/`execute_sql`/`list_migrations`/`get_advisors`). Runs as **service role / BYPASSES RLS**. Used ONLY for: schema/policy/RPC ground-truth, setup (confirm emails), reading ground truth, cleanup. **Never** used to "prove" an access-control PASS.
  - **REST-as-user** — real GoTrue signup + password-grant JWTs, then PostgREST (`/rest/v1/...`) and RPC (`/rest/v1/rpc/...`) requests sent with each user's `Authorization: Bearer <token>`. **This is what enforces RLS.** All access-control cases use this method.
  - **Code** — read-only inspection of `src/App.jsx` (the client uses the right RPC/insert/column shapes).

## Test actors

- **A** — owner: signs up, claims a username, creates a library, invites.
- **B** — member: signs up, claims a username, joins A's library via code.
- **C** — outsider: signs up, claims a username, **never joins**. Used to prove cross-user isolation returns 0 rows (not an error).

---

## 0. Schema / policy / RPC ground-truth (MCP — setup, not an RLS proof)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-00a | Migration applied | MCP `list_migrations` | `shared_library_phase1` (+ `shared_library_phase1_lock_anon_execute`) listed. |
| B-00b | Four tables exist, RLS enabled | MCP `list_tables` | `profiles`, `libraries`, `library_members`, `library_invites` all present with `rls_enabled=true`, columns/PKs/FKs per spec. |
| B-00c | `profiles` case-insensitive unique index | MCP `pg_indexes` | `profiles_username_lower_idx` = `UNIQUE … (lower(username))`. |
| B-00d | RPCs exist + SECURITY DEFINER | MCP `pg_get_functiondef` | `create_library`, `accept_library_invite`, `username_available`, `my_library_ids`, `is_library_owner` all `SECURITY DEFINER`, `search_path=public`. Helpers `STABLE`. |
| B-00e | RPC execute grants | MCP `has_function_privilege` | `authenticated` can execute all 3 RPCs; `anon` cannot. |
| B-00f | No INSERT policy on `libraries`/`library_members` | MCP `pg_policies` | Neither table has an INSERT policy (writes only via SECURITY DEFINER RPC). |
| B-00g | No new security advisors | MCP `get_advisors security` | No RLS-disabled / policy-allows-all warnings introduced for the 4 new tables. |

## 1. Identity / username

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | A claims a free username | REST-as-user | A `POST /rest/v1/profiles {user_id, username}` → 201. Row exists for A. |
| B-02 | B claims a different free username | REST-as-user | B insert → 201. |
| B-03 | Case-insensitive collision rejected | REST-as-user | C inserts a casing-variant of A's handle (A=`MaeveQA…` → `maeveqa…`) → HTTP 409, code `23505`, **no row created**. |
| B-04 | `username_available` true for free | REST-as-user (RPC) | `rpc/username_available {p_username:<unused>}` returns `true`. |
| B-05 | `username_available` false for taken | REST-as-user (RPC) | For A's exact handle → `false`. |
| B-06 | `username_available` case-insensitive | REST-as-user (RPC) | For A's handle upper/lowercased → `false`. |
| F-01 | Client claim + 23505 map | Code | `UsernameGate.claim` inserts `{user_id, username}`; maps `error.code==='23505'` to "handle taken." |
| F-02 | Gate wiring | Code | Root checks `profiles.select('username').eq('user_id',uid).maybeSingle()`; shows `UsernameGate` when absent; pre-fill via `username_available` only when seed sanitizes + is free. |

## 2. Sharing (headline two-account flow)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-10 | A creates a library via RPC | REST-as-user (RPC) | `rpc/create_library {p_name}` returns a uuid. |
| B-11 | A is an `owner` member + can read library | REST-as-user | A `GET /libraries?id=eq.<id>` returns 1 row; A `GET /library_members` shows A with `role=owner`. |
| B-12 | A creates an invite | REST-as-user | A `POST /library_invites {library_id, created_by}` → 201 with generated `code`, `max_uses=20`, `use_count=0`, future `expires_at`. |
| B-13 | B accepts invite → member | REST-as-user (RPC) | B `rpc/accept_library_invite {p_code}` returns the library_id; B now a `member` row; invite `use_count` = 1. |
| B-14 | B reads the library | REST-as-user | B `GET /libraries?id=eq.<id>` returns 1 row. |
| B-15 | Roster mutual visibility | REST-as-user | B sees A **and** B in `library_members`; A sees both. No row missing. |
| B-16 | **No infinite-recursion** on `library_members` select | REST-as-user | A and B selecting `library_members` for the shared library return rows with **no** "infinite recursion detected in policy" error (validates SECURITY DEFINER helper fix). |
| B-17 | B reads A's profile (co-member) | REST-as-user | B `GET /profiles?user_id=eq.<A>` returns A's username row. |
| B-18 | B reads A's avatar (co-member) | REST-as-user | B `GET /avatars?user_id=eq.<A>` returns A's appearance row. |
| B-19 | C cannot read the library | REST-as-user | C `GET /libraries?id=eq.<id>` → **0 rows, 200** (not an error). |
| B-20 | C cannot read A's profile | REST-as-user | C `GET /profiles?user_id=eq.<A>` → **0 rows** (only co-members + self visible). |
| B-21 | C cannot read A's avatar | REST-as-user | C `GET /avatars?user_id=eq.<A>` → **0 rows**. |
| B-22 | C cannot read the roster | REST-as-user | C `GET /library_members?library_id=eq.<id>` → **0 rows**. |
| F-10 | Client roster shape | Code | `LibraryDetail.loadRoster` selects members then joins `profiles`/`avatars` by id; `SharedArchives` lists `libraries` with embedded `library_members`. |

## 3. Permissions (any member invites; owner-only manage)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-30 | Member cannot rename library | REST-as-user | B `PATCH /libraries?id=eq.<id> {name}` → affects **0 rows** (RLS update qual `is_library_owner`). |
| B-31 | Member cannot delete library | REST-as-user | B `DELETE /libraries?id=eq.<id>` → **0 rows**. |
| B-32 | Owner can rename | REST-as-user | A `PATCH /libraries {name}` → 1 row updated. |
| B-33 | Any member can create invite | REST-as-user | B `POST /library_invites {library_id, created_by:B}` → 201. |
| B-34 | Non-member cannot create invite | REST-as-user | C `POST /library_invites {library_id, created_by:C}` → denied (403/RLS, `with_check` fails). |
| B-35 | Owner removes a member | REST-as-user | A `DELETE /library_members?library_id&user_id=eq.<B>` → 1 row (B removed). |
| B-36 | Member can leave (self only) | REST-as-user | After rejoin, B `DELETE …user_id=eq.<B>` → 1 row; B attempting to delete another member's row → 0 rows. |
| B-37 | Owner can delete the library | REST-as-user | A `DELETE /libraries?id=eq.<id>` → 1 row; cascade removes members/invites. |

## 4. Invites (expiry, exhaustion, idempotency)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-40 | Expired code rejected | REST-as-user (RPC) + MCP setup | With `expires_at` forced into the past, B `rpc/accept_library_invite` → error "invalid or expired"; **no** membership created; `use_count` unchanged. |
| B-41 | Fully-used code rejected | REST-as-user (RPC) + MCP setup | With `use_count = max_uses`, accept → error; no membership; count unchanged. |
| B-42 | Idempotent double-accept | REST-as-user (RPC) | B accepting the **same valid code twice** leaves B a single member row and increments `use_count` **once** (second call no-ops the count via `get diagnostics` guard). |
| B-43 | Invalid/garbage code | REST-as-user (RPC) | Nonexistent code → clean error, no membership. |

## 5. Isolation / hardening

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-50 | Direct insert into `libraries` denied | REST-as-user | A `POST /libraries {name, created_by:A}` (bypassing RPC) → denied by RLS (no INSERT policy). |
| B-51 | Direct insert into `library_members` denied | REST-as-user | A/C `POST /library_members {library_id, user_id, role}` (bypassing RPC) → denied (no INSERT policy). Closes the "insert myself into any library" hole. |
| B-52 | Personal `books` unaffected | REST-as-user + MCP | A pre-existing `books` row stays owner-only: A reads own books; B/C cannot read A's books; Phase 1 added no `library_id` column to `books`. |
| B-53 | `notes`/avatars solo behavior intact | Code + MCP | `books`/`notes` policies unchanged (`auth.uid()=user_id`); only additive co-member SELECT added to `avatars`. A solo user (no membership) is unaffected. |

---

## Out of scope (Phase 2/3 — do NOT test here)

- `books.library_id`, `book_ownership`, shared shelf, ownership badges (Phase 2).
- `book_personal_state`, per-member ratings/progress on shared books (Phase 3).
- The shared-shelf prototype UI (`prototype/hushthorn-shared-library.jsx`).

## Cleanup contract

All test users (A/B/C) and any rows they create (profiles, libraries, library_members, library_invites, avatars) are removed at the end via `delete from auth.users where email like 'qa-shared-%@example.com'` (cascades). Report confirms the four tables and `auth.users` return to their pre-test row counts (`profiles=0`, `libraries=0`, `library_members=0`, `library_invites=0`; `books=23`, `avatars=2` unchanged).
