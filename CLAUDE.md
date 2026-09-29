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

- `src/App.jsx` — the entire app in one ~5.5k-line file: all components, helpers
  (`callClaude`, `cleanGenres`, `noteFingerprint`), the shared `Overlay` modal,
  and the `FONT_CSS` `<style>` block. `fetchByIsbn` is a local helper inside
  `AddBookModal`, not a top-level one. Navigate by search.
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

## Deferred / future ideas

Most prototype-era features are shipped: spine shelf, per-format reading
progress, snap-to-update, hybrid save, and the shared library (built as the
**union model** — an archive merges members' personal libraries through two
SECURITY DEFINER views; the old Phase-2 `book_personal_state`/`book_ownership`
design was superseded and dropped). Genuinely unshipped:

- **Spine shelf at scale** — A–Z jump rail for author sort at 100+ books; row
  virtualization for very large shelves. (The spine shelf itself, cover-sampled
  spine colors, and the `spine_color` column are already shipped.)

- **Cathedral spine shelf** — designed, NOT built yet. Plan:
  `docs/superpowers/plans/2026-09-29-cathedral-spine-shelf.md` (read it first).
  Art spec + v1 asset audit (which images are swaps vs overlays):
  `docs/CATHEDRAL_ART_SPEC.md`. Runtime assets: `public/cathedral/*.webp`
  (optimized; sources in `output/cathedral-v1/`, never load those at runtime).
  Behavior reference: `prototype/cathedral/` (design-canvas files — port the
  logic in their `class Component` script, not the markup). Spines view only;
  Covers view unchanged; unlock progress is private per reader. Plan Task 8
  covers the "Spine shelf at scale" item above.

- **The Visage (avatar creation)** — BUILT, shipped **dormant** behind the
  `VISAGE_ENABLED` flag (`src/App.jsx`, currently `false`). Gallery + Atelier +
  seal-to-Storage are implemented and integrated; the flag hides the editor UI
  and forces the `❦` avatar placeholder everywhere. To launch: flip
  `VISAGE_ENABLED = true`, drop the broad `co-members read avatars` policy,
  redeploy, then verify a co-member `select traits from avatars` returns 0.
  Spec with structural rules, schema, locked verbiage, and test cases:
  `docs/VISAGE_SPEC.md`. Asset pipeline: `docs/VISAGE_PROMPT_TEMPLATES.md`
  (painterly PNG path) + `docs/VISAGE_FIGMA_SETUP.md` (vector SVG path).
  Reference UI: `prototype/hushthorn-visage.jsx` (placeholder art; the
  architecture is the deliverable). Summary: two modes — Gallery (preset
  portraits from Storage) and Atelier (layered builder) — across three forms:
  **The Rose** (feminine) / **The Thorn** (masculine) / **The Vine**
  (non-binary). Build Gallery (Phase 1) first; Atelier facial pickers
  (eyes/nose/mouth) are implemented in the prototype but stay feature-flagged
  off until Phase 3 art exists. Key rules: the 9-layer stack order is fixed;
  form never restricts traits (shapes silhouette + curates presets only);
  "Seal the Likeness" flattens to one PNG — upload to Storage BEFORE updating
  the `avatars` row (extend the existing table: `form`, `traits jsonb`,
  `image_path`, `preset_name`), and the app displays only the flattened image.
  `avatars` RLS stays owner-only; if archive members should see each other's
  avatars beside shared books, grant a narrow read on `image_path` only —
  never `traits` (route it through the union-model views, same discipline as
  the shared library).

See also `docs/TODO.md` (richer signup + 2FA) and `README.md` "Known TODOs"
(enable Supabase leaked-password protection before real users).

## Naming note

The prototype calls the heat rating **Spicy** with chili-pepper icons; the repo
renamed it to **Smoulder** with candle icons (`smut` column unchanged). When
porting prototype code, translate Spicy/chili → Smoulder/candle.
