# Shared Library — Phase 2 RLS Re-QA Test Plan (post-`shared_library_phase2_rls_fixes`)

**Feature under test:** the two RLS fixes in migration
`shared_library_phase2_rls_fixes` (`20260704063933`) on project
`ujxsrcxbhcbihhdluzyl`, confirming the two prior Phase 2 blockers are fixed and no
regression to move-in convert or personal-book access.
**Prior failures being re-checked:** report.md FAIL-1 (reveal opt-in unsettable —
no UPDATE policy on `library_members`) and FAIL-2 (S-10 — non-member can inject a
book into any archive).
**Fixes under test (from the migration):**
1. `revoke update` on `library_members` from `authenticated`/`anon`; re-`grant
   update (share_reading)` to `authenticated`; add RLS policy
   `members update own share_reading` (`user_id = auth.uid()`).
2. `alter policy "users manage own books"` to add `library_id is null` to both
   USING and WITH CHECK, so shared rows require membership (the additive shared
   policies own them).

**Methodology (same as full Phase 2 run):**
- **REST-as-user** — real GoTrue password-grant JWT per actor; PostgREST
  (`/rest/v1/...`, `/rest/v1/rpc/...`) with `apikey:<ANON>` +
  `Authorization: Bearer <JWT>`. This is what enforces RLS — the only proof of an
  access-control PASS.
- **MCP** (`execute_sql`) — service role, BYPASSES RLS. Used ONLY for setup,
  ground-truth reads, and cleanup — never to prove an access case.

## Test actors (created fresh; cleaned up at end)
- **A** — owner of test library **L**; has one personal seed book.
- **B** — member of **L** (via `accept_library_invite`); the reveal reader.
- **C** — outsider; belongs to no library; the injection attacker.
- A + B get `profiles` usernames; C does not.

## Re-QA cases

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| R-1a | reveal-write (was FAIL-1): A can set own `share_reading=true` | REST-as-A `PATCH /library_members?library_id=eq.L&user_id=eq.A {"share_reading":true}`; re-read as A | write accepted AND re-read shows `share_reading=true` (not 0-rows-updated) |
| R-1b | reveal end-to-end ON: B reads A's marks | REST-as-B `GET /book_personal_state?book_id=eq.<shared>&user_id=eq.A` with A share ON | 1 row: A's migrated marks visible to B |
| R-1c | reveal end-to-end OFF: flip A back to false → B sees nothing | REST-as-A `PATCH share_reading=false`; REST-as-B same GET | `[]` (0 rows) |
| R-2 | role-escalation guard (new): A cannot self-promote | REST-as-A `PATCH /library_members?...&user_id=eq.A {"role":"owner"→attempt on a member row / or set role}`; MCP re-read | request DENIED (permission error / no row changed); A's role unchanged |
| R-3 | S-10 (was FAIL-2): outsider C cannot inject a shared book | REST-as-C `POST /books {"library_id":L,"user_id":C,...}` | DENIED (no row created); B `GET /books?library_id=eq.L` does not show it |
| R-4 | regression — member shared insert | REST-as-B `POST /books {"library_id":L,"user_id":B,...}` | succeeds (row created, `library_id=L`) |
| R-5 | regression — move-in convert flip | REST-as-A `PATCH /books?id=eq.<personal,A> {"library_id":L}` | succeeds (RLS UPDATE flip allowed for owner-member); row now `library_id=L` |
| R-6a | regression — personal CRUD | REST-as-A create/read/update/delete a `library_id null` book | all 4 succeed |
| R-6b | regression — personal shelf query scoping | REST-as-A `GET /books?user_id=eq.A&library_id=is.null` | returns only A's personal rows, no shared rows |

## Cleanup + restore verification
Delete all seeded books (cascades `book_ownership` + `book_personal_state`),
seeded personal_state, test library L + members + invite, and users A/B/C from
`auth.users` (+ identities/profiles). Re-confirm baseline: personal books=23,
avatars=2, profiles=3, libraries=1, library_members=3, book_ownership=0,
book_personal_state=0, notes=1, 0 leftover test users.
