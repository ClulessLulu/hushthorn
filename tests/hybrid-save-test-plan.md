# Hybrid Save — Manual Test Plan

**Feature:** `docs/HYBRID_SAVE_SPEC.md` (+ 2026-07-07 Addendum). Branch `hybrid-save`.
**How to run:** `npm run dev` (Chrome), sign in, open a book's detail panel.
**Why manual:** this is client-side buffering UI. No new tables/RLS/views (title/author/genres/progress are pre-existing owner-only columns; RLS already proven). Persistence rides the existing `updateBook` path — correctness is code-reviewed; these cases confirm the UX end-to-end in the browser.

## Instant save (flash, no bar)
- [ ] I-1: Tap Verdict to 4 swords → violet "saved" pill flashes next to it and fades (~0.6s). Reload → 4 swords persist.
- [ ] I-2: Tap Smoulder / Read / Shelf / a Format chip → each flashes "saved" and persists on reload.
- [ ] I-3: Tap the same control twice → pill re-flashes each time and does NOT stay on screen permanently (no lingering pill, no layout shift on the Owned/Read rows).

## Buffered save (bar appears only when dirty)
- [ ] B-1: Edit Title → card border turns pink, "unsaved changes" pill appears, Save bar slides up from the modal bottom.
- [ ] B-2: With the bar showing, tap Verdict → sword saves instantly (flash), bar STAYS (independent channels).
- [ ] B-3: Save & Close → panel closes; reopen the book → new Title persisted.
- [ ] B-4: Edit Author → Discard changes → Author reverts to saved value, bar disappears.
- [ ] B-5: Edit genres (add + remove chips) → Save & Close → reopen → genres persisted.
- [ ] B-6: Edit Title → close via ✕ (or backdrop) → reopen → shows the SAVED title, not the discarded edit (close = implicit discard).
- [ ] B-7: The save bar pins to the modal's bottom and scrolls WITH the modal content (not floating over the page/backdrop).

## Progress (INSTANT — Decision A revised)
- [ ] P-1: Change a page number / quick-bump → persists immediately (no save bar from progress); reopen → new value.
- [ ] P-2: Snap-to-update (photo of a page) → parsed value writes immediately.
- [ ] P-3: Set a format to 100% → book flips to Read immediately (auto-Read per-change).
- [ ] P-4: Editing progress alone never shows the Save & Close bar (that's Edit-details only).

## Archive (union) variant
- [ ] A-1: Open YOUR book inside a shared archive → same hybrid editing (edit title → bar → Save persists via your copy).
- [ ] A-2: After saving a title change on an archive book → the archive shelf shows the new title / re-keys correctly (refreshArchiveUnion ran).
- [ ] A-3: Open a CO-MEMBER's book you don't own → READ-ONLY: no Edit-details card, no save bar, no editable inputs (only WhoHasIt + reveal + "Add to my library").

## Regression
- [ ] R-1: Inscribe modal (add a book) unchanged — "Inscribe to Owned/Wishlist" still commits; no stray save bar inside it.
- [ ] R-2: Notes / marginalia unchanged — adding a note still writes immediately (not part of the save bar).
- [ ] R-3: Rename a book's title to exactly match another of your books (any case) → Save & Close is HARD-BLOCKED: title field goes pink with "Another tome is already titled…", nothing persists, bar stays open. Editing the title clears the error. A non-colliding title saves normally.
