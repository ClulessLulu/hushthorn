# Visual Redesign — "Books as Objects"

**Status:** Designed and approved (mockups reviewed 2026-09-20).
**Mockups:** https://claude.ai/artifact/PWaysWqyPmy2e2d9us3QSB — board `A - Standing Tome (chosen)` is the
cover reference; `Library screen - full shell` is the page reference. Boards B and C were rejected.

**Feature in one line:** Make the Covers view read as physical books instead of image tiles, carry reading
progress on the book itself using the spine shelf's existing rail language, tighten the page header, and fix
the add-book modal — all within the existing gothic design system.

---

## Direction

Locked: **deepen the gothic.** Warmer, more physical, more atmospheric — not a modernization. The existing
palette, fonts, and `ht-*` classes stay; this adds depth and texture rather than replacing the language.

## Scope

**In scope**
1. Covers view — books become "standing tomes" with depth and progress rails
2. Progress rails — one shared rule across Covers and Spines
3. Page shell — tighter header, background grain
4. Add-book / scan modal — the one surface called out as painful

**Deliberately NOT in scope** (they are fine as they are; churning them is risk without payoff)
- The spine shelf's own look — explicitly liked, only its rail *rule* changes (below)
- Book detail panel, forms/inputs, empty states, loading copy
- The Visage (dormant behind `VISAGE_ENABLED`), shared archives, notes/marginalia
- Any data model, DB, or RLS change. **This redesign adds no columns and no queries.**

## Structural rules — do not deviate

1. **The redesign is token-level first.** New shared classes live in the `FONT_CSS` block in `src/App.jsx`
   alongside the existing `ht-*` classes. Components consume those classes. Do not restyle components
   one-off with bespoke inline CSS where a shared class will do.
2. **No new progress data.** Rails read the existing `formatPercent(book, fmt)` helper and the existing
   `progress` JSON. No new columns, no new fetches.
3. **Cyan stays audio-only.** The audio rail is the only cyan in the Covers view.
4. **Sharp corners hold.** The tome cover's `2px 4px 4px 2px` radius is a book edge, not a rounded card —
   it is the one sanctioned exception, and it is 4px at most.
5. **Covers display `image_path`/`coverUrl` as-is.** The tome anatomy wraps the cover image; it never
   re-composites or redraws artwork.

---

## 1. The Standing Tome (Covers view)

Replaces the flat `aspect-[2/3]` image box in the grid card at `src/App.jsx:2310`.

**Anatomy**, bottom to top, inside a `position: relative` box at the card's cover aspect:

| Part | What it is | Notes |
|---|---|---|
| `.ht-tome` | the relative box | sized by the grid cell, `aspect-[2/3]` |
| `.ht-tome-cover` | the cover image / fallback | `inset: 0`, radius `2px 4px 4px 2px`, deep drop shadow, `overflow: hidden` |
| `.ht-tome-pages` | fore-edge page block | absolute, `right: -8px`, width 8px, cream `repeating-linear-gradient` striations |
| `.ht-tome-spine` | spine edge | absolute, `left: 0`, width 17px (12px below the `sm` breakpoint), dark gradient + 1px pink hairline on its right |
| `.ht-rail` | progress rails | see §2 |

**Cover fallback.** `CoverImage`'s `fallback` (a book with no artwork) renders the title in Cinzel inside the
cover, clamped to **5 lines** with `overflow-wrap: break-word` and a `max-height`, so a long title can never
spill past the cover.

**Card text.** Title + author only. The progress text line shown in an earlier mockup is **removed** —
the rails carry progress. Exact percentages remain available as the card's `title` tooltip
(`"<title> — <author> · 64% Print · 72% Audio"`), matching the spine's existing tooltip format.

- Title: clamp to **2 lines** (`-webkit-line-clamp: 2`) + `overflow-wrap: break-word`. A long title must never
  push the grid out of alignment.
- Author: clamp to **1 line**.

**Wishlist books** render as ghosts: cover at `opacity: .55` with a `1px dashed rgba(240,166,224,.45)` border
and the page block faded. This deliberately mirrors the spine shelf's "ghosts in dashed glass".

**Interaction.** Hover/focus lifts the tome `translateY(-10px)` and deepens its shadow. The card stays a
`<button>` firing `setActiveId` — clicking a cover opens the detail panel, which is already the shipped
behavior and needs no change.

**Responsive.** The tome is sized by its grid cell, so it works at the existing `grid-cols-2 sm:grid-cols-3
md:grid-cols-4`. The page block, spine edge, and rails keep fixed px widths at all sizes (they are edges, not
proportions). At `grid-cols-2` on a phone the page block must not overflow the cell — the grid gap absorbs the
8px, verified in §7.

## 2. Progress rails — one rule, both views

The rails already exist on spines (`src/App.jsx:1124` and `:1137`). This adopts them on covers and makes the
rule identical in both places.

- **Reading rail** — violet `rgba(167,139,250,0.9)` (the existing `SPINE_GLOW.print`), rises from the foot of
  the **spine edge** (left). Driven by `Math.max(formatPercent(book,'print'), formatPercent(book,'ebook'))`.
- **Audio rail** — cyan `rgba(34,211,238,0.95)` (`SPINE_GLOW.audio`), rises from the foot of the
  **fore-edge** (right).
- Width 3px on covers (2px on spines, unchanged), `box-shadow: 0 0 6px <same colour>`, sharp corners,
  `pointer-events: none`, `aria-hidden="true"`.
- Each rail sits `bottom: 6px` on covers (`5px` on spines, unchanged) and its height is
  `calc(<pct>% - 6px)` — the same "subtract the foot offset" form the spine already uses, so a 100% rail
  stops flush with the top edge rather than overshooting it.
- **A rail renders only when `pct > 0` AND the book is not finished.**

**Behaviour change to shipped code:** spine rails are currently *not* gated on `book.read` — a deliberate
choice so a tome finished in audio still showed its partial print rail. That is being dropped by decision:
**a finished book shows no rail in either view.** Add the `!book.read` gate to both spine rails and update the
comment at `src/App.jsx:1089-1094`, which documents the old invariant and would otherwise be wrong.

Consequence, accepted: a book marked read that still has partial print progress no longer advertises it on the
shelf. The detail panel still shows per-format progress.

## 3. Page shell

**Header.** Currently ~270px before the first book. Tighten to ~155px:
wordmark `62px → 44px`, tagline `17px → 15px`, and reduced vertical gaps on the tagline, ornament rule,
avatar chip, and controls bar. No elements are removed — wordmark, tagline, `◆` rule, avatar chip, sign-out,
and controls bar all stay.

**Background grain.** Add one line to `.ht-bg`'s `background-image`, layered *above* the existing four radial
washes:

```css
repeating-linear-gradient(45deg, rgba(240,166,224,.016) 0 2px, transparent 2px 6px),
```

Pure CSS, no asset, no request. It must stay at/below ~1.6% alpha — visible as texture, never as stripes.

## 4. Add-book / scan modal

The one surface called out as painful. Current problems, at `src/App.jsx:4866-4895`:

| Problem | Fix |
|---|---|
| Covers are 40×56 thumbnails (`w-10 h-14`) — books reduced to list rows | Enlarge to ~56×84 and give them the tome treatment at small scale (cover + page block; no rails — an un-added book has no progress) |
| Result rows use flat `bg-purple-950/40`, not the app's card | Use `ht-card` so results match every other surface |
| `+ Owned` / `+ Wishlist` are stacked 10px buttons, tap targets well under 44px | Rebuild as a single row of two buttons at **≥44px tap height**, full-width on narrow screens |
| Fallback glyph is `♛`, inconsistent with `❦` used everywhere else | Use `❦` |
| No "nothing found" state — only loading and error | Add one, in the app's voice, telling the user what to do next (search by author, or inscribe manually) |
| `max-h-80` scroll window feels cramped | Raise the cap so more results are visible before scrolling |

Search behaviour, ISBN scanning, camera handling, and the duplicate-title guard are **unchanged** — this is a
visual and tap-target pass only.

## 5. Motion

- Tome lift on hover/focus, `.25s ease`; shadow deepens with it.
- Existing `ht-card` transitions stay as they are.
- **`prefers-reduced-motion`**: the existing `@media (prefers-reduced-motion: reduce)` block at
  `src/App.jsx:128` must be extended to disable the tome lift. Rails are static and stay visible — they are
  information, not decoration.

## 6. Accessibility

- Rails are decorative duplicates of the tooltip text → `aria-hidden="true"`.
- The card remains a real `<button>` with an accessible name; the cover `<img>` keeps its `alt`.
- Modal action buttons reach ≥44px tap height (§4).
- Rail colours are never the sole carrier of meaning — the tooltip and the detail panel both state progress.

## 7. Test cases (QE checklist)

- [ ] A book with `print` progress shows a violet rail at the correct height; 0% shows no rail
- [ ] A book with both ebook and audio progress shows violet (the further of print/ebook) AND cyan
- [ ] Marking a book **read** removes its rails in the Covers view **and** the Spine shelf
- [ ] A book with malformed/missing `progress` renders no rail and does not throw (`formatPercent` returns 0)
- [ ] A 60-character title clamps to 2 lines under the cover and does not misalign the grid
- [ ] A 60-character title on a **coverless** book clamps inside the cover and does not overflow it
- [ ] Wishlist books render as dashed ghosts in Covers, matching the Spine shelf
- [ ] Clicking/tapping a cover opens the detail panel; keyboard Enter/Space does the same
- [ ] At `grid-cols-2` (phone width) the page block does not overflow its cell or cause horizontal scroll
- [ ] `prefers-reduced-motion: reduce` disables the tome lift; rails still render
- [ ] Add-book results show enlarged covers in `ht-card` rows; both add buttons are ≥44px tall
- [ ] A search with no matches shows the new empty state, not a blank area
- [ ] `npm run build` passes

## 8. Open questions

None blocking. Two things were decided rather than asked, and are cheap to reverse:
- Exact percentages live in the card tooltip rather than visible text (visible text was rejected as busy).
- The grain is CSS-only; if it reads as stripes on a high-DPI display, drop its alpha or remove the line.
