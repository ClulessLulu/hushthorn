# Verdict Half-Step Rating — Design Spec (TODO)

**Status:** TODO — designed, not started. Tracked in [docs/TODO.md](../../TODO.md).
**Blocker to resume:** the 9 emblem PNGs must be dropped into `src/assets/verdict/` first.

## Goal

Redesign the **Verdict** rating (currently 5 binary swords) into a single
**evolving emblem** that represents a **1–5 score in 0.5 increments**, using the
provided dagger artwork (dagger → rose → leaves → chain → vine → crown at 5).

## Decisions locked (from the design Q&A)

- **Display model:** one emblem that morphs through 9 states (1, 1.5, 2 … 5),
  NOT five repeated icons.
- **Icon source:** real raster artwork supplied by the developer (not SVG
  recreation).
- **Assets:** 9 transparent PNGs, **256×256**, **one uniform canvas/anchor**
  for all (blade fixed in place; canvas sized for the tallest = crown@5 and the
  widest = rose/chain@3/4.5), no number labels. Named by score×10 in
  `src/assets/verdict/`: `verdict-10.png … verdict-50.png`. Map score→file via
  `Math.round(value * 10)`.
- **Input:** tap/drag to set in 0.5 steps; **tapping the current value again
  clears to 0** (preserve the existing clear rule).
- **Spicy rating:** unchanged for now (5 chili peppers, integer) unless we later
  decide to mirror half-steps there.

## Implementation plan (agent chain, in dependency order)

1. **supabase-migrator** — verify `books.overall` column type; if integer,
   migrate to `numeric(2,1)` so `2.5` persists. Additive/reversible; existing
   rows + RLS untouched. (Must land BEFORE the UI persists half-steps.)
2. **frontend-dev** — rebuild the rating control: render the matching emblem for
   the current 1–5 (.5-step) score, wire the saved assets, implement the .5
   input + tap-to-clear, and fix the two fraction-breakers below.
3. **design-guardian** + **qa-tester** — drift review (cyan=audio rule, sharp
   corners) and verify (half-step edges, clear-to-0, idempotent persistence).

## Code touchpoints (src/App.jsx)

- `Sword({ filled, size })` :139 — current inline-SVG icon (binary fill).
- `Meter({ value, onChange, Icon })` :591 — renders `[1,2,3,4,5]` integer buttons.
- Editable Verdict meter :3041 · read-only meter in cards :1046.
- `'⚔'.repeat(avgRating)` profile stat :1668 — **breaks on fractions**, must handle.
- Goodreads import `parseInt(... "My Rating")` :1143 — Goodreads is integer 1–5,
  so import stays whole-valued, but switch to `parseFloat` + clamp to be safe.

## Open items

- Confirm `books.overall` actual type (supabase-migrator step 1).
- Final input affordance: left/right tap-zones on the emblem vs a slider vs a
  small −/+ . Recommended: tap left/right half = x.5 / x.0, drag to scrub.
- Average-verdict display format once values are fractional (e.g. `4.5 ⚔`).
