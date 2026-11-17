# Code review to-do

From `/code-review` on 2026-11-08. Tick `[x]` when done. Each fix that changes logic gets a test in `tests/` (CLAUDE.md rule), with the logic in an importable module under `src/lib/`.

Files in items 1-4, 6, 8 and 10 (`SpineAppearance.jsx`, `NavTab.css`, the spine work in `App.jsx`) are uncommitted work in progress. Fix them before that work is committed.

**2026-11-16: the spine photo feature (`SpineAppearance.jsx`, `spinePhoto.js`) was removed at the owner's request. Items 1, 2, 3, 4, 8 and 10 no longer apply.** Spine widths (item 5) stay.

## Do first (user-visible breakage)

- [x] **1. Spine photo upload silently fails on Safari/iOS** (`src/components/SpineAppearance.jsx:59`) — done 2026-11-08: JPEG fallback, strict `isSpinePhotoUrl` in `src/lib/spinePhoto.js`, tests in `tests/spine-photo-unit.mjs`
  Fix: after `canvas.toDataURL('image/webp')`, check the result starts with `data:image/webp`. If it doesn't, retry with `image/jpeg`, and let `useShelfSpine` accept `data:image/(webp|jpeg);base64,`.
  Test: the prefix check accepts webp and jpeg and rejects png, `javascript:` and empty strings.

- [x] **2. Uploaded photo is squashed and may be rotated wrong** (`SpineAppearance.jsx:54`) — done 2026-11-08: centre cover-crop via `coverRect`. EXIF needs no code (browsers orient decoded `<img>`). Horizontal photos still turn 90deg clockwise: confirm on a real photo.
  Fix: crop-to-cover instead of stretching (`drawImage` with a source rectangle that matches the 84x480 ratio). Use `createImageBitmap(file, { imageOrientation: 'from-image' })` so EXIF rotation is applied. Decide whether landscape photos should rotate; if so, test both directions.
  Test: a pure `coverRect(srcW, srcH, dstW, dstH)` returns the right crop for landscape, portrait and square inputs.

- [x] **5. Spine widths changed with no test** (`src/App.jsx:1961`, `spineWidthOf`) — done 2026-11-08: moved with `layoutShelfRows` into `src/lib/shelfLayout.js`, tests in `tests/shelf-layout-unit.mjs`. Left as is, your call: audio-only / no-page books still use the 17-28px hashed width.
  Fix: move `spineWidthOf` into `src/lib/` and test it. Cases: print pages, ebook only, audio only, no pages, 0, negative, NaN, a string. Check that a book moving between buckets doesn't break `layoutShelfRows` (no overflow at the 32px max), and decide whether audio-only and no-pages books should use the new buckets too.
  Test: boundary pages around each bucket, and that rows still fill the shelf exactly.

- [ ] **6. Inscribe arch art is stretched and the new art isn't wired in** (`src/components/NavTab.css:18`) — BLOCKED on a design call: `inscribe-arch.webp` is 251x450 (ratio 0.56), the button is 132x154 (0.86), the tab art is 192x188 (1.02)
  Fix: size the button to the art's own ratio, or use `inscribe-arch.webp` as `--tab-art`. Commit `public/brand/buttons/inscribe-arch.webp` if it is the intended asset.
  Check: compare the 132x154 button against the 192x188 source art at normal size and at 200% zoom.

## Do next (correctness, scale, accessibility)

- [ ] **3. Spine preference only lives in this browser** (`SpineAppearance.jsx:19`)
  Fix: guard `usePreference` against a missing `id`. Show a clear error when `localStorage` fails or the quota is full. Decide whether photos should stay local-only (say so in the UI copy) or move to Supabase Storage like the Visage avatar.

- [ ] **4. One store subscription per spine** (`src/App.jsx:1967`)
  Fix: read the preference once per shelf (one store or context) and pass it down. Parse the JSON once, not per spine per render.
  Check: a 100+ book shelf registers one set of listeners, not 200.

- [ ] **7. Inscribe is a dialog trigger, not a nav tab** (`src/App.jsx:3756`)
  Fix: stop `NavTab` setting `aria-current` on it, and give it `aria-haspopup="dialog"`. Consider moving it out of the Sections `<nav>`.
  Check: screen reader announces it as a button that opens a dialog.

- [ ] **10. No size limit on spine photo uploads** (`SpineAppearance.jsx:62`)
  Fix: reject files over a set size (for example 15 MB) before decoding. Prefer `createImageBitmap` with a resize option so a huge image is never decoded at full size. Show a clear "pick a smaller photo" message.

## Polish

- [ ] **8. Spine with a photo: hidden title still takes space, dots sit on the art** (`App.jsx:2067`)
  Fix: don't render the title span when a photo shows. Move or hide the status dots. Escape or validate the `url(...)` value.

- [ ] **9. `PasswordInput` rough edges** (`App.jsx:5791`, added this session)
  Fix: apply the caller's `className`. Use either `aria-pressed` or the changing label, not both. Decide whether the toggle should be skipped when tabbing (`tabIndex={-1}`).

## Suggested order

1. Items 1 and 2 (same function, about 30 min).
2. Item 5 (about 30 min, mostly the test).
3. Item 6 (about 15 min).
4. Items 4, 10, 3, 7 (about 1.5 hours).
5. Items 8 and 9 (about 20 min).

## Found 2026-11-13 while writing the UI tests (`tests/e2e`)

Search for the function name; line numbers are not given because they move.

- [ ] **11. Banish from the archive deletes with one click, no confirm** (`DetailPanel`, calls `removeBook`)
  It sits directly under "Mark as Read" and removes the book and its notes for good.
  Fix: confirm first (name the book), or offer an undo. Test: `tests/e2e/books.spec.js` "Banish" must then confirm.

- [ ] **12. Esc does not close any modal** (`Overlay`)
  `tests/manual-test-tracker.md` expects "Esc / close works". There is no Escape handler.
  Fix: close on Escape in `Overlay`, and return focus to the button that opened it.
  Test: remove `.fixme` from "Esc closes the Inscribe window" in `tests/e2e/navigation.spec.js`.

- [ ] **13. There is no way to add a book purely by hand** (`AddBookModal`)
  The empty-search message says "switch to Scan or upload to add it by hand", but the Title/Author
  form only appears after a photo is uploaded or captured. A book the search cannot find and you
  have no photo of is a dead end, which breaks the "never a dead end" rule.
  Fix: an "Inscribe by hand" button that opens the review form empty.

- [ ] **14. Rating buttons do not expose which value is selected** (`Meter`)
  The group is `role="radiogroup"` but the five buttons are plain buttons with no `aria-checked` or
  `aria-pressed`, so a screen reader hears "Verdict: 4 of 5" for every state. The UI tests can only
  check ratings through the database for the same reason.
  Fix: `role="radio"` + `aria-checked` on each, or `aria-pressed`.

- [ ] **15. Sign-in, sign-up and reset errors are not announced** (`AuthPage`, `ResetPasswordPage`)
  The error `<p>` has no `role="alert"` (the expired-link notice has one). Fix: add it.

- [ ] **16. Sign-in cards use `rounded-xl`** (`AuthPage`, `ResetPasswordPage`, `UsernameGate`)
  Breaks the sharp-corner rule in CLAUDE.md section 6. Fix: `rounded-md`.
