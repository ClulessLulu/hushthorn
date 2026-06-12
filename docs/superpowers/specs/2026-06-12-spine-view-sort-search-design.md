# Spine Shelf View + Sort/Dimming Search — Design

Porting two features from `prototype/hushthorn-demo.jsx` into the live
Supabase-backed app (`src/App.jsx`), adapting them to the persisted data model.

- **Feature #1 — Sort + dimming search** (no migration)
- **Feature #2 — Spine shelf view** (one `books.spine_color` column)
- **Supporting — View-preference persistence** on the existing `avatars` row

Reference implementation: `prototype/hushthorn-demo.jsx:204-378` (spines),
controls bar around `:680-722`. The repo wins where it diverges.

## Decisions locked during brainstorming

1. **Spine color**: precompute + store in a `books.spine_color` column.
   Compute on add / cover-change; **auto lazy-backfill** existing books on
   first spine render (sample client-side once, write back). Genre fallback
   while loading / on failure.
2. **Mobile / 100+ books**: responsive per-row count so each wooden shelf
   board sits under exactly one visual row. No virtualization (deferred TODO).
3. **View prefs**: persist `pref_layout` + `pref_sort` on the `avatars` table
   (cross-device).
4. **Search**: **hide** non-matches in the cover grid (clean reflow); **dim**
   non-matches to ~20% opacity in the spine shelf (no reflow — preserves the
   bookcase). Matches by title / author / genre.

## Data model / migrations

Two migrations via Supabase MCP (`apply_migration`).

```sql
-- Migration 1: spine color
ALTER TABLE books ADD COLUMN spine_color text;   -- nullable; e.g. 'rgb(74,42,91)'

-- Migration 2: view preferences on the existing avatars row
ALTER TABLE avatars ADD COLUMN pref_layout text NOT NULL DEFAULT 'grid';   -- 'grid' | 'spines'
ALTER TABLE avatars ADD COLUMN pref_sort   text NOT NULL DEFAULT 'recent'; -- recent|author|title|verdict|spice
```

`spine_color` is nullable so existing rows load unaffected and get backfilled
lazily. RLS already restricts `books` and `avatars` to the owning `user_id`;
no policy changes needed (the new columns inherit row-level access).

### App-side data mapping

In the books fetch (`src/App.jsx:341-346`) add `spineColor: b.spine_color` to
the mapped book object. In the avatar fetch (`:347-351`) add
`pref_layout` / `pref_sort` to the loaded prefs.

## Spine color strategy

### Color utilities (ported from prototype)

- `hashStr(s)` — stable 32-bit string hash.
- `genreFallbackColor(book)` — genre regex table
  (`vampire/blood → #5b1f3f`, `fae → #33306e`, `romance → #7c2a5e`,
  `witch/magic → #46246b`, `dark academia/mystery → #3b2f4e`,
  `gothic/horror → #2a1f3d`, `dragon/epic/fantasy → #1f3a5c`), else
  `hsl(hashStr(title) % 360, 35%, 24%)`.
- `sampleCoverColor(dataUrl)` — draw to an 8×12 canvas, average RGB, darken so
  the brightest channel is ≤150 ("library light"). Returns `rgb(r,g,b)`.

### When colors are computed

- **On add** (`addBook`, `src/App.jsx:480`): after the cover URL is resolved,
  sample it and include `spine_color` in the insert. Best-effort — a sampling
  failure inserts `spine_color: null` (fallback handles display).
- **On cover change** (`CoverEditor.save`, `src/App.jsx:2232`): after the new
  `coverUrl` is determined, resample and include `spine_color` in the update.
- **Lazy backfill** (existing books, `spine_color === null`): handled inside
  `useSpineColor` (below). On first spine render the hook samples the cover,
  displays it, and fires a one-shot Supabase update writing `spine_color` back.
  Guarded so a book is never resampled once persisted.

### `useSpineColor(book, onPersist)` hook

```
initial = book.spineColor || spineColorCache.get(coverUrl) || genreFallbackColor(book)
effect (on coverUrl):
  if book.spineColor present        -> use it, seed cache, done
  if cache has coverUrl             -> use cached, done
  if no coverUrl                    -> genre fallback, done
  else: resolve dataUrl (data: | coverCache | fetch->blob->dataURL)
        -> sampleCoverColor
        -> cache + setColor
        -> onPersist(color)   // one-shot DB write of spine_color
  on any failure: keep genre fallback (no write)
```

`onPersist` is supplied by the parent and calls
`supabase.from('books').update({ spine_color }).eq('id', book.id)`, updating
local state so it never fires twice. Module-level `spineColorCache` Map dedupes
within a session; the DB write dedupes across sessions.

## Components (all in `src/App.jsx`, single-file structure preserved)

| Unit | Responsibility | Depends on |
|---|---|---|
| `hashStr`, `genreFallbackColor`, `sampleCoverColor` | pure color utils | — |
| `useSpineColor` | resolve + cache + lazy-persist spine color | utils, supabase |
| `Spine` | one spine button: hash dimensions, verdict gem, spice band, vertical title, unread-proud / wishlist-ghost states; dimmed prop | `useSpineColor` |
| `SpineShelf` | rows of spines + wooden boards; responsive per-row count; count header; empty state | `Spine` |
| `ControlsBar` | Covers/Spines toggle, sort `<select>`, search input | — |
| `sortBooks(list, key)` | pure sort (stable) | — |
| `matchesQuery(book, q)` | title/author/genre substring match | — |

### `Spine` details (ported, audio kept dormant)

- Height `122 + hashStr(title) % 48`; width `17 + hashStr(author+title) % 12`.
- Verdict gem dot: gold `#fbbf24` at overall 5, periwinkle `#a5b4fc` for 1-4,
  faint for 0.
- Spice band at foot: `rgba(244,114,182, 0.2 + smut*0.16)`, faint at 0.
- Vertical title (`writing-mode: vertical-rl`), truncated at 24 chars.
- Unread (owned & !read) sits proud (`-translate-y-1.5`); wishlist is ghosted
  (`opacity-60`) + dashed border; `dimmed` drops to `opacity-20`.
- Audio ring markup is included but only renders when
  `book.formats?.includes('audio')` — dormant until Feature #3 (audiobooks)
  lands; harmless no-op now since no book has `formats` yet.
- Hover: `-translate-y-2 -rotate-3`, raised z-index.

### Responsive rows (`SpineShelf`)

Measure the shelf container width with a `ResizeObserver` on a ref (fallback to
`clientWidth` on mount + window resize listener). Compute
`perRow = clamp(floor(width / (MAX_SPINE_W + GAP)), 6, 14)` where
`MAX_SPINE_W = 29`, `GAP = 5`. Chunk the (already sorted) book list into rows of
`perRow`; render each row in a `flex items-end` container followed by a wooden
board div. Re-chunk on width change. Each board therefore always underlines one
full visual row.

## Controls bar & view composition

A single `ControlsBar` rendered below the existing shelf ribbon `<nav>`
(`src/App.jsx:560-600`), above `<main>`. Only shown in the `library` view (not
Oracle / Kindle).

Pipeline applied in `<main>` for the library view:

```
shelfFiltered = books filtered by the active shelf ribbon (existing logic)
sorted        = sortBooks(shelfFiltered, sortKey)
-- grid:   render sorted.filter(b => matchesQuery(b, query))   // HIDE non-matches
-- spines: render <SpineShelf books={sorted}>, each Spine dimmed={query && !matchesQuery}
```

- **Layout toggle**: Covers / Spines segmented control.
- **Sort `<select>`**: Recent (default) · Author · Title · Verdict · Spice.
- **Search input**: dims (spines) / hides (grid) live on each keystroke.

### `sortBooks(list, key)`

Stable sort over a shallow copy:
- `recent` — preserve incoming order. This is well-defined: the books fetch
  already orders by `created_at` descending (`src/App.jsx:327`) and new books
  prepend in-session, so incoming order is newest-first.
- `author` — `localeCompare` on author, then title.
- `title` — `localeCompare` on title.
- `verdict` — `overall` descending, then recent order as tiebreak.
- `spice` — `smut` descending, then recent order as tiebreak.

### Preference persistence

- On mount, initialize `layout` / `sortKey` state from loaded
  `avatars.pref_layout` / `pref_sort` (default `grid` / `recent` if no avatar
  row yet).
- On layout toggle: upsert `pref_layout` immediately.
- On sort change: upsert `pref_sort` (debounced ~400ms to avoid a write per
  rapid change). Reuse the existing `avatars` upsert shape
  (`src/App.jsx:1133`); upsert keyed on `user_id`, preserving existing avatar
  fields (partial upsert or merge so prefs don't clobber name/colors).
- Write failures log quietly and never block the UI (the in-session state is
  the source of truth for the session).

## Error handling & fallbacks

- Cover missing / fetch fails / sample throws → `genreFallbackColor`, no DB
  write, no crash.
- `spine_color` write fails → keep the sampled color in session, log to console,
  retry opportunistically next session (still null in DB).
- Empty library in spine view → "This bookcase stands empty. / Inscribe a tome
  to begin the collection."
- Avatar row absent (user never customized) → prefs default to grid/recent; the
  first pref write creates the row via upsert.
- `ResizeObserver` unsupported → fall back to a fixed `perRow = 10` and a window
  resize listener.

## Testing (QE bar — list cases alongside the code)

Pure functions are unit-testable without React:

- `sortBooks`:
  - each key orders correctly; equal-key items keep recent order (stability);
  - empty list and single item;
  - missing/null `overall`/`smut` treated as 0;
  - mixed-case author/title sorts case-insensitively.
- `matchesQuery`:
  - matches on title, author, and any genre; case-insensitive;
  - empty query matches everything; whitespace-only query matches everything;
  - no match returns false; partial substring matches.
- `genreFallbackColor`: each genre regex maps to its color; unknown genre →
  deterministic hsl from title hash (same title ⇒ same color).
- `hashStr`: deterministic; different strings ⇒ (practically) different hashes.

Behavioral / manual (Chrome):
- Lazy backfill writes `spine_color` exactly once per existing book; reload
  shows stored color with no pop; a book never resamples after persist.
- Add a book → `spine_color` present in the insert; change a cover → resampled.
- Sampling failure path → genre fallback, no broken DB write.
- Grid search hides non-matches and reflows; spine search dims, no reflow.
- Sort + layout round-trip across reload and across a second device/browser.
- Responsive: shelf boards stay aligned under rows at 360px, 768px, 1024px.

## Out of scope (explicitly deferred)

- **Audiobooks** (Feature #3): `formats` / `audioHours` / listening card / 🎧
  filter. Spine audio-ring markup is present but dormant.
- **Conjure sample tomes**: demo-only generator; skipped (would write fake rows
  to a real account).
- Virtualized rows + A–Z jump rail for very large libraries (future TODO).
- Note `source` ("kindle" badge) / `isTime` persistence — bundled with the
  audiobook migration later.
