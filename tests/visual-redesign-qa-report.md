# QA Report — `visual-redesign` branch (visual/layout pass)

**Date:** 2026-09-21
**Tester:** qa-tester (Playwright MCP, Chrome)
**Scope:** Card-frame uniformity, rails, wishlist ghost state, tap targets, reduced-motion, background grain, and app-shell overflow. No auth was attempted; see "Session note" below for how live-app checks 16–18 became reachable anyway.
**Targets:**
- Target 1 — live app shell: `http://localhost:5173/`
- Target 2 — QA fixture: `http://localhost:4173/qa-fixture.html` (served via `vite preview`; `file://` is blocked by the browser tool, so the fixture was served locally instead of opened directly — same file, same compiled CSS asset)

---

## Session note — fixture CSS gap (read before the results)

The fixture (`dist/qa-fixture.html`) links only the compiled Tailwind stylesheet
(`dist/assets/index-DBYaucMX.css`). That file contains **zero** rules for any
`.ht-*` custom class (`.ht-tome`, `.ht-frame`, `.ht-bg`, `.ht-card`, `.ht-rail*`,
`.ht-tome-ghost`, etc. — confirmed by `grep -c "ht-tome\|ht-frame\|ht-rail\|ht-bg\|ht-card" dist/assets/index-DBYaucMX.css` → `0`). Those classes are defined by
the `FONT_CSS` string in `src/App.jsx` (lines 150–236) and are injected into the
DOM by a `<style>` tag **at React runtime**, not by the Tailwind build. The
fixture never runs the app's JS, so on first load none of the `.ht-*` rules
existed — `.ht-frame` computed to `position: static`, `.ht-tome` had no padding
or `position: relative`, ghost cards had no dashed border, rails had no color —
none of it a real app defect, just a gap in how the fixture was assembled.

**Workaround used:** navigated to the live app (Target 1), extracted the exact
injected `<style>` text (7,349 chars, confirmed containing `.ht-tome`/`.ht-frame`)
straight from its DOM, saved it verbatim as `dist/qa-fixture-fontcss.css`, and
linked it into the fixture at runtime before measuring. This tests the **real
shipped CSS rules** against the fixture's **verbatim markup** — which is what
the fixture was built for — rather than either fabricating a pass or reporting
false failures caused by the missing stylesheet.

**Action item (not a numbered bug, filed as BUG-002 for tracking):** whoever
maintains `qa-fixture.html` should inline `FONT_CSS` into the fixture (or link
`dist/qa-fixture-fontcss.css`) so future runs don't silently test unstyled
markup.

## Session note — unexpected authenticated session

Target 1 was expected to land on the login screen (per the hard constraint: no
credentials, no login attempted). Instead the browser already carried a valid
Supabase session — not established by this QA pass — and Target 1 rendered the
real library (70 tomes). No login/signup/auth action was performed at any
point; this session state was inherited from the browser profile. Per the
task's own instruction ("blocked, not failed" only applies when a logged-in
library is *unreachable*), this was used **read-only** for checks 16–18 exactly
as scoped, plus one bonus cross-check (noted inline) against production data
for the card-uniformity and genre-chip-overflow findings, since real data
turned out to be available. No book, shelf, or account data was created,
edited, or deleted.

---

## Results table

| # | Check | Result | Measured evidence |
|---|---|---|---|
| 1 | `.ht-tome` uniform W×H in `#grid`, 1280w | PASS | All 6 fixture cases: **208.0 × 301.0px**, zero variance. Cross-checked on live production grid (70 real cards): 1 distinct size, `208.0×301.0`. |
| 1 | `.ht-tome` uniform W×H in `#grid`, 440w | PASS | All 6 fixture cases: **158.5 × 226.75px**, zero variance. |
| 2 | `.ht-tome-cover` aspect 2:3, 1280w | PASS | All 6 cases: ratio **1.5000** exactly (incl. wide-art `wide-longgenres-both` and no-art `no-art-finished`). |
| 2 | `.ht-tome-cover` aspect 2:3, 440w | PASS | All 6 cases: ratio **1.5000** exactly. |
| 3 | Genre chip row same height, short vs. long genre card | PASS | `tall-reading` row height **19.5px**, `wide-longgenres-both` row height **19.5px** — identical at both 1280w and 440w. (Related to FAIL #4 below — see note.) |
| 4 | No horizontal overflow, 1280w | PASS | `scrollWidth === clientWidth` = 1265 = 1265. Max element right-edge 1255px (`.ht-frame`), within bounds. |
| 4 | No horizontal overflow, 440w | **FAIL** | See BUG-001. `scrollWidth`(425) `=== clientWidth`(425) at the **document** level, but the last genre chip in `wide-longgenres-both` has `right = 529.22px` against `clientWidth = 425px` — **104px past the viewport**, silently clipped by the row's own `overflow-hidden` rather than shrinking/eliding. |
| 5 | Read rail on LEFT, audio rail on RIGHT of plate | PASS | `.ht-rail-read` renders at `left:-1px` of every tome that has one; `.ht-rail-audio` at `right:-1px`. Confirmed geometrically for `tall-reading`, `wide-longgenres-both`, `ghost-audio`, `near-full-rails`, `tiny-rail`. |
| 6 | Rail height scales with % | PASS | 1280w, tome height 301px (minus border): 64% → 191.36px (≈63.5%); 38% → 113.62px (≈37.7%); 72% → 215.27px (≈71.5%); 99%→296.01px; 97%→290.02px; 2%→5.98px. All proportional. |
| 7 | `tiny-rail` (2%) visible (height>0) | PASS | Measured height **5.98px** — clearly non-zero/non-collapsed. |
| 8 | `near-full-rails` (99%/97%) never exceeds plate | PASS | Read rail: top 517.99 ≥ tome top 518 (no overshoot); Audio rail: top 523.98, bottom 814 = tome bottom 814. Neither rail's top is above, nor bottom below, the tome's own bounding box. |
| 9 | `no-art-finished` has NO rails | PASS | `querySelector('.ht-rail-read')`/`.ht-rail-audio` both `null` inside that tome. |
| 10 | Rail computed colors | PASS | Read rail: `rgba(167, 139, 250, 0.9)` (exact spec match). Audio rail: `rgba(34, 211, 238, 0.95)` (exact spec match). |
| 11 | `ghost-audio` dashed border + faded cover | PASS | `border-style: dashed` (vs `solid` on every other case); cover `opacity: 0.55` (vs `1` on normal cards). |
| 12 | `no-art-finished` fallback title stays inside cover box | PASS | Fallback `<span>` rect (184×75.6) fully within `.ht-tome-cover` rect on both X and Y axes. |
| 13 | All 4 corner glyphs present & inside plate bounds | PASS | 24/24 (`tl`/`tr`/`bl`/`br` × 6 cases) — all `position:absolute`, all `insideX && insideY` true. |
| 14 | `#btn-owned` / `#btn-wishlist` ≥ 44px tall | PASS | Both measured at exactly **44.0px**. |
| 15 | Reduced motion: `.ht-tome` transition `none`, no hover transform | PASS | With `prefers-reduced-motion: reduce` emulated: computed `transition: none` before hover; after `hover()` on the card, computed `transform: none` (no lift). |
| 16 | Live app: no horizontal overflow, 1280w | PASS | `scrollWidth === clientWidth` = 1265 = 1265, overflow 0. |
| 16 | Live app: no horizontal overflow, 440w | PASS | `scrollWidth === clientWidth` = 425 = 425, overflow 0. |
| 17 | Grain: texture or stripes/banding? | PASS — **reads as subtle texture, not stripes** | See "Grain analysis" below — pixel-level evidence, not just eyeballing. |
| 18 | `.ht-frame` visible on all 4 sides at 440w | PASS | Rect `{top:10, left:10, right:415, bottom:890}` inside viewport `440×900` — `frameVisibleAllSides = true`. |

**Totals: 20 checks executed (some rows split PASS/FAIL by width) → 19 PASS, 1 FAIL, 0 BLOCKED.**
(Counted as: 18 distinct check IDs in the brief, #1/#2/#4/#16 each verified at both widths = 22 individual assertions; 21 passed, 1 failed.)

---

## Grain analysis (check 17 — "the single check the user most wants answered")

Screenshots: `tests/screenshots/live-app-1280-full.png`, `tests/screenshots/live-app-1280-viewport.png`, `tests/screenshots/live-app-440-full.png`, `tests/screenshots/live-app-440-viewport.png`.

Visual read: both screenshots show a soft diagonal cross-hatch under broad, smooth violet/fuchsia glows near the top and bottom corners — no visible rings or hard edges in the radial glows, no visible horizontal/vertical stripes.

To go beyond eyeballing, I pixel-sampled a plain background scanline (y=5, x=0..80, top-left corner, no cards/text) from the actual rendered PNG with Pillow:

```
[(12,7,20), (12,7,20), (12,7,20), (12,7,20), (16,10,24), (16,10,24), (12,7,20), (12,7,20),
 (12,7,20), (12,7,20), (12,7,20), (12,7,20), (16,10,24), (16,10,24), (16,10,24), (12,7,20), ...]
```

- Transitions: 921/1279 horizontal pixel-pairs differ at y=5 (1280w); 313/439 at 440w — i.e. the color oscillates on ~70% of adjacent pixels.
- Period: oscillation repeats roughly every 4–6px — matches the CSS source exactly: `.ht-bg` (`src/App.jsx` FONT_CSS block) defines `repeating-linear-gradient(45deg, rgba(240,166,224,.016) 0 2px, transparent 2px 6px)` as the base grain layer, under four soft `radial-gradient` glows.
- Magnitude: max single-step jump is **13–14** (summed across R+G+B, out of a possible 765) — roughly a 5% shift, consistent with the very low `0.016` alpha of the grain layer.
- No long flat runs followed by a sudden large jump (which is the signature of gradient/banding compression artifacts) — the underlying radial-gradient glow rises smoothly (baseline drifts from `(12,7,20)` to `(15,8,25)` over 80px, i.e. gradually, not steppy).

**Verdict: subtle diagonal grain texture, working as designed. No visible banding/stripes.**

---

## Failure detail

### FAIL — Check 4 (440w): genre chips overflow their row, silently dropping the second chip

- **Selector:** `.flex.gap-1.flex-nowrap.overflow-hidden` (the `GenreChips` row, `oneLine` mode) → chip `span.ht-display...flex-shrink-0...truncate`
- **Case:** fixture `wide-longgenres-both`, at 440px viewport width.
- **Expected:** genre chips fit within the card / are truncated with an ellipsis when they don't.
- **Actual:** row container right edge = `392px` (correctly clipped to the card's content width via `overflow-hidden`), but the **second** chip (`"FICTION, FANTASY, EPIC"`) has `right = 529.22px` — **137px past its own row, 104px past the document's `clientWidth` (425px)**. The chip is invisible on screen (clipped by the parent), not ellipsized — the first chip's text ("FICTION, ROMANCE, FANTA…") does get a visible ellipsis, but the second chip vanishes entirely rather than being hidden or shrunk gracefully. Screenshot: `tests/screenshots/bug-genre-chip-overflow-440.png` (see "The Serpent's Vow…" card — only one genre chip is visible even though the markup renders two).
- **Production corroboration (bonus, not in the original check list):** on the live app's real 70-book grid at **1280px** (not just the narrow fixture width), `11 of 38` genre-chip rows (29%) overflow the same way — e.g. row right edge `611.5` vs. last-chip right edge `703.9` (92px over); `361.5` vs `480` (118px over). This is not a fixture-only edge case; it reproduces routinely in production data.
- **Root cause:** `src/App.jsx:381`, the `GenreChips` component's `oneLine` branch applies `whitespace-nowrap flex-shrink-0 max-w-full truncate` to each chip inside a `flex-nowrap overflow-hidden` row (`:379`). `flex-shrink-0` prevents the chip from ever shrinking to fit, so it grows to its full text width in the `flex-nowrap` row; `truncate`'s ellipsis only fires when an element's own box is width-constrained below its content, which never happens here — so the *row's* `overflow-hidden` is left to silently clip whatever doesn't fit, with no ellipsis and, for a second/third chip, no visibility at all. Call site for the covers-grid card: `src/App.jsx:2388` (`<GenreChips genres={b.genres} max={2} className="mt-1" oneLine />`).
- **Suggested fix direction (not applied — QA does not fix):** drop `flex-shrink-0` (or replace with a `min-w-0` + `flex-shrink` so chips can compress) so the container's `truncate` behavior actually has room to engage, or cap the row to always show exactly one genre in tight layouts.

---

## Screenshots

- `tests/screenshots/live-app-1280-viewport.png` / `-full.png` — live library shell, 1280w
- `tests/screenshots/live-app-440-viewport.png` / `-full.png` — live library shell, 440w
- `tests/screenshots/bug-genre-chip-overflow-440.png` — fixture at 440w showing the dropped second genre chip
- `tests/screenshots/font-css-extracted.css` — raw extracted FONT_CSS text (evidence for the fixture-CSS-gap note)

## Bugs filed

See `docs/BUGS.md`:
- **BUG-001** (Medium) — Genre chips silently overflow/disappear instead of truncating, in narrow cards and in ~29% of real production cards.
- **BUG-002** (Low / tooling) — `qa-fixture.html` doesn't load `FONT_CSS`, so `.ht-*` classes are unstyled unless manually injected; future QA runs risk false failures (or false passes on unstyled markup) unless this is fixed.

## Go / No-Go

**NO-GO** — one confirmed, reproducible visual bug (BUG-001), corroborated in production data, blocks calling the redesign clean. Everything else — the headline card-uniformity fix, rails, wishlist ghost state, tap targets, reduced-motion, shell overflow, and the background-grain question — passed with measured evidence.
