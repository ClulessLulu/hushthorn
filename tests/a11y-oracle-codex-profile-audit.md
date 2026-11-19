# Accessibility audit: The Oracle, The Binding (Codex), Your Profile

Target: WCAG 2.2 AA, plus the Hushthorn rules in CLAUDE.md section 6 (44px targets,
`#ffd5ee` focus outline, reduced-motion and forced-colors rules).
Branch: `a11y/oracle-codex-profile`. Audited 2026-11-18 on **staging** (`npm run dev:staging`,
port 5174, staging banner checked before every run), account `E2E_ALPHA`.

## How it was measured

- Playwright (Chromium 1255) driving the real app on staging, at 390x844, 1280x900, and
  640x450 (a 1280px window at 200% zoom). The AI endpoint and Open Library were stubbed so no
  paid call was made and nothing was written. The Codex preview was opened with a fake
  Goodreads CSV; Bind was **not** pressed in the audit run.
- axe-core 4.14.1, injected into the page (downloaded with `npm pack` into a scratch folder,
  not added to `package.json`), tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`.
- Contrast was measured on rendered pixels, not guessed from class names: the text is made
  transparent, the element is screenshotted, the text colour (with its alpha and every
  ancestor's opacity) is composited over each background pixel, and the 10th-percentile ratio
  is reported. The fixed staging banner is hidden during capture.
- Target size = the element's bounding box. Tab order = 8 to 14 Tab presses from the screen's
  start, recording the focused element and its computed outline.
- Screenshots: `tests/screenshots/a11y-before-*.png` and `a11y-after-*.png` (gitignored).

Severity: **High** = blocks or loses a keyboard or screen-reader user. **Medium** = fails an AA
criterion or a project rule with a workaround. **Low** = best practice or polish.

## Findings (baseline, before any fix)

### Your Profile (`AvatarPage` in `Overlay`, opened by `AvatarChip`; `SharedArchives`, `LibraryDetail`)

| ID | Finding | WCAG | Evidence | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| P1 | Focus stays on the header chip when the window opens | 2.4.3 | `Overlay` has no focus handling; after Enter on the chip `document.activeElement` is the chip, not in the dialog (390 and 1280) | High | Fixed |
| P2 | Tab walks out of the window into the page behind it, though it says `aria-modal="true"` | 2.4.3, 1.3.1 | Tab walk from the chip: Shelf switcher, Oracle, Inscribe, Codex, six shelf ribbons, Codex upload buttons, only then Close | High | Fixed |
| P3 | Escape does not close the window | 2.1.1 (keyboard parity with the backdrop click) | No key handler in `Overlay`; window still open after Escape. Logged as `CODE_REVIEW_TODO.md` item 12 | High | Fixed |
| P4 | Focus is not returned to the opener on close | 2.4.3 | After close, focus is on a page button, not the chip | Medium | Fixed |
| P5 | Shared-archive name and invite-code fields are labelled by placeholder only | 1.3.1, 3.3.2, 4.1.2 | `SharedArchives` inputs: no `<label>`, no `aria-label`; placeholder `placeholder-purple-400/50` computes to about 2.6:1 | High | Fixed |
| P6 | Archive rows open and close but do not say so | 4.1.2 | `SharedArchives` row button has no `aria-expanded`; state shown only by the ▸ / ▾ glyph | Medium | Fixed |
| P7 | Errors are not announced | 4.1.3 | `err`, `joinErr` (`SharedArchives`) and `err` (`LibraryDetail`) are plain `<p>` | Medium | Fixed |
| P8 | Trope backfill progress ("Divining… 2 of 9"), its summary and the "press Stop first" warning are not announced | 4.1.3 | Plain `<p>` in `AvatarPage` | Medium | Fixed |
| P9 | Small text below 4.5:1 | 1.4.3 | `text-purple-400/60` 11px: @handle 3.13 (390) / 3.28 (1280), shelf caption 3.23, sharing hint 3.09, remove ✕ 3.18. `text-purple-400/70` 11-12px: stat labels 3.93-4.00, member count 3.86-4.04. `text-purple-300/60` 10px "Tropes" 4.32 | Medium | Fixed |
| P10 | Targets under 44px | 2.5.8 (24px) and project 44px | Close ✕ 32x28; Divine 31; Bind / Join and both inputs 34; Invite 29; share switch 30 (390) / 20 (1280); Rename, Delete archive 22; Remove member ✕ 19x20 (under 24px: passes 2.5.8 only by the spacing exception); header chip 42 | Medium | Fixed |
| P11 | Focus indicator is the browser default (`1px auto rgb(16,16,16)`), not the `#ffd5ee` outline; a near-black ring on a near-black card | 2.4.7, project rule | Computed outline on Close, Divine, Bind, Join, inputs | Medium | Fixed |
| P12 | Decorative glyphs read aloud | 1.1.1 | "✨" in the Divine label, "⚔⚔⚔⚔⚔" in the average-verdict label (read as five emoji names), ▸ / ▾, the mini-shelf emoji | Low | Fixed |
| P13 | "Copied" on the invite button is not announced | 4.1.3 | Label text swaps in place | Low | Fixed |
| P14 | The tagged-tomes result list scrolls but cannot be focused | 2.1.1 | `ul.max-h-40.overflow-y-auto` with no focusable content | Low | Fixed |
| P15 | Sharing switch knob slides with no reduced-motion rule | 2.3.3 (AAA), project rule | `transition-transform` on the knob in `LibraryDetail` | Low | Fixed |
| P16 | "Tropes" section title is a `<p>` while its siblings are `<h3>` | 1.3.1 | Heading list skipped it | Low | Fixed |
| P17 | Chip says "Inscribe your Visage ✦" while the Visage is dormant | none (copy) | `AvatarChip` | Low | Left: Visage copy is out of scope (VISAGE_ENABLED stays false) |
| P18 | "48 of 46 owned books read": `readCount` counts read wishlist books too | none (data) | `AvatarPage` | Low | Left: not accessibility; logged for the owner |
| P19 | Dialog role and name | 4.1.2 | `role="dialog"`, `aria-modal="true"`, `aria-label="Your Profile"`: present | none | Pass |
| P20 | Headings: page `h1` (wordmark), dialog `h2`, section `h3` | 1.3.1 | in order | none | Pass |
| P21 | No sideways scroll at 390, 1280 or 200% zoom | 1.4.10 | `scrollWidth == clientWidth` (390/390, 1280/1280, 640/640); panel 606/606 | none | Pass |
| P22 | axe | | 0 violations at both widths, archive collapsed and expanded | none | Pass |

### The Oracle (`OracleSection`)

| ID | Finding | WCAG | Evidence | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| O1 | Picks arrive one by one with no announcement | 4.1.3 | No `aria-live` / `role=status` anywhere in `main` during or after a consult | High | Fixed |
| O2 | The Consult button is `disabled` while divining, so a keyboard user's focus drops to the page; busy state not exposed | 2.4.3, 4.1.2 | `disabled={loading…}`; HTML focus fixup moves focus to `body`; no `aria-busy` | High | Fixed |
| O3 | "The Oracle's vision clouded over" is not announced | 4.1.3 | Plain `<p>` (the wishlist error already has `role="alert"`) | Medium | Fixed |
| O4 | Consult button hover state: white on `indigo-400/90` | 1.4.3 | 3.51 (1280) / 3.54 (390) | Medium | Fixed |
| O5 | "+ Wishlist" is 85x23 and five buttons share one name | 2.5.8 (spacing exception), project 44px, 2.4.6 | Each card's button reads "+ Wishlist" with no title | Medium | Fixed |
| O6 | Footnote and "needs at least one book" text, `text-purple-400/60` 14px | 1.4.3 | 3.31 at both widths | Medium | Fixed |
| O7 | Consult focus ring is `ring-indigo-300`; Wishlist uses the browser default | 2.4.7, project rule | Computed styles in the tab walk | Medium | Fixed |
| O8 | The no-cover fallback "♛" is read aloud | 1.1.1 | Glyph inside the cover box, next to an `h3` with the title | Low | Fixed |
| O9 | Picks are not a list | 1.3.1 | `div` of `div`s | Low | Fixed |
| O10 | `.ht-card` still jumps 2px on hover under reduced motion (only the transition is removed); BOOK_DESIGN section 6 says card lift is off | project rule | FONT_CSS reduced-motion block | Low | Fixed |
| O11 | Headings `h2` "The Oracle", `h3` per pick; cover `alt="Cover of …"` | 1.3.1, 1.1.1 | | none | Pass |
| O12 | No sideways scroll; axe 0 violations before and after a consult | 1.4.10 | 390/390, 1280/1280, 640/640 | none | Pass |

### The Binding / Codex (`PairSection`, view `pair`)

| ID | Finding | WCAG | Evidence | Sev | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | Focus is lost three times: choosing a file removes the upload button (the preview replaces it); Cancel and Bind remove the preview | 2.4.3 | After each step `document.activeElement` is `body` | High | Fixed |
| C2 | Import progress and outcome are not announced; Bind is `disabled` while binding | 4.1.3, 4.1.2 | Progress lives only in the button label; the outcome `<p>` is plain | High | Fixed |
| C3 | File errors ("No books could be read from that file…") not announced | 4.1.3 | Plain `<p>` | Medium | Fixed |
| C4 | The two file inputs have no accessible name | 4.1.2 | `input[type=file]` with no label (hidden with `display:none`, so axe skips them; the visible button is the control) | Low | Fixed (named; buttons now also point at their instructions) |
| C5 | White text on `pink-500` (Bind) and on the hover states of both upload buttons | 1.4.3 | Bind 3.53 (390) / 3.56 (1280); hover `pink-500` 3.53, hover `indigo-500` 4.47 (computed) | Medium | Fixed |
| C6 | Small muted text below 4.5:1 | 1.4.3 | "cancel" `text-purple-400/70` 3.79 (390) / 4.03 (1280); footnote `text-purple-400/60` 3.31 | Medium | Fixed |
| C7 | Targets under 44px | 2.5.8 / project | Upload buttons 32; cancel 31x20; Bind 36. Checkboxes are 13px but the whole card is their `<label>` (pass) | Medium | Fixed |
| C8 | Browser-default focus ring; a focused checkbox shows only a 13px ring | 2.4.7, project rule | | Medium | Fixed |
| C9 | "❦" in the success message is read aloud | 1.1.1 | | Low | Fixed |
| C10 | Headings `h2` "The Binding", `h3` per card; no sideways scroll; axe 0 on the upload screen, 1 (`color-contrast`, Bind) on the preview | | | none | Pass apart from C5 |

Measurement artefacts (not findings): "Export Library" at 390px read 4.49 because the span wraps
over two lines and its box takes in the neighbouring words; the staging banner caused low readings
in the first run until it was hidden.

## Fixes

Counts: **35 findings fixed** (P1-P16, O1-O10, C1-C9), **2 left** (P17 copy, P18 data); 7 rows
were already passing (P19-P22, O11-O12, C10 apart from C5).

### Shared pieces

- `Overlay` (every modal): captures the opener during the first render, focuses the panel
  (`tabIndex=-1`) on open unless a child already took focus, wraps Tab and Shift+Tab inside
  (`wrapTab` and `FOCUSABLE` in the new `src/lib/focusTrap.js`, unit-tested), closes on Escape
  (same path as a backdrop click, so the "bulk run still going" guard in Your Profile still
  applies), and refocuses the opener on unmount if it is still on the page. StrictMode-safe: the
  double mount refocuses the opener and then moves back in. Fixes P1-P4 and CODE_REVIEW_TODO 12
  for Inscribe and the book window too.
- `GenreSuggestInput` (book window): Escape while the suggestion list shows calls
  `preventDefault`, so the first Escape closes the list and the second closes the window
  (checked on staging: list closed, window stayed open, then closed, focus back on the card).
- `FONT_CSS`: new `.ht-focus-scope` (on the Oracle root, the Binding root, and a wrapper inside
  Your Profile) gives every focusable descendant the `#ffd5ee` 2px outline; a checkbox's card
  label lights up as a whole; script-only focus targets (`tabindex=-1`) get no ring. Its
  forced-colors block uses `Highlight` for the outline and gives every button a `ButtonText`
  edge. It is last in the sheet. No animation, so no reduced-motion rule is needed.
- `FONT_CSS` reduced-motion block: `.ht-card:hover { transform: none; }` (O10), placed after
  the `.ht-card:hover` rule it overrides.
- `MiniAvatar` placeholder "❦": `aria-hidden="true"` instead of an `aria-label` on a plain
  `div` (ignored by screen readers). Every caller shows the reader's name beside it, and the
  sealed-image branch already used `alt=""`.

### Your Profile

P5 visible labels "New shared archive" and "Invite code" (`label for`), placeholders raised to
`placeholder-purple-300/70` (computed 5.1:1). P6 `aria-expanded` on archive rows, arrows hidden.
P7 `role="alert"` on all three error lines. P8 an always-mounted `sr-only` status line reads
"Divining… n of m", then "N tagged … Review the list below."; the "press Stop first" warning is an
alert. P9 every muted line on these screens moved from `purple-400/60`, `purple-400/70` and
`purple-300/60` to `purple-300/75`. P10 `min-h-[44px]` (and `min-w-[44px]` on icon buttons) on
Close, Divine, Stop, Bind, Join, both inputs, archive rows, the switch, Invite, Copy, Rename, Delete,
Leave, Remove member, and the header chip. P11 `.ht-focus-scope`; the chip's ring is now `#ffd5ee`.
P12 emoji and glyphs `aria-hidden`; the average reads "… verdict, of 5 swords". P13 `sr-only`
status "Invite code copied". P14 the result list is focusable with a name. P15
`motion-reduce:transition-none` on the switch track and knob. P16 "Tropes" is an `h3`.
Remove member now names who: "Remove @name from the archive". The chip has
`aria-haspopup="dialog"`.

### The Oracle

O1 one `role="status"` line, text from `oracleStatusText()` in `src/lib/oracle.js` (unit-tested):
"Reading the leaves of your library…", then "Picks are arriving…" (unchanged while cards land),
then "N picks from the Oracle.", or "The Oracle has given all it saw — consult again for a fresh
reading." With no picks on screen this line is the visible message, so the copy is never in the
page twice (a first version duplicated it and broke `negative.oracle.spec.js`; fixed). The list is
a `ul` named "The Oracle's picks", `aria-busy` while picks are pending, and is not itself live.
O2 Consult uses `aria-disabled` and `aria-busy` while divining instead of `disabled` (the existing
`busyRef` ignores presses); it stays focused. It keeps `disabled` when the shelves are empty, with
`aria-describedby` pointing at the reason. O3 the error is an alert. O4 hover is `indigo-600`
(6.3:1 computed). O5 "+ Wishlist" is 44px tall, its name is "+ Wishlist: <title>", a polite line
says "“<title>” is on your wishlist.", and focus moves to the next pick's button (or back to
Consult) once the card has left. O6 muted lines `purple-300/75`. O7 focus ring. O8 "♛" hidden.
O9 list semantics.

### The Binding (Codex)

C1 focus moves to "Found N books — choose what to bind:" when a file is read, and back to "Upload
My Clippings.txt" after Cancel or Bind. C2 an always-mounted `role="status"` line says "Binding
your tomes to the archive, fetching covers…" while busy and then the outcome; Bind uses
`aria-disabled`/`aria-busy` while busy (keeps `disabled` when nothing is ticked) and a ref blocks a
same-instant double press. C3 errors are alerts. C4 inputs named "Kindle My Clippings.txt file" and
"Goodreads library export CSV file"; the buttons point at their instructions with
`aria-describedby`. C5 Bind `pink-600` (hover `pink-700`), upload hovers `pink-600` and
`indigo-600`. C6 muted lines. C7 targets. C8 focus ring and whole-card checkbox focus. C9 "❦" hidden.

## After the fix (measured on staging, same method)

| Check | 390 | 1280 | 200% zoom (640) |
| --- | --- | --- | --- |
| axe violations: Oracle before/after consult, Codex upload/preview, Profile, Profile with an archive open | 0 / 0 / 0 / 0 / 0 / 0 | same | |
| Targets under 44px on the three screens | none (Codex checkboxes are 13px inside a full-card label) | none | |
| Sideways scroll (`scrollWidth`/`clientWidth`) | 390/390 | 1280/1280 | 640/640; profile panel 606/606 |
| Focus outline on every tabbed control | `2px solid rgb(255,213,238)` | same | |
| Your Profile: focus on open / Tab leaves / Escape closes / focus back on chip | in dialog / never (14 presses) / yes / yes | same | |
| Consult while divining | `aria-busy="true"`, `aria-disabled="true"`, focused, label "Divining…" | same | |
| Codex focus after file / after Cancel | preview heading / upload button | same | |
| Forced colors (Chromium emulation) | button edge `1px solid` ButtonText, outline in Highlight | | |
| Reduced motion | card hover `transform: none`; switch `transition-property: none` | | |

Contrast after the fix (10th-percentile, measured): every text element on the three screens is at
or above 4.5:1 except: the decorative "♛" (4.13, now `aria-hidden`) and roster "❦" (4.44, now
`aria-hidden`), which are decoration and exempt; Bind and Join while disabled (3.3), exempt as
inactive controls; and "Export Library" at 390 (4.46), the wrapping-span artefact noted above
(`purple-100` on the card computes above 12:1). The merged Oracle status line measured 5.83 (390)
and 5.72 (1280). Examples of the moved muted text: stat labels and member counts 3.86-4.04 → pass;
@handle and sharing hint 3.09-3.28 → pass; Oracle and Codex footnotes 3.31 → pass.

## Tests

- Unit: `tests/focus-trap-unit.mjs` (new, 7 tests), `tests/live-status-unit.mjs` (new, 6 tests,
  round 2) and 4 new `oracleStatusText` tests in `tests/oracle-unit.mjs`. `npm test`: 78 pass, 0 fail
  (after round 2).
- Round 1 numbers below were for 12 UI tests; round 2 has 15 (see "Fix round 2").
- UI: `tests/e2e/a11y.spec.js`, 12 tests. With the pre-fix `App.jsx` all 12 fail on the intended
  assertion (focus not in dialog, no `aria-haspopup`, no labels, Escape ignored, no `aria-busy`,
  no status region, no alert, no named Wishlist button, no input labels; the last three Codex
  tests stop at the missing input label). With the fix: 12 pass.
- Round 1: full suite from `test/e2e-buttons` plus this spec, 195 passed, 1 skipped (the old
  `fixme`). Round 2: the suite is now copied into this working tree (uncommitted) and
  `npm run test:e2e` runs it, `a11y.spec.js` included; see "Fix round 2" for the counts.

## Fix round 2 (independent review, `tests/a11y-oracle-codex-profile-review.md`)

| Review ID | Fix | Verified |
| --- | --- | --- |
| M1 focus fell to `<body>` after Invite; then Escape and the Tab trap stopped | `Overlay` now listens for keys on the document while open (only the topmost of stacked overlays reacts: the innermost panel holding focus, else the last opened), and a `MutationObserver` pulls focus back to the panel when it lands on `<body>`. Explicit focus moves: Invite → Copy; Bind / Join → the new archive's row; bad Bind / Join → the field; Remove member and Rename → the archive's row; Leave / Delete → "New shared archive". StrictMode-safe (stack push/splice and listeners undone in cleanup) | Staging by hand on a throwaway archive (alpha, beta joined by API, then deleted; 0 left): focus stayed in the dialog after Bind (row), Invite (Copy), Remove member (row), bad Join (code field), Delete (name field); Escape closed it. e2e "with focus lost to the page…" |
| M2 double click on + Wishlist saved two rows (BUG-004, already on master) | Per-pick in-flight ref in `addRec`; `aria-disabled` while saving. `addBook` unchanged | e2e "a double click on + Wishlist saves the book once": 2 rows on master and round 1, 1 row now |
| m1 Escape on the cover crop closed the book window | `ImageCropModal` takes an `onCancel` (both callers pass `setCropSrc("")`) and claims Escape in the capture phase, so `Overlay` sees it as handled | e2e "Escape cancels the crop and leaves the book window open" |
| m2 backfill announced every book | `bulkTropeStatusText()` in new `src/lib/liveStatus.js` (unit-tested): start, every 10, finish | Staging, 59 untagged, AI stubbed to fail (nothing written): 7 announcements, not 59 |
| m3 four e2e tests failed on master at a missing locator; one unit test only matched selector text | Codex tests find the input by `type=file` + `accept`; + Wishlist by card text + visible label, focus asserted before size and name. The `FOCUSABLE` string test is dropped | Against master all 15 a11y tests fail, each at its behaviour assertion (focus, alert, status, row count, crop). Against round 1 exactly the 3 new ones fail |

**m4 (config), done in round 2:** `a11y` is in the "app" project's `testMatch` in
`playwright.config.js`, and `navigation.spec.js` "Esc closes the Inscribe window" is no longer
`.fixme` (it passes). No browsers or device projects were added.

Round 2 re-check (frontend-dev, 2026-11-18, all on staging, port 5174, staging banner checked):

- Full `npm run test:e2e`: first run 198 passed, 1 failed; final run **199 passed, 0 failed, 0 skipped**. The failure was a race in the new
  "with focus lost to the page…" test: it blurred while the archive list was still loading, and
  `Overlay`'s focus rescue (correctly) pulled focus back before the `<body>` precondition was read.
  The test now waits for "Opening…" and "Gathering the keepers…" to go first; 9 of 9 repeats pass.
- `a11y.spec.js` (15 tests) against master's `App.jsx`: all 15 fail, each at its behaviour
  assertion (focus, `aria-haspopup`, label, Escape, `aria-busy`, status, alert, row count, crop).
  None stops at a missing locator.
- M1 scripted in Chromium on a throwaway archive "E2E Handcheck …" (alpha owner, beta joined by
  invite code through the API): Bind by keyboard → focus on the new row; Invite → Copy; Remove
  member ✕ → the row; beta at 390px, Leave archive → "New shared archive"; alpha, Delete archive →
  "New shared archive". After each, Tab and Shift+Tab stayed in the dialog and Escape closed it.
  The archive was deleted at the end. Join by UI was not driven (it shares Bind's focus path).
- m2 with the AI stubbed to fail (nothing written), 59 untagged: the status region changed 7 times
  ("Divining tropes for 59 tomes…", 10, 20, 30, 40, 50 of 59, "0 tagged. Review the list below.").

Follow-ups, deliberately left (review): **m5** axe `label-content-name-mismatch` on the
`ArchiveSwitcher` button (already on master, outside these screens). **m6** "✎ Change cover" in
`CoverEditor` is a clickable `div` the keyboard cannot reach (the crop e2e test has to force-click
it). New, seen during the M1 check: after Remove member the archive row still said "2 members" until
the window was reopened. Fixed in round 3 (R2-S1).

## Fix round 3 (review round 2 Minors, frontend-dev, 2026-11-18)

All on staging (port 5174, banner checked). Every new or un-skipped test was run against `App.jsx`
with only its fix reverted, and failed there (column "Without the fix").

| Review ID | Status | Fix | Test | Without the fix |
| --- | --- | --- | --- | --- |
| R2-W1 Safari: tap/click opener lost | **Fixed** | `trackPresses()` (capture-phase pointerdown / mousedown / touchstart, started and stopped by the root, StrictMode-safe) remembers the last pressed control; `pickOpener()` uses it when `activeElement` is `<body>` (or a panel holding the press) and the press is under 5 s old. Both in `src/lib/focusTrap.js`, unit-tested | `mobile.spec` "after a tap opens it… focus is back on the chip" (`test.fail` removed); `a11y.spec` "Escape closes it and focus returns to + Inscribe" (keyboard-only WebKit branch removed, clicks everywhere) | Both fail in `webkit-desktop` and `mobile-safari` (`toBeFocused`); pass in Chromium |
| R2-F1 + Owned: opener removed | **Fixed** | `Overlay` keeps a return chain: its opener, then the chain of the window that held the opener. On close it focuses the first element still on the page (`firstConnected()`), else the window still open, if any. + Owned → book window → Escape lands on + Inscribe | `a11y.spec` "a book opened by + Owned returns focus to + Inscribe when it closes" | Fails in Chromium (`toBeFocused`: focus on `<body>`) |
| R2-S1 "2 members" after Remove | **Fixed** | `LibraryDetail.removeMember` calls a new `onRosterChanged` after a successful delete only; `SharedArchives` reloads its list and bumps membership, then focus returns to the row | `a11y.spec` "after Remove member, the archive row says 1 member at once" (alpha keeps an "E2E Archive …", beta joins by invite code over REST, deleted in `finally`) | Fails: row still "2 members" |
| R2-T1 phone targets under 44 | **Fixed** | `min-h-[44px]` (and `min-w-[44px]` on chips and Clear) on Covers / Spines, Sort, Search, Match all / any, trope chips, Clear, the archive switcher and its options; `.ht-curio-btn` 36 → 44px (popover top 42 → 50px); trope gaps 6 → 8px. Inscribe Close is a 44 x 44 box with `-my-2 -mr-2`, so the header row keeps its height. Each Verdict / Smoulder button is a 44 x 44 box around the unchanged 20px icon, edge to edge; the "saved" pill has a fixed 48px slot so it cannot wrap the row | `mobile.spec` shelf-controls test (was `fixme`; it measured `<main>`, which holds no shelf controls, so it now measures the ControlsBar row and the switcher with its list open), Verdict / Smoulder test (was `fixme`), Inscribe Close size | Shelf controls and Verdict / Smoulder fail in all 3 projects; Inscribe Close fails (32 x 28) |
| R2-P1 "48 of 46" | **Fixed** (BUG-005) | `countOwnedRead()` in new `src/lib/shelfStats.js`, read books with `shelf === 'owned'`; `AvatarPage` prints it. "Tomes read" tile and the chip still count all read books (they are not a share of owned) | `tests/shelf-stats-unit.mjs` (6 tests) | 2 of 6 fail with the old rule. Staging alpha now reads "43 of 46" |
| R2-B1 badge covers Leave | **Fixed** | `:root:has(.ht-staging-badge)` sets `--ht-badge-h: 24px` (badge fixed at 24px); `Overlay`'s panel pads its bottom by `1.25rem + var(--ht-badge-h) + env(safe-area-inset-bottom)`. Production: no badge, and `index.html` has no `viewport-fit=cover`, so both terms are 0 and the panel is as before | `mobile.spec` "scrolled to its end, the last control is not under the staging badge": Leave's bottom ≤ the badge's top, and `elementFromPoint` at its centre is Leave. (The badge is `pointer-events:none`, so `elementFromPoint` alone cannot see it) | Fails on `mobile-safari` and `mobile-chrome`; passes on `webkit-desktop`, where the centred panel never reached the badge |

Measured with my own script at 390 (iPhone 14 size, Chromium) and 1280: every ControlsBar control
44px tall (chips 72-136 wide), Verdict / Smoulder 44 x 44, Inscribe Close 44 x 44, no sideways
scroll on the library or the book window, no console errors. Screenshots (gitignored):
`tests/screenshots/r2t1-390-shelf-controls.png`, `r2t1-390-shelf-controls-focus.png`,
`r2t1-390-book-window.png`, `r2t1-390-book-window-focus.png`, `r2t1-390-inscribe.png`,
`r2b1-390-profile-bottom.png`, and the same six at `1280`.

Design trade-offs for the owner: the trope area is taller on a phone (rows 44px + 8px instead of
24 + 6); the five swords / candles now sit 44px apart, and at 390px the meter drops under its label;
the controls are 44px on desktop too (BOOK_DESIGN §4 asks for ≥ 44 everywhere).

Final counts (current tree, one run at a time): `npm test` 108 pass, 0 fail. `npm run test:e2e`
201 passed, 0 failed. `npm run test:e2e:webkit` 103 passed, 2 skipped, 0 failed.
`npm run test:e2e:mobile` 103 passed, 2 skipped, 0 failed. The 2 skips in each cross-browser run
are the R2-S1 test, which runs in the Chromium "app" project only: staging rate-limits invite joins
("Too many invite attempts"), and a run of all projects hit that limit after about 9 joins in an
hour. It passed earlier in all three cross-browser projects, before the limit was hit. One earlier mobile run had 1 failure in
`navigation.spec` "Spines / Covers… remembered after a reload" (mobile-safari: the cathedral did
not appear within 10 s after reload); 5 of 5 repeats and both later runs passed. Not caused by
this change, but it is flaky.

## Left, with reason

- P17 "Inscribe your Visage ✦" on the chip while the Visage is dormant: Visage copy is out of scope.
- P18 "48 of 46 owned books read": fixed in round 3 (R2-P1, BUG-005).
- Not covered by this audit: the dormant Visage branch of `AvatarPage`, other modals' content
  (Inscribe, book window) beyond the shared `Overlay` behaviour, real screen readers (NVDA,
  VoiceOver) and a real Windows High Contrast session (only Chromium emulation), and the page
  footer's `text-purple-400/40` line, which sits outside these three screens.
