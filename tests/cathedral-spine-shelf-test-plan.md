# Cathedral Spine Shelf — Test Plan & QA Report

**Feature:** `docs/superpowers/plans/2026-09-29-cathedral-spine-shelf.md` · art: `docs/CATHEDRAL_ART_SPEC.md`
**Branch:** `cathedral-spine-shelf` (pushed; not merged to `master`, not deployed)
**Environment:** staging Supabase `shwhzfpqjbwukjztlzee`, dev server `vite --mode staging`. Production was never used.
**Accounts:** `qa.alpha@hushthorn.local` (44 books, progress 30) · `qa.beta@hushthorn.local` (1,000 seeded + 4 imported books)
**Evidence:** screenshots under `output/cathedral-v1/qa/` (`no-pillar-crowns-2026-09-30/`, `task7-shared-archive/`, `task8-scale/`, `task9-polish/`, `task10/`)

Legend: ✅ pass (observed) · ❌ fail · ⚠️ not observed / partial — says exactly what was and wasn't seen.

---

## 1. Progress engine (pure functions)

Runnable check: `cathedral-engine-check.mjs` (copy of `CATHEDRAL_MILESTONES`, `finishedCountOf`, `evaluateCathedral`; diffed byte-for-byte against `src/App.jsx` before this run). **10 passed, 0 failed.**

| # | Case | Expected | Result |
|---|---|---|---|
| E1 | 0 → 1 finished | unlock Candlelight | ✅ |
| E2 | peak 2, add unread (finished 2) | nudge "Something green is testing the stone." | ✅ |
| E3 | same state again | no event (nudge shown once) | ✅ |
| E4 | 2 → 3 | unlock Creeping Ivy, no nudge in same event | ✅ |
| E5 | peak 5 (nudged ∋ 6), mark one unread → 4 | peak stays 5, no event | ✅ (precondition: 6 already nudged by the transition that reached 5 — made explicit) |
| E6 | bulk 0 → 22 | ONE event listing 6 unlocks in order; nudged [1,3,6,10,15,21] | ✅ |
| E7 | "Iron Flame" + "iron flame" both read | counts once | ✅ |
| E8 | wishlist row with read = true | not counted | ✅ |
| E9 | peak 10, finished drops to 3 | peak never drops, no event | ✅ |
| E10 | `finishedCountOf(undefined)` | 0, no throw | ✅ |

Shelf layout check: `shelf-layout-check.mjs` (copy of `layoutShelfRows`, diffed against App.jsx). **9 passed, 0 failed** — urn ends shelf 2 and takes 2 slots; tree ends the last shelf; no row over capacity; no book lost; 0 books at peak 42 doesn't crash.

## 2. Data layer, RLS, idempotency (Task 1)

Run with real minted JWTs for alpha and beta.

| # | Case | Result |
|---|---|---|
| D1 | alpha `bump(5,[1,3])` creates her row | ✅ |
| D2 | beta `select *` → [] | ✅ cannot see alpha's row |
| D3 | alpha sees only her own row | ✅ |
| D4 | beta PATCH alpha's row | ✅ 0 rows; alpha's `updated_at` unchanged afterwards |
| D5 | `bump(2,[])` after peak 5 | ✅ stays 5 (`greatest()`) |
| D6 | identical bump twice | ✅ peak/nudged unchanged (`updated_at` ticks by design) |
| D7 | `bump(6,[6,1])` | ✅ peak 6, nudged [1,3,6] (union + dedupe + sort) |
| D8 | `archive_shelf` / `archive_reveal` / `archive_avatar` never reference `cathedral_progress` | ✅ re-checked in Task 7 |

## 3. Load, save, backfill (Tasks 3 + 6)

| # | Case | Result |
|---|---|---|
| L1 | Reload never re-fires a seen unlock or nudge | ✅ `updated_at` byte-identical across reload; load path only reads when a row exists |
| L2 | Marking a book read through the UI persists progress | ✅ alpha 1 → 2 → nudged [1,3], matching E2 |
| L3 | Two tabs, one stale, both marking books read | ✅ server kept the higher peak (4), the stale tab's write lost on value |
| L4 | Stale tab must not show a false unlock card | ⚠️ guard implemented (card only when `data.peak_finished === peak`); the two-tab run that found the issue predates the guard and was not re-run live |
| L5 | **Bulk import** (Goodreads CSV, 4 read books, 0 → 4) | ✅ ONE card "Several things stir in the archive…" listing Candlelight + Creeping Ivy; one `bump_cathedral_progress` call (`p_finished 4, p_nudged [1,3]`); auto-dismissed at 6.99 s |
| L6 | Backfill intro for a reader with history and no row | ✅ "The archive remembers what you've read…" lists Candlelight + Creeping Ivy; stays until dismissed; DB row peak 4, nudged [1,3], `seen_intro` true; does not reappear on reload |
| L7 | Reader with nothing to remember (peak 0) | ✅ no intro; `seen_intro` set silently |
| L8 | Production without the table | ✅ by construction — load errors are logged and nothing is written; the `seen_intro` write only happens after a row is confirmed |

**Bug found and fixed during this QA pass (L5):** the intro card was decided by an effect that re-ran whenever progress changed in a session. A reader who started at 0 with `seen_intro` false saw their **first live unlock as the intro card** (wrong copy, no auto-dismiss), and the real unlock card was hidden behind it. The intro is now decided once, at load, from the loaded/backfilled peak; peak-0 readers are marked as having seen it.

## 4. Notifications & Curiosities (Task 6)

| # | Case | Result |
|---|---|---|
| N1 | Unlock card: pink top edge, locked heading copy, name + description | ✅ (L5) |
| N2 | Nudge copy + "Finish another tome or two." | ✅ engine-level (E2) and copy reviewed; ⚠️ the nudge card itself was not screenshotted live |
| N3 | 44 px dismiss target, `role="status"` `aria-live="polite"` | ✅ |
| N4 | Card in Covers view adds "See it on your spine shelf" | ⚠️ intro card verified over the Covers grid; the link branch itself not observed live |
| N5 | Card gutters on a 390 px phone | ✅ 16 / 16 px (was 8–9 px — fixed in Task 9) |
| N6 | Curiosities lists only found unlocks, ends "Keep filling the shelves. Not everything has woken yet." | ✅ alpha lists her 7; beta (0) has no button |

## 5. Frame & unlock layers (Tasks 4–5)

| # | Case | Result |
|---|---|---|
| F1 | Crown frame stiles sit on the pilasters (bare / ivy / bloom) | ✅ within 0.2 px in all three states, both bookcases |
| F2 | Rose window centred in the crown's opening; dim < 6, lit ≥ 6 | ✅ |
| F3 | Planks meet the pilasters; gilded rail visible | ✅ |
| F4 | Header and nav paint above the backdrop; backdrop visible behind | ✅ |
| F5 | Each layer at its threshold: candles 1, ivy 3, window 6, urn 10, familiar 15, tree 21, wisps + sprite 30, bloom 42 | ✅ peak 0 / 6 / 30 / 42 screenshots |
| F6 | Bloom crown keeps the ivy | ✅ rose layer composited onto the ivy crown |
| F7 | Unowned layers are never requested | ✅ bare state requested no unlock asset |
| F8 | Crown crossfade + 600 ms delayed fade at the moment of unlock | ⚠️ not observed — the live unlock (L5) happened in the Codex view, not Spines |
| F9 | Covers view | ✅ no cathedral frame/decorations. Owner decision: the nave backdrop is now app-wide (Covers, Oracle, Codex) |

## 6. Shared archive privacy (Task 7)

alpha (30) and beta (0) as members of "QA Shared Archive".

| # | Case | Result |
|---|---|---|
| S1 | Each sees only their own decorations | ✅ alpha: ivy, lit window, cat, 7 Curiosities · beta: bare crown, unlit candles, no ivy/cat/Curiosities |
| S2 | Co-member progress is never fetched | ✅ beta's network: only `cathedral_progress?user_id=eq.<beta>` and her own bump |
| S3 | alpha's unlock can never show a card to beta | ✅ no realtime channel exists in the app; cards come only from the viewer's own mutations |
| S4 | Emblem under each crown; plaque names members, viewer first | ✅ "Ex Libris · qaAlpha & qaBeta" / "qaBeta & qaAlpha" |
| S5 | Union spines keep the owner-count box | ✅ |

## 7. Scale — 0 / 1 / 1,000 books (Task 8)

| # | Case | Result |
|---|---|---|
| X1 | 0 books | ✅ empty-state copy, no bookcases, no rail |
| X2 | 1 book | ✅ one bookcase, one spine, plaque "Bookcase I · Ir – Ir" |
| X3 | 1,000 books: DOM holds ≤ 3 bookcases of spines | ✅ max 3 bookcases / 126 spine buttons while scrolling all 24 |
| X4 | Smooth scroll | ✅ full-shelf scroll: p50 8.4 ms, p95 8.6 ms, max 34 ms per frame, 0 over 50 ms |
| X5 | No scroll jump | ✅ page height drift ≤ 1 px across the whole shelf |
| X6 | A–Z rail at 100+ books; letters with no titles disabled; jump | ✅ Q/X/Z disabled; "M" → "Bookcase XIII · Lu – Mi"; hidden at 44 books |
| X7 | Familiar follows the bookcase in view | ✅ bookcase-0 → bookcase-1 as each crosses mid-screen |

## 8. Polish, accessibility, performance (Task 9)

| # | Case | Result |
|---|---|---|
| P1 | Reduced motion | ✅ cat sits (walk hidden), no flicker/halo/wisp/sprite animation, no shimmer, card has no entrance animation, A–Z jump uses instant scroll |
| P2 | Decorations `aria-hidden`; nothing decorative is focusable | ✅ 0 focusables inside `aria-hidden`; 0 decorative images exposed |
| P3 | Spines stay real buttons; keyboard reaches them first | ✅ every focusable in the shelf is a spine; Tab goes controls → spines |
| P4 | Bookcases navigable by screen reader | ✅ `role="group"` + "Bookcase II · Th – Fo" labels |
| P5 | First load of one bare bookcase ≤ 1.5 MB | ✅ 506 KB of cathedral assets with cache disabled |
| P6 | Mobile 390 px: mobile backdrop, crown scales, no sideways scroll, rail clear of spines | ✅ (sideways scroll of 443 px on 375 px and rail overlap both found and fixed) |

---

## Open items

- ⚠️ F8, L4, N2, N4 above — logic in place, not observed live.
- ✅ **Production database promoted (owner sign-off, 2026-09-30):** migrations `cathedral_progress_table` + `cathedral_progress_pin_search_path` applied to production `ujxsrcxbhcbihhdluzyl`. Verified read-only: same 5 columns, RLS on, the 3 owner-only policies, `bump_cathedral_progress` SECURITY INVOKER with `search_path=""`, 0 rows, no archive view references it, the owner's 82 books untouched. The one new advisor warning (mutable search_path) was fixed on both environments; the pinned function was exercised on staging (lower bump kept alpha at 30). Code is still only on the branch — production gets the cathedral UI when the branch is merged to `master`.
- Pre-existing, unrelated: React `validateDOMNesting` warning — `Meter`'s buttons nested inside a Covers-view card button.

## Staging fixtures left in place

- qa.beta: 1,000 books tagged `qa-seed-1000` (hidden from archives) — remove with `delete from books where 'qa-seed-1000' = any(genres);`
- qa.beta: 4 books titled `QA Import …` (read) and a progress row at 4.
- qa.beta: member of "QA Shared Archive".
- qa.alpha: progress restored to her real 30.
