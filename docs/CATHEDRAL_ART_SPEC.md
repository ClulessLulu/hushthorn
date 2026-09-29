 Cathedral Spine Shelf — Painted Art Spec

The spine shelf becomes a painted cathedral. **Only the architecture and the
unlock decorations are images.** Spines stay code, because they carry data
(cover-sampled color, Verdict dot, Smoulder foot, progress rails, wishlist
ghost, owner-count box, finished gilt). Never bake a book into a painting.

Reference prototype: the Design canvas "Hushthorn Book Spine Shelf — Gothic
Library Redesign" (boards: *Library* and *At scale*).

## Style anchor

- Use the Hushthorn logo as the **style reference image** for every layer, in
  the same generator that made the logo. Same model, same style settings,
  fixed seed where the tool allows it.
- Palette: near-black `#0c0714`, midnight blue, violet, plum, rose/magenta
  pink. Metal accents: antique gold AND silver. No browns, no greens except
  the ivy/tree (tint those toward teal).
- Painterly digital illustration, soft glow, fine detail, no text, no people,
  no recognizable real building.
- Light: cool moonlight from the rose window (top, center); warm candlelight
  from the sconces (sides). Keep it identical across all layers.

## Prompt template

> Painterly gothic cathedral library illustration in the style of the
> reference image, deep violet and midnight blue with rose-pink glow,
> antique gold and silver filigree, candlelit, soft rim light, highly
> detailed, **[LAYER SUBJECT]**, isolated on a transparent background,
> front-facing orthographic view, no text, no people.

For opaque/tiling layers replace "isolated on a transparent background" with
"seamless tileable texture, even lighting, no vignette".

## Layers

All sizes are 2× (retina). PNG with alpha unless marked opaque (WebP ok).

| File | Size | Type | Subject for the prompt |
|---|---|---|---|
| `crown.png` | 1920×420 | alpha | pointed gothic arch top of a bookcase, carved dark wood, two spired pinnacles, empty circular opening in the center |
| `rose-window-dim.png` | 512×512 | alpha | circular stained-glass rose window, unlit, dusty, dark |
| `rose-window-lit.png` | 512×512 | alpha | the same window, glowing pink, violet and blue |
| `pilaster.png` | 96×1024 | alpha, repeat-y | carved fluted wooden column, seamless top to bottom |
| `plank.png` | 1024×48 | alpha, repeat-x | dark carved shelf plank with a thin gold edge, seamless left to right |
| `back-panel.png` | 512×512 | opaque, tile | dark wood back panel of a bookcase, seamless |
| `plinth.png` | 1920×120 | alpha | carved base of a bookcase with a blank brass plaque |
| `nave-backdrop.webp` | 1920×1080 | opaque | dim cathedral nave interior, far background, soft focus |
| `sconce-unlit.png` / `sconce-lit.png` | 96×160 | alpha | silver wall sconce with one candle (unlit / lit with flame) |
| `ivy-crown.png` | 1920×420 | alpha | ivy draped over the arch; must align with `crown.png` |
| `ivy-pilaster.png` | 96×1024 | alpha, repeat-y | ivy climbing a column, seamless |
| `ivy-pilaster-glow.png` | 96×1024 | alpha, repeat-y | alternate climbing ivy with violet glow accents |
| `ivy-drape.png` | 1024×128 | alpha, repeat-x | ivy hanging from a shelf edge, seamless |
| `rose-urn.png` | 180×300 | alpha | silver urn of midnight-pink roses |
| `thornwood-tree.png` | 400×700 | alpha | small twisted thorn tree in a silver planter, pink and lavender blossoms |
| `bloom-garland.png` | 1920×420 | alpha | thorny rose garland following the arch; aligns with `crown.png` |
| `familiar-walk.png` | 1024×96 | alpha, 8 frames | small ORIGINAL black cat with pink eyes and a silver bell, side view, 8-frame walk cycle, each frame 128×96 |
| `familiar-sit.png` | 128×96 | alpha | the same cat sitting |
| `shared-emblem.png` | 256×128 | alpha | two interlocked rings, gold and rose, small ribbon |

The familiar must be an original design, not resembling any existing
character or mascot. Will-o'-wisps stay CSS (soft radial glows); they look
better animated than painted.

### Pillar vine variants

Use both `ivy-pilaster.png` and `ivy-pilaster-glow.png` for variety across pillars. Both assets are available in `output/cathedral-v1/` at 96×1024 with alpha transparency and vertical repetition (`repeat-y`). The glow variant adds violet highlights to the dark-teal ivy. Choose one variant per pillar and keep its scale consistent along the full column. App integration is pending.

### Winged sprite variants

Two separate woodland sprite overlays are available in `output/cathedral-v1/`:

| Asset | Dimensions | Format | Appearance |
| --- | --- | --- | --- |
| `sprite-winged.png` | 256 × 256 | PNG, alpha | Delicate sprite with rounded pink wings. |
| `sprite-winged-elegant.png` | 256 × 256 | PNG, alpha | Slender sprite with elongated, tapered pink-violet wings. |

These are independent visual variants, not consecutive animation frames. Keep their proportions when scaling. They supplement the CSS will-o'-wisps; app integration is pending.

## Acceptance checks (QE list)

- [ ] Every layer shares palette and light direction when stacked at 100%.
- [ ] `ivy-crown.png` and `bloom-garland.png` align pixel-for-pixel on
      `crown.png` (overlay test in the canvas).
- [ ] Repeat-x/y layers show no seam at 3 repetitions.
- [ ] No text or letterforms anywhere (generators like to add fake text).
- [ ] Contrast: spine titles stay 4.5:1 against the back panel.
- [ ] Total first-load weight for one bookcase ≤ 1.5 MB; unlock layers
      load only when that unlock is owned.
- [ ] Generator terms allow commercial use of the output.

## Integration notes

- App: `public/cathedral/` served as static assets (optimized WebP copies of `output/cathedral-v1/`); CSS `background-image`
  for tiles, `<img>` for anchored overlays; lazy-load per bookcase.
- 1,000+ tomes: one bookcase ≈ 54 spines; render only bookcases in view
  (+1 above/below). A–Z rail jumps to the bookcase holding that letter.
- Unlock state is private per reader: an owner-only `cathedral_progress`
  table (same RLS discipline as the owner-only `books` rows) stores the peak
  finished count and nudges already shown; never expose it through the
  union-model views (`archive_shelf`, `archive_reveal`).
- `prefers-reduced-motion`: familiar sits still, candles don't flicker.

## v1 asset audit (2026-09-29)

Checked every file in `output/cathedral-v1/` against this spec. Evidence:
`output/cathedral-v1/qa/` (contact sheet on a checkerboard, a rough assembled
bookcase, and a WebP-vs-original comparison). Implementation plan:
`docs/superpowers/plans/2026-09-29-cathedral-spine-shelf.md`.

**Passed:** all 22 production files match the spec's pixel sizes; every
alpha layer has transparent corners; the repeat-x/y tiles (pilaster, plank,
both ivy pilasters, ivy drape) have identical first/last rows or columns, so
they tile without a seam; no fake lettering found.

**Weight:** the PNG originals total ~5 MB. Optimized WebP copies are in
`public/cathedral/` (visually identical, see the comparison): one bare
bookcase loads ~0.5 MB (budget 1.5 MB); every unlock together ~1.1 MB.
`familiar-walk.json` there points at `familiar-walk.webp`.

**How each image must be used (these override the table above):**

| Asset | Finding | Use it as |
|---|---|---|
| `crown` | Painted arch spans only x 293–1617 of 1920 (69%). Rose-window opening centered at (954, 272), radius ≈ 92. | Render at bookcase width ÷ 0.69, centered; window sits behind the opening. |
| `ivy-crown`, `bloom-garland` | Not overlays: each contains the whole arch, and its geometry differs from `crown` (~83% mask overlap). | **Swap** the crown image (bloom › ivy › bare) with a crossfade. Never stack on `crown`. |
| `rose-window-dim` vs `-lit` | Different tracery (structure differs by a wide margin), so swapping would visibly change the pattern. | Use `-lit` for both states; dim state = CSS `grayscale(.6) brightness(.55)`. `-dim` is unused. |
| `pilaster` | Paints only a 40px shaft (x 24–64 of 96); reads as a thin rod. | Lay it on a code-drawn fluted column. |
| `plank` | Paints only a 15px rail (rows 15–30 of 48). | Gilded top edge of a code-drawn shelf with depth and shadow. |
| `plinth` | Paints only a 587px drawer/plaque, not a full base. | Centered plaque on a code-drawn base molding. |
| `nave-backdrop` | Has its own large central rose window, which shows through the crown's open arches next to the bookcase's window. | Add a dark radial scrim behind the crown. |
| `thornwood-tree` | Native 400×700 dwarfs the spines. | Scale to about one shelf height. |
| `familiar-walk` | 8 frames, 8 fps, faces right; gait varies slightly between frames (per its JSON). | Preview before shipping; fall back to `familiar-sit`. |
| `shared-emblem` | Reads as two bangles more than an emblem. | Fine small; regenerate later if it bothers you. |

**Style note:** `MIDJOURNEY_PROMPTS.md` moves the direction toward
photoreal, and the pieces mix photoreal props (urn, cat, sprites, sconces)
with the painted backdrop. Together they hold up (see the QA composite), but
new pieces should follow one direction: the selected Midjourney nave as the
style reference.

**Not checked here:** the generator's commercial-use terms; title contrast
with real cover-sampled spine colors (needs the app, Task 4 of the plan).
