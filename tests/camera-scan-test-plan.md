# Test Plan — Camera and Scan Functions (validate on master)

**Code under test:** `master` @ `4769a57` (PR #2 snap-to-update + PR #3 forgot-password merged). Line numbers omitted on purpose: they drift.
**What counts as a camera/scan function:** every place the app opens the camera or reads a photo.
1. **Live ISBN barcode scan** (Add Book → Scan): native `BarcodeDetector` (asks for `ean_13` only) where the browser has it, otherwise ZXing.
2. **Scan multiple:** queue barcodes, then "Add N".
3. **Cover photo → AI reads title/author** (`scanCover`): live "📸 Capture cover" and "⬆ Upload a photo" (with the crop step).
4. **Change cover on an existing book** (`CoverEditor`).
5. **Snap to update progress** for print, ebook and audio. The detailed rows live in `tests/snap-print-audio-test-plan.md`; section 7 here is the on-device runbook.

**Drafted:** 2026-10-20 from the code on master plus checks in the build sandbox. **No row below has been run on a real phone.**
**Fixtures:** `tests/fixtures/camera-scan-barcodes.html` (barcodes to scan off a screen) and the five reported page photos (not committed: copyrighted pages).

## How to read this plan

- Every row has a **PASS** criterion. Record ✅ / ❌ and what you saw. Take a screenshot or short screen recording for every ❌.
- IDs: `PRE-` setup, `CAM-` camera lifecycle, `BC-` single barcode, `MS-` scan multiple, `CP-` cover photo, `CE-` change cover, `SN-` snap to update, `X-` cross-cutting.
- 🔎 marks a **suspected defect found by reading the code**. Run those first. Section 9 lists each with the evidence.
- **Master is production.** You are writing real rows to your real account. Everything you add must be deleted (section 8).
- Each cover scan and each progress snap makes **one Claude call** through your `/api/claude` proxy (small cost).

## What is already proven, and what is not

| Proven in the build sandbox | Not proven (that is why this plan exists) |
|---|---|
| The seven fixture barcodes decode to their exact printed digits with ZXing (the app's fallback decoder) at full size, small, and slightly blurred. EAN-8 and the non-ISBN EAN-13 decode too, so the app's own ISBN filter must reject them. | Any real camera, `BarcodeDetector`, iOS Safari behaviour, focus, glare, and low light. |
| Progress-snap logic: 54 unit tests; the confirm → Apply → save path against a mocked model. | Claude actually reading your photos, covers and screenshots. |
| Photo downscaling for progress snaps in headless Chromium. | Open Library and Google Books lookups: unreachable or rate-limited from the sandbox, so **expected titles below are unverified**. |
| The full-frame cover crop outputs the photo size × the screen's pixel ratio (measured, section 9, H-1). | Anything on a real phone's memory limits. |

---

## 1. Set-up (do these first)

| ID | Check | PASS criterion |
|---|---|---|
| PRE-01 | Master is what is deployed | Vercel → hushthorn → Deployments: Production is commit `4769a57` ("Merge pull request #3") and Ready. |
| PRE-02 | New code is live | Sign-in page shows **Forgot your password?** under the password field and **no Google button**. |
| PRE-03 | Devices | At least: **D1** Android phone with Chrome; **D2** iPhone with Safari; **D3** desktop Chrome with a webcam. Optional **D4** Android Firefox or Samsung Internet. Write down model, OS, browser version. |
| PRE-04 | Which decoder each device uses | On D1/D3 open DevTools (`chrome://inspect` for the phone) and run `'BarcodeDetector' in window`. `true` = native path, `false` = ZXing path. Record it per device: the two paths behave differently. |
| PRE-05 | Fixtures | Open `tests/fixtures/camera-scan-barcodes.html` on a laptop at high brightness, no glare. Seven cards, each says what should happen. |
| PRE-06 | Test books | Have 3 real books with ISBN barcodes (one glossy hardcover, one paperback, one older book), and one real book **already in your archive**. |
| PRE-07 | Baseline | Note your book count and the covers-bucket object count (Q3 in section 8) before you start. |

## 2. Camera lifecycle (Add Book → Scan)

| ID | Check | PASS criterion |
|---|---|---|
| CAM-01 | First open, allow permission | Live **back-camera** preview, a pink scan line, status "Point at the barcode…". |
| CAM-02 | Deny permission | Status "The camera couldn't be opened — grant permission, or upload a photo instead." **Open the camera** and **Upload a photo** remain usable. The app does not re-prompt in a loop. |
| CAM-03 | Allow later in site settings, then tap **Open the camera** | Camera starts. Record whether a page reload was needed (iOS often needs one). |
| CAM-04 | Dismiss the permission prompt without choosing | No crash or blank screen; tapping **Open the camera** asks again. |
| CAM-05 | Close the modal (X, back button) while live | Camera light goes out within about a second; `chrome://inspect` shows no live stream. |
| CAM-06 | Switch Scan → Search → Scan | Camera stops on leaving and starts **once** on returning (no double stream, no frozen preview). |
| CAM-07 | Lock the phone or background the app for 30 s, return | Camera resumes, or **Open the camera** is offered. Never a frozen black preview with no way out. |
| CAM-08 | Rotate portrait ↔ landscape | Preview is not stretched; scanning still works. |
| CAM-09 | No camera / camera busy (desktop without webcam; another app holding the camera) | Same message as CAM-02. No crash. |
| CAM-10 | **Stop camera** / **Open the camera** | Toggles reliably; Stop ends the stream. |
| CAM-11 | Open and close the scanner 20 times | No slowdown, no heat, camera light never stuck on. |

## 3. Single barcode scan

| ID | Check | PASS criterion |
|---|---|---|
| BC-01 | Scan fixture **BC-A** off a screen | Status "Found ISBN … — consulting the archives…", then the review form: title contains "Gatsby", author, cover, genres filled; notice "Matched from the barcode — confirm the details, then inscribe." Within 5 s of steady aim on good network. |
| BC-02 | **Inscribe to Owned** | Book appears in Owned; survives a reload. Q1 shows the row with `cover_url` and, if the lookup knew it, `progress.print.pages` as a positive integer. |
| BC-03 | Same with **Inscribe to Wishlist** | Appears on Wishlist, not Owned. |
| BC-04 | Scan the printed barcode on each of your 3 real books at 15–25 cm | Each reads within 5 s; the matched title is the right book. |
| BC-05 | Unknown ISBN: fixture **BC-X** | "That barcode wasn't in the archives. Try capturing the cover instead." The camera restarts on its own. No book is created. |
| BC-06 | Non-ISBN barcodes: fixtures **BC-N1** (EAN-13) and **BC-N2** (EAN-8) | Ignored for at least 15 s: no review form, no error, status stays "Point at the barcode…". |
| BC-07 | Scan a book you already own | A dialog "Already in your archive" appears. **Cancel** adds nothing. **Add anyway** adds a *separate* second copy (by design per the dialog; note that CLAUDE.md still says titles are unique). |
| BC-08 | Hard conditions: dim light, glare, 30° angle, 40 cm away, shaky hands | Record read time or failure for each. PASS = reads within 10 s in at least 3 of 4. In the sandbox a barcode that was both small and out of focus did **not** decode, so expect failures when both apply. |
| BC-09 | 🔎 **Airplane mode right after the camera detects the code** | The user should be told the lookup failed. Expected from the code: the app says "That barcode wasn't in the archives…" (H-2). Record what you see. |
| BC-10 | Throttle to slow 3G | Status stays "consulting the archives…", no duplicate review forms, result eventually appears. |
| BC-11 | Hold the same barcode steady for 10 s | One review form only. |
| BC-12 | **D2 iPhone Safari** | Preview is not blank; barcode reads (ZXing path); record time to read. |

## 4. Scan multiple

| ID | Check | PASS criterion |
|---|---|---|
| MS-01 | Tick **Scan multiple** | **Capture cover** and **Upload a photo** disappear; "0 queued" and "Point at a barcode — matches drop in here." |
| MS-02 | Scan **BC-A, BC-B, BC-C, BC-D** one after another | Each lands in the queue with title, author and cover; status `📖 Added "…"`; counter reads 4 queued. |
| MS-03 | Keep a barcode in view | Within 2 s: ignored. After that: "Already scanned — keep going…"; the count does not rise. |
| MS-04 | Unknown **BC-X** | "ISBN … not in the archives — keep scanning…"; no row. |
| MS-05 | Non-ISBN **BC-N1/BC-N2** | Ignored. |
| MS-06 | Scan a book already in your archive | Row is faded and tagged "already in archive"; status says so; it is **not** counted in "Add N". (Single scan lets you add a second copy; multi-scan cannot. Note it.) |
| MS-07 | **✕** on a queued row | Row removed; counter updates. |
| MS-08 | Pick a shelf, tap **Add N to** | Modal closes; exactly N new books on the chosen shelf, none duplicated, not marked read. Q1/Q2: N rows, right shelf, `progress.print.pages` where known. |
| MS-09 | Close the modal with books still queued | Record what happens. Expected from the code: the queue is discarded with no warning (H-5). |
| MS-10 | Leave the camera on for 5 minutes | No crash, no growing lag, preview still live. |
| MS-11 | Airplane mode mid-queue, then scan | Same misleading "not in the archives" message (H-2); the queued books are untouched. |
| MS-12 | Toggle Scan multiple off and on mid-scan | No stuck state; next scan behaves per the new mode. |

## 5. Cover photo → AI reads title/author

| ID | Check | PASS criterion |
|---|---|---|
| CP-01 | Scan mode, tap **📸 Capture cover** on 3 different book covers with clear text | Review form opens with title/author filled and the notice "The scribe read the cover — check the details, then divine or adjust the genres." Title matches the cover (a wrong guess is a finding; blank is acceptable). |
| CP-02 | **⬆ Upload a photo** (gallery) → crop → **Apply** | Review form opens; same AI behaviour as CP-01. **Skip** behaves the same. |
| CP-03 | Type a title first, then capture a cover | No AI call is made (Network tab shows no `/api/claude`). Cover is kept. (By design: the scan only runs when the title is empty.) |
| CP-04 | 🔎 **Large photo.** Take a 12 MP photo with the phone's own camera app, then Upload it and Apply with the **whole frame** | Review form within 5 s, no freeze, no blank cover, title read. The full-frame crop is rendered at photo size × screen pixel ratio (H-1). Record the time and any crash on D1 and D2. |
| CP-05 | Rotate and zoom in the crop modal | The saved cover matches the preview. |
| CP-06 | Cancel the add without inscribing | No new object in the `covers` bucket (Q3 count unchanged). |
| CP-07 | Inscribe with a photo cover | Q3 shows `covers/{your uid}/{uuid}.jpg`; `books.cover_url` is that public URL; the cover loads after reload and in a private window. Record the file size (expect well under 1 MB). |
| CP-08 | Airplane mode at the moment you tap Inscribe | The book is still saved (fallback cover), no crash. Record whether you are told the photo was not saved (the code swallows the failure silently, H-7). |
| CP-09 | AI unavailable (offline) while scanning the cover | "The scribe couldn't make out the cover. Inscribe the details by hand below." Manual entry works. |
| CP-10 | iPhone HEIC photo from the library | Crop modal shows the image (iOS normally converts to JPEG). |
| CP-11 | A non-image file, or an extremely large image | No white screen; the picker rejects it or a clear message appears. |

## 6. Change cover on an existing book

| ID | Check | PASS criterion |
|---|---|---|
| CE-01 | Open a book → **✎ Change cover** → choose photo → crop → save | Cover updates immediately and after reload; `books.cover_url` points at a new `covers/{uid}/…` object. |
| CE-02 | After CE-01, look at the bucket | Record whether the **previous uploaded cover is still there**. The app code never deletes old objects (searched: no `.remove(` call anywhere in `src/App.jsx`; a database job could still clean up, none seen), so storage grows with each change (H-7). |
| CE-03 | Offline when saving | Original cover kept; a clear message, no half-saved state. |
| CE-04 | (Optional, second account) | Another user cannot overwrite or delete your `covers/{uid}/…` objects. |

## 7. Snap to update progress (on-device runbook)

Full rows, PASS criteria and the model-evaluation procedure are in `tests/snap-print-audio-test-plan.md`. On the phone, at minimum:

| ID | Check | PASS criterion |
|---|---|---|
| SN-01 | Print book: the five reported photos, **3 runs each** (ground truth in the snap plan: TWO opener+facing page → chapter 2, page 3 or blank; TWO opener → chapter 2; ONE opener → chapter 1; page "4" → page 4; THREE opener → chapter 3) | **No photo ever produces a wrong page.** Blank is fine and the app then asks. Chapter openers show a guessed page you can edit; the second snap of a learned chapter fills without asking. |
| SN-02 | A raw, unedited photo from the phone camera (3–6 MB) | Reads normally instead of failing (photos are now downscaled before upload). |
| SN-03 | 🔎 **Audio row, Android Chrome: tap Snap to update.** Can you choose an **existing screenshot** of an audiobook player? | PASS = you can. The input is `capture="environment"`; on Android that opens the camera directly with no picker ([web.dev](https://web.dev/articles/media-capturing-images)), so the gallery screenshot you need may be unreachable (H-9). Record what appears on D1 and D2, for Print, Ebook and Audio rows. |
| SN-04 | Audio screenshot showing **time left only** (Audible/Libby) | Strip shows listened = total − left, or refuses with an explanation. **Never** the time left recorded as time listened. |
| SN-05 | Audio screenshot showing "elapsed / total" | Both fields filled correctly in decimal hours. |
| SN-06 | Audio: a result where listened is bigger than the total | **Apply** is disabled with an explanation; the book is not marked read. |
| SN-07 | Ebook percent screenshot | Percent saved. A snap that reads nothing leaves the saved percent unchanged. |
| SN-08 | Cover or blank page (no number, no chapter) | "Couldn't find a page number or chapter heading…", no Apply, nothing written. |
| SN-09 | Q2/Q4 after each Apply | No `null` values written; `chapters` keys and values are positive integers; totals unchanged unless you corrected them. |
| SN-10 | Chapter map privacy | With archive sharing on, a co-keeper can see `progress.print.chapters`. Decide whether that is acceptable. |

## 8. Data checks and clean-up (Supabase SQL editor, production)

These are **read-only** `SELECT`s. Run them before and after each section.

```sql
-- Q1: books created in the last 3 hours (add "and user_id = '<your uid>'" if others use the app)
select id, title, author, shelf, read, formats, cover_url, progress, created_at
from books where created_at > now() - interval '3 hours' order by created_at desc;

-- Q2: progress that should never exist
select title, progress from books
where created_at > now() - interval '3 hours'
  and ( progress::text like '%null%'
     or (progress->'print'->>'page')::numeric > (progress->'print'->>'pages')::numeric
     or (progress->'audio'->>'listened')::numeric > (progress->'audio'->>'hours')::numeric );

-- Q3: cover uploads (also compare the count with PRE-07)
select name, round((metadata->>'size')::bigint/1024.0) as kb, created_at
from storage.objects where bucket_id = 'covers' order by created_at desc limit 20;

-- Q4: learned chapters
select title, progress->'print' as print from books where progress->'print' ? 'chapters';
```

**Clean-up:** delete every test book **in the app** (it is your account). Delete leftover cover images from Storage → `covers` in the dashboard (your uploads are under `covers/{your uid}/`). Re-run Q1 and Q3 and confirm they match PRE-07. The one pre-existing damaged record (*Perfect Assassin*, null progress) is **not** part of this plan and is still unfixed.

## 9. Suspected defects (found by reading the code; check these first)

| ID | Suspicion | Evidence so far | Severity if confirmed |
|---|---|---|---|
| H-1 | The cover-photo crop is rendered at **photo size × the screen's pixel ratio**, and sent to the AI and stored un-downscaled. A 12 MP photo on a ratio-3 phone becomes a 12000×9000 canvas. May hang, hit iOS's canvas size limit (blank image), or exceed Vercel's 4.5 MB body limit (then silently falls to "couldn't make out the cover"). | **Measured in headless Chromium with the real function:** 4000×3000 photo → output 4000×3000 at ratio 1, 8000×6000 at 2, **12000×9000 at 3 (7.5 s on a server)**. My test image was low-detail, so the sizes (0.5–2.7 MB) understate a real photo. Phone limits not measured. | Medium (cover scan or Apply fails on large photos) |
| H-2 | A network failure during an ISBN lookup is reported as "not in the archives". | Code: `fetchByIsbn` returns `null` on any error and both messages key off `null`. | Low–medium (misleads the user) |
| H-3 | Only 978/979 EAN-13 barcodes are read. Older books with ISBN-10-only or non-ISBN barcodes are ignored silently, with no hint after a timeout. | Code: native detector asks for `ean_13`; both paths filter `/^97[89]\d{10}$/`. | Low |
| H-4 | Single scan allows a second copy via "Add anyway"; multi-scan silently excludes books already owned. | Code + dialog text. CLAUDE.md still says titles are unique. | Low (decide the intended rule) |
| H-5 | Closing the scanner with books queued discards the queue with no warning. | Not yet confirmed in code; test MS-09. | Low |
| H-6 | Cover scan does not run if a title is already typed. | Code (`hadTitle`). By design; test CP-03 only to record it. | None |
| H-7 | Cover uploads fail silently (`uploadCoverPhoto` returns `null`), and replaced covers are never deleted, so the public `covers` bucket only grows. | App code: no `.remove(` call anywhere (storage use is only `upload` and `getPublicUrl`). Production today: 9 objects, 1.9 MB, largest 0.5 MB. | Low now, grows over time |
| H-8 | Camera auto-starts once per entry to the capture view; after a denied permission the user must tap **Open the camera**. | Code (`cameraTriedRef`). | Low |
| H-9 | 🔎 The progress-snap file input always uses `capture="environment"`, including Ebook and Audio rows, whose screenshots are in the phone's gallery. On Android that opens the camera with no gallery option. | HTML attribute in code; behaviour per [web.dev](https://web.dev/articles/media-capturing-images) (an older article). Not yet confirmed on a device. | **High if confirmed** (ebook and audio snapping unusable on Android) |

## 10. Exit criteria

1. PRE-01 to PRE-07 done and recorded.
2. Every row run on **D1 and D2** (D3 for the barcode and cover rows), result recorded.
3. All 🔎 rows (H-1, H-2, H-9, BC-09, CP-04, SN-03) have a recorded outcome, and each confirmed one is turned into a ticket or a fix.
4. SN-01: no wrong page in any run.
5. Section 8 clean-up done and Q1/Q3 match the baseline.
