# UI tests (Playwright)

Drives the real app in Chromium and checks the critical paths: sign in, wrong
sign-in, sign up, forgot password, adding a book, updating a book, and the main
buttons. **Staging only.** `helpers/env.js` refuses to start unless the Supabase
URL is the staging project, and every page blocks requests to production.

## First-time setup (once)

Run from the `hushthorn` folder in PowerShell.

1. `npm install -D @playwright/test`
   Adds the test runner to this project and records it in `package.json` and
   `package-lock.json` together. Commit both, or CI's `npm ci` will fail.
2. `npx playwright install chromium`
   Downloads the browser the tests drive. It is not part of the npm package.
3. Check `.env.staging.local` exists with `E2E_ALPHA_EMAIL` and
   `E2E_ALPHA_PASSWORD`. That file is gitignored; it is where the staging test
   account lives.

## Run

- `npm run test:e2e` runs everything. It starts `npm run dev:staging` itself if
  nothing is on port 5174.
- `npx playwright test auth` runs one file. `--headed` shows the browser.
  `--ui` opens the step-through runner.
- `npm run test:e2e:report` opens the last report, with a trace for each failure.

`npm test` does NOT run these. It only runs the unit tests in `tests/*.mjs`.

## What is real and what is stubbed

| Area | How it is tested |
| --- | --- |
| Sign in, sign out, wrong password | Real staging Supabase |
| Add / edit / delete books, view prefs | Real staging database, and each test reads the row back over REST |
| Sign up, forgot password | The Supabase Auth reply is stubbed. Real calls send email and staging allows only a few an hour. These prove the page handles each reply; they do not prove mail arrives |
| Book search (Google Books, Open Library) | Stubbed, so a quota or outage cannot fail a test |
| AI (`/api/claude`) | Always answered 503. No test spends money |

## Rules for new tests

- Titles come from `uniqueTitle()` so they start with `E2E `. Cleanup deletes
  every book with that prefix for the test account, and nothing else.
- Assert the saved row, not just the screen.
- A test restores anything else it changes (see the layout test).
- Find elements by role, label or placeholder. Never by Tailwind class.

## Page objects and the per-button tests

`pages/` holds one object per screen. Each lists its buttons once, found by role,
label or placeholder, so a renamed button is fixed in one place.

| Object (file) | Buttons it knows |
| --- | --- |
| `SignInPage` | Sign in / Create account tabs, Show / Hide password (each field), Forgot your password?, Enter the Archive, Open the Archive, Send reset link, Back to sign in, Send a new reset link |
| `SectionsNav`, `ShelvesNav`, `ControlsBar`, `ProfileChip`, `LibraryPage` (`LibraryPage.js`) | Oracle, + Inscribe, Codex; All / Owned / Wishlist / Read / Unread / Audio; archive switcher; Covers, Spines, Sort, Search, Match all / any, trope chips, Clear, Curiosities; profile chip, Close, Leave the archive |
| `InscribeModal`, `CropModal` (`InscribeModal.js`) | Close, Scour the grimoire, Scan or upload, Add several, + Owned, + Wishlist, Remove from queue, Add N to the archive, Open the camera, Stop camera, Capture cover, Upload a photo, Scan another, Inscribe to Owned / Wishlist; crop: Skip, Portrait / Landscape / Square / Free, Left / Right 90, Replace photo, Crop & use this cover |
| `DetailPanel` | Close, shelf, read, Banish, Save & Close, Discard, Verdict 1-5, Smoulder 1-5, genres (Add / Remove), Browse all tropes, trope chips, Divine tropes, Snap to update (Apply / Retry / Enter by hand), 25% / 50% / Done, Print / Ebook / Audio, Page / Time, Speak a note, Inscribe note, Strike out |

One positive test per button, in `buttons.signin`, `buttons.library`, `buttons.inscribe`,
`buttons.camera` and `buttons.detail` (`*.spec.js`). Stand-ins used:

- Book search and the AI endpoint: stubbed (see `helpers/app.js`); a test that needs an
  AI answer replies with the smallest valid one (Divine tropes, Snap to update).
- Camera: Chromium's fake camera (`buttons.camera.spec.js` only).
- Voice notes: a stand-in speech recogniser, because headless Chromium has none.
- Sign out: the logout request is answered locally so the shared test session survives.
- Uploads: a small PNG is built in memory (`helpers/png.js`).

Existing flow specs (`auth`, `books`, `navigation`) still use plain helpers; moving them
onto the page objects is optional follow-up.

## Not covered yet

- The "choose a new password" screen and real email delivery (needs a mailbox;
  see `tests/manual-test-tracker.md` section 3).
- Buttons that need a second account or data we do not seed: shared archives
  (Bind, Join, Invite, Rename, Delete / Leave archive, Remove member), the
  "Divine tropes for my library" bulk run, and cathedral whisper / jump rail.
- The Binding uploads (Upload clippings / Goodreads CSV), Oracle's Consult button
  (needs a success reply shaped like the real one), barcode detection.
- The Visage editor buttons (dormant behind `VISAGE_ENABLED`).
- Negative cases for the new per-button tests; they are positive-only by design.
- Phone width (390px) and Safari.
