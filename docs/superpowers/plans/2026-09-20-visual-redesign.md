# Visual Redesign ("Books as Objects") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Covers view read as physical books carrying their own reading progress, tighten the page header, and fix the add-book modal — without touching data, DB, or RLS.

**Architecture:** Token-level first. New shared `ht-*` classes go in the `FONT_CSS` block in `src/App.jsx`; components consume those classes. The whole app lives in one file (`src/App.jsx`, ~6.4k lines) by established convention — navigate by symbol search, do not restructure.

**Tech Stack:** Vite + React, Tailwind utility classes + the `ht-*` custom classes in `FONT_CSS`. Supabase is untouched by this plan.

**Spec:** `docs/superpowers/specs/2026-09-20-visual-redesign-design.md` — read it before Task 1. Mockup reference: https://claude.ai/artifact/PWaysWqyPmy2e2d9us3QSB (board `A - Standing Tome (chosen)` and `Library screen - full shell`).

## Verification model — READ THIS FIRST

**This repo has no test runner.** There is no `npm test`, no Jest, no Vitest. Do not invent one, do not add a
test framework, and do not write `*.test.js` files. Verification for every task is:

1. `npm run build` — must pass (this is the project's hard gate, per CLAUDE.md)
2. The explicit browser checks listed in that task, run on `npm run dev` in Chrome

When a task says "verify", it means those two things. Report the actual build output and what you saw in the
browser. If you cannot run a browser, say so plainly in your report rather than claiming the check passed.

## Global Constraints

Exact values, copied from the spec. Every task's requirements implicitly include these.

- Reading rail colour: `rgba(167,139,250,0.9)` — the existing `SPINE_GLOW.print`
- Audio rail colour: `rgba(34,211,238,0.95)` — the existing `SPINE_GLOW.audio`
- **Cyan is reserved for audio.** The audio rail is the only cyan in the Covers view.
- Rail geometry on covers: width `3px`, `bottom: 6px`, height `calc(<pct>% - 6px)`, `pointer-events: none`, `aria-hidden="true"`
- Rail geometry on spines: width `2px`, `bottom: 5px` — **unchanged**, only the render condition changes
- A rail renders only when `pct > 0` **AND** the book is not finished (`!book.read`)
- Tome cover radius: `2px 4px 4px 2px` — the one sanctioned exception to the sharp-corner rule, 4px max
- Page block: `right: -8px`, `width: 8px`; spine edge: `left: 0`, `width: 17px` (`12px` below the `sm` breakpoint)
- Background grain: `repeating-linear-gradient(45deg, rgba(240,166,224,.016) 0 2px, transparent 2px 6px)` — alpha must stay at/below `.016`
- Wishlist ghost: cover `opacity: .55` + `1px dashed rgba(240,166,224,.45)`, page block `opacity: .35`
- Hover lift: `translateY(-10px)`, `.25s ease`
- Title clamps to 2 lines, author to 1 line, coverless-title fallback to 5 lines
- Add-book action buttons: **≥44px tap height**
- **No new columns, no new queries, no DB/RLS change.** Rails read the existing `formatPercent(book, fmt)`.
- `npm run build` must pass before any task is considered done

---

### Task 1: The standing tome (cover anatomy)

**Files:**
- Modify: `src/App.jsx` — the `FONT_CSS` template literal (add classes near the existing `.ht-arch` rule, ~line 175); the reduced-motion `@media` rule (~line 128); the Covers grid card cover block (~line 2310, inside the `gridBooks.map` in the `Hushthorn` component)

**Interfaces:**
- Produces: CSS classes `.ht-tome`, `.ht-tome-cover`, `.ht-tome-pages`, `.ht-tome-spine`, `.ht-tome-ghost`. Task 2 attaches rails inside `.ht-tome`, which is the `position: relative` containing block.

- [ ] **Step 1: Add the tome classes to `FONT_CSS`**

Insert immediately after the existing `.ht-arch { … }` rule:

```css
/* ── the standing tome (Covers view) ─────────────────────────
   A cover with real thickness: cream page block on the fore-edge, darkened
   spine edge at the left. Progress rails (Task 2) attach to those same edges.
   .ht-tome is the positioning context — it must stay position:relative. */
.ht-tome { position: relative; transition: transform .25s ease; }
.ht-tome-cover {
  position: absolute; inset: 0;
  border-radius: 2px 4px 4px 2px;
  overflow: hidden;
  box-shadow: 0 16px 28px rgba(0,0,0,0.72), inset 0 1px 0 rgba(240,166,224,0.16);
  transition: box-shadow .25s ease;
}
.ht-tome-pages {
  position: absolute; top: 6px; bottom: 6px; right: -8px; width: 8px;
  border-radius: 0 2px 2px 0;
  background: repeating-linear-gradient(180deg, #e8ddc8 0 2px, #c4b69b 2px 3px);
  box-shadow: 1px 0 4px rgba(0,0,0,0.65);
}
.ht-tome-spine {
  position: absolute; left: 0; top: 0; bottom: 0; width: 12px;
  background: linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.04));
  border-right: 1px solid rgba(240,166,224,0.11);
}
@media (min-width: 640px) { .ht-tome-spine { width: 17px; } }
/* Only tomes marked .ht-tome-lift rise on hover. The add-book result rows in
   Task 4 are also .ht-card, and their small covers must NOT lift. */
.ht-card:hover .ht-tome-lift { transform: translateY(-10px); }
.ht-card:hover .ht-tome-lift .ht-tome-cover { box-shadow: 0 26px 42px rgba(0,0,0,0.8), inset 0 1px 0 rgba(240,166,224,0.22); }
/* wishlist tomes are ghosts in dashed glass — mirrors the spine shelf */
.ht-tome-ghost .ht-tome-cover { opacity: .55; border: 1px dashed rgba(240,166,224,0.45); }
.ht-tome-ghost .ht-tome-pages { opacity: .35; }
```

- [ ] **Step 2: Disable the lift under reduced motion**

**Do NOT edit the existing `@media (prefers-reduced-motion: reduce)` rule near line 128.** `FONT_CSS` is
injected verbatim into a `<style>` tag with no post-processing, so equal-specificity rules are decided by
source order. That block sits *above* the `.ht-tome` rules added in Step 1, so a neutralizer placed there
loses the cascade to the unconditional rules and silently does nothing.

Instead append a second reduced-motion block immediately after the `.ht-tome-ghost` rules from Step 1:

```css
/* Reduced motion for the tome MUST be declared here, after the rules above.
   FONT_CSS is injected verbatim into a <style> tag with no post-processing, so
   equal-specificity rules are decided by source order — the earlier
   prefers-reduced-motion block near the top of this sheet would lose to the
   unconditional .ht-tome rules and silently do nothing. */
@media (prefers-reduced-motion: reduce) {
  .ht-tome { transition: none; }
  .ht-card:hover .ht-tome-lift { transform: none; }
}
```

Rails (Task 2) are information, not decoration, so reduced motion never disables them.

- [ ] **Step 3: Rework the grid card's cover block**

Find this block in the Covers grid (~line 2310):

```jsx
                  <div className="aspect-[2/3] rounded-sm overflow-hidden bg-purple-950/60 flex items-center justify-center">
                    <CoverImage
                      src={b.coverUrl}
                      alt={`Cover of ${b.title}`}
                      className="w-full h-full object-cover"
                      fallback={<span className="ht-display text-purple-400/60 text-xs px-2 text-center">{b.title}</span>}
                    />
                  </div>
```

Replace with:

```jsx
                  <div className={`ht-tome ht-tome-lift aspect-[2/3] ${b.shelf === "wishlist" ? "ht-tome-ghost" : ""}`}>
                    <div className="ht-tome-cover bg-purple-950/60 flex items-center justify-center">
                      <CoverImage
                        src={b.coverUrl}
                        alt={`Cover of ${b.title}`}
                        className="w-full h-full object-cover"
                        fallback={<span className="ht-display text-purple-300/70 text-[11px] leading-snug px-3 text-center line-clamp-5 break-words">{b.title}</span>}
                      />
                    </div>
                    <div className="ht-tome-pages" aria-hidden="true" />
                    <div className="ht-tome-spine" aria-hidden="true" />
                  </div>
```

Note: the card wrapper is `ht-card rounded-md p-3`, so the page block's `right: -8px` sits inside the card's
12px padding and cannot overflow the card or the grid cell.

- [ ] **Step 4: Let long titles break**

The title and author already clamp (`line-clamp-2` / `line-clamp-1`). Add word breaking so a single long
unbroken word cannot widen the cell. Find (~line 2318):

```jsx
                  <h3 className="mt-2 text-[15px] font-semibold leading-tight line-clamp-2">{b.title}</h3>
```

Replace with:

```jsx
                  <h3 className="mt-2 text-[15px] font-semibold leading-tight line-clamp-2 break-words">{b.title}</h3>
```

- [ ] **Step 5: Verify**

Run: `npm run build` → expect `✓ built in …`, no errors.

Then `npm run dev` in Chrome, Covers view:
- Books show a cream page block on the right edge and a dark spine edge on the left
- Hovering a card lifts the book and deepens its shadow
- A wishlist book renders faded with a dashed cover border
- A book with no cover art shows its title inside the cover, clamped, not spilling out
- Narrow the window to phone width (2 columns): no horizontal scrollbar, page block stays inside the card

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(covers): render books as standing tomes"
```

---

### Task 2: Progress rails — one rule across Covers and Spines

**Files:**
- Modify: `src/App.jsx` — `FONT_CSS` (rail classes, after the `.ht-tome-ghost` rules from Task 1); the Covers grid card (`gridBooks.map`, ~line 2300); the `Spine` component (~line 1080, rails at ~1124 and ~1137, comment at ~1089, tooltip at ~1101)

**Interfaces:**
- Consumes: `.ht-tome` from Task 1 as the rails' positioning context.
- Uses the existing top-level helpers `formatPercent(book, fmt)` (returns 0 for missing/malformed progress) and `FORMAT_META[fmt].label`.
- Produces: CSS classes `.ht-rail`, `.ht-rail-read`, `.ht-rail-audio`.

- [ ] **Step 1: Add the rail classes to `FONT_CSS`**

Insert after the `.ht-tome-ghost` rules:

```css
/* progress rails — violet reading on the spine edge, cyan audio on the
   fore-edge. Same language as the spine shelf. Cyan is audio-only. */
.ht-rail { position: absolute; bottom: 6px; width: 3px; pointer-events: none; }
.ht-rail-read { left: 0; background: rgba(167,139,250,0.9); box-shadow: 0 0 6px rgba(167,139,250,0.9); }
.ht-rail-audio { right: -8px; background: rgba(34,211,238,0.95); box-shadow: 0 0 6px rgba(34,211,238,0.95); }
```

- [ ] **Step 2: Compute progress in the grid card**

Find the top of the map body in the Covers grid (~line 2300):

```jsx
            {gridBooks.map((b) => {
              // UnionBooks (archive entries) have `owners`; personal books have `id`.
              const isUnion = !!b.owners;
              const openId = isUnion ? b.key : b.id;
              return (
```

Replace with:

```jsx
            {gridBooks.map((b) => {
              // UnionBooks (archive entries) have `owners`; personal books have `id`.
              const isUnion = !!b.owners;
              const openId = isUnion ? b.key : b.id;
              // Progress rails, same rule as the spine shelf: reading (the further
              // of print/ebook) climbs the spine edge, audio climbs the fore-edge.
              // A finished tome shows no rail. `formatPercent` coerces missing or
              // malformed progress to 0, so a rail simply doesn't render.
              const printPct = formatPercent(b, "print");
              const ebookPct = formatPercent(b, "ebook");
              const readPct = b.read ? 0 : Math.max(printPct, ebookPct);
              const readFmt = ebookPct > printPct ? "ebook" : "print";
              const audioPct = b.read ? 0 : formatPercent(b, "audio");
              const tip =
                `${b.title} — ${b.author}` +
                (readPct > 0 ? ` · ${readPct}% ${FORMAT_META[readFmt].label}` : "") +
                (audioPct > 0 ? ` · ${audioPct}% ${FORMAT_META.audio.label}` : "");
              return (
```

- [ ] **Step 3: Put the tooltip on the card**

Find the card button (~line 2305):

```jsx
                <button
                  key={b.id || b.key}
                  onClick={() => setActiveId(openId)}
                  className="ht-card rounded-md p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                >
```

Replace with (adds `title` — the exact percentages live here, not as visible text):

```jsx
                <button
                  key={b.id || b.key}
                  onClick={() => setActiveId(openId)}
                  title={tip}
                  className="ht-card rounded-md p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                >
```

- [ ] **Step 4: Render the rails inside the tome**

In the block added by Task 1, find:

```jsx
                    <div className="ht-tome-pages" aria-hidden="true" />
                    <div className="ht-tome-spine" aria-hidden="true" />
                  </div>
```

Replace with:

```jsx
                    <div className="ht-tome-pages" aria-hidden="true" />
                    <div className="ht-tome-spine" aria-hidden="true" />
                    {readPct > 0 && (
                      <span className="ht-rail ht-rail-read" aria-hidden="true" style={{ height: `calc(${readPct}% - 6px)` }} />
                    )}
                    {audioPct > 0 && (
                      <span className="ht-rail ht-rail-audio" aria-hidden="true" style={{ height: `calc(${audioPct}% - 6px)` }} />
                    )}
                  </div>
```

- [ ] **Step 5: Gate the spine rails on `book.read`**

This changes shipped behaviour deliberately. First fix the comment that documents the old invariant
(~line 1089) — find:

```jsx
  // Two thin vertical EDGE RAILS rise from the foot of the spine — NEITHER is
  // gated on book.read, so a tome finished in audio still shows its partial
  // print rail. Defensive `formatPercent` coerces missing/malformed progress
  // to 0, so a rail simply doesn't render rather than throwing.
```

Replace with:

```jsx
  // Two thin vertical EDGE RAILS rise from the foot of the spine. BOTH are
  // gated on book.read: a finished tome shows no rail, in this view and in
  // the Covers view alike (one rule, both views). Defensive `formatPercent`
  // coerces missing/malformed progress to 0, so a rail simply doesn't render
  // rather than throwing.
```

Then find the two render conditions (~1124 and ~1137) and add the gate:

```jsx
      {readPct > 0 && (
```

becomes

```jsx
      {!book.read && readPct > 0 && (
```

and

```jsx
      {audioPct > 0 && (
```

becomes

```jsx
      {!book.read && audioPct > 0 && (
```

- [ ] **Step 6: Match the spine tooltip to the rails**

So the tooltip doesn't advertise percentages the rails no longer show. Find (~line 1101):

```jsx
  const tip =
    `${book.title} — ${book.author}` +
    (readPct > 0 ? ` · ${readPct}% ${FORMAT_META[readFmt].label}` : "") +
    (audioPct > 0 ? ` · ${audioPct}% ${FORMAT_META.audio.label}` : "");
```

Replace with:

```jsx
  const tip =
    `${book.title} — ${book.author}` +
    (!book.read && readPct > 0 ? ` · ${readPct}% ${FORMAT_META[readFmt].label}` : "") +
    (!book.read && audioPct > 0 ? ` · ${audioPct}% ${FORMAT_META.audio.label}` : "");
```

- [ ] **Step 7: Verify**

Run: `npm run build` → expect `✓ built in …`, no errors.

Then `npm run dev` in Chrome:
- A book with print progress shows a violet rail on its left edge at roughly the right height
- A book with audio progress shows a cyan rail on its right edge
- A book with both shows both
- Mark a book **read** → its rails disappear in Covers **and** on the Spines shelf
- Hover a card → tooltip shows the percentages; a read book's tooltip shows title/author only
- A book with no progress shows no rail and does not error (check the console)

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(progress): rails on covers; hide rails once a book is read

A finished book now shows no rail in either view. This drops the spine
shelf's previous deliberate behaviour of keeping a partial print rail on
a book finished in audio."
```

---

### Task 3: Page shell — tighter header, background grain

**Files:**
- Modify: `src/App.jsx` — the `.ht-bg` rule in `FONT_CSS` (~line 78); the `<header>` block in the `Hushthorn` component (~line 2170)

**Interfaces:**
- Consumes nothing from Tasks 1–2. Produces nothing they depend on. Independently reviewable.

- [ ] **Step 1: Add the grain to `.ht-bg`**

Find (~line 78):

```css
.ht-bg {
  background-color: #0c0714;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.45), transparent 70%),
```

Replace those lines with (the grain is the FIRST layer so it sits above the washes):

```css
.ht-bg {
  background-color: #0c0714;
  background-image:
    repeating-linear-gradient(45deg, rgba(240,166,224,.016) 0 2px, transparent 2px 6px),
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.45), transparent 70%),
```

Leave the other three `radial-gradient` lines and `min-height: 100vh` exactly as they are.

- [ ] **Step 2: Tighten the header**

Find (~line 2170):

```jsx
      <header className="max-w-5xl mx-auto px-5 pt-10 pb-4 text-center">
        <Crown />
        <h1 className="ht-blackletter ht-glow text-6xl sm:text-7xl text-transparent bg-clip-text bg-gradient-to-b from-pink-200 via-fuchsia-300 to-fuchsia-500">
          Hushthorn
        </h1>
        <p className="mt-3 text-[15px] text-pink-200/65 italic">
          a candlelit archive for the books you shouldn't read in public
        </p>
        <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="ht-rule w-24 inline-block" />
          <span className="text-pink-300/70 text-[10px]">◆</span>
          <span className="ht-rule w-24 inline-block" />
        </div>
        <div className="mt-4 flex justify-center">
```

Replace with (nothing is removed — only sizes and gaps shrink):

```jsx
      <header className="max-w-5xl mx-auto px-5 pt-6 pb-3 text-center">
        <Crown />
        <h1 className="ht-blackletter ht-glow text-4xl sm:text-5xl text-transparent bg-clip-text bg-gradient-to-b from-pink-200 via-fuchsia-300 to-fuchsia-500">
          Hushthorn
        </h1>
        <p className="mt-2 text-[15px] text-pink-200/65 italic">
          a candlelit archive for the books you shouldn't read in public
        </p>
        <div className="mt-3 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="ht-rule w-24 inline-block" />
          <span className="text-pink-300/70 text-[10px]">◆</span>
          <span className="ht-rule w-24 inline-block" />
        </div>
        <div className="mt-3 flex justify-center">
```

- [ ] **Step 3: Verify**

Run: `npm run build` → expect `✓ built in …`, no errors.

Then `npm run dev` in Chrome:
- Books appear noticeably higher on the page; the header is roughly half its old height
- Wordmark, tagline, `◆` rule, avatar chip and sign-out are all still present
- The background shows a faint diagonal grain — texture, not visible stripes. If it reads as stripes, lower the alpha below `.016`
- Check at phone width too: the wordmark does not wrap

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "style(shell): tighten header, add background grain"
```

---

### Task 4: Add-book / scan modal pass

**Files:**
- Modify: `src/App.jsx` — the search-results section of `AddBookModal` (~lines 4866–4895)

**Interfaces:**
- Consumes `.ht-tome`, `.ht-tome-cover` and `.ht-tome-pages` from Task 1. Deliberately does **not** use
  `.ht-tome-lift` (no hover lift inside a list) and does **not** render rails — an un-added book has no
  progress. Task 1 must land before this task.

**Scope guard:** this is a visual and tap-target pass only. Do NOT change the search logic, the Google
Books / Open Library fetches, ISBN scanning, camera handling, or the duplicate-title guard.

- [ ] **Step 1: Raise the results scroll cap**

Find (~line 4867):

```jsx
          <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-1">
```

Replace with:

```jsx
          <div className="mt-4 space-y-3 max-h-[28rem] overflow-y-auto pr-1">
```

- [ ] **Step 2: Rebuild the result row**

Find the whole result row (~lines 4869–4894):

```jsx
              <div key={doc.key} className="flex gap-3 items-center bg-purple-950/40 rounded-sm p-2.5 border border-purple-800/40">
                <div className="w-10 h-14 rounded-sm overflow-hidden bg-purple-900/60 flex-shrink-0 flex items-center justify-center">
                  <CoverImage
                    src={doc._coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : "")}
                    alt=""
                    className="w-full h-full object-cover"
                    fallback={<span className="text-purple-500 text-lg">♛</span>}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">{doc.title}</p>
                  <p className="text-sm text-purple-300/70 truncate italic">
                    {doc.author_name?.[0] || "Unknown"} {doc.first_publish_year ? `· ${doc.first_publish_year}` : ""}
                  </p>
                  <GenreChips genres={cleanGenres(doc.subject)} className="mt-1" />
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => pick(doc, "owned")} className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-indigo-500/40 hover:bg-indigo-500/70 text-indigo-100">
                    + Owned
                  </button>
                  <button onClick={() => pick(doc, "wishlist")} className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-pink-500/30 hover:bg-pink-500/60 text-pink-100">
                    + Wishlist
                  </button>
                </div>
              </div>
```

Replace with (card surface, larger cover with a page block, `❦` fallback, and both actions at 44px):

```jsx
              <div key={doc.key} className="ht-card rounded-md p-3">
                <div className="flex gap-3 items-start">
                  <div className="ht-tome w-14 h-[84px] flex-shrink-0">
                    <div className="ht-tome-cover bg-purple-900/60 flex items-center justify-center">
                      <CoverImage
                        src={doc._coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : "")}
                        alt=""
                        className="w-full h-full object-cover"
                        fallback={<span className="text-purple-400/70 text-base">❦</span>}
                      />
                    </div>
                    <div className="ht-tome-pages" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold line-clamp-2 break-words">{doc.title}</p>
                    <p className="text-sm text-purple-300/70 truncate italic">
                      {doc.author_name?.[0] || "Unknown"} {doc.first_publish_year ? `· ${doc.first_publish_year}` : ""}
                    </p>
                    <GenreChips genres={cleanGenres(doc.subject)} className="mt-1" />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => pick(doc, "owned")} className="ht-display flex-1 min-h-[44px] text-[10px] uppercase px-3 rounded-sm bg-indigo-500/40 hover:bg-indigo-500/70 text-indigo-100">
                    + Owned
                  </button>
                  <button onClick={() => pick(doc, "wishlist")} className="ht-display flex-1 min-h-[44px] text-[10px] uppercase px-3 rounded-sm bg-pink-500/30 hover:bg-pink-500/60 text-pink-100">
                    + Wishlist
                  </button>
                </div>
              </div>
```

Note: the small cover deliberately omits `.ht-tome-spine` — at 56px wide a 12px spine edge would swallow the
artwork. The page block alone is enough to read as a book.

- [ ] **Step 3a: Stop treating "zero results" as an error**

Without this the empty state in Step 3b is unreachable dead code. The search effect currently sets `error` to a
message whenever a completed search returns nothing, so `!error` is never true in exactly the case the empty
state exists for. Find, inside the search `useEffect`:

```jsx
          setResults(docs);
          setError(docs.length ? "" : "No tomes found. Try a different title or author.");
          setLoading(false);
```

Replace with:

```jsx
          setResults(docs);
          // A search that completes with zero results is not an error — the
          // empty state below the results list owns that message. `error` is
          // reserved for genuine failures (network, both providers down), which
          // is what the pink error line renders.
          setError("");
          setLoading(false);
```

This touches only the error *string* (display plumbing). The fetches, debounce, field mapping and the
`catch` that sets "The archives are unreachable…" all stay exactly as they are — that pink error line is
still needed for real failures.

- [ ] **Step 3b: Add the "nothing found" state**

Find the results container's closing and the loading/error lines above it (~line 4864):

```jsx
          {loading && <p className="mt-4 text-[15px] text-purple-300/70 italic">Consulting the archives…</p>}
          {error && <p className="mt-4 text-[15px] text-pink-300">{error}</p>}
```

Replace with (adds a third state — themed voice, but it states what to do next, per CLAUDE.md):

```jsx
          {loading && <p className="mt-4 text-[15px] text-purple-300/70 italic">Consulting the archives…</p>}
          {error && <p className="mt-4 text-[15px] text-pink-300">{error}</p>}
          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <div className="mt-6 text-center">
              <p className="ht-display text-sm text-purple-200">No tome answers to that name.</p>
              <p className="mt-1.5 text-[15px] text-purple-300/70 italic">
                Try the author's name instead, or switch to Scan or upload to add it by hand.
              </p>
            </div>
          )}
```

- [ ] **Step 4: Verify**

Run: `npm run build` → expect `✓ built in …`, no errors.

Then `npm run dev` in Chrome, open Inscribe → Scour the grimoire:
- Search "court of thorns" → results are card rows with larger covers that read as little books
- A result with no artwork shows `❦`, not `♛`
- Both `+ Owned` and `+ Wishlist` sit side by side and measure ≥44px tall (check in DevTools)
- Clicking `+ Owned` still adds the book; the duplicate-title guard still fires on a title you already own
- Search a nonsense string like "zzzqqqx" → the new "No tome answers to that name" state appears
- At phone width the row does not overflow and the buttons stay tappable

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "style(inscribe): card result rows, bigger covers, 44px actions, empty state"
```

---

## Done criteria

All four tasks committed, `npm run build` passing, and the spec's QE checklist
(`docs/superpowers/specs/2026-09-20-visual-redesign-design.md` §7) walked in the browser.
