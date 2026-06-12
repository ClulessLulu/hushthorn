# Hushthorn — Prototype Spec

Feature inventory and design decisions from the prototyping phase (Claude.ai
artifact sessions, June 2026). The reference implementation is
`prototype/hushthorn-demo.jsx`. Where the repo has diverged, the repo wins —
update this doc when decisions change.

## Product summary

Gothic book-cataloging app: track owned/wishlist/read/unread books, rate them
on two axes (overall quality + spice), keep notes anchored to pages or audio
timestamps, capture notes by voice, add books by search/photo/live-scan, get
AI recommendations from your own library, and mirror Kindle highlights without
duplicate effort.

## Theme

- Background: near-black `#0c0714` with violet cathedral glow (top) and magenta
  candle glows (bottom corners). Fixed ornamental frame around the viewport
  (`.ht-frame`): thin rose-pink line + inner violet echo, rounded corners.
- Cards: blue-violet gradient (`rgba(38,23,64) → rgba(17,10,30)`), pink-tinted
  borders that brighten + glow on hover.
- Wordmark: "Hushthorn" (capital H) in **Rozha One**, vertical gradient
  pink-200 → fuchsia-500, fuchsia drop-shadow glow, filigree crown SVG above,
  diamond ornament divider (─ ◆ ─) below.
  - Font journey, for the record: UnifrakturMaguntia → Pirata One →
    Grenze Gotisch → UnifrakturCook → girlie-gothic sampler → modern-gothic
    sampler → **Rozha One** (chosen). The brand artwork (gothic library with
    crowned H monogram) is the intended app icon / splash asset.
- Headings/labels: Cinzel, uppercase, tracked. Body: EB Garamond.
- Themed verbiage: add = "Inscribe", books = "tomes", notes = "Marginalia",
  delete note = "strike out", remove book = "Banish from the archive",
  recommendations = "The Oracle", Kindle pairing = "The Binding".

## Data model (prototype shape)

```js
book = {
  id, title, author, year,
  coverUrl,            // remote URL or data: URL (photo/capture)
  genres: [string],    // max ~6
  formats: ["print"|"ebook"|"audio"],  // default ["print"]; absent ⇒ print
  audioHours, audioListened,           // decimal hours, audio only
  shelf: "owned" | "wishlist",
  read: boolean,
  overall: 0-5,        // Verdict (swords)
  smut: 0-5,           // Spicy (peppers)
  notes: [{
    id, page,          // page number, "loc 1234", or timestamp string
    isTime: boolean,   // true ⇒ page field holds an audio timestamp
    isQuote: boolean,  // renders as styled quote vs plain note
    text, isVoice,     // isVoice: captured via speech
    source,            // "kindle" for imported highlights
    date,
  }],
}
```

Key invariant: one entry per book (title-matched, case-insensitive), formats as
attributes — never duplicate a book per format.

## Features

### Library views
- **Cover grid** (default): 2–4 col cards with cover, genre chips (max 2),
  read-only meters, shelf/read/audio/notes badges.
- **Spine shelf** (toggle): books as vertical spines on wooden shelf boards,
  ~14 per row. Spine width/height vary deterministically (hash of title/author).
  Spine color: sampled from cover pixels (averaged, darkened, cached) with
  genre-palette fallback (vampires=wine, fae=indigo, witches=violet, etc.),
  else stable hue from title hash. Verdict gem at head (gold = 5 swords),
  spice band at foot (pink intensity = level), hollow cyan ring = audio.
  Unread spines sit proud of the row; wishlist spines are ghosted + dashed.
  Hover eases the spine out; click opens detail.
- **Controls bar**: Covers/Spines toggle, sort picker (recent / author / title /
  verdict / spice), search that *dims* non-matches (no reflow) in both layouts.
- **Shelf filter ribbons**: All / Owned / Wishlist / Read / Unread / 🎧 Audio.
- Demo affordance: "Conjure 60 sample tomes" generates fake books for density
  testing (ids prefixed `conj-`; banishable).

### Ratings
- Verdict: 5 sword icons (periwinkle). Spicy: 5 chili icons (rose-red).
- Tap current value to clear to 0. Caption copy: "One sword: barely worth its
  steel. Five: a masterwork. One pepper: a longing glance. Five: do not read
  in the chapel."

### Notes / Marginalia
- Page or 🎧 timestamp reference (toggle in form; defaults to time for
  audio-format books), "this is a quote" checkbox (renders italic EB Garamond
  with pink rule), voice capture via Web Speech API (Chrome/Edge; pulsing
  recording state; graceful fallback message), imported notes wear a "kindle"
  badge.

### Adding books ("Inscribe a Tome")
1. **Search the archives**: Open Library `search.json` (general `q`), shows
   covers + cleaned genre chips per result, + Owned / + Wishlist buttons.
2. **Add with a photo**: upload cover → Claude vision reads title/author
   (strict JSON, nulls when unsure) → auto-fills → auto-runs genre divination.
   Scan failure ⇒ clear message + manual fields.
   - "✨ Divine details" button (enabled when title present): Claude fills
     author (only if empty) + genres; Open Library cover fetched if none.
   - Genres are removable chips + add-input (Enter/comma/Add), max 6,
     case-insensitive dedupe.
3. **Live scan**: getUserMedia camera preview; BarcodeDetector watches for
   EAN-13 (978/979 ISBN) → Open Library ISBN lookup → prefilled form; or
   "Capture cover" grabs a frame → same vision flow. Sandbox/browser fallbacks
   at every step. (Expo: expo-camera + barcode scanning.)

### The Oracle (AI recommendations)
- Sends full library (title, author, genres, shelf, read, verdict, spicy) to
  Claude; asks for exactly 5 real books NOT in the library, strict JSON:
  `{title, author, genre, reason, spice}`. Reasons must reference the user's
  taste. Covers fetched best-effort per rec. "+ Wishlist" adds with genre;
  duplicate titles show "In your archive". Re-consult uses current shelves.

### The Binding (Kindle pairing)
- **My Clippings.txt**: parses `==========`-separated entries, Title (Author)
  line, page/location meta; highlights ⇒ quotes, notes ⇒ plain, bookmarks
  skipped. Books marked Owned + Read.
- **Goodreads CSV** (Papa Parse): read shelf ⇒ Read, to-read ⇒ Wishlist,
  currently-reading ⇒ Owned/Unread, star ratings ⇒ Verdict (fill-if-empty).
  Series suffixes trimmed from titles.
- **Notebook export** (per-book, from Kindle app): HTML variant (DOM-parsed:
  .bookTitle/.authors/.noteHeading/.noteText) and CSV variant (header-row
  detection + preamble title/author). All highlights import as plain quotes
  (user does not use highlight colors semantically — decided 2026-06).
- **Merge engine**: title-matched; existing books are updated (read status,
  shelf upgrade to owned, fill-empty rating/genres/cover), new books added with
  best-effort covers+genres (first 12 lookups capped). Highlights dedupe by
  `noteFingerprint()` (lowercase, punctuation+whitespace normalized) so
  re-imports are idempotent across sources.
- **Import report**: "N new tomes bound · N updated · N new highlights
  inscribed · N already mirrored" / "Everything … already mirrored — the
  archive is current."
- Preview-before-import with per-book checkboxes and "already in archive —
  will update" flags.
- Future (real app): inbound email import (Readwise pattern), share-sheet
  capture of single highlights, desktop USB watcher. Browser-extension scrape
  of read.amazon.com deliberately deprioritized (ToS risk).

### Audiobooks
- `formats` toggle in detail panel ("I have the audio").
- Listening card: hours listened / total hours (decimals), cyan→pink progress
  bar, "% through the telling".
- Indicators: cyan hours badge on cards, hollow cyan ring on spines, hours in
  spine tooltip. 🎧 Audio shelf filter.
- Open question: should 100% listened auto-suggest marking Read?

## Environment notes

- Artifact sandbox blocked external `<img>` → `CoverImage` component fetches
  bytes → data URL, with session cache + placeholder fallback. Unneeded in
  Expo; optional simplification on web.
- Claude API: keyless only inside artifacts. Local/prod uses `callClaude()`
  with proxy URL or (dev only) `VITE_ANTHROPIC_API_KEY` +
  `anthropic-dangerous-direct-browser-access`.
- Voice (Web Speech API) and BarcodeDetector: Chrome/Edge only — always keep
  fallbacks.

## Known TODOs

- Supabase: auth, books/notes persistence, then error boundaries + security
  pass (mirrors Kindled's plan).
- Split single-file app into modules (`components/`, `lib/claude.js`,
  `lib/openLibrary.js`, `lib/imports.js`).
- A–Z jump rail for author-sorted spine view at 100+ books; virtualized rows.
- Spine view: evaluate stronger unread affordance; optional progress on spine.
- Structured timestamp input (h/m/s) vs free text — decide after use.
- Claude-assigned genres as fallback when Open Library subjects are junk.
- Precompute + persist spine colors at add-time (avoid client sampling).
- Test suite priorities (QE): import idempotency (same file twice ⇒ zero new),
  fingerprint collisions/punctuation variants, malformed clippings/CSV/HTML,
  AI JSON parse failures, cover fetch failures, camera/speech permission
  denials.
