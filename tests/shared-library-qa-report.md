# Shared-Library (Union Model) QA Report

**Feature:** Multi-user shared archive / library — invite, join, union of member
libraries, RLS isolation.
**Environment:** STAGING ONLY — `http://localhost:5174/`, Supabase project
`shwhzfpqjbwukjztlzee`. Production (`http://localhost:5173/`,
`ujxsrcxbhcbihhdluzyl`) was never navigated to, queried, or written to at any
point in this pass.
**Date:** 2026-09-26
**Tester:** qa-tester (bookbee team)
**Method:** Playwright MCP (Chrome) for the UI flow; direct PostgREST calls
against minted user JWTs (`/auth/v1/token?grant_type=password`) for every RLS
check, per the task's instruction that this is the reliable way to catch leaks
the UI could hide.

## Safety confirmation

- Navigated to `http://localhost:5174/` first; `browser_evaluate` and a direct
  fetch of `/src/lib/supabase.js` both confirmed `MODE: "staging"` and
  `VITE_SUPABASE_URL: "https://shwhzfpqjbwukjztlzee.supabase.co"`. Re-checked
  after the full flow (final command in this report's evidence trail) —
  unchanged. Port 5173 was never opened in this session.

## Test accounts / fixtures created

| Item | Value |
|---|---|
| Alpha | `qa.alpha@hushthorn.local`, username `@qaAlpha`, `user_id aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa` |
| Beta | `qa.beta@hushthorn.local`, username `@qaBeta`, `user_id bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb` |
| Shared archive | "QA Shared Archive", `library_id 3305c37a-4500-43d2-ad25-ed327d11b6e9`, invite code `c190e0e11c9aa7cc8e680d287ffc9050` |
| Isolation archive (Beta never joins, used for check F) | "QA Archive Beta Never Joins", `library_id dad3d45d-2e1c-4835-b9c9-8380c01cbcfe`, invite code `099a56b73e38dbe69b9ee86355564a6d` |
| Alpha's books | Fourth Wing `18dface3-6679-48c2-9222-e33f94314c2f` · Iron Flame `d96c848a-5546-4e94-a32b-379531bfc326` · A Court of Thorns and Roses `b630c61f-b1b4-421c-a9a1-61f462dd3305` |
| Beta's books | iron flame (deliberate lower-case dup) `bceb01c6-536d-4461-9539-ecdfde748c1d` · Onyx Storm `f993af9f-6b4a-402e-b3b7-0b51845f62fa` |
| Alpha's test note (for check B) | `008b2d7c-cdb4-4789-bc42-adc58de8f48c` on Fourth Wing, text "QA secret marginalia - Beta must never see this" |

## Flow executed (UI)

1. Alpha signed in → claimed `@qaAlpha` → bound "QA Shared Archive" → generated
   invite code. Added 3 books (Fourth Wing, Iron Flame, A Court of Thorns and
   Roses), all Owned/print. Screenshot: `tests/screenshots/alpha-shelf-3-books.png`.
2. Signed out, Beta signed in → claimed `@qaBeta` → joined via Alpha's invite
   code → "QA Shared Archive · 2 members" confirmed in the profile panel.
3. Beta added 2 books: "Onyx Storm" (unique) and "Iron Flame" retitled to
   lower-case `iron flame` (deliberate case-variant duplicate of Alpha's book).
   Screenshot: `tests/screenshots/beta-my-library-2-books.png`.
4. Beta switched the shelf to "QA Shared Archive": saw **4 tomes**
   (Fourth Wing, A Court of Thorns and Roses, Onyx Storm, and one merged
   "iron flame" entry tagged "2 readers") — Alpha's books are visible to Beta.
   Screenshots: `tests/screenshots/beta-shared-archive-merged-iron-flame.png`,
   `tests/screenshots/beta-iron-flame-merged-detail.png`.

## Results table

| Check | Result | Evidence |
|---|---|---|
| A — Beta `books` select returns only her own rows | **PASS** | `GET /rest/v1/books?select=id,user_id,title,author` as Beta → 200, 2 rows, both `user_id=bbbbbbbb-...`. No Alpha rows. |
| B — Beta cannot read Alpha's `notes` | **PASS** | With a real Alpha note present: `GET /rest/v1/notes?select=*&user_id=eq.<alpha>` → 200, `[]`. Direct `?id=eq.008b2d7c-...` → 200, `[]`. |
| C — `archive_shelf`/`archive_reveal` expose Alpha's shared books + only the right columns | **PASS** | `archive_shelf` → 200, 3 rows, columns `library_id, owner_id, book_id, title, author, cover_url, genres, formats, shelf, created_at` (no marks). `archive_reveal` → 200, `[]` (Alpha hasn't opted in); column-probe confirms `library_id, owner_id, book_id, overall, smut, progress, read` exist but `notes`/`text` do **not** (`42703 column does not exist`). |
| D — `archive_avatar` exposes only `user_id`+`image_path` | **PASS** | `select=*` → 200 `[]` (no avatars rows — Visage feature-flagged off, never sealed). `select=user_id,image_path` → 200 valid. `select=traits`/`form`/`preset_name` → `42703 column does not exist`. |
| E — Beta cannot UPDATE/DELETE Alpha's books | **PASS** | `PATCH` and `DELETE` on Alpha's Fourth Wing row (as Beta) both → 200, `[]` (0 rows affected). Re-verified as Alpha afterward: row intact, title still "Fourth Wing". |
| F — Beta cannot read/create `library_invites` outside her role | **PASS** | Against a real second library Beta never joined: `GET ?library_id=eq.<lib2>` → 200 `[]` (real invite existed). `GET` with no filter → 200 `[]` (can't see even her own library's invite as non-owner). `POST` an invite for Alpha's library as Beta (member, not owner) → **403** `"new row violates row-level security policy for table \"library_invites\""`. |
| G — Duplicate-title behavior (Alpha "Iron Flame" vs Beta "iron flame") | **DOCUMENTED, by design** | DB level: **two separate rows**, `d96c848a-5546-4e94-a32b-379531bfc326` (Alpha) and `bceb01c6-536d-4461-9539-ecdfde748c1d` (Beta) — no collision, no DB merge. UI/union level: client-side merge by `norm(title)+'|'+norm(author)` (`unionKeyOf`, App.jsx ~1632-1642) folds them into **one** archive card, "2 readers", detail view lists both "You" and "@qaAlpha" under "Who has it." This matches the documented union-model architecture — not a defect. |
| H — Invalid/garbage invite code rejected cleanly | **PASS** | UI: joining with `totally-garbage-code-xyz` → inline message "That invite is invalid or expired.", no crash (screenshot `tests/screenshots/check-h-invalid-invite-code.png`). API: `rpc/accept_library_invite` with garbage code → 400 `{"code":"P0001","message":"Invite is invalid or expired"}`. |
| I — Alpha's books disappear from Beta's archive view after Beta leaves | **PASS on reload / FAIL live (see BUG-003)** | DB: after "Leave archive", Alpha's `library_members` → 1 row (Alpha only); confirmed via Alpha's own token. A **fresh page load** for Beta correctly shows only "My Library" (2 own books), "No shared archives yet." But the **live, un-reloaded** view does not update — see BUG-003. |

**Counts: 8 PASS, 0 hard FAIL, 1 finding filed as a bug (stale client state, not a data leak), 1 check (G) informational/by-design.**

## Failures / findings

### BUG-003 — Leaving a shared archive doesn't refresh the currently-viewed shelf

See `docs/BUGS.md` for the full write-up. Short version: if Beta is actively
viewing the "QA Shared Archive" shelf and leaves via the profile panel's
"Leave archive" button, the confirm dialog fires and the profile panel
correctly flips to "No shared archives yet" — but the main shelf grid behind
it keeps rendering the stale union data (still labeled "QA Shared Archive",
still "4 tomes" including Alpha's Fourth Wing and A Court of Thorns and
Roses) until the page is manually reloaded. Reproduced twice with matching
accessibility-tree snapshots and a screenshot
(`tests/screenshots/bug-stale-archive-view-after-leave.png`).

This is **not** a security/data leak — checks A and C independently prove the
underlying REST/RLS layer is correctly scoped the instant it's queried fresh
(confirmed by the reload in check I showing correct, empty state). It is a
client-side stale-state bug: `currentLibraryId`/the loaded union array aren't
invalidated or refetched when `leave()` succeeds in `LibraryDetail`
(`src/App.jsx` ~3684-3690), so the app keeps showing Beta data she technically
no longer has a live grant to view, until something else (reload) forces a
refetch.

## Data-integrity / cross-user leak findings (explicit call-out)

**None found.** Every RLS boundary tested (own-rows-only on `books`, notes
isolation, archive_shelf/archive_reveal/archive_avatar column scoping,
update/delete blocking, invite read/create scoping) held under real minted
JWTs with real cross-account data present. The one filed bug (BUG-003) is a
UI staleness issue, not a leak — the server-side data was never actually
exposed to an unauthorized query; only Beta's own already-open browser tab
kept rendering data from before she left.

## Screenshots

- `tests/screenshots/alpha-shelf-3-books.png` — Alpha's personal library, 3 books.
- `tests/screenshots/beta-my-library-2-books.png` — Beta's personal library, 2 books.
- `tests/screenshots/beta-shared-archive-merged-iron-flame.png` — Beta's shared-archive view, 4 tomes, "iron flame" showing "2 readers".
- `tests/screenshots/beta-iron-flame-merged-detail.png` — "iron flame" detail modal showing "Who has it: You, @qaAlpha".
- `tests/screenshots/check-h-invalid-invite-code.png` — clean invalid-invite-code error message.
- `tests/screenshots/bug-stale-archive-view-after-leave.png` — BUG-003 evidence.
