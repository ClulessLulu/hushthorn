# Shared Library — Phase 2 Test Plan (shared shelf + per-format ownership + private reading state)

**Feature under test:** Shared Library Phase 2 on branch `phase2-shared-shelf`.
**Spec (source of truth):** `docs/superpowers/specs/2026-06-30-shared-library-phase2-design.md`
(→ "The one rule that must never break" + "Test cases (QE bar)").
**Move/merge cases:** `tests/shared-library-phase2-move-merge-cases.md` (a–f, C-01..C-10).
**App under test:** single-file `src/App.jsx` — `loadArchiveBooks`, `updateBook` shared
branch, `toggleOwnership`, `addBookToArchive`, `moveBookIntoArchive`.
**Supabase project:** `ujxsrcxbhcbihhdluzyl`.
**Executed by:** qa-tester, real per-user JWTs (Phase 1 methodology).

> **RLS re-QA (2026-07-04):** after migration `shared_library_phase2_rls_fixes`,
> the two prior blockers (S-10 injection, reveal-write) plus a new
> role-escalation guard and the convert/personal-CRUD regressions were re-run and
> all PASS — see `tests/shared-library-phase2-rls-refix-test-plan.md` and the
> "Phase 2 RLS Re-QA" section of `tests/report.md`. Verdict: **GO**.

## Methodology

- **REST-as-user** — real GoTrue password-grant JWT per actor, then PostgREST
  (`/rest/v1/...`, `/rest/v1/rpc/...`) with `apikey: <ANON>` + `Authorization: Bearer <JWT>`.
  This is what *enforces RLS* — the only way an access-control PASS is proven.
- **MCP** (`execute_sql`) — service role, **BYPASSES RLS**. Used ONLY for setup,
  ground-truth reads, and cleanup — never to prove an access case.
- **Code** — read-only inspection of `src/App.jsx` for the C-01..C-10 logic checks.
- The RPC data operations in `App.jsx` (`toggleOwnership`, `addBookToArchive`,
  `moveBookIntoArchive`, `updateBook` shared branch) issue the *same* PostgREST
  calls the browser client would; executing those calls with a real JWT exercises
  the identical RLS path. Each case names the exact requests + PASS criterion.

## Test actors (all created fresh; cleaned up at the end)

- **A** — owner of test library **L**; has a personal shelf of seed books.
- **B** — member of **L**; used for the reveal + no-leak-from-another-member proofs.
- **C** — outsider; belongs to NO library. Proves archive isolation.
- A + B get `profiles` usernames; C does not need one. None of the pre-existing
  real accounts (Sin/Loveless/Lorreighna) or library "The Cathedral" are touched.

## PASS criterion convention

Each row carries a falsifiable PASS. A FAIL names expected vs. actual with the
request/response or query output as evidence. Any personal mark found on a shared
`books` row is an automatic FAIL (the headline no-leak rule).

---

## Privacy / no-leak (headline)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| P-01 | Convert a *rated* personal book of A into L resets the shared `books` row marks | MCP ground-truth after REST-as-A move | `overall=0, smut=0, read=false, progress={}` on the converted row; `library_id=L`, `user_id=A` kept |
| P-02 | B reading the shared row sees NO rating | REST-as-B `GET /books?id=eq.<P>` | row returned, but `overall=0,smut=0,read=false,progress={}` |
| P-03 | B cannot read A's `book_personal_state` while A `share_reading=false` | REST-as-B `GET /book_personal_state?book_id=eq.<P>` | `[]` (0 rows) |
| P-04 | After A sets `share_reading=true`, B CAN read A's personal_state (the reveal) | REST-as-A update share_reading, then REST-as-B GET | 1 row: A's migrated marks visible to B |
| P-05 | Toggling `share_reading` back to false hides A's personal_state from B again | REST-as-A false, REST-as-B GET | `[]` (0 rows) |
| P-06 | A's `notes` are NEVER returned to B, even with `share_reading=true` | REST-as-B `GET /notes?book_id=eq.<P>` with sharing ON | `[]` (0 rows) |
| P-07 | B still sees only her own personal_state row (her own upsert) regardless of A's toggle | REST-as-B GET filtered to B's user_id | B's own row only |

## Ownership (per-format)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| O-01 | A owns print+audio, B owns ebook → exact `book_ownership` rows | MCP ground-truth after REST inserts as each user | rows: (A,print),(A,audio),(B,ebook) — exactly 3, no more |
| O-02 | A cannot insert an ownership row for B (user_id != auth.uid) | REST-as-A insert `{user_id:B,...}` | 403 / RLS violation; 0 rows created |
| O-03 | B cannot delete A's ownership row | REST-as-B `DELETE book_ownership?user_id=eq.A` | 0 rows deleted (delete policy `user_id=auth.uid()`) |
| O-04 | Tagging a format not in `books.formats` unions it in | REST-as-B tag ebook, MCP read `books.formats` | `formats` now contains `ebook` |
| O-05 | ≥1 owner → derived shelf "owned"; 0 owners → "wishlist" | `loadArchiveBooks` shape via code + MCP counts | `shelf='owned'` when ownership rows exist; `'wishlist'` when none |
| O-06 | B (non-owner of a format) can insert her own ownership on a shared book she didn't create | REST-as-B insert on A's shared book | row created (insert policy is library membership + own user_id, not book creator) |

## Move-in / merge (from move-merge-cases.md a–f)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| M-CONVERT (a) | Convert-in-place: title absent → row converted, marks migrated, row reset, ownership per format, notes kept | REST-as-A move; MCP + REST-as-B | row `library_id=L` + marks reset; `book_personal_state(P,A)` = migrated 4/3/true/{"print":100}; ownership = ebook,print; A's 2 notes still on P |
| M-MERGE (b) | Merge into existing title (case-insensitive): no dup row, P2 deleted, marks→private, audio unioned, notes re-pointed+deduped | REST-as-A move; MCP | 1 row titled "fourth wing" in L; P2 count 0; `book_personal_state(S,A)`=5/4/true/{"audio":100}; ownership (S,A,audio); formats⊇audio; A notes on S=3, on P2=0 |
| I-CONVERT (c) | Repeat move of already-shared P → zero side effects | REST-as-A repeat; MCP diff | function no-ops (personal-row load requires `library_id is null`); all 4 counts unchanged |
| I-MERGE (c) | Re-seed identical P2, re-run merge → idempotent (23505 ignored, upsert in place, note fp dedupe) | MCP re-seed, REST-as-A move; MCP diff | ownership count unchanged; 1 personal_state row; notes count unchanged; no error |
| E-UNRATED (d) | Unrated book → converted but NO `book_personal_state` row; ownership still created | REST-as-A move; MCP | `book_personal_state(P3)` count 0; `book_ownership(P3,A,print)` count 1 |
| E-NOFORMAT (e) | Book with empty/null formats → defaults to a single `print` ownership row | REST-as-A move; MCP | exactly 1 ownership row, `format='print'` |
| E-ISOLATION (f) | A's untouched personal book P5 stays owner-only, absent from archive | MCP + REST-as-B | P5 `library_id=null`, 0 ownership; REST-as-B `GET /books?id=eq.P5` → `[]` |

## Move/merge code-inspection (C-01..C-10)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| C-01 | Title match guard: ilike + strict JS `trim().toLowerCase()` equality | Code | partial ilike hit rejected in JS |
| C-02 | No-leak reset: convert path zeroes row marks in same update as `library_id` | Code | single `update … library_id, overall:0, smut:0, read:false, progress:{}` |
| C-03 | Meaningful-mark guard: no upsert when `!hasMarks` | Code | `upsertMyState` early-returns when hasMarks false |
| C-04 | Ownership insert ignores 23505 | Code | `error.code !== '23505'` guard |
| C-05 | personal_state upsert `onConflict:'book_id,user_id'` | Code | present |
| C-06 | Notes re-pointed/deduped BEFORE deleting personal row (FK safety) | Code | delete of `books` is after note loop |
| C-07 | Note dedupe: fingerprint-collision source notes deleted, survivors add fp | Code | targetFps set updated on re-point |
| C-08 | Format union in merge | Code | unioned formats written when missing |
| C-09 | UI gate: "Move into a shared archive" only when `!book.library_id && archives.length>0` | Code | `canMove` guard |
| C-10 | Defensive: every Supabase call logs + returns; nothing throws | Code | every branch guarded |

## Isolation / permissions / recursion

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| S-01 | Personal book (`library_id null`) excluded from archive queries | `loadArchiveBooks` code + MCP | personal shelf query filters `.is('library_id', null)`; archive query filters `.eq('library_id', L)` |
| S-02 | Outsider C reads nothing from the archive: books | REST-as-C `GET /books?library_id=eq.L` | `[]` (not an error) |
| S-03 | Outsider C reads nothing: ownership | REST-as-C `GET /book_ownership?book_id=eq.<S>` | `[]` |
| S-04 | Outsider C reads nothing: personal_state | REST-as-C `GET /book_personal_state?book_id=eq.<S>` | `[]` |
| S-05 | Outsider C reads nothing: roster (library_members) | REST-as-C `GET /library_members?library_id=eq.L` | `[]` |
| S-06 | Any member (B) may edit group fields on a shared book | REST-as-B `PATCH /books?id=eq.<S>` title | update succeeds; MCP confirms new title |
| S-07 | Any member (B) may add a shared book to the archive | REST-as-B insert into `books` with `library_id=L` | row created |
| S-08 | Any member (B) may remove a shared book from the archive | REST-as-B `DELETE /books?id=eq.<tmp>` | row deleted (member delete policy) |
| S-09 | No "infinite recursion" on shared selects (books/ownership/personal_state) | REST-as-B GETs | 200 with data, no `42P17` recursion error |
| S-10 | C cannot insert a book into L (non-member) | REST-as-C insert `library_id=L` | RLS rejects; 0 rows |

## Cleanup + restore verification

- Delete every seeded book (P, S, P2–P5, temporaries), cascading `book_ownership`
  + `book_personal_state`; delete any remaining seeded `notes`; delete test library
  L + its members/invites; delete users A/B/C from `auth.users` (+ identities).
- Re-confirm baseline: personal `books`=23, total `books`=23, `avatars`=2,
  `profiles`=3, `libraries`=1, `library_members`=3, `library_invites`=1,
  `book_ownership`=0, `book_personal_state`=0, `notes`=1.
