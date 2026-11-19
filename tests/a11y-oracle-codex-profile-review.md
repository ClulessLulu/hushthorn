# Independent review: a11y fixes to The Oracle, The Binding, Your Profile and `Overlay`

Branch `a11y/oracle-codex-profile`, uncommitted working tree, reviewed 2026-11-18 by qa-tester.
I changed no source files. The e2e runs used a scratch copy: `git archive HEAD`, plus the working-tree
`src/App.jsx`, `src/lib/oracle.js` and `src/lib/focusTrap.js`, plus `playwright.config.js`,
`package.json`, the lockfile and `tests/e2e/**` from `test/e2e-buttons`. That branch's `src/` matches HEAD.
Every run was against staging on port 5174, and the staging banner check passed on each run.

## Verdict: GO WITH FIXES

The fixes do what the audit claims on the paths it tested. One Major hole remains in the new focus trap
and Escape handling. It is on an audited screen, so I would fix it before merge. A second Major is a data
bug that was already on master; this change did not cause it, but it answers checklist item 8.

| Severity | Count |
| --- | --- |
| Blocker | 0 |
| Major | 2 (1 introduced or left open by this change, 1 already on master) |
| Minor | 6 |

## Findings

### Major

**M1. Focus drops to `<body>` after "Invite a fellow reader". After that, Escape does nothing and Tab leaves the window.** (`LibraryDetail` `makeInvite`; `Overlay` `onKeyDown`)
- Repro (staging, alpha): open Your Profile, expand "QA Shared Archive", Tab to "Invite a fellow reader", press Enter.
- Measured: after the code appears, `document.activeElement` is `BODY`. Pressing Escape leaves the dialog open (`dialogOpenAfterEscape: true`).
- Cause: `Overlay` listens for keys on its own element (`onKeyDown` on `role="dialog"`), so the trap and Escape only work while focus is inside the dialog. If the focused control unmounts, focus goes to `body` and both stop working. Tab then goes into the page behind, even though the dialog is `aria-modal`. This breaks 2.4.3, and Escape no longer matches the backdrop click.
- Same pattern, by code reading only (not run): `SharedArchives` Bind and Join (the input clears, the button becomes `disabled` and loses focus), Remove member ✕ (the row goes away), and Leave or Delete archive (the detail collapses).
- Fix direction: when focus is on `body` while the dialog is open, `Overlay` should bring it back to the panel. Either add a document-level keydown or focusin listener while open, or move focus to the panel when the focused element leaves the dialog. Also move focus to "Copy" after an invite is made. Owner: **frontend-dev**.

**M2. A double click on "+ Wishlist" creates two rows with the same title. This was already on master.** (`OracleSection` `addRec` → `addBook`)
- Repro: Consult (AI stubbed with one pick), then double-click "+ Wishlist".
- Measured: `books` rows with that title = **2** on master and **2** with this fix (`booksByTitle`). This breaks "one book per title" (CLAUDE.md §4 rule 1).
- Cause: `addRec` has no in-flight guard, unlike `busyRef` and `bindingRef`, and `addBook` never checks `isTitleTaken`. The fixer changed `addRec` but added no guard.
- Not caused by this change, so it does not block it. It should be filed in `docs/BUGS.md`; I did not, because this task allowed one file. Owner: **frontend-dev**.

### Minor

**m1. Escape during the cover crop now closes the whole book window and throws away the chosen photo.** (`CoverEditor` → `ImageCropModal`, which renders inside `DetailPanel`'s `Overlay`)
- Repro: open a book, click the cover, choose Upload photo and pick a PNG. "Adjust cover" shows. Focus "Skip — use as-is" and press Escape.
- Measured: `cropStillVisible: false`, `bookWindowVisible: false`. Before this change, Escape did nothing here.
- The crop screen looks like its own modal, so Escape should cancel the crop only. Suggested fix: `ImageCropModal` handles Escape itself and calls `preventDefault`, the same way `GenreSuggestInput` does. Owner: frontend-dev.

**m2. The trope backfill's live region speaks on every book.** (`AvatarPage`: the `role="status"` text "Divining… n of N")
- The text changes on every `setBulkDone`. For alpha's 59 untagged books that is up to 59 polite announcements. This is the per-item chatter the fix removed from the Oracle (audit O1).
- Found by reading the code. I did not run a screen reader.
- Suggested fix: announce the start and the end, or every 10 books. Owner: frontend-dev.

**m3. Some new e2e tests fail on master for a reason other than the behaviour they guard.**
- All 12 tests in `a11y.spec.js` fail against master's `App.jsx`, which is good.
- C1, C2 and C3, and the + Wishlist test, fail on master because the new `getByLabel` / `aria-label` locators do not exist there (`setInputFiles` timeout, element not found). They never reach the focus or alert check they are meant to prove.
- In `focus-trap-unit.mjs`, the last test only regex-matches the `FOCUSABLE` string, which tests how it is written rather than what it does.
- The unit tests import the real `src/lib/focusTrap.js` and `src/lib/oracle.js`; no functions are copied.

**m4. `a11y.spec.js` is not run by any config on this branch.** It needs `a11y` in the `app` project's `testMatch` when `test/e2e-buttons` merges. Also, `navigation.spec.js` "Esc closes the Inscribe window" is still `.fixme`; I removed the `.fixme` in the scratch copy and it **passes** with this change, so it can be un-fixme'd at merge.

**m5. axe flags `label-content-name-mismatch` (serious, 1 node) on every screen.** The node is the `ArchiveSwitcher` button (`button[aria-haspopup="listbox"]`, `.text-[11px]`). This was already on master and is outside the three audited screens; I am logging it so it is not lost.

**m6. Also found, but not part of this change:** "✎ Change cover" in `CoverEditor` is a clickable `div` that the keyboard cannot reach (2.1.1).

## What I verified (all against staging)

| # | Check | Result |
| --- | --- | --- |
| 1 | `npm test` | 73 pass, 0 fail (9 files) |
| 1 | `npm run build` + `check-dist-for-keys.mjs` | built; `OK: no Anthropic or service_role keys found in dist/` |
| 1 | Full e2e suite with `a11y.spec.js` (scratch) | **195 passed, 1 skipped** (the `.fixme` Esc test), 0 failed, 6.5 min |
| 2 | `a11y.spec.js` against master's `App.jsx` and `oracle.js` | **12 of 12 fail** (setup passes); see m3 for which ones fail for the right reason |
| 3 | axe-core 4.x (`@axe-core/playwright`, installed in scratch only), WCAG 2.0/2.1/2.2 A+AA tags | 390 and 1280: Oracle idle, error and 5 results; Codex upload, preview (after choosing a file) and error; Profile collapsed and expanded (2 archives). Only violation: m5. Contrast came back "incomplete" (gradient backgrounds), so I measured it by hand (row 6) |
| 4 | Profile keyboard | Enter on chip puts focus on the panel. 40 Tabs forward and 40 back all stay in the dialog and wrap both ways (Close → Divine → 2 archive rows → 2 inputs → Leave → Close). Every stop shows `outline: solid 2px rgb(255,213,238)`. Escape closes and focus returns to the chip |
| 4 | Oracle keyboard | Enter on Consult keeps focus on it with `aria-busy="true"`, then on "Consult the Oracle again". After + Wishlist, focus goes to the next pick; after the last pick it goes back to Consult |
| 4 | Codex keyboard | After a file is chosen, focus is on "Found N books…". After Cancel or Bind it is on "Upload My Clippings.txt". The checkbox card label gets the `#ffd5ee` ring (`label:has(> input:focus-visible)`) |
| 5 | Oracle live regions (MutationObserver, 5 picks landing about 250 ms apart) | Status text changed 3 times: "Reading the leaves…" → "Picks are arriving…" → "5 picks from the Oracle.", not once per card. The list has no `aria-live` or live role. The error is `role="alert"`. Visible and sr-only copies are never in the page together |
| 6 | Contrast (formula on the composited Tailwind values over `#0c0714` and over the lighter `.ht-card` stop `rgba(38,23,64,.92)`) | `purple-300/75` text 5.9–6.6:1; white on `pink-500/70` 5.6; on `pink-600` (Bind, hover) **4.60**; on `pink-700` 6.0; on `indigo-500/70` 6.7; on `indigo-500/80` (Consult) 5.8–6.4; on `indigo-600` 6.3; `pink-100` on `pink-500/70` (+ Wishlist hover) 4.8; `#ffd5ee` ring on `#0c0714` 15.3. All pass. Bind at 4.60 has little margin |
| 7 | Targets | No visible control under 44px on the Oracle (results), the Codex (upload and preview) or the Profile (collapsed and expanded) at 390 and 1280. The only exception is the 13px checkboxes, which are covered because the whole card is their `<label>` |
| 7 | Sideways scroll | `scrollWidth == clientWidth` at 390, 640 (200% of 1280) and 1280 on all three screens; Profile panel 606/606 |
| 7 | Reduced motion / forced colours | Hovered `.ht-card` under `reduce`: `transform: none`, `transition: 0s`. The new rule comes after the line-141 rule it overrides. Forced colours: scoped button has a `1px solid ButtonText` border and a Highlight outline |
| 8 | Regressions | Inscribe: Escape closes it, focus back on "+ Inscribe". Book window: first Escape with the genre list open closes only the list (6 → 0 options, window stays open); second Escape closes the window and focus returns to the card; 80 Tabs stay inside. StrictMode dev build: trap and focus return behave as above. Consult pressed 4 times (Enter, Enter, Space, click) → **1** AI call. Bind pressed Enter twice → **1** row. No console errors apart from the expected 503 from the stubbed AI |
| 9 | Design | No new radius over `rounded-md` (the chip's `rounded-full` was already there), no cyan, no new fonts or button styles. `pink-600/700` already appear 9 times on master, so they are not a new colour family. Copy stays in voice; errors end with a next step |
| 10 | Diff hygiene | `git diff --check` clean. No `console.log`, `debugger` or secrets. The 12 whitespace-only lines come from re-wrapping the `SharedArchives` inputs in label wrappers (needed). Comments say why and cite audit IDs. New files use LF |

Screenshots (gitignored): `tests/screenshots/a11y-review-oracle-results-390.png`, `a11y-review-profile-390.png`,
`a11y-review-codex-preview-1280.png`, `a11y-review-codex-checkbox-focus-390.png`.

## What I could not verify

- **Real screen readers** (NVDA, VoiceOver). Announcement order is inferred from the DOM and live-region mutations. m2 comes from reading the code.
- **Real browser zoom.** 200% zoom was approximated with a 640px viewport.
- **Pixel-sampled contrast over the cathedral art.** I used formula values over the documented background stops.
- **The M1 variants** (Bind or Join a new archive, Remove member, Leave or Delete archive). I did not run them, to avoid creating or deleting staging libraries. Only Invite was measured.
- **The Visage branch of `AvatarPage`** (`VISAGE_ENABLED` is false).
- **Safari and Firefox.** Chromium only.

---

# Round 2 + WebKit/mobile (2026-11-18, qa-tester)

Same uncommitted tree, after the fixer's round 2. I changed no source file. Every run used staging
(port 5174, banner checked); port 5173 was never started. The "fails on master" run used a scratch copy
(`git archive master` + the working-tree `tests/e2e`, config and `package.json`; `master` and `HEAD`
are the same commit), deleted afterwards.

## Verdict: GO WITH FIXES

All five round-1 findings are fixed, and I reproduced each fix myself. Nothing found in round 2 blocks
the change. The two new Minors in the change's own code (R2-W1, R2-F1) are focus-return gaps in
`Overlay`; fix them with the change or right after it.

| Severity | Count | IDs |
| --- | --- | --- |
| Blocker | 0 | |
| Major | 0 | |
| Minor | 6 | R2-W1, R2-F1, R2-S1 (known), R2-T1, R2-P1, R2-B1 |

Still open from round 1, outside this change and untouched: m5 (`ArchiveSwitcher` label mismatch),
m6 ("Change cover" is a clickable div).

## Round-1 findings, re-checked

| ID | How I checked | Result |
| --- | --- | --- |
| M1 Overlay focus loss | Script on staging alpha + beta, keyboard only, in Chromium AND WebKit: Bind a new archive, Invite, beta joins by code (REST), Remove member, Join beta's archive, Leave it, Delete mine. After each: `document.activeElement`, 25 Tab presses, Escape. After Invite, focus was also forced to `<body>` | Focus after Bind → the new archive's row; Invite → Copy; Remove → archive row; Join → archive row; Leave and Delete → the "New shared archive" field. **0 of 25** Tabs left the dialog in every case, and Escape closed it every time, in both engines. Cleanup: 0 `E2E R2` archives left on either account. **Fixed** |
| M2 + Wishlist double save | `a11y.spec` and `mobile.spec` (two clicks in one task), rows read back over REST after a 1 s wait | 1 row in Chromium, WebKit, iPhone and Pixel. Master: **2** rows. **Fixed** |
| m1 crop Escape | `a11y.spec` "Escape cancels the crop" in all 4 projects; code: `ImageCropModal` capture-phase listener + `onCancel` at both call sites | The crop closes and the book window stays. **Fixed** |
| m2 trope chatter | `bulkTropeStatusText` (`src/lib/liveStatus.js`) + 6 unit tests that import it | The text changes at the start, every 10 tomes, and at the end; it is identical in between. Not run against the real AI (would spend money). **Fixed (by code + unit tests)** |
| m3 weak tests | All 15 `a11y.spec` tests against master's `App.jsx` | **15 of 15 fail**, each on its behaviour, not on a missing locator: the double click gets 2 rows; the Codex heading is found but `inactive`; the + Wishlist button is found but `inactive`; alert and status are not found because master has none. The regex test on `FOCUSABLE` is gone. **Fixed** |

## New findings

**R2-W1 (Minor, WebKit only, app). After a tap or click opens a window, closing it returns focus to `<body>`, not to the opener.** (`Overlay`: `const [opener] = useState(() => document.activeElement)`)
- Repro: WebKit (iPhone 14 or Desktop Safari), tap the profile chip, then tap Close (or press Escape). Measured: `activeElement` = `BODY`. In Chromium it is the chip. The same happens with + Inscribe.
- Cause: Safari never focuses a button on click or tap, and Playwright's WebKit does the same, so `document.activeElement` is `<body>` when `Overlay` first renders. Opening by keyboard works in WebKit (focus + Enter → focus returns to the chip, measured).
- Impact: VoiceOver/Safari users who open a window by pointer land at the top of the page when it closes.
- Fix direction: pass the opener in (the caller has the button), or fall back to the last `pointerdown` target when `activeElement` is `body`. Owner: **frontend-dev**.
- Test: `mobile.spec.js` "after a tap opens it and Close shuts it, focus is back on the chip" is marked `test.fail(isWebKit(), 'R2-W1 ...')`. It runs, and turns red once the gap is fixed.

**R2-F1 (Minor, app). When a window is opened from another window that is closing, focus has nowhere to return when it closes.** (`Overlay` cleanup skips `opener.focus()` when the opener is gone)
- Repro (Chromium, staging): keyboard + Inscribe → search → Enter on + Owned → the book window opens with focus inside → Escape. Measured: the book window closes and `activeElement` = `BODY`; the next Tab also reports `BODY`.
- Cause: the book window's opener is the + Owned button inside Inscribe, which unmounts in the same commit.
- Not a regression (master returned focus nowhere), but it is a case the new focus return should cover. Fix direction: when the opener is disconnected, fall back to the previous Overlay's opener (+ Inscribe) or to the new book's card. Owner: **frontend-dev**.

**R2-S1 (Minor, known). After Remove member, the archive row still says "2 members" until the window is reopened.** (`LibraryDetail.removeMember` reloads its own roster, not the `SharedArchives` list)
- Measured in both engines: row text before `...2 members · you keep it`, after `...2 members · you keep it`. Owner: frontend-dev.

**R2-T1 (Minor, outside this change). On a phone, the shelf controls and some window buttons are under 44 x 44.** (CLAUDE.md §6)
- iPhone 14 (WebKit), library: archive switcher 116x31, Covers 82x27, Spines 75x27, Sort 165x38, Search 176x34, Curiosities 119x36, Match all 79x22, Match any 82x22, trope chips 72-136 x 24. Inscribe: Close 32x28, "Scan multiple" label 348x16. Book window Verdict/Smoulder: icon plus 2px padding.
- The three audited screens (Oracle, Codex, Profile) and both navs have **no** control under 44 in any project.
- Kept visible as `test.fixme` in `mobile.spec.js`. Owner: frontend-dev.

**R2-P1 (Minor, outside this change, already on master). Your Profile says "48 of 46 owned books read".** (`AvatarPage`: `readCount = books.filter(b => b.read)` counts read wishlist books, then prints "{readCount} of {owned.length} owned books read")
- Seen on staging alpha at iPhone size (`tests/screenshots/r2-iphone14-webkit-profile-bottom.png`). Owner: frontend-dev.

**R2-B1 (Minor, staging only).** When Your Profile is scrolled to the end on a phone, the fixed staging badge covers the lower edge of "Leave the archive". The badge does not render in production. On a real iPhone the bottom sheet has no `safe-area-inset-bottom` padding, so the home bar may sit over the same edge. I could not check that without a device.

## What I verified (round 2)

| Check | Result |
| --- | --- |
| `npm test` | 78 pass, 0 fail |
| `npm run build` + `check-dist-for-keys.mjs` | built; `OK: no Anthropic or service_role keys found in dist/` |
| Full Chromium e2e, before my test edits | 199 passed, 0 failed (6.5 min) |
| Full Chromium e2e, after my test edits (`npm run test:e2e`) | 199 passed, 0 failed (7.1 min); same count as before, so no Chromium test was lost or changed in outcome |
| `webkit-desktop` (Desktop Safari) | 48 passed, 2 skipped (fixme), 0 failed. Setup is included; 1 of the passes is the expected failure for R2-W1 |
| `mobile-safari` (iPhone 14, WebKit, touch) | 48 passed, 2 skipped, 0 failed |
| `mobile-chrome` (Pixel 7, Chromium, touch) | 48 passed, 2 skipped, 0 failed |
| axe-core 4.10.3 (installed in scratch only), WebKit, iPhone 14 | 0 violations: Oracle idle, error and 3 picks; Codex upload and preview; Your Profile. Contrast "incomplete" (gradients) |
| Contrast by formula (recomputed, not copied) | white on `pink-600` 4.60:1 (passes, thin margin); `purple-300/75` over `#0c0714` 6.59:1 |
| Reduced motion | `.ht-card:hover { transform:none }` is in the line-184 block, after the line-142 rule it overrides. WebKit with `reducedMotion: reduce`: hovered card `transform: none`, `transition-duration: 0s` |
| Forced colours | Code only: `.ht-focus-scope` outline → `Highlight`, buttons get `1px solid ButtonText`. Not rendered |
| Sideways scroll | `scrollWidth <= clientWidth` on the library, the Oracle (with picks), the Codex (with preview), Your Profile, Inscribe and the book window, at 390 (iPhone), 412 (Pixel) and 1280 (Safari) |
| Your Profile at phone size | The panel is 609 px tall in a 664 px viewport and scrolls inside itself (1133 px of content); its top is at 53 px, Close is in view, and "Leave the archive" can be reached by scrolling |
| Diff hygiene | `git diff --check` clean; no `console.log`, `debugger` or keys in the `src` diff; 12 whitespace-only lines each way (the label re-wrap round 1 accepted); new files use LF |
| Design §6 | No new radius (the one `rounded-full` is the existing chip), no cyan, no new font or button style; `#ffd5ee` is the documented focus colour |

## Tests added or changed (round 2)

- `playwright.config.js`: new projects `webkit-desktop`, `mobile-safari` and `mobile-chrome`. They depend on `setup`, reuse its session, and run only `mobile|a11y|navigation|books`. `workers` stays 1.
- `package.json` scripts: `test:e2e` now names the three Chromium projects (same tests as before); new `test:e2e:webkit`, `test:e2e:mobile` and `test:e2e:all`. No dependency added.
- `tests/e2e/mobile.spec.js` (new: 14 tests, 2 of them fixme) and `tests/e2e/helpers/touch.js` (new: `press`, `hasTouch`, `isWebKit`, `smallTargets`, `expectNoSideScroll`, `opensOnScan`, `showSearch`).
- `books.spec.js`, `navigation.spec.js`: a phone opens Inscribe on Scan (`AddBookModal`), so these press "Scour the grimoire" first, or expect Scan as the default, only when `opensOnScan` is true. No change on desktop.
- `a11y.spec.js` "Escape closes it and focus returns to + Inscribe": opens the window by keyboard in WebKit (R2-W1) and still clicks in Chromium.
- `tests/e2e/README.md`: a new "Safari (WebKit) and phones" section with the reason for the subset and the WebKit focus rule.

Skips: nothing in the cross-browser subset uses voice notes, the camera or barcode detection, so no
engine skip was needed. The specs that do (`buttons.camera`, `buttons.detail`) stay Chromium-only by
project choice, as the README explains.

Screenshots (gitignored): `tests/screenshots/r2-iphone14-webkit-oracle.png`, `r2-iphone14-webkit-codex-preview.png`,
`r2-iphone14-webkit-profile.png`, `r2-iphone14-webkit-profile-bottom.png`.

## Not verified

- **Real Safari on macOS or iOS, and VoiceOver.** This machine runs Windows. Playwright's WebKit is the same engine, not the same browser: no iOS keyboard, no real touch, no VoiceOver, no safe areas.
- NVDA. Announcements are inferred from changes to the live-region text.
- Forced-colours rendering (checked in code only) and real 200% zoom.
- The trope backfill against the real AI (it would spend money; covered by unit tests only).
