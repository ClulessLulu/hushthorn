# Reliable Scanner + Unified Scan/Upload + Multi-Book — Design

Fixes the unreliable live ISBN scanner and reorganizes book-adding in
`src/App.jsx` `AddBookModal` (currently three modes: `search` / `photo` /
`live`, ~lines 1834-2490). Target: mobile **and** web.

## Problem

Live scanning relies solely on the browser's native `BarcodeDetector`
(`src/App.jsx` ~2121), which is absent on iOS Safari and inconsistent on
desktop, and the camera opens with no resolution/focus constraints (~2107), so
barcodes are often unreadable even where the API exists. Failures are silent
(~2142). Photo upload and live camera are also split across two tabs despite
being the same intent ("capture a physical book").

## Decisions locked during brainstorming

1. **Two tabs**, not three or one combined screen: **"Search"** (unchanged typed
   search + results) and **"Scan or upload"** (merges Photo + Live). Default tab
   adapts by platform: coarse-pointer/touch + narrow viewport → Scan; else
   Search.
2. **Decoding is native-first + lazy ZXing fallback**: use `window.BarcodeDetector`
   when present; otherwise dynamically `import('@zxing/browser')` only when a
   fallback scan starts (no main-bundle bloat).
3. **Multi-book batch** via a "Scan multiple" toggle: barcode-only rapid queue,
   camera keeps scanning, de-dupes, flags already-in-library; finish with one
   shelf for the whole batch ("Add N to Owned ▾", default Owned).
4. Cover-capture (Claude OCR) and photo upload remain **single-book** (they need
   per-book review); hidden while "Scan multiple" is on.

## New dependency

- `@zxing/browser` (pulls `@zxing/library`). **Dynamically imported** inside the
  decoder helper so it is fetched only when the native API is unavailable and a
  scan actually begins. Never in the initial bundle.

## Architecture

### Mode set
`AddBookModal` mode state changes from `"search" | "photo" | "live"` to
`"search" | "scan"`. The `search` branch is unchanged. The `photo` and `live`
branches are replaced by one `scan` branch with two sub-states (below).

### Platform default tab
On mount, default `mode` via a small check:
`const prefersScan = window.matchMedia('(pointer: coarse)').matches &&
window.matchMedia('(max-width: 640px)').matches;` → `prefersScan ? 'scan' :
'search'`. (Coarse pointer + narrow viewport ≈ phone.)

### `useBarcodeScanner` helper (new)
A hook/util encapsulating decode strategy so the component does not branch on
platform:

```
start(videoEl, onIsbn):
  if ('BarcodeDetector' in window):
     detector = new BarcodeDetector({ formats: ['ean_13'] })
     loop every 500ms: detector.detect(videoEl) → emit matching ISBNs
  else:
     const { BrowserMultiFormatReader } = await import('@zxing/browser')
     reader.decodeFromVideoElement(videoEl, result => emit result)
stop(): clear loop / reader.reset()
```

- ISBN gate (shared): `/^97[89]\d{10}$/` on the raw value.
- On any decode error: keep scanning silently, but surface a one-time "having
  trouble reading — hold steady or tap Capture cover" hint after a few seconds.

### Camera constraints (quality fix)
`getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 },
height: { ideal: 720 } } })`. After the stream starts, best-effort
`track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })` inside a
try/catch (unsupported tracks ignored). Falls back gracefully to whatever the
device provides.

## "Scan or upload" tab — sub-states

### a) Capture state (camera live)
- Live `<video>` preview with a scan-line guide.
- **Auto barcode watch** via `useBarcodeScanner`.
- **"Scan multiple" toggle** (default off) — see Multi-book below.
- **📷 Capture cover** button → grabs the frame to a canvas → `scanCover(dataUrl)`
  (existing Claude OCR) → review state. *Hidden when Scan multiple is on.*
- **"Upload a photo instead"** → file input → existing crop modal → `scanCover`.
  *Hidden when Scan multiple is on.*
- Status line reflects real state ("Point at the barcode…", "Found ISBN … —
  looking it up", not-found, etc.).

### b) Review state (single book)
The existing details form — title/author typeahead, genre chips, cover-source
picker, **Inscribe to Owned / Wishlist** — reached after a single-mode barcode
hit, a cover capture, or an upload. A "↻ Scan another" control returns to
capture state. (This is today's `photo`-mode form, reused as-is.)

## Multi-book batch

State: `const [scanMultiple, setScanMultiple] = useState(false);` and
`const [queue, setQueue] = useState([]);` plus a `lastScanRef` (value + ts) for
cooldown.

Behavior when `scanMultiple` is **on** and a barcode is detected:
1. Cooldown/de-dupe: ignore if same ISBN as `lastScanRef` within 2000ms, or if
   the ISBN is already represented in `queue`.
2. **Refactor `lookupIsbn`**: today it fetches *and* mutates form state +
   switches mode (`src/App.jsx` ~2146). Split it into `fetchByIsbn(isbn) →
   { isbn, title, author, coverUrl, genres } | null` (pure fetch) and thin
   consumers: single mode applies the result to the review form (current
   behavior); batch mode pushes it to the queue. This avoids duplicating the
   Open Library fetch across the two contexts.
3. Already-in-library check: if a book with the same title (case-insensitive,
   per the app's title-uniqueness invariant) exists in `books`, push the item
   flagged `inArchive: true` (shown greyed, not inserted on "Add all").
4. Otherwise push to `queue`; brief confirmation (status text "📖 N queued" +
   optional short WebAudio beep). **Camera keeps scanning** (do not `stopCamera`).

Queue UI (under the camera): a header count ("N queued") and a scrollable list;
each row = small cover thumbnail + title + author, a remove ✕, and an "already
in archive" tag for flagged rows. Empty queue → helper text.

Finish control: **"Add {n} to [Owned ▾]"** where the dropdown switches the
target shelf (Owned default, Wishlist option). On tap, insert every non-flagged
queued book to the chosen shelf via the existing `addBook` path with
`spine_color: null` (lazy backfill colors them later — same approach as
`importBooks`, keeps batching fast). Then clear the queue and close, or stay in
capture state for another batch (close the modal after a brief "N tomes
inscribed" confirmation).

When `scanMultiple` is **off**: a barcode hit behaves as today — `stopCamera()`
then go to the single-book review state. Toggling the switch off mid-session
keeps the queue; toggling on re-enables rapid mode.

## Error handling / fallbacks

- Camera permission denied / no camera → capture state shows an **upload-only**
  panel with a clear message; Upload + crop + OCR still work; "Scan multiple"
  hidden.
- Neither `BarcodeDetector` nor ZXing usable (rare) → auto-scan disabled with a
  message; **Capture cover + Upload still function** (never a dead end).
- ISBN not found in Open Library → status message; in single mode stay scanning
  and suggest Capture cover; in multi mode skip silently with a brief "not found"
  toast and keep scanning.
- ZXing dynamic import fails (offline) → message + fall back to capture/upload.
- All existing camera cleanup (`stopCamera` on unmount / tab change) preserved;
  ZXing reader reset on stop.

## Reused vs changed vs removed

- **Reused unchanged:** `scanCover` (Claude OCR), crop modal, review form,
  typeahead, cover-source picker, `addBook`. The Open Library fetch logic inside
  `lookupIsbn` is reused (extracted into `fetchByIsbn`).
- **Changed:** mode set → `search | scan`; `startBarcodeLoop` replaced by
  `useBarcodeScanner` (native + lazy ZXing); camera constraints; tab UI; platform
  default; `lookupIsbn` split into `fetchByIsbn` (pure) + single/batch consumers.
- **Removed:** the standalone "Add with a photo" tab and the separate "Live scan"
  tab (folded into "Scan or upload").

## Testing (QE bar)

Pure / unit:
- ISBN gate `/^97[89]\d{10}$/`: accepts 9780xxxxxxxxx / 979xxxxxxxxxx; rejects
  12- and 14-digit, non-978/979, and EAN-5 supplements.
- Queue de-dupe: same ISBN within cooldown ignored; same ISBN already queued
  ignored; distinct ISBNs accumulate.
- Already-in-library: title-match (case-insensitive) flags `inArchive`, excluded
  from insert.
- Platform default: coarse+narrow → scan; fine pointer / wide → search.

Behavioral / integration:
- Decoder selection: native present → native loop; absent → ZXing lazily
  imported and decodes from the video element.
- Camera constraints applied; `focusMode` failure swallowed without breaking the
  stream.
- Fallback matrix: permission denied → upload-only; no decoder → capture/upload
  still work.

Manual (Playwright, throwaway account, like prior features):
- Single: scan barcode → lookup → review → inscribe → persists.
- Multi: toggle on → scan several → queue accumulates, dupes/in-archive handled →
  "Add N to Owned" inserts all → appear in library (Supabase rows).
- Upload: file → crop → OCR → review → inscribe.
- Camera-blocked path shows upload-only and still adds a book.

## Out of scope

- EAN-5 price supplements; per-book shelf assignment within a batch; a typed
  manual-ISBN field (could add later as a last-resort fallback); barcode formats
  other than EAN-13 (book ISBNs).
