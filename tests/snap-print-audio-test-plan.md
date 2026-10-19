# Test Plan — Snap-to-update for Print Books (page + chapter) and Audiobooks

**Feature:** "📸 Snap to update": photo or screenshot → Claude vision → confirm → write progress
**Code under test:** PR #2 (`claude/signup-error-production-dpdg7n`). Pure logic in `src/lib/progressSnap.js`; browser photo preparation in `src/lib/snapImage.js`; UI in `src/App.jsx` (`PROGRESS_SHOT_PROMPTS`, `readProgressShot`, `ProgressEditor`, `handleSnap`, `applySnap`); auto-Read in `updateBook`; server proxy `api/claude.js`. Line numbers omitted on purpose: they drift.
**Supersedes:** `tests/snap-to-update-test-plan.md` rows `U-01`, `U-12`, `U-13` (they expect the old print shape `{page, pages}`; print now reads `{page, chapter}`). Ebook rows there still stand.
**Drafted:** 2026-10-19. **Status:** unit rows `DONE` (54 passing). Photo preparation `DONE` and checked in headless Chromium. **Nothing that calls the real model has been run**: there is no Anthropic key in the build environment, so section 4 and the model half of A-01/A-02 are still open.

## How to read this plan

- Every row has a **PASS** criterion; if it isn't met the row fails.
- IDs: `G-` ground truth, `B-` data, `U-` unit, `V-` vision evaluation (real model), `F-` frontend, `A-` audiobook, `N-` network/size, `X-` release.
- **Rows marked `KNOWN GAP` are expected to FAIL today.** Each links to a gap in section 8.
- The unit tests prove the logic. They say **nothing** about whether Claude reads a photo correctly. That is what section 3 is for, and it is the part most likely to fail in the real world.
- Run on staging with a throwaway book. A scan can mark a book finished (see A-05).

---

## 1. Ground truth: the reported photos (print)

Read by eye from the five images the user sent. These are the expected answers; "page null" means nothing is printed on that page.

| ID | Photo | Expected `page` | Expected `chapter` | Distractors in the photo |
|---|---|---|---|---|
| G-01 | Camera preview: left page (running head "2 · JAMES PATTERSON", faint) + right page chapter opener "TWO" | `3` (left + 1) **or** `null` | `2` | Laptop and desktop behind the book; thumb over the left page |
| G-02 | Chapter opener "TWO", single page, close-up | `null` | `2` | Story text: "sixteen-pound", "twenty minutes" |
| G-03 | Chapter opener "ONE" + "Eastern Russia / 30 Years Ago" | `null` | `1` | "30 Years Ago" is a number that is **not** a page |
| G-04 | Page with running head "4 · JAMES PATTERSON" | `4` | `null` | Keyboard keys in the background ("4", "$", "R", "C"); "4 a.m." in the text |
| G-05 | Chapter opener "THREE", sliver of the facing page on the left | `null` | `3` | Cut-off words from the other page; the user's thumb |

Strict PASS for the set: **no photo produces a wrong page.** A `null` is acceptable (the app asks); a wrong number is not, because the user may confirm it without checking. Chapter errors are secondary but must be recorded.

## 2. Data

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | Stored shape | MCP `execute_sql` after Apply on staging | `progress.print` = `{page, pages?, chapters?}`; `chapters` keys are integer strings, values positive integers; no `null` values written. |
| B-02 | No migration, RLS unchanged | Code | `progress` jsonb column reused; `books` RLS owner-only is untouched. |
| B-03 | Damage cleanup | MCP | `select title from books where progress->'print'->'page' = 'null'::jsonb` returns 0 rows after cleanup. **Today it returns 1** (Perfect Assassin). Decide: clear the nulls by hand. |
| B-04 | Chapter map visibility | Code + Manual | `progress` is shared with co-keepers when "share my progress" is on. Decide whether `chapters` should be visible; if not, strip it from the shared payload. |

## 3. Unit (Node, in CI): `tests/progress-snap-unit.mjs`, 54 passing

Already covers: nothing-read → `null` for each format; page-only snap keeps the stored total; null page writes nothing; chapter learning, overwrite, idempotency; malformed stored progress; no mutation of stored data; guess interpolation, extrapolation and ordering; past-total flag; the four-photo session end to end; audio time-left derivation, missing/inconsistent totals, and the listened-past-total block; photo size maths (`fitWithin`).

To add (needs `readProgressShot` moved to the lib with the model call injected, because today it lives in `App.jsx` and can't be imported):

| ID | Case | PASS criterion |
|---|---|---|
| U-01 | Model returns fenced JSON, JSON with prose, garbage, truncated JSON, empty content | `null`, never throws |
| U-02 | Model returns the **old** shape `{"page":4,"pages":384}` | `pages` ignored; `{page:4, chapter:null}` |
| U-03 | Model returns `"chapter": "THREE"` or `"III"` (string, not integer) | **KNOWN GAP G-3**: chapter is silently lost today; PASS = parsed as 3, or at least handled without a wrong number |
| U-04 | Model returns roman-numeral front matter, `"page": "xii"` or `12` | `page` is `null` (front matter is not a story page) |
| U-05 | Network/HTTP failure (401, 413, 500) | `null`; UI shows the error state |

## 4. Vision evaluation: the real model (not run in PR CI)

Needs an Anthropic key, so it runs by hand or on a schedule. The model is non-deterministic, so each photo is run **3 times** and every run counts.

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| V-01 | Reported photos G-01 to G-05 | Manual on staging, 3 runs each | Meets section 1. Any wrong page in any run is a failure to investigate. |
| V-02 | Golden set | Script over `tests/fixtures/snap/*.jpg` + `expected.json` | **≥ 20 photos** across ≥ 5 books: right page with number, left page with number, facing pages, chapter opener, dim light, glare, angled shot, finger covering text. Wrong-page rate **0%**, null rate reported, chapter exact-match ≥ 90%. |
| V-03 | Front matter | Photo of a preface page (roman numerals) | `page` null. Never `12`. |
| V-04 | Page with no number and no chapter (cover, blank, mid-chapter page with no header) | Manual | `null` for both; error state; no Apply button. |
| V-05 | Number hazards | Photos where the only digits are in story text, a price, a barcode or a date | `page` null. |
| V-06 | Kindle/Libby "Page 145 of 320" screenshot used under Print | Manual | Page read as 145. Total is **not** read (the print prompt no longer asks for it): confirm that is acceptable. |

**Fixtures and copyright:** do not commit photos of copyrighted pages (the five above are *Perfect Assassin*) into the repo. Use public-domain books for the committed set, and keep the user's real photos outside the repo.

## 5. Frontend: print confirm strip

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-01 | Printed page read | Manual | Page field prefilled and editable; `p / total (%)` shown when the total is known. |
| F-02 | Chapter, not in the book's map | Manual | Note "Chapter N has no page number printed", a guessed page, editable. |
| F-03 | Chapter already learned | Manual | No note; page filled from the map. |
| F-04 | Apply disabled for bad input | Manual | Empty, 0, negative or decimal page → Apply disabled. |
| F-05 | Past the stored total | Manual | Page 412 on a 384-page book → total field appears; Apply disabled until total ≥ page. |
| F-06 | What Apply writes | MCP | Only `page`, `chapters` and (if corrected) `pages`; the stored total is unchanged otherwise. |
| F-07 | Retry, Enter by hand | Manual | Retry reopens the picker; Enter by hand clears the strip without writing. |
| F-08 | Slow/failed model call | Manual (throttle, block `/api/claude`) | "Reading the screen…" then the print error message; **nothing written**. |
| F-09 | Snap button while reading | Manual | Disabled during loading; no double request. |
| F-10 | Phone layout | Manual (360 px) | Confirm strip fits, inputs ≥ 44 px, no horizontal scroll. |
| F-11 | Camera blocked | Manual | Picker still works as an upload. |

## 6. Audiobook

The audio prompt was **not** changed by PR #2. These rows test what exists.

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| A-01 | Player showing "1:23:45 / 8:20:11" | Manual | `listened ≈ 1.40`, `hours ≈ 8.34` (decimal hours). |
| A-02 | Player showing **only time left** ("3 hr 12 min left"), the most common layout | Unit `DONE` + Manual | **G-2 FIXED in code.** Unit: stored total 10 h, 3.2 h left → listened 6.8 (derived); no total known → refused with a message, never recorded as listened. **Still to do manually:** confirm the real model puts "3 hr 12 min left" in `remaining` and not `listened`. |
| A-03 | Only the chapter's elapsed time shown | Manual | Not recorded as total progress. |
| A-04 | Partial read (listened only) | Unit + Manual | Stored `hours` is kept; only `listened` changes. |
| A-05 | **A bad read marks the book finished** | Unit `DONE` | **G-4 FIXED.** Before: a 12 h read on a 9.5 h book was stored, clamped to 100% and (by `updateBook`'s `maxPercent ≥ 100` rule) auto-marked the book Read. Now both fields are editable and Apply stays disabled while listened > total. The unit test replays the exact scenario. |
| A-06 | Hours/minutes conversion | Unit | 2h15m → 2.25, 45m → 0.75, "1:05:30" → 1.0917; stored with sane rounding. |
| A-07 | Overlays | Manual | Sleep-timer or speed overlay covering the time → `null`, no guess. |
| A-08 | Apps | Manual | Audible, Libby, Spotify audiobooks, Apple Books each produce a sensible read or a clean failure. |

## 7. Network and size

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| N-01 | **Large photo** | Headless Chromium `DONE` + Manual | **G-5 FIXED.** Before: the photo went to `/api/claude` as base64 with no resizing, and Vercel Functions reject request bodies over 4.5 MB ([limit](https://vercel.com/docs/functions/limitations)), so a photo over about 3.3 MB failed with 413 and the user saw only "Couldn't read…". Now it is downscaled to 1568 px (the longest edge the standard-tier vision models keep; [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)) and re-encoded as JPEG. Browser check: a 12.4 MB noise photo (16.5 MB as base64) → 1568×1176, ~1.3 MB; EXIF rotation respected (portrait stays portrait); no upscaling; transparent PNG gets a white background; HEIC/corrupt/empty files give a clear "couldn't be opened" message. **Still to do manually:** one raw photo from your own phone camera. |
| N-02 | Signed out / expired session | Manual | `/api/claude` 401 → error state, no write. |
| N-03 | AI not configured (no `ANTHROPIC_API_KEY`) | Manual on a preview | 503 → error state with the manual path. |
| N-04 | Cost guard | Code | One call per snap, `max_tokens: 1000`; Retry is user-initiated only. |

## 8. Known gaps (decisions needed)

| Gap | Problem | Suggested fix |
|---|---|---|
| G-2 | **FIXED** (unit-proven; real-model behaviour still to confirm, see A-02). Audio prompt did not handle "time left" displays; a remaining time could be recorded as time listened. | Prompt now returns `remaining`; the app computes `listened = hours − remaining` when the total is known. |
| G-3 | A chapter returned as a word or roman numeral becomes `null` silently. | Parse words and roman numerals defensively in `coerce`, with unit tests. |
| G-4 | **FIXED.** Audio `listened > hours` auto-marked the book Read. | Apply is blocked until the pair is consistent. |
| G-5 | **FIXED.** No client-side downscaling; large photos hit the 4.5 MB body limit with no explanation. | Resized to 1568 px as JPEG before sending (also cheaper and faster). |
| G-6 | Nothing automated touches the real model, so prompt changes can regress silently. | Build the V-02 golden set; run it by hand before changing a prompt. |

## 9. Release gate

1. CI green: unit tests, build, bundle check.
2. V-01 passes with **no wrong page** in 3 runs of each reported photo.
3. N-01: one raw phone photo through the real app, outcome recorded.
4. A-02: one real "time left" screenshot (Audible or Libby) through the real model, outcome recorded.
5. B-03 cleanup done (open: the damaged *Perfect Assassin* record is still in production).
