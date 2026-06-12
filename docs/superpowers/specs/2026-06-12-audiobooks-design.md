# Audiobooks (Feature #3) — Design

Porting the audiobook feature from `prototype/hushthorn-demo.jsx` (DetailPanel
listening card ~lines 1799-1872) and `docs/PROTOTYPE_SPEC.md` "Audiobooks"
section into the live Supabase app (`src/App.jsx`), adapting to the persisted
data model. The repo wins where it diverges.

## Decisions locked during brainstorming

1. **Format model**: a `books.formats text[]` column (default `{print}`), not a
   boolean. Matches the prototype's `formats.includes("audio")` checks (spine
   ring, tooltip, filter) verbatim — no rewrites — and preserves the spec's
   "one entry per book, formats as attributes, never duplicate per format"
   invariant.
2. **100% behavior**: a **gentle nudge**, never automatic. When an audiobook is
   fully listened and not yet read, the listening card shows a one-tap
   "Finished the telling — mark as Read?" prompt. The user stays in control.
3. **Audio-timestamp notes**: free-text timestamp (e.g. `3:45:12`), not
   structured h/m/s. Persist a new `notes.is_time` column.
4. **Timestamp input is audiobook-only**: the page ⇄ 🎧-time toggle appears in
   NotesSection ONLY when the book has the `audio` format. Print / e-book / all
   Kindle imports use page (or location) input with no toggle and
   `is_time = false`. E-book readers track location/page, not time.
5. **`source` (kindle badge) persistence stays deferred** — only the Kindle
   import feature writes it; adding the column now would be dead weight. Out of
   scope.

## Migrations (two, additive/safe, via Supabase MCP apply_migration)

```sql
-- Migration "add_audio_formats": format + audio progress on books
ALTER TABLE books ADD COLUMN formats text[] NOT NULL DEFAULT '{print}';
ALTER TABLE books ADD COLUMN audio_hours    numeric;   -- nullable, decimal hours
ALTER TABLE books ADD COLUMN audio_listened numeric;   -- nullable, decimal hours

-- Migration "add_note_is_time": time-anchored marginalia
ALTER TABLE notes ADD COLUMN is_time boolean NOT NULL DEFAULT false;
```

`formats` is NOT NULL with a default so existing rows backfill to `{print}`
automatically. `audio_hours`/`audio_listened` are nullable (unset until the user
enters them). `is_time` defaults false so existing/imported notes stay
page-based. RLS already restricts `books`/`notes` to the owning `user_id`; new
columns inherit row-level access — no policy changes.

## Data layer (src/App.jsx)

- **books fetch mapping** (in the data-load `useEffect`, the
  `setBooks((booksData||[]).map(...))` object): add
  `formats: b.formats || ['print']`, `audioHours: b.audio_hours`,
  `audioListened: b.audio_listened`.
- **notes fetch mapping** (the `notesByBook[...].push({...})` object in the same
  effect): add `isTime: n.is_time`.
- **updateBook FIELD_MAP** (the `const FIELD_MAP = {...}` inside `updateBook`):
  add `formats: 'formats'`, `audioHours: 'audio_hours'`,
  `audioListened: 'audio_listened'`.
- **addBook insert** (`supabase.from('books').insert({...})` in `addBook`): add
  `formats: book.formats || ['print']`, `audio_hours: null`,
  `audio_listened: null`. (New search/photo/scan adds are print by default;
  audio is toggled on later in the detail panel.)
- **note insert** (`updateBook`, ~line 799 — the `added` note branch inside the
  `'notes' in patch` diff): add `is_time: added.isTime ?? false` to the
  `supabase.from('notes').insert({...})` payload. `NotesSection.addNote`
  (~line 2941) must include `isTime` on the new note object it pushes into the
  `onUpdate({ notes })` array so it flows through.
- **importBooks** (~line 362): new books default `formats: ['print']`; imported
  notes set `isTime: false` (page/location based). No timestamp inference.

## UI components (src/App.jsx, single-file structure preserved)

### DetailPanel — format toggle
A `ToggleRow` in the left column (after the Read toggle):
- label: `formats.includes("audio") ? "Audiobook 🎧" : "No audio copy"`
- action: `formats.includes("audio") ? "Remove audio" : "I have the audio"`
- onClick: toggle `"audio"` membership in `formats` via
  `onUpdate({ formats: next })` where next adds/removes "audio" from
  `book.formats || ["print"]`.
- Removing audio keeps `audio_hours`/`audio_listened` (re-adding restores them).

### DetailPanel — Listening card
Rendered only when `formats.includes("audio")`, below the ratings card
(cyan accent per design system — cyan is reserved for audio):
- Header: "Listening 🎧" (cyan).
- Two number inputs (`min=0 step=0.1`): hours listened "of" total hours, each
  `onChange` clamps `Math.max(0, parseFloat(e.target.value) || 0)` and calls
  `onUpdate({ audioListened })` / `onUpdate({ audioHours })`.
- When `audioHours > 0`: cyan→pink progress bar at
  `min(100, (audioListened/audioHours)*100)%` and caption
  "{rounded}% through the telling".
- **Gentle nudge**: when `audioHours > 0 && audioListened >= audioHours &&
  !book.read`, show a one-tap button "✨ Finished the telling — mark as Read?"
  that calls `onUpdate({ read: true })`. It disappears once read is true (or if
  the condition stops holding); no auto-marking, no dismissal state needed.

### Cover grid card — audio badge
In the grid card badges row, when `formats.includes("audio")` add a cyan badge:
`🎧 {audioListened||0}h / {audioHours}h` when `audioHours` is set, else `🎧 Audio`.

### Spine — audio ring (no code change)
The Spine already renders a hollow cyan ring gated on
`book.formats?.includes("audio")` and includes audio info in its tooltip. Once
`formats` flows from the fetch mapping, the ring activates automatically.

### Shelf ribbon — 🎧 Audio filter
- Add `{ key: "audio", label: "🎧 Audio" }` to `shelfTabs` (~line 505).
- Extend the `filtered` shelf logic with: `if (shelfFilter === "audio") return
  (b.formats || []).includes("audio")`.

### NotesSection — page ⇄ time toggle (audiobook-only)
- Compute `isAudio = (book.formats || []).includes("audio")`.
- When `isAudio`: render a page/🎧-time segmented toggle controlling a local
  `isTime` state; default `isTime` to true for audiobooks. The reference input
  placeholder/label switches between "Page" and "🎧 Timestamp (e.g. 3:45:12)".
  The field stores free text either way (the existing `page` field already holds
  arbitrary strings like "loc 1234").
- When `!isAudio`: page (or location) input only, no toggle, `isTime` stays
  false. Unchanged from current behavior.
- On save, pass `isTime` through so the note insert persists `is_time`.
- Rendering a note: when `note.isTime`, prefix the reference with 🎧 (e.g.
  "🎧 3:45:12") instead of "p. {page}".

## Error handling / fallbacks

- `audioHours` null or 0 → no progress bar, no nudge.
- Non-numeric input → clamped to ≥ 0 (existing prototype pattern).
- A book with no `formats` (shouldn't happen post-migration) → treated as
  `["print"]` via `book.formats || ["print"]` guards everywhere.
- onUpdate write failure for audio fields → handled by the existing updateBook
  error path (logs, local state already optimistic); never blocks the UI.
- Toggling audio off then on → hours preserved (we never clear them).

## Testing (QE bar — list cases alongside the code)

Pure / logic cases:
- formats toggle: print → [print, audio] → back to [print]; idempotent; never
  duplicates "audio"; never drops "print".
- progress %: 0 when hours 0/null; clamps to 100 when listened > total;
  rounds for the caption.
- nudge visibility: shows only when audioHours>0 && listened>=total && !read;
  hides at read=true; hides when listened<total.
- audio filter: returns only books whose formats include "audio"; composes with
  sort + search (from the prior feature).
- note is_time: audiobook note saved with isTime=true persists is_time=true;
  non-audio note persists is_time=false; toggle only present for audiobooks.

Data-layer:
- migrations: books.formats text[] NOT NULL default {print}; audio_hours /
  audio_listened numeric nullable; notes.is_time boolean NOT NULL default false.
- existing rows backfill to formats {print}; existing notes is_time=false.
- RLS unchanged (owner-only by user_id).
- round-trip: set audio + hours, reload → values persist; add audiobook note
  with timestamp, reload → renders with 🎧 prefix.

Manual (Chrome):
- listening card appears/disappears with the format toggle; progress bar color
  + width; nudge tap marks read and the prompt vanishes.
- grid badge + spine ring show for audiobooks; 🎧 filter ribbon works.
- NotesSection toggle present only for audiobooks; defaults to time; Kindle
  imports remain page/location based.

## Out of scope (deferred)

- `ebook` format value (no UI yet; the formats array can hold it later).
- Note `source` / "kindle" badge persistence (belongs to the import feature).
- Structured h/m/s timestamp input (spec says decide after use — revisit later).
- Auto-suggesting Read from listening progress beyond the explicit nudge.
