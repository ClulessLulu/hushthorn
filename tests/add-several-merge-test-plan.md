# Test Plan — Pre-merge: Add several fixes, spine-photo removal, password eye, Inscribe arch

**Scope:** working tree of `test/e2e-buttons` on 2026-11-16 (uncommitted changes in
`src/App.jsx`, new `src/lib/importMerge.js`, deleted `SpineAppearance.jsx`,
`spinePhoto.js`, `spine-photo-unit.mjs`; edited `tests/e2e/buttons.inscribe.spec.js`,
`tests/import-dedupe-unit.mjs`).
**Code under test (by name):** `importBooks` (root `Hushthorn`), `AddBookModal.pick`,
`AddBookModal.addSearchBatch`, `mergeImport` / `noteFingerprint` (`src/lib/importMerge.js`),
`Spine`, `DetailPanel`, `PairSection.doImport`, `NavTab` (Inscribe arch), the password
eye in the auth pages.
**Environment:** STAGING only (`npm run dev:staging`, port 5174, project
`shwhzfpqjbwukjztlzee`). Badge "STAGING · THROWAWAY DATA" confirmed before the first
write; every Supabase request in every scripted run went to the staging host only
(asserted by the script). Account: E2E alpha. Every created book is titled `E2E …`
and deleted at the end.
**Method key:** `Unit` = `npm test`; `E2E` = `npm run test:e2e`; `Browser` = scripted
Chromium (Playwright library, own scripts, real staging) at 1280x900 and 390x844;
`REST` = rows read back from staging as alpha; `Code` = read the function.

Real search results go through the live Google Books API (it rate-limited with 429
during the run) and the Open Library fallback. `E2E ` is put in front of every
returned title by a route rewrite, and a guard aborts any books INSERT whose title
lacks the prefix.

## 1. Build and automated layers

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| B-01 | Unit tests | `npm test` | Exit 0, 5 files, 0 failures; `import-dedupe-unit.mjs` imports `src/lib/importMerge.js` (not a copy) |
| B-02 | Build | `npm run build` | "built", exit 0 |
| B-03 | No secrets in bundle | `check-dist-for-keys.mjs` | Prints `OK` |
| B-04 | Bundle content | grep `dist/` | `Enter the Archive` present; `Shelf spine`, `hushthorn:spine:`, `SpineAppearance` absent |
| B-05 | UI suite | `npm run test:e2e` | 0 failed; >= 111 passed; only the known Esc skip |
| B-06 | Merge base | `git rev-list`, `git merge-tree` | Branch is 0 behind master; committed HEAD merges cleanly |

## 2. Add several (search queue)

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| F-01 | Queue of one | Browser, real search, REST | "1 queued" → "Add 1 to the archive" → window closes; exactly 1 row with the picked author/year/cover/shelf |
| F-02 | Mixed queue of 4 real results (2 Owned, 2 Wishlist; different authors/years/covers) | Browser, REST | 4 rows from one INSERT; each row has its OWN author, year, cover_url, genres, shelf; no two rows share another's data |
| F-03 | Persistence | Browser reload, open each book | Each book shows exactly 1 card; panel shows its own title, author and year; rows unchanged after reload |
| F-04 | Same title picked twice | Browser | Queue holds 1 entry, not 2 |
| F-05 | Title already in library, different case | Browser, REST | Entry marked "already in archive", excluded from the Add count; after Add the existing title still has exactly 1 row, shelf unchanged |
| F-06 | Only an already-owned title queued | Browser | No Add button; closing writes nothing |
| F-07 | Real double-click on Add (POST slowed 1.5 s) | Browser, request count | Button shows "Inscribing…" and is disabled; 1 POST; 1 row per title |
| F-08 | Two clicks dispatched in the same JS task | Browser, request count, REST | 1 POST; 1 row (one book per title) |
| F-09 | Untick with items queued, re-tick | Browser | Panel hides; queue is still there on re-tick; nothing written |
| F-10 | Close with items queued, reopen | Browser, REST | Nothing written; reopen state recorded (observation) |
| E-01 | Offline, press Add | Browser `setOffline`, REST | Window stays; alert text "Those tomes could not be saved. Check your connection, then tap Add again."; queue intact; no card for the unsaved books on the shelf; 0 rows |
| E-02 | Back online, press Add again | Browser, REST, reload | Window closes; exactly 1 row per book with its own year and shelf; 1 card each after reload |
| F-11 | Single add, checkbox off | Browser, REST | Book saved at once with year, author, genres, shelf; 1 card after reload |
| U-01 | `mergeImport` keeps an integer `year`, ignores non-integers | Unit | M-batch cases pass |

## 3. Spine-photo removal

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| F-20 | No "Shelf spine" section in a book's panel | Browser: every book opened (5 batch books at 1280, the F-50 book at both widths) | Panel text never contains "Shelf spine" |
| F-21 | Spines view renders | Browser, both widths | Every spine has the gradient background and visible title text; 0 `.invisible` titles; no horizontal scroll; no new console errors |
| E-20 | Leftover `hushthorn:spine:<id>` values (data URL, junk, `javascript:`) | Browser | Library loads; same spine count; no spine uses the stored value; no new console errors |

## 4. Password eye (sign-in / create account)

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| F-30 | Toggle | Browser | Click flips input `type` password↔text and name "Show password"↔"Hide password" |
| F-31 | Keyboard | Browser | Tab from the field reaches the eye; Enter and Space toggle it |
| F-32 | Does not submit, keeps value | Browser | URL unchanged, no alert, value length unchanged |
| F-33 | Independent per field (create account) | Browser | Toggling the confirm eye does not change the password eye |
| F-34 | Reset-password screen | — | Needs an emailed recovery link: NOT TESTED |

## 5. Inscribe arch tab

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| F-40 | Opens the window | Browser | Click opens the `Inscribe` dialog |
| F-41 | Selected while open | Browser | `aria-expanded="true"` and the selected art (`tab-selected.webp`) while open; `false` when closed |
| F-42 | Three tabs fit at 390 | Browser | All three tab boxes inside 0..390; no horizontal scroll |

## 6. Regression

| ID | Check | Method | PASS criterion |
| --- | --- | --- | --- |
| F-50 | Search add → open → Verdict 4 → note → reload → banish | Browser, REST, both widths | Row has year/author; `overall=4`; note row exists and shows after reload; 0 rows after banish |
| F-51 | The Binding page loads (`mergeImport` moved) | Browser, both widths | Codex renders, no horizontal scroll, no errors |
| F-52 | Goodreads CSV import, twice | Browser, REST, request log | Run 1 writes 2 rows (read/owned, to-read/wishlist); run 2 makes 0 write requests and rows are unchanged |
| E-50 | Goodreads import with the books INSERT refused | Browser, REST | Error shown; on-screen copy matches what actually happened to the shelf |
