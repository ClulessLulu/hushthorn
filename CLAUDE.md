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

## Commands

- `npm run dev` — Vite dev server (use Chrome: voice + barcode features are Chrome/Edge only)
- `npm run build` — production build; must pass before considering work done

## Architecture facts

- All Claude API calls go through the single `callClaude()` helper. Never call
  the API inline; never put an API key in client code. Production path is the
  Express proxy (same pattern as Kindled, port 3001).
- Model for in-app AI calls: `claude-sonnet-4-20250514`. AI responses are
  requested as strict JSON; always parse defensively (strip ``` fences, slice to
  outermost `[`...`]` or `{`...`}`) and fail quietly with a manual-entry fallback.
- Open Library is the book data source. Covers: `covers.openlibrary.org/b/id/{cover_i}-{S|M}.jpg`.
  Subject tags are noisy — always run them through `cleanGenres()`.
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
  the same icon again to clear to 0.

## Conventions

- Sharp corners (`rounded-sm`/`rounded-md`), never large radii.
- New features get graceful fallbacks: camera blocked → photo upload; speech
  unsupported → typed notes; AI call fails → manual fields. Never a dead end.
- Quality bar: the developer is a QE — when adding parsers or merge logic,
  list the test cases (especially idempotency and malformed input) in the PR
  or alongside the code.
