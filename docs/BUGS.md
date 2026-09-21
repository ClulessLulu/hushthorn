# Bugs

Filed by QA. Each entry: severity, steps to reproduce, expected vs. actual with
measured numbers, and suspected file/selector. QA does not fix — route to the
owning agent named in each entry.

---

## BUG-001 — Genre chips silently overflow/disappear instead of truncating

**STATUS: FIXED** (2026-09-21, commit follows this entry). `flex-shrink-0` and `max-w-full` dropped in favour
of `min-w-0 truncate`, so the chip can compress and the ellipsis actually engages.
Verified against the **live 70-book library** (not the fixture) at both widths:

| | before | after (1280px) | after (440px) |
|---|---|---|---|
| chip rows | 38 | 38 | 38 |
| chips escaping their row | 11 | **0** | **0** |
| chips clipped to nothing | — | **0** | **0** |
| chips correctly ellipsised | — | 22 | 34 |
| page horizontally overflowing | — | no | no (scrollWidth 425 === clientWidth) |

**Severity:** Medium (visual data loss — a genre silently vanishes from the card, no error, no ellipsis)
**Found by:** qa-tester, visual-redesign QA pass, 2026-09-21
**Owner:** frontend-dev

### Steps to reproduce

1. Open the covers grid (any width; most visible on narrow viewports or with books that have long/multiple genre names).
2. Find a book whose two genre chips (`GenreChips` in `oneLine` mode, `max=2`) combined are wider than the card's content width.
3. Inspect the genre chip row under the book's author line.

Reproduced directly against `dist/qa-fixture.html` (`data-case="wide-longgenres-both"`, http://localhost:4173/qa-fixture.html) at **440px viewport width**, and independently against the live production library at **1280px viewport width** (`http://localhost:5173/`, 70-book grid, no auth performed by QA — pre-existing session).

### Expected

Genre chips either fit within the card, or overflow content is truncated with a visible ellipsis (the `truncate` class is present specifically for this).

### Actual — with measured numbers

**Fixture, 440px:**
- Genre row (`.flex.gap-1.flex-nowrap.overflow-hidden`) right edge: `392.0px` (correctly clipped to the card's content box)
- Second chip (`"FICTION, FANTASY, EPIC"`) right edge: `529.22px`
- Overflow: **137px past its own row**, **104px past the document's `clientWidth` (425px)**
- Visually: the chip is not shown at all (fully clipped by the row's own `overflow-hidden`), not ellipsized. First chip does show a visible ellipsis; second chip just vanishes.
- Screenshot: `tests/screenshots/bug-genre-chip-overflow-440.png`

**Production, 1280px (bonus corroboration — real data, not synthetic):**
- 11 of 38 genre-chip rows on the live 70-book grid overflow the same way (29%).
- Sample: row right edge `611.5` vs. last-chip right edge `703.9` (92.4px over); row right edge `361.5` vs. last-chip right edge `480.0` (118.5px over); row right edge `1111.5` vs `1181.2` (69.7px over).

### Suspected file / selector

`src/App.jsx:381` — the `GenreChips` component's `oneLine` branch:

```jsx
<span key={g} className={`ht-display text-[9px] uppercase px-1.5 py-0.5 rounded-sm border border-purple-500/40 bg-purple-900/40 text-purple-200/90 ${oneLine ? "whitespace-nowrap flex-shrink-0 max-w-full truncate" : ""}`}>
```

`flex-shrink-0` prevents the chip from ever shrinking inside the `flex-nowrap overflow-hidden` row (`src/App.jsx:379`), so it always renders at full content width. `truncate`'s ellipsis only engages when the chip's own box is constrained below its content width — that never happens here, so the *row's* `overflow-hidden` silently clips whatever doesn't fit, with no ellipsis, and a second chip can be clipped away entirely.

Grid-card call site: `src/App.jsx:2388` — `<GenreChips genres={b.genres} max={2} className="mt-1" oneLine />`.

### Suggested fix direction (not applied — QA does not fix)

Drop `flex-shrink-0` (or pair with `min-w-0`) so chips can compress and `truncate` actually gets to work, or hard-cap to rendering a single genre chip in tight layouts.

---

## BUG-002 — QA fixture doesn't load `FONT_CSS`; `.ht-*` classes are unstyled by default

**STATUS: RESOLVED BY REMOVING THE FIXTURE** (2026-09-21). The fixture existed only because the app was
assumed to be unreachable behind auth. This QA pass proved Playwright reaches the real authenticated library,
so the fixture is obsolete — and a fixture that duplicates markup and hand-syncs `FONT_CSS` would drift out of
date and quietly test the wrong thing. `dist/qa-fixture.html` and `dist/qa-fixture-fontcss.css` are deleted.
Future QA tests the live app.

**Severity:** Low / tooling (does not affect the shipped app — confirmed the live app injects this CSS correctly; affects only the reliability of future QA runs against `qa-fixture.html`)
**Found by:** qa-tester, visual-redesign QA pass, 2026-09-21
**Owner:** frontend-dev (fixture maintenance)

### Steps to reproduce

1. Open `dist/qa-fixture.html` directly (served, since `file://` is blocked by the Playwright browser tool) and inspect computed styles on `.ht-frame`, `.ht-tome`, `.ht-bg`, or any other custom `ht-*` class.

### Expected

The fixture claims to load "the real compiled stylesheet" so that authed-only component markup can be visually QA'd without logging in. All classes referenced in the verbatim markup should be styled.

### Actual — with measured numbers

- `dist/assets/index-DBYaucMX.css` contains **zero** occurrences of `.ht-tome`, `.ht-frame`, `.ht-rail`, `.ht-bg`, or `.ht-card` (`grep -c "ht-tome\|ht-frame\|ht-rail\|ht-bg\|ht-card" dist/assets/index-DBYaucMX.css` → `0`).
- On first load, `.ht-frame` computed to `{ position: "static", zIndex: "auto", backgroundColor: "rgba(0,0,0,0)" }` instead of the shipped `{ position: "fixed", inset: "10px" }`.
- Root cause: the custom classes are defined in the `FONT_CSS` template string in `src/App.jsx` (lines 150–236) and injected via a `<style>` tag by React **at runtime** when the app mounts — they are never part of the Tailwind-processed CSS asset. The fixture links only the compiled CSS asset and never executes the app's JS bundle, so none of that styling is present.
- Confirmed on the live app (`localhost:5173`) that the same class computes correctly (`position: fixed`, `inset: 10px`), proving this is a fixture-wiring gap, not a product defect.

### Suspected file / selector

`dist/qa-fixture.html` (`<head>`, only links `./assets/index-DBYaucMX.css`); source of the missing styles is `src/App.jsx:150-236` (`FONT_CSS`).

### Suggested fix direction (not applied — QA does not fix)

Whatever script generates `qa-fixture.html` should also inline the `FONT_CSS` block (or link a small stylesheet built from it) so the fixture is self-contained. QA worked around this for this pass by extracting the live-injected style text and linking it in at runtime (`dist/qa-fixture-fontcss.css`, saved alongside this report) — that workaround file can be reused as the missing `<link>` target if convenient.
