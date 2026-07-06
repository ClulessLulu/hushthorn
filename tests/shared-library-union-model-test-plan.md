# Test Plan — Shared Library Union Model (archive_shelf + archive_reveal views)

**Feature:** Shared Library Union Model — SECURITY DEFINER co-member views
**Spec:** `docs/superpowers/specs/2026-07-05-shared-library-union-model-design.md`
**Brief:** `.superpowers/sdd/task-4-brief.md`
**App under test:** `src/App.jsx` (Vite + React + Supabase), project `ujxsrcxbhcbihhdluzyl`
**Author:** QA / bookbee team
**Branch:** `union-model-shelf`
**Status:** Executed 2026-07-05

## Methodology note (non-negotiable)

Every ACCESS assertion in this plan uses a **real per-user JWT** obtained via
`POST /auth/v1/token?grant_type=password` against the live GoTrue endpoint, with
each user's JWT sent as `Authorization: Bearer <jwt>` + `apikey: <anon>` to
PostgREST (`/rest/v1/...`). This is exactly how the browser drives requests —
RLS is evaluated against the JWT's `auth.uid()`.

The Supabase MCP (service role, bypasses RLS) is used **only** for:
- Setup (creating users, library, books, notes)
- Ground-truth queries (confirming schema, counts, policy text)
- Cleanup (deleting all test rows and users)

Any case marked `MCP` is a structural/schema check, not an access assertion.
Any case marked `JWT-B`, `JWT-A`, or `JWT-C` is a real-user access check.

## Actors

| Actor | Email | Role |
|---|---|---|
| A (owner) | `qa-union-a@example.com` | Library L owner + member |
| B (co-member) | `qa-union-b@example.com` | Library L member |
| C (outsider) | `qa-union-c@example.com` | No membership in any library |

## Security model under test

- `books` table: owner-only RLS (`auth.uid() = user_id`). Marks and notes never
  leave the owner's row via the base table.
- `archive_shelf`: SECURITY DEFINER view. Exposes title/author/cover/genres/
  formats/shelf for co-members. **Structurally has no marks columns.**
- `archive_reveal`: SECURITY DEFINER view. Exposes marks (overall/smut/progress/read)
  only where the owner's `library_members.share_reading = true`. **No notes column.**
- Both views: `WHERE b.user_id <> auth.uid()` (co-members only, never the caller's
  own rows). `WHERE b.hidden_from_archives = false`.
- Grants: `revoke all from public, anon; grant select to authenticated` (per spec).

## Test data setup (service role)

| Item | ID | Description |
|---|---|---|
| Library L | `eeeeeeee-0000-0000-0000-000000000001` | A owns, B is member, C excluded |
| A_FW | `a0000000-…-0001` | Fourth Wing (A): print+audio, owned, overall=4, smut=3, read=true |
| A_OWN | `a0000000-…-0002` | A Unique Tome (A): print, owned, overall=5, smut=4, has a note |
| A_WL | `a0000000-…-0003` | A Wishlist Book (A): print, **shelf=wishlist** |
| A_HID | `a0000000-…-0004` | A Secret Tome (A): ebook, **hidden_from_archives=true**, overall=5, smut=5, has a note |
| A_NWL | `a0000000-…-0005` | The Coveted Scroll (A): wishlist — nobody-owned title |
| B_FW | `b0000000-…-0001` | Fourth Wing (B): ebook, owned, overall=3, smut=2 |
| B_OWN | `b0000000-…-0002` | B Unique Tome (B): print, owned |
| B_NWL | `b0000000-…-0003` | The Coveted Scroll (B): wishlist — nobody-owned title |
| A_NOTE | `ffffffff-…-0001` | Note on A_OWN: "must never leak to co-members" |
| A_NOTE2 | `ffffffff-…-0002` | Note on A_HID: "hidden book note - must never leak" |

---

## 1. Schema / Structure (MCP — service-role checks, not access proofs)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | Migration `shared_library_union_model` applied | MCP `list_migrations` | Migration version `20260705093412` listed. |
| B-02 | `books.hidden_from_archives` column exists | MCP `list_tables` | Column present, `data_type=boolean`, NOT NULL, `default_value=false`. |
| B-03 | Phase 2 tables gone | MCP `execute_sql` on `information_schema.tables` | `book_ownership` and `book_personal_state` return 0 rows. |
| B-04 | `books.library_id` column gone | MCP `execute_sql` on `information_schema.columns` | 0 rows for `library_id` on `books`. |
| B-05 | `archive_shelf` view exists with correct columns | MCP `execute_sql` on `information_schema.columns` | Columns: `library_id, owner_id, book_id, title, author, cover_url, genres, formats, shelf`. **No** `overall/smut/progress/read/notes`. |
| B-06 | `archive_reveal` view exists with correct columns | MCP `execute_sql` on `information_schema.columns` | Columns: `library_id, owner_id, book_id, title, author, overall, smut, progress, read`. **No** `notes`. |
| B-07 | Both views are SECURITY DEFINER (`security_invoker=false`) | MCP `execute_sql` on `pg_class.reloptions` | `reloptions` contains `security_invoker=false` for both views. |
| B-08 | Both views are not insertable (DML rejected structurally) | MCP `execute_sql` on `information_schema.tables.is_insertable_into` | Both return `NO`. |
| B-09 | `books` RLS: single owner-only policy | MCP `execute_sql` on `pg_policies` | Exactly one policy on `books`: `"users manage own books"` cmd=ALL, `qual=(auth.uid()=user_id)`, `with_check=(auth.uid()=user_id)`. No Phase-2 shared-books policies remain. |
| B-10 | `notes` RLS: owner-only | MCP `execute_sql` on `pg_policies` | `"users manage own notes"` cmd=ALL, `qual=(auth.uid()=user_id)`. |
| B-11 | Advisors: exactly the 2 intended definer-view WARNs | MCP `get_advisors(security)` | `security_definer_view` WARNs for `archive_shelf` and `archive_reveal` present. No new `rls_disabled` or `policy_allows_all` findings vs. prior baseline. |

---

## 2. Union + Ownership (real JWTs)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| U-01 | B sees A's non-hidden books via `archive_shelf` | JWT-B `GET /archive_shelf?library_id=eq.L` | Returns 4 rows (A_FW, A_OWN, A_WL, A_NWL). A_HID is absent. All rows have `owner_id=A`. |
| U-02 | A sees B's books via `archive_shelf` | JWT-A `GET /archive_shelf?library_id=eq.L` | Returns 3 rows (B_FW, B_OWN, B_NWL). All rows have `owner_id=B`. |
| U-03 | Shared title (Fourth Wing): both owner rows present | JWT-B sees A's FW row (print+audio); JWT-A sees B's FW row (ebook) | Each caller sees the co-member's row with correct `formats`. Dedup by title+author is client-side — both owner rows are available from the view. |
| U-04 | Hidden book excluded from union count | JWT-B `GET /archive_shelf?library_id=eq.L` | Row count=4, not 5. A_HID (`A Secret Tome`) is absent. |
| U-05 | Wishlist shelf value passes through | JWT-B query filtered to `shelf=eq.wishlist` | A_WL and A_NWL both returned with `shelf=wishlist`. |

---

## 3. No-Leak (HEADLINE — real JWTs, each is a security assertion)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| N-01 | `archive_shelf` has NO marks columns (structural) | JWT-B `GET /archive_shelf?limit=1` + inspect keys | Response keys: `[library_id, owner_id, book_id, title, author, cover_url, genres, formats, shelf]`. Keys `overall/smut/progress/read` are absent. |
| N-02 | `archive_reveal` has NO notes column (structural, share_reading ON) | JWT-B `GET /archive_reveal?limit=1` with share_reading=true + inspect keys | Response keys: `[library_id, owner_id, book_id, title, author, overall, smut, progress, read]`. Key `notes` is absent. |
| N-03 | B cannot read A's marks while `share_reading=false` | JWT-B `GET /archive_reveal?library_id=eq.L&owner_id=eq.A` | Returns 0 rows. |
| N-04 | B cannot read A's books directly (base table owner-only) | JWT-B `GET /books?user_id=eq.A` | Returns 0 rows. |
| N-05 | B cannot read A's notes directly | JWT-B `GET /notes?user_id=eq.A` | Returns 0 rows. |
| N-06 | Flip `share_reading=true`: B now sees A's marks via `archive_reveal` | JWT-A PATCH share_reading=true; JWT-B `GET /archive_reveal?library_id=eq.L&owner_id=eq.A` | Returns rows for A's non-hidden books with their `overall/smut/progress/read`. A_HID absent. |
| N-07 | Flip `share_reading=false`: B sees 0 again | JWT-A PATCH share_reading=false; JWT-B same GET | Returns 0 rows. |
| N-08 | Hidden book absent from `archive_shelf` for B | JWT-B `GET /archive_shelf?library_id=eq.L&book_id=eq.A_HID` | Returns 0 rows. |
| N-09 | Hidden book absent from `archive_reveal` for B (share_reading=true) | JWT-A PATCH share_reading=true; JWT-B `GET /archive_reveal?library_id=eq.L&book_id=eq.A_HID` | Returns 0 rows. |
| N-10 | Hidden book visible to owner A in own `books` | JWT-A `GET /books?id=eq.A_HID` | Returns 1 row with `hidden_from_archives=true` and A's marks. |

---

## 4. Isolation / Regression (real JWTs)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| I-01 | Outsider C: `archive_shelf` for L returns 0 | JWT-C `GET /archive_shelf?library_id=eq.L` | 0 rows (C shares no library with A/B). |
| I-02 | Outsider C: `archive_reveal` for L returns 0 | JWT-C `GET /archive_reveal?library_id=eq.L` | 0 rows. |
| I-03 | Outsider C: direct `books` query for A returns 0 | JWT-C `GET /books?user_id=eq.A` | 0 rows. |
| I-04 | Outsider C: direct `notes` query for A returns 0 | JWT-C `GET /notes?user_id=eq.A` | 0 rows. |
| I-05 | Personal library unchanged: A sees all 5 own books incl. hidden | JWT-A `GET /books?user_id=eq.A` | Returns 5 rows including A_HID, all with A's marks intact. |
| I-06 | Task-1 migrated books intact as personal books | MCP `execute_sql` — spot-check pre-existing rows | Pre-existing personal books (Quicksilver/Sinner/Brimstone/Twisted Love/Haunting Adeline/The Awakening et al.) present with owner `user_id`, marks (overall/smut/read), and `hidden_from_archives=false`. |

---

## Out of scope

- UI behavior (switcher, card layout, Wishlist filter tab, detail panel) — design-guardian covers visual review.
- Write paths (addBook, updateBook, hidden toggle) — covered by backend-dev agent.
- Audio/barcode/voice features — unrelated to this migration.
