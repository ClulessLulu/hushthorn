# Test Plan — The Binding import persistence (B1 fix + noteFingerprint port)

**Feature:** Kindle/Goodreads import ("The Binding") now persists everything it
merges: new `books` rows WITH their `notes`, and for merged books a `books`
UPDATE plus INSERT of only the genuinely-new notes (deduped by
`noteFingerprint()`), with every write error-checked and the outcome surfaced
by `PairSection.doImport`.
**App under test:** single-file `src/App.jsx` — `importBooks`, `mergeImport`,
`noteFingerprint`, `PairSection.doImport`.
**Companion unit harness:** `tests/import-dedupe-unit.mjs` (pure logic — run
with `node`; 42 cases, all green at authoring time). The cases below are the
ones that REQUIRE a live Supabase project + login, so they are a manual/MCP
plan, not a script.

## How to read this plan

- Each row carries a concrete **PASS** criterion; the test FAILS if the
  criterion is not met.
- IDs: `P-` persistence (live DB), `X-` error paths, `R-` regression.
- Methods: `Manual` (Chrome, logged-in dev account), `MCP` (Supabase MCP
  `execute_sql` to count/inspect rows), `Console` (devtools console for the
  log-and-degrade `console.error` lines).
- Fixture: a small `My Clippings.txt` with 1 book / 2 highlights, and a
  Goodreads CSV with one `read`/4-star row whose title matches an existing
  wishlist book in a different case (e.g. `BRIDE` vs `Bride`).

## 1. Happy-path persistence

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| P-01 | New book row inserted | Manual + MCP | Import clippings with 1 unseen book → `books` has exactly 1 new row (`title`, `author`, `shelf='owned'`, `read=true`, `formats={print}`) with `user_id = auth.uid()`. |
| P-02 | New book's notes inserted | MCP | Same import → `notes` has exactly 2 new rows, `book_id` = the new book's id, `user_id` set, `page`/`is_quote`/`text` matching the file, `is_voice=false`, `is_time=false`, `date` = today's short date. |
| P-03 | Notes survive reload | Manual | Hard-reload the app → the imported book still shows both highlights as marginalia (pre-fix behavior: they vanished). |
| P-04 | Merged book fields UPDATEd | Manual + MCP | With `Bride` on the wishlist (unread, 0 swords), import the Goodreads row `BRIDE` (read, 4★, owned) → the SAME `books` row (no new row) now has `read=true`, `shelf='owned'`, `overall=4`. Row count for that title = 1. |
| P-05 | Merged book's new notes INSERTed, dupes skipped | MCP | With one existing note on the book, import clippings containing that note as a whitespace/punctuation variant plus 1 new highlight → exactly 1 new `notes` row (the new one); the variant inserts nothing. |
| P-06 | No-op merge writes nothing | MCP + Console | Import a Goodreads row that is strictly weaker (unread/wishlist/lower stars) than the existing book → zero UPDATEs, zero INSERTs issued (network tab / `get_logs`); local book unchanged. |

## 2. Idempotency (the CLAUDE.md invariant)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| P-07 | Re-import same clippings file | Manual + MCP | `SELECT count(*) FROM books` and `FROM notes` before and after the second import are IDENTICAL; UI still shows the success message (a no-op import is a success). |
| P-08 | Re-import with cosmetic variants | Manual + MCP | Re-import a hand-edited copy of the same file (extra spaces, straight vs curly quotes, case changes in highlight text) → zero new `notes` rows. |
| P-09 | Second import issues zero writes | Console / network tab | During P-07, no `insert`/`update` requests to `books` or `notes` are issued at all (importBooks returns early on 0 additions + 0 updates). |

## 3. Error paths (X-)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| X-01 | Books insert fails (e.g. devtools offline) | Manual + Console | Import while offline → console shows `import books insert: …`; NO `notes` insert is attempted (no FK error); UI shows the failure copy ("…check your connection and upload the same file again. Re-importing never creates duplicates."), not the success message. Books remain visible locally for the session. |
| X-02 | Recovery by re-import | Manual + MCP | Go back online, upload the SAME file → books + notes persist, and no duplicates exist (row counts equal one import's worth). |
| X-03 | Notes insert fails after books insert | Manual + MCP | (Simulate: kill network between the two writes, or temporarily revoke insert on `notes`.) Failure copy shown; after reload the book exists without notes; re-importing the file inserts ONLY the missing notes via the merge path — self-healing, no dup book row. |
| X-04 | Merge update fails | Console | Failure on the `books` UPDATE logs `import merge update: …` and doImport shows the failure copy; app does not throw. |
| X-05 | Success message waits for writes | Manual | The "Binding…" busy label stays until the writes finish; the success/failure message appears only AFTER persistence resolves (doImport awaits onImport). |

## 4. Regression (R-)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| R-01 | Scanner batch add still persists | Manual + MCP | AddBookModal batch confirm (`onAddMany` → `importBooks`) still inserts its books (no notes) exactly as before; no console errors. |
| R-02 | RLS ownership | MCP | All rows written by an import carry `user_id = auth.uid()`; a second account sees none of them. |
| R-03 | Unique-by-title with pre-existing shelf | Manual | Importing a file whose titles all exist (any casing) adds ZERO book rows; each shows "already in archive — will update" in the preview. |
| R-04 | updateBook note path untouched | Manual | Adding/deleting a note from the DetailPanel still inserts/deletes exactly one `notes` row (column mapping unchanged — importBooks mirrors it). |
