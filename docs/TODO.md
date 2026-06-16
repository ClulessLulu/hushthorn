# Hushthorn — TODO / Backlog

Features designed but parked, with links to their specs. Pick one up by reading
its spec, clearing the blocker, then running the listed agent chain.

## ⚔ Verdict half-step rating

Redesign the **Verdict** rating into a single **evolving dagger emblem** that
represents a **1–5 score in 0.5 steps** (dagger → rose → leaves → chain → vine →
crown at 5), using supplied artwork.

- **Status:** TODO — designed, not started.
- **Blocked on:** the developer to drop **9 emblem PNGs** (256×256, transparent,
  one uniform canvas/anchor, no labels) into `src/assets/verdict/` named
  `verdict-10.png … verdict-50.png` (score×10).
- **Spec:** [2026-06-16-verdict-half-step-rating-design.md](superpowers/specs/2026-06-16-verdict-half-step-rating-design.md)
- **Agent chain:** `supabase-migrator` (`books.overall` → `numeric(2,1)`) →
  `frontend-dev` (emblem UI, .5 input, wire assets, fix `'⚔'.repeat`/import) →
  `design-guardian` + `qa-tester`.
