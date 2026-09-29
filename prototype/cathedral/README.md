# Cathedral spine shelf — design prototype

Reference only; not part of the app build. Exported from the Design canvas
"Hushthorn Book Spine Shelf — Gothic Library Redesign" on 2026-09-29.

- `library.dc.html` — the Spines view as a cathedral, the unchanged Covers
  grid, the Shared Archive variant, hidden unlocks, halfway nudges,
  notifications and Curiosities.
- `nave-at-scale.dc.html` — 1,000+ books: stacked bookcases, overview map,
  A–Z rail.

Format: plain HTML with template holes (`{{…}}`, `<sc-for>`, `<sc-if>`). All
behavior is in the `class Component` script at the bottom of each file —
`milestones()`, `member()`, `commit()` (unlock + nudge rules) and
`renderVals()`. The cathedral here is drawn with CSS/SVG; production uses the
painted assets in `public/cathedral/`. Sample titles, the second reader
(`[Partner]`) and the "viewer" switch are prototype-only.

Implementation plan: `docs/superpowers/plans/2026-09-29-cathedral-spine-shelf.md`.
