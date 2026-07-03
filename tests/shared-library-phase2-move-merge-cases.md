# Test Cases — Shared Library Phase 2, Task 5 (move-in / merge a personal book into an archive)

**Feature:** `moveBookIntoArchive(bookId, libraryId)` — move a personal book into a shared archive, either converting it in place (title absent) or merging into an existing shared title as a co-owner (title present, case-insensitive).
**Spec (source of truth):** `docs/superpowers/specs/2026-06-30-shared-library-phase2-design.md` → "UX → Move-in / merge" and "The one rule that must never break."
**Plan:** `docs/superpowers/plans/2026-06-30-shared-library-phase2.md` → Task 5.
**App under test:** single-file `src/App.jsx` — `moveBookIntoArchive` (Hushthorn root) + the "Move into a shared archive" control in `DetailPanel`.
**Supabase project:** `ujxsrcxbhcbihhdluzyl`
**Author:** backend-dev + parser-qe. **Executed by:** qa-tester in Task 8 with real per-user JWTs.

## How to read this plan

- Each case carries a concrete **PASS** criterion; the test FAILS if the criterion is not met.
- IDs: `M-` move/merge behavior, `I-` idempotency, `E-` edge/no-leak.
- **Headline invariant (the no-leak rule):** after any move, the shared `books` row carries `overall=0, smut=0, read=false, progress={}`. Personal marks live only in `book_personal_state`. Any case that finds a mark on a shared `books` row is an automatic FAIL.

## Verification methods

- **REST-as-user** — real GoTrue password-grant JWT for the acting user, then PostgREST (`/rest/v1/...`) with `Authorization: Bearer <token>`. This is what enforces RLS. The move op runs client-side as this user; verify by reading back as this user (and as a co-member where reveal matters).
- **MCP** — Supabase MCP (`execute_sql`) as service role, **BYPASSES RLS**. Used ONLY for setup, cleanup, and reading ground-truth row state (counts, column values). **Never** to prove an access-control PASS.
- **Code** — read-only inspection of `src/App.jsx` (`moveBookIntoArchive`, `DetailPanel`).
- **UI** — drive the actual control (personal book → open detail → "Move into a shared archive" → pick archive → Move) in Chrome, then verify DB.

## Test actors

- **A** — owner: has a personal library of books and belongs to archive **L** (owner).
- **B** — co-member of **L**: used to seed an existing shared title (for the merge case) and to confirm the no-leak rule from another member's viewpoint.

## Shared setup (MCP, once)

1. A and B exist (confirmed emails), both members of archive **L** (`libraries.id = L`), via the Phase 1 flow.
2. Record baseline counts: `select count(*) from books`, `book_ownership`, `book_personal_state`, `notes`. Restore these at cleanup.

---

## (a) M-CONVERT — convert-in-place preserves marks and zeroes the row

**Precondition:** archive **L** does NOT contain a book titled "The Cruel Prince". A owns a personal book P: `title='The Cruel Prince'`, `library_id=null`, `user_id=A`, `overall=4`, `smut=3`, `read=true`, `progress={"print":100}`, `formats=['print','ebook']`, plus 2 notes owned by A on P.

**Setup (MCP):** insert P and its 2 notes for A. Confirm `select overall,smut,read,progress from books where id=P` = `4,3,true,{"print":100}`.

**Action:** as A, `moveBookIntoArchive(P.id, L)` (UI: open P's detail, pick L, Move).

**Expected DB state (MCP ground-truth):**
- `books` row P: `library_id=L`, `user_id=A` (provenance kept), and **`overall=0, smut=0, read=false, progress={}`** (RESET — the no-leak rule). `formats` unchanged (`['print','ebook']`). Exactly ONE row with this id (no duplicate created).
- `book_personal_state` for `(P.id, A)`: exactly one row, `read=true, overall=4, smut=3, progress={"print":100}`.
- `book_ownership` for `(P.id, A)`: exactly 2 rows — `print` and `ebook` (one per format in `formats`).
- `notes`: A's 2 notes still reference `book_id=P.id` (kept, not deleted).

**Verify:**
- MCP: `select overall,smut,read,progress,library_id from books where id=P` → the reset values + `L`.
- MCP: `select read,overall,smut,progress from book_personal_state where book_id=P and user_id=A` → the migrated marks.
- MCP: `select format from book_ownership where book_id=P and user_id=A order by format` → `ebook,print`.
- REST-as-B (co-member of L): `GET /books?id=eq.P` → returns the row with `overall=0,smut=0,read=false,progress={}` (B sees NO rating — the headline no-leak proof).
- REST-as-B with A's `share_reading=false`: `GET /book_personal_state?book_id=eq.P` → 0 rows for A.

**PASS:** row reset to defaults, marks migrated to A's private state, both formats owned, notes kept, B sees no marks on the row.

---

## (b) M-MERGE — merge into an existing title, no duplicate, notes re-pointed + deduped

**Precondition:** archive **L** ALREADY contains a shared book S (`title='Fourth Wing'`, `library_id=L`, created by B, `overall=0,smut=0,read=false,progress={}` per the no-leak rule; B owns `print`). A owns a personal book P2: `title='fourth wing'` (different casing — must still match), `library_id=null`, `user_id=A`, `overall=5,smut=4,read=true,progress={"audio":100}`, `formats=['audio']`, with 3 notes owned by A on P2. One of A's notes has text identical (after normalization) to a note A already has on S; the other 2 are unique. (Seed the shared-side duplicate note as A on S first, so the dedupe has something to hit.)

**Setup (MCP):** insert S (+ B's ownership), insert P2 (+ A's 3 notes), insert 1 pre-existing A note on S that matches one of P2's notes (same normalized text/page/quote/time).

**Action:** as A, `moveBookIntoArchive(P2.id, L)`.

**Expected DB state (MCP ground-truth):**
- `books`: still exactly ONE row titled "Fourth Wing" in L (`id=S`). **P2's row is DELETED** (`select count(*) from books where id=P2` → 0). No second shared row created.
- S's `books` columns remain `overall=0,smut=0,read=false,progress={}` (untouched — A's marks never land on the group row).
- `book_personal_state` for `(S.id, A)`: exactly one row, `read=true,overall=5,smut=4,progress={"audio":100}` (A's marks migrated onto the existing shared row).
- `book_ownership`: `(S.id, A, 'audio')` exists; B's `(S.id, B, 'print')` untouched.
- `books.formats` for S: unioned to include `audio` (so ProgressEditor shows A's audio row) — e.g. `['print','audio']`.
- `notes`: A's 2 UNIQUE notes now reference `book_id=S` (re-pointed). The 1 DUPLICATE note from P2 is DELETED (the copy already on S survives). Net: A has exactly 3 notes on S (2 re-pointed + 1 pre-existing), 0 notes on P2. B's notes untouched.

**Verify:**
- MCP: `select count(*) from books where library_id=L and lower(title)='fourth wing'` → 1.
- MCP: `select count(*) from books where id=P2` → 0.
- MCP: `select read,overall,smut,progress from book_personal_state where book_id=S and user_id=A` → the migrated marks.
- MCP: `select format from book_ownership where book_id=S and user_id=A` → `audio`.
- MCP: `select formats from books where id=S` → contains `audio`.
- MCP: `select count(*) from notes where user_id=A and book_id=S` → 3; `... book_id=P2` → 0.

**PASS:** no duplicate shared row, P2 deleted, A's marks on private state (not the group row), audio owned + unioned into formats, notes re-pointed with the duplicate collapsed.

---

## (c) I-CONVERT / I-MERGE — repeating either is idempotent (no dupes, no error)

**Precondition:** the end state of (a) and (b) respectively.

**Action:** as A, run `moveBookIntoArchive` a SECOND time with the same arguments.
- For (a): `moveBookIntoArchive(P.id, L)` again. NOTE: P is now shared (`library_id=L`), so the DB load `.is('library_id', null).eq('user_id',A)` returns no personal row → the function logs "personal book not found" and returns without change. **Zero side effects.**
- For (b): P2 no longer exists → the load returns no row → return, zero side effects. (To exercise the merge dedupe path directly, re-run the merge on a freshly re-seeded identical P2; ownership insert must ignore 23505, personal_state upsert must overwrite-in-place, notes re-point must skip fingerprints already on S.)

**Expected DB state:** identical counts to the post-(a)/(b) state. Specifically:
- `book_ownership` count for A on the target: unchanged (23505 dedupe).
- `book_personal_state` for A on the target: exactly one row (upsert PK `book_id,user_id`), values unchanged.
- `notes` count for A on the target: unchanged (fingerprint dedupe skips re-points; no new duplicates).
- No error surfaced to the UI (the control's `runMove` swallows/defends; `moveBookIntoArchive` returns quietly).

**Verify (MCP, before vs after the second run):** snapshot the 4 counts (`books`, `book_ownership`, `book_personal_state`, `notes`) scoped to the target ids; diff = 0 across the board.

**PASS:** second run changes nothing and throws nothing.

---

## (d) E-UNRATED — an unrated / unstarted book creates NO book_personal_state row

**Precondition:** archive **L** does NOT contain "A Court of Silence". A owns a personal book P3: `title='A Court of Silence'`, `library_id=null`, `user_id=A`, `overall=0, smut=0, read=false, progress={}` (all defaults, no progress), `formats=['print']`, no notes.

**Action:** as A, `moveBookIntoArchive(P3.id, L)`.

**Expected DB state:**
- `books` row P3: converted (`library_id=L`), columns still `0/0/false/{}`.
- `book_personal_state` for `(P3.id, A)`: **0 rows** (no bogus default row — the meaningful-mark guard `overall>0 || smut>0 || read===true || progress non-empty` is false).
- `book_ownership` for `(P3.id, A, 'print')`: 1 row (ownership is still recorded regardless of marks).

**Verify:** MCP `select count(*) from book_personal_state where book_id=P3` → **0**; `select count(*) from book_ownership where book_id=P3 and user_id=A` → 1.

**PASS:** no personal_state row for an unrated book; ownership still created.

---

## (e) E-NOFORMAT — a book with no formats defaults to print ownership

**Precondition:** A owns a personal book P4 with `formats` empty/null (`[]` or `null`), `title` absent from **L**, some marks or none (either is fine — this case is about format defaulting).

**Setup (MCP):** insert P4 with `formats='{}'` (empty array) or `formats=null`.

**Action:** as A, `moveBookIntoArchive(P4.id, L)`.

**Expected DB state:**
- `book_ownership` for `(P4.id, A)`: exactly 1 row with `format='print'` (the default).
- `books.formats` for P4: the function does not force-write formats on the convert path — it only reads them to derive ownership; the row keeps its stored formats. (If empty, ProgressEditor falls back to print in the merge shape via `formats: row.formats || ['print']` on load.)

**Verify:** MCP `select format from book_ownership where book_id=P4 and user_id=A` → `print` (one row).

**PASS:** no-format book yields exactly one `print` ownership row.

---

## (f) E-ISOLATION — a personal book untouched by a move stays owner-only

**Precondition:** A owns an unrelated personal book P5 (`library_id=null`) that is NEVER moved. B is a co-member of L but has no relationship to P5.

**Action:** perform any of the moves above on OTHER books; do nothing to P5.

**Expected DB state:**
- P5 remains `library_id=null`, marks on the row (unchanged), no `book_ownership` / `book_personal_state` rows.
- REST-as-B: `GET /books?id=eq.P5` → **0 rows** (B cannot see A's personal book — owner-only RLS, unaffected by Phase 2).

**Verify:**
- MCP: `select library_id from books where id=P5` → `null`; `select count(*) from book_ownership where book_id=P5` → 0.
- REST-as-B: `GET /rest/v1/books?id=eq.P5` with B's JWT → `[]`.

**PASS:** the moved-book plumbing never touches an unrelated personal book; it stays private to A.

---

## Cleanup (MCP)

Delete all seeded books (P, S, P2–P5), their `book_ownership`, `book_personal_state`, and `notes` rows for A and B. Re-confirm the baseline counts recorded in setup are restored (no orphans, `on delete cascade` from `books` handles ownership/personal_state; delete notes explicitly if any remain).

## Code-inspection checks (no DB needed)

| ID | Check | PASS criterion |
|---|---|---|
| C-01 | Title match guard | `moveBookIntoArchive` uses `.ilike('title', title)` THEN a strict JS `trim().toLowerCase()` equality filter over candidates — a partial ilike hit ("Fourth Wing" vs "Fourth Wingman") is rejected. |
| C-02 | No-leak reset | Case A issues `update books set overall=0,smut=0,read=false,progress={}` AFTER migrating marks to personal_state. |
| C-03 | Meaningful-mark guard | `upsertMyState` returns early (no upsert) when `!hasMarks` (`overall>0 || smut>0 || read===true || progress non-empty` is false). |
| C-04 | Ownership idempotency | ownership insert ignores `error.code === '23505'`. |
| C-05 | personal_state idempotency | upsert with `onConflict: 'book_id,user_id'`. |
| C-06 | Notes-first ordering | in Case B, notes are re-pointed/deduped BEFORE `delete from books where id=bookId` (FK safety). |
| C-07 | Note dedupe | source notes whose fingerprint already exists among A's notes on the target are DELETED, not re-pointed; survivors add their fp so two identical source notes don't both survive. |
| C-08 | Format union | Case B unions A's formats into the target's `books.formats` when any are missing. |
| C-09 | UI gate | the "Move into a shared archive" control renders only when `!book.library_id && archives.length > 0`. |
| C-10 | Defensive | every Supabase call in `moveBookIntoArchive` logs its error and returns; nothing throws to the UI. |
