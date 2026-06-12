# QA Report — Spine Shelf View + Sort/Dimming Search

Reviewed against [tests/test-plan.md](test-plan.md) and the approved spec
(`docs/superpowers/specs/2026-06-12-spine-view-sort-search-design.md`).
Build confirmed green by lead (`npm run build`); migrations applied + verified
via `list_tables` on project `ujxsrcxbhcbihhdluzyl`.

## Summary verdict: SHIP-WITH-FIXES (no blockers)

Data layer is correct end-to-end: every read mapping, insert, update FIELD_MAP,
`persistSpineColor`, and `savePrefs` references the verified columns
(`spine_color`, `pref_layout`, `pref_sort`) with no name mismatch. Pure
functions match spec exactly. Stability, debounce, prefs-sync, hide-vs-dim, and
resample-loop safety all hold.

**Counts:** ~60 PASS · 0 FAIL · ~16 NEEDS-MANUAL (in-browser / DB verification) ·
2 flagged non-blocking code issues (P2, P3).

> **Update (lead):** both P2 and P3 below were fixed before commit. `pick` is
> now async and samples `spineColor` on add (parity with `addManual`); the
> `SpineShelf` resize effect now keys on `[books.length > 0]` so it re-measures
> across the empty↔filled boundary. Build re-verified green. `importBooks`
> (bulk Kindle merge) intentionally still relies on lazy backfill to keep bulk
> imports fast.

## Non-blocking issues (resolved)

- **P2 — Search-result add path (`pick`) omits `spineColor`.** The "+Owned /
  +Wishlist" buttons on search results don't sample a spine color on add. Not a
  crash (insert coerces `?? null`, lazy backfill recovers on first spine view),
  but inconsistent with the manual-add path (`addManual`) which samples on add.
  `importBooks` (Kindle bulk merge) has the same gap.
  *Fix:* make `pick` async, resolve coverUrl, `spineColor = coverUrl ? await
  computeSpineColor(coverUrl) : null`, include on the `onAdd` object.
- **P3 — `SpineShelf` ResizeObserver `[]` deps.** Won't remeasure on an
  empty→filled transition without a remount (falls back to `perRow=10`).
  Cosmetic; shelf still renders one board per row.
  *Fix:* add `books.length > 0` (or a stable observed ref) to the effect deps so
  `perRow` remeasures.

## Pass/Fail by test-plan ID

### Backend (B)
- B-01..B-05 PASS (lead-verified schema).
- B-06, B-07, B-11, B-12 NEEDS-MANUAL (DB queries / advisors / two accounts).
- B-08 PASS (only valid layout/sort strings reachable).
- B-09, B-10 PASS (lead-verified RLS owner-only).
- B-13 PASS (insert `spine_color`). B-14 PASS (CoverEditor resample → onUpdate →
  FIELD_MAP). B-15 PASS (hook → onPersist → update). B-16 PASS (local-state
  one-shot guard). B-17 PASS (partial upsert keyed on PK `user_id`, pref fields
  only — no clobber). B-18 PASS-code / NEEDS-MANUAL (DB defaults satisfy NOT
  NULL at runtime). B-19 PASS (`spineColor: b.spine_color`). B-20 PASS (prefs
  mapping). B-21 PASS (column fidelity everywhere).

### Frontend (F)
- F-01..F-10 PASS (Spine dimensions / verdict gem / spice band / unread-proud /
  wishlist-ghost / dim / vertical title / dormant audio ring / hover).
- F-11, F-12, F-13 NEEDS-MANUAL (perRow formula correct; visual check at
  360/768/1024px).
- F-14 PASS post-mount (see P3).
- F-15..F-26 PASS (toggle gated to library; sort keys + stability; grid HIDES
  via `gridBooks`; spines DIM via `dimmed` prop; live keystroke; sort-then-filter
  pipeline).
- F-27..F-29 PASS (no-pop initial color; cache dedupe; fallback while sampling).
- F-30 PASS-code (immediate layout save). F-31 PASS-code (400ms sort debounce).
- F-32, F-33 NEEDS-MANUAL. F-34 PASS-code / NEEDS-MANUAL. F-35 PASS (write
  failure never blocks UI).

### Units (U-01..U-29)
ALL PASS by inspection (no Vitest harness in repo). `sortBooks` stable copy +
null→0; `matchesQuery` trim/empty/genre `.some`; `genreFallbackColor` table
matches spec colors exactly, unknown → deterministic hsl; `hashStr` deterministic
`>>>0`.

### Edges (E-01..E-12)
ALL PASS except E-08, E-11 NEEDS-MANUAL. Cover-missing / fetch-fail / CORS-taint
all caught → genre fallback, no write; write-fail logged not blocking; empty-state
exact copy; ResizeObserver-absent fallback; too-bright darkened ≤150; audio
dormant no-op.

## Needs manual verification (Chrome)
B-06, B-07, B-11, B-12, B-18 (runtime), F-11, F-12, F-13, F-32, F-33, F-34
(runtime), E-08, E-11, plus end-to-end backfill (B-13/14/15/16) and debounce
timing (F-31 via logs).

## Notes (not bugs)
- F-11: plan said 360px "floor 6" but `floor(360/34)=10` (within clamp) — code
  is correct per the spec formula; floor-6 only engages below ~204px.
- U-06: `sortBooks` uses raw `localeCompare` (no `.toLowerCase()`) — correct
  case-insensitive ordering per spec intent.
