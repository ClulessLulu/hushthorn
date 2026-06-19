# CLAUDE.md — Hushthorn

Gothic book-cataloging app for spicy/romantasy readers. Currently a Vite + React
web prototype; planned to become a React Native (Expo Router) app with Supabase,
living alongside the developer's other app, Kindled.

## Source of truth

- The repo's current code wins over any docs when they conflict.
- `prototype/hushthorn-demo.jsx` is the reference implementation from the design
  phase — port features from it, don't treat it as the live app.
- Full feature inventory and design decisions: `docs/PROTOTYPE_SPEC.md`. Read it
  before implementing or modifying any feature listed there.

## Project structure

- `src/App.jsx` — the entire app in one ~3.3k-line file: all components, helpers
  (`callClaude`, `cleanGenres`, `noteFingerprint`, `fetchByIsbn`), the shared
  `Overlay` modal, and the `FONT_CSS` `<style>` block. Navigate by search.
- `src/main.jsx` — entry; renders `<App/>` in `<React.StrictMode>` (double-invokes
  effects in dev — keep imperative setup like camera start idempotent).
- `src/lib/supabase.js` — Supabase client. `src/index.css` — Tailwind entry.
- `.claude/agents/` — the project's 7 specialist subagents.

## Commands

- `npm run dev` — Vite dev server (use Chrome: voice + barcode features are Chrome/Edge only)
- `npm run build` — production build; must pass before considering work done
- Env (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional
  `VITE_ANTHROPIC_API_KEY` for AI features in local dev.

## Architecture facts

- All Claude API calls go through the single `callClaude()` helper (top of App.jsx).
  It currently calls `api.anthropic.com` directly from the browser via
  `VITE_ANTHROPIC_API_KEY` (dev only). A server-side proxy (Kindled's Express
  pattern, port 3001) is the intended production path but is NOT built yet — don't
  assume it exists. Never ship the key in a production client.
- Backend is Supabase (already live, not just planned): auth + Postgres tables
  `books`, `notes`, `avatars`, all RLS owner-only (`user_id = auth.uid()`). Schema
  changes go through the Supabase MCP (no local migrations folder).
- Model for in-app AI calls: `claude-sonnet-4-6`. AI responses are
  requested as strict JSON; always parse defensively (strip ``` fences, slice to
  outermost `[`...`]` or `{`...`}`) and fail quietly with a manual-entry fallback.
- Book data: Google Books (`googleapis.com/books/v1/volumes`) is the primary
  search; Open Library is used for ISBN lookups + cover fallback. Covers: Google
  Books `imageLinks.thumbnail` (https-ify) or `covers.openlibrary.org/b/id/{cover_i}-M.jpg`
  — the OL ISBN endpoint without `?default=false` serves a blank placeholder, not
  a 404. Subject tags are noisy — always run them through `cleanGenres()`.
- Books are unique by title (case-insensitive) — one entry per book, with a
  `formats` array (print/ebook/audio), never duplicate entries per format.
- Imported highlights dedupe by `noteFingerprint()` (normalized text hash).
  Re-importing the same file must be idempotent — preserve this invariant.

## Design system (do not drift)

- Palette: near-black `#0c0714` bg, blue-violet cards, fuchsia/pink accents,
  cyan reserved for audio features. Tailwind utility classes + the `ht-*`
  custom classes in the FONT_CSS block.
- Fonts: Rozha One (wordmark "Hushthorn"), Cinzel (headings/labels, uppercase),
  EB Garamond (body). Gothic-but-modern; no blackletter.
- Voice: themed copy ("Inscribe", "tome", "marginalia", "The Oracle",
  "The Binding") but error messages always state clearly what to do next.
- Ratings: Verdict = 5 swords (overall), Smoulder = 5 candles (spice/heat). Tap
  the same icon again to clear to 0. DB fields: `overall` = Verdict, `smut` = Smoulder.

## Conventions

- Sharp corners (`rounded-sm`/`rounded-md`), never large radii.
- Modals use the shared `Overlay` (caps height at `max-h-[92dvh]`). Don't reuse
  the `ht-bg` class on a modal card without `!min-h-0` — `ht-bg` carries
  `min-height:100vh`, which overrides the cap and breaks modals on mobile.
- New features get graceful fallbacks: camera blocked → photo upload; speech
  unsupported → typed notes; AI call fails → manual fields. Never a dead end.
- Quality bar: the developer is a QE — when adding parsers or merge logic,
  list the test cases (especially idempotency and malformed input) in the PR
  or alongside the code.

## Features to add

Designed and working in `prototype/hushthorn-demo.jsx` — port from there.
(Already shipped in the repo: The Oracle, The Binding, audiobooks — don't rebuild.)

- **Spine shelf view** — a toggleable library layout (alongside the cover grid)
  rendering books as vertical spines on wooden shelves, for browsing 100+ titles
  without endless scroll. Procedural spines: width/height from a stable hash of
  title+author; color sampled from cover pixels (averaged, darkened, cached) with
  a genre-palette fallback, else a title-hash hue. Verdict gem at the head, spice
  band at the foot, hollow cyan ring = has audio. Unread spines sit proud of the
  row; wishlist spines are ghosted + dashed. Controls bar: Covers/Spines toggle,
  sort (recent/author/title/verdict/smoulder), and search that *dims* non-matches
  rather than reflowing. Prototype refs: `Spine`, `SpineShelf`, `useSpineColor`,
  `sampleCoverColor`, `genreFallbackColor`, `matchesQuery`.
  - Real-app TODOs deferred from the prototype: A–Z jump rail for author sort at
    100+ books; row virtualization; precompute + persist spine colors at add-time
    (a `spine_color` column) instead of sampling client-side every render.

- **Per-format reading progress** — progress tracked separately per format on a
  `book.progress` object keyed by format: `print {page, pages}`, `ebook {percent}`,
  `audio {listened, hours}`. So one book read in print AND audio keeps two
  independent bars. `formatPercent(book, fmt)` → 0-100 per format; `maxPercent`
  for furthest overall; `activeProgress(book)` returns the furthest *unfinished*
  format `{fmt, pct}` — this is what spines/cards surface, so a half-finished
  audiobook still shows even when the print copy is done (do NOT gate the spine
  fill on `book.read`). Any format hitting 100% auto-marks the book Read
  (centralize in the book-update path so every progress source triggers it).
  Progress bars colored by format (violet print / indigo ebook / cyan audio) on
  cards, in the detail panel, and as a rising edge-glow on spines. Detail-panel
  editor has number fields + quick bump buttons + a 0-100 slider per format.
  Prototype refs: `formatPercent`, `maxPercent`, `activeProgress`, `FORMAT_META`,
  `ProgressEditor`. DB: add `progress jsonb` to `books`.
  - Decided: 100% auto-marks Read (no confirm). Schema migration via Supabase MCP.

- **Snap-to-update progress (AI capture)** — reuses the vision pipeline: user
  snaps a photo/screenshot of their Kindle, Libby, or audiobook player; Claude
  reads it and writes into that format's progress. Per-format prompt (hours for
  audio; percent-preferred-else-page for reading), strict-JSON parse with the
  standard defensive slice, manual-entry fallback when unreadable. Frame it
  honestly as "Snap to update," never "sync" — there is no sanctioned Kindle/
  Libby progress API (verified June 2026; camera capture is the state of the art).
  Prototype refs: `readProgressShot`, `handleSnap` inside `ProgressEditor`.
  - Out of scope (and why): automatic Kindle/Libby/Audible progress sync — no
    public API; browser-extension scraping of read.amazon.com breaks constantly
    and risks ToS. Don't promise it in UI.

## Naming note

The prototype calls the heat rating **Spicy** with chili-pepper icons; the repo
renamed it to **Smoulder** with candle icons (`smut` column unchanged). When
porting prototype code, translate Spicy/chili → Smoulder/candle.
