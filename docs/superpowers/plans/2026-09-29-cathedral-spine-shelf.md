# Cathedral Spine Shelf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the reader chooses **Spines**, the shelf becomes a painted gothic cathedral bookcase. Finishing books secretly unlocks decorations (candles, ivy, stained glass, roses, a cat familiar, a thorn tree, wisps, a rose garland). Progress is hidden; the only signals are quiet notifications. **Covers view does not change.**

**Architecture:** The existing `Spine` component stays the data layer (cover-sampled color, Verdict dot, Smoulder foot, progress rails, wishlist ghost, owner-count box). A new cathedral frame wraps the existing shelf rows and layers painted WebP art around them. A small, pure progress engine decides unlocks and nudges; per-reader progress lives in a new owner-only Supabase table. Whole app is one file (`src/App.jsx`) by established convention — add components there, navigate by symbol, do not restructure.

**Tech Stack:** Vite + React, Tailwind + `ht-*` classes in `FONT_CSS`, Supabase (new `cathedral_progress` table), static assets in `public/cathedral/`.

**Read before Task 1:**
- `docs/BOOK_DESIGN.md` — how a book looks (spine anatomy, states, contrast cap), the filter buttons, controls bar, Curiosities, notifications and modals.
- `docs/CATHEDRAL_ART_SPEC.md` — the art layers and the **v1 asset audit** (how each image must be used; some are swaps, not overlays).
- `prototype/cathedral/library.dc.html` — behavior reference from the design canvas (spines view, covers view, shared archive, notifications, unlock logic). Design-canvas format: markup on top, all logic in the `class Component` script at the bottom (`milestones()`, `commit()`, `renderVals()`). **Port the logic and layout intent, not the markup** — the prototype draws the cathedral with CSS/SVG; production uses the painted assets.
- `prototype/cathedral/nave-at-scale.dc.html` — how 1,000+ books look (stacked bookcases, A–Z rail, overview).
- `output/cathedral-v1/qa/assembled-bookcase-test.jpg` — a rough composite of the real assets (placement is approximate; use it to see scale problems, not as a layout target).

## Verification model — READ THIS FIRST

Same rules as `docs/superpowers/plans/2026-09-27-trope-filtering.md` → "Verification model": no test runner (do not add one), `npm run build` must pass, browser checks on **staging port 5174 only, never 5173 (production, the owner's real library)**, seeded staging logins listed there. Schema changes go to **staging first** via the Supabase MCP; production only after the owner signs off. If you cannot drive a browser, say so and list what is unverified. Never claim an unobserved pass.

## Global constraints

- **Covers view is untouched.** The cathedral renders only when `layout === "spines"`.
- **Spines stay code.** Never bake a book into an image. Keep every existing spine encoding. Add one: a finished book gets a thin gold inner edge (`box-shadow: inset 0 0 0 1px rgba(232,200,119,0.55)`).
- Use only `public/cathedral/*.webp` (already optimized — see the audit). Never import from `output/cathedral-v1/` at runtime.
- Design system: sharp corners, Rozha One / Cinzel / EB Garamond, cyan only for audio, themed copy.
- `prefers-reduced-motion`: familiar sits (`familiar-sit.webp`), candles don't flicker, no shimmer, wisps/sprites static.
- **Privacy:** a reader's progress, unlocks and nudges are never readable by anyone else, including archive co-members. Never add progress columns to `archive_shelf` / `archive_reveal` and never join `cathedral_progress` into them.

## Locked decisions (from the design session)

1. **What counts:** finished books = the reader's OWN `books` rows with `read = true`, counted once per normalized title. Wishlist never counts. In a shared archive, a co-member's copy counts only after "Add to my library" (union model: marks live on my own row).
2. **Thresholds are secret.** Never render a number, progress bar, locked list or "N of 8".

   | Finished | Unlock | Halfway hint (nudge copy) |
   |---|---|---|
   | 1 | Candlelight | — (no nudge; gap too small) |
   | 3 | Creeping Ivy | Something green is testing the stone. |
   | 6 | Stained Glass Wakes | Colored light flickers behind the glass, then fades. |
   | 10 | Night Roses | The scent of roses drifts through the nave. |
   | 15 | The Familiar | Small footsteps pad somewhere in the dark. |
   | 21 | Thornwood Sapling | A root has cracked the floor between the shelves. |
   | 30 | Will-o'-Wisps (+ winged sprites) | A pale light blinked at the edge of your sight. |
   | 42 | The Hushthorn Blooms | The thorns above the arch are budding. |

   Unlock descriptions: copy them from `milestones()` in `prototype/cathedral/library.dc.html`.
3. **Unlocks never re-lock.** Track `peak_finished = max(stored, current)`. Marking a book unread never removes anything.
4. **Halfway nudge, once per unlock.** Between the last reached threshold `prev` and the next `next`: `gap = next − prev`; if `gap ≥ 2` and `peak ≥ prev + ceil(gap / 2)` and that unlock was not nudged yet → show the hint once. Checked after **every** add, import, and read change. An unlock takes precedence over a nudge in the same event.
5. **Notifications:** one centered card just under the header, `role="status" aria-live="polite"`, dismiss button (44px target), auto-dismiss 7s (unlock) / 5.5s (nudge). Unlock: pink top edge, heading "Something stirs in the archive…" (or "Several things stir…" when several unlock at once), name + description; one soft light sweep over the bookcase. Nudge: blue top edge, heading "The archive is close to waking something…", the hint, and "Finish another tome or two." In Covers view an unlock card adds a "See it on your spine shelf" link.
6. **Curiosities:** a small button appears after the first unlock and opens a popover listing ONLY what the reader has found, ending "Keep filling the shelves. Not everything has woken yet."
7. **Existing readers (backfill):** first load with no progress row → create it with `peak_finished` = current finished count and every threshold ≤ peak marked nudged; show ONE intro card "The archive remembers what you've read…" listing what woke; set `seen_intro`. Never replay unlocks one by one.
8. **Shared archive:** the same cathedral; decorations come only from the viewer's own progress. Union spines keep the owner-count box. Add the `shared-emblem.webp` ribbon under the crown and a plinth plaque naming the members. The co-member's progress is never fetched.
9. **Scale:** one bookcase = 3 shelves; shelf capacity = the existing responsive `perRow` (6–14) → bookcase holds `3 × perRow`. Bookcases stack vertically. Render only bookcases in view ±1 (IntersectionObserver). A–Z rail for 100+ books (letters with no titles disabled). Ivy on every bookcase; the familiar lives on the bookcase in view; the tree and garland belong to the **last** bookcase ("the apse").

## Task 1 — `cathedral_progress` table (staging)

- [ ] Via Supabase MCP on **staging**:

```sql
create table public.cathedral_progress (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  peak_finished integer not null default 0 check (peak_finished >= 0),
  nudged        integer[] not null default '{}',
  seen_intro    boolean not null default false,
  updated_at    timestamptz not null default now()
);
alter table public.cathedral_progress enable row level security;
create policy "own progress: select" on public.cathedral_progress
  for select using (user_id = auth.uid());
create policy "own progress: insert" on public.cathedral_progress
  for insert with check (user_id = auth.uid());
create policy "own progress: update" on public.cathedral_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Monotonic, idempotent bump (safe with two open tabs).
create or replace function public.bump_cathedral_progress(p_finished integer, p_nudged integer[])
returns public.cathedral_progress language sql security invoker as $$
  insert into public.cathedral_progress as cp (user_id, peak_finished, nudged, updated_at)
  values (auth.uid(), greatest(p_finished, 0), coalesce(p_nudged, '{}'), now())
  on conflict (user_id) do update
    set peak_finished = greatest(cp.peak_finished, excluded.peak_finished),
        nudged = (select array(select distinct unnest(cp.nudged || excluded.nudged) order by 1)),
        updated_at = now()
  returning cp.*;
$$;
```

- [ ] RLS checks (staging, as `qa.alpha` then `qa.beta`): alpha sees only alpha's row; beta `select * from cathedral_progress` returns 0 of alpha's rows; beta cannot update alpha's row; `bump` with a LOWER count never lowers `peak_finished`; calling `bump` twice with the same args changes nothing.
- [ ] Confirm `archive_shelf` / `archive_reveal` definitions do not reference the new table.

## Task 2 — Progress engine (pure helpers, top of App.jsx near other helpers)

- [ ] `CATHEDRAL_MILESTONES` constant (table above, with `desc` and `hint`).
- [ ] `finishedCountOf(books)` — own rows only, `read === true`, not wishlist, dedupe by `title.trim().toLowerCase()`.
- [ ] `evaluateCathedral(prev, finished)` → `{ peak, nudged, event }` where `event` is `{kind:'unlock', items}` | `{kind:'nudge', hint}` | `null`. Pure; no I/O. Port from `commit()` in the prototype.
- [ ] List these cases in a comment block above the helper (QE convention) and check each in the browser console on staging:
  - 0 → 1 finished: unlock Candlelight.
  - peak 2 → add an **unread** book: nudge "Something green…" (peak 2 ≥ 1 + ceil(2/2)).
  - Same state again: no event (nudge already recorded).
  - peak 2 → 3: unlock Creeping Ivy, no nudge in the same event.
  - peak 5 → mark one book unread (finished 4): peak stays 5, no event.
  - Bulk import taking 0 → 22: one event listing all 6 unlocks (Candlelight…Thornwood), nudges for them recorded.
  - Duplicate titles (print + ebook rows) count once.
  - Wishlist rows marked read (malformed data) do not count.

## Task 3 — Load, save, backfill

- [ ] Load `cathedral_progress` alongside the existing personal data load (line ~1866). Missing table / error → treat as no row, log, never block the shelf (graceful fallback).
- [ ] Run `evaluateCathedral` after: add book, update book (read toggle and the auto-read at 100% progress, ~line 2388), import (Goodreads path ~line 2918 sets `read: true` in bulk), delete. Persist with `rpc('bump_cathedral_progress', …)` only when peak or nudged changed.
- [ ] Backfill intro (decision 7).
- [ ] Browser checks: reload never re-fires a seen unlock or nudge; two tabs marking books read end with the same peak.

## Task 4 — Cathedral frame around the existing spine rows

Layer order, back to front: `nave-backdrop` → bookcase back (`back-panel` tile) → spines → planks → pilasters/ivy → crown (+ rose window behind it) → decorations → notification.

- [ ] Only in `SpineShelf` (layout `spines`). Keep `perRow` measuring; group rows into bookcases of 3 shelves.
- [ ] Measurements from the audit (all assets are 2×): `crown.webp` paints only x 293–1617 of 1920 (69%). Render the crown at `bookcase width ÷ 0.69`, centered, so its painted arch matches the body. The rose-window opening is centered at (954, 272) with radius ≈ 92 → place `rose-window-lit.webp` **behind** the crown at left 49.7%, top 64.8% of the crown box, diameter ≈ 10% of crown width.
- [ ] Rose window dim state = `rose-window-lit.webp` with `filter: grayscale(.6) brightness(.55)`; lit (≥6 finished) removes the filter and adds a soft pink/blue glow. **Do not use `rose-window-dim.png`** — its tracery differs from the lit one.
- [ ] `pilaster.webp` (repeat-y) paints only a 40px-wide shaft; frame each side with a code-drawn fluted border (see `.flute` in the prototype) and lay the shaft on it.
- [ ] `plank.webp` (repeat-x) paints only a 15px rail; keep the existing plank div (gradient, shadow) and use the image as its gilded top edge.
- [ ] `back-panel.webp` tile behind the spines with an overlay `rgba(12,7,20,.35)`; verify spine titles still meet 4.5:1.
- [ ] `plinth.webp` paints only a 587px-wide drawer/plaque; center it on a code-drawn base molding; "Ex Libris · Hushthorn" (or members' names in an archive) sits on/under the plaque.
- [ ] `nave-backdrop.webp` (desktop) / `nave-backdrop-mobile.webp` (≤ 640px) as a fixed background behind the spines view only. Its own large rose window sits at the center and shows through the crown's open arches (see the QA composite) — add a dark radial scrim behind the crown so there aren't two competing windows.
- [ ] Hover/focus lift on spines stays as today.

## Task 5 — Unlock layers

- [ ] Candlelight (≥1): `sconce-unlit` → `sconce-lit` on each pilaster, one per shelf; CSS flicker + warm halo.
- [ ] Creeping Ivy (≥3): `ivy-pilaster` on the left pilaster, `ivy-pilaster-glow` on the right (alternate per bookcase); `ivy-drape` along the underside of each crown/top shelf; crown swaps to `ivy-crown`.
- [ ] Crown states are **swaps, not overlays**: `ivy-crown` and `bloom-garland` each contain the whole arch, and their geometry differs slightly from `crown` (~83% mask overlap). Pick one src: bloom (≥42) › ivy (≥3) › bare, and crossfade over ~1.2s when it changes.
- [ ] Stained Glass Wakes (≥6): rose window lit (Task 4).
- [ ] Night Roses (≥10): `rose-urn` stands on shelf 2 as a flex item after the spines (it takes a spine slot's width; reduce that shelf's capacity by 2).
- [ ] The Familiar (≥15): `familiar-walk` atlas (8 frames of 128×96, 8 fps, faces right — see `familiar-walk.json`) patrols the top shelf's plank edge; flip with `scaleX(-1)` walking left; pause at each end as `familiar-sit`. The frames vary slightly in gait (JSON note) — preview it; if it jitters, ship `familiar-sit` only and log it.
- [ ] Thornwood Sapling (≥21): `thornwood-tree` at the end of shelf 3 of the LAST bookcase; scale it to about one shelf height (it will look huge at native size).
- [ ] Will-o'-Wisps (≥30): CSS wisps + at most one `sprite-winged` / `sprite-winged-elegant` drifting slowly per bookcase in view.
- [ ] The Hushthorn Blooms (≥42): crown → `bloom-garland` on every bookcase.
- [ ] Each layer is only requested when owned (conditional render — no hidden `<img>` preloading).

## Task 6 — Notifications and Curiosities

- [ ] Implement decisions 5 and 6. The light sweep plays only on unlocks in Spines view.
- [ ] The card sits under the header, centered; it overlaps the crown briefly — acceptable, but delay the unlock layer's fade-in by ~600 ms so the reveal isn't fully hidden.

## Task 7 — Shared archive

- [ ] Implement decision 8. Union spines already render the owner-count box; keep it where the Verdict dot would be.
- [ ] Browser check with `qa.alpha` + `qa.beta` in one archive: each sees their own decorations only; alpha finishing a book never shows a card to beta; beta's Curiosities never lists alpha's unlocks.
- [ ] Note: if a member turns on `share_reading`, co-members can see their read marks through `archive_reveal` and could count them. That is existing, opted-in behavior; the decorations themselves stay private. Don't change it here.

## Task 8 — Scale (the unshipped "Spine shelf at scale" item in CLAUDE.md)

- [ ] Bookcases stack vertically; each gets a plaque "Bookcase VIII · He – Ho" (first/last title prefixes).
- [ ] Virtualize: render a bookcase's spines only when it is within one viewport of the screen; keep placeholders with a fixed height so scroll doesn't jump.
- [ ] A–Z rail (sticky, right side) when the shelf has 100+ books; jumps to the bookcase containing that letter; disabled letters have no titles.
- [ ] Check with a staging account seeded to ~1,000 books (script it on staging only): smooth scroll, DOM holds ≤ 3 bookcases of spines.

## Task 9 — Polish, accessibility, performance

- [ ] Reduced motion (Global constraints).
- [ ] Decorations are `aria-hidden`; the familiar and relics never steal focus; spines stay real buttons.
- [ ] First load of one bare bookcase ≤ 1.5 MB (measured: ~0.5 MB with the WebP set) — confirm in DevTools Network on staging.
- [ ] Mobile (390px): crown scales with the bookcase; backdrop switches to the mobile file; the notification card fits with 16px gutters.

## Task 10 — QA report

- [ ] Add `tests/cathedral-spine-shelf-test-plan.md` with every case above (engine cases, RLS, idempotency, two tabs, bulk import, backfill intro, shared privacy, reduced motion, 0 / 1 / 1,000 books, covers view unchanged) and mark each pass/fail with what was actually observed.
