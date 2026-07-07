# Hybrid Save Model — Implementation Spec

**Status:** Designed and approved. Reference prototype: `prototype/hushthorn-hybrid-save.jsx`

**Feature in one line:** Ratings, read/unread, shelf, and format toggles save
instantly on tap. Title, author, genres, progress, and notes buffer changes
behind a save bar that appears only when there's unsaved work. Applies to both
the **detail panel** (editing existing books) and the **Inscribe modal**
(adding new books).

---

## The split: what saves instantly vs. what buffers

### Instant save (no button, no bar)

These are *single-tap decisions* — one intent per interaction, low risk of
mistakes, and adding a Save button would just make them feel sluggish.

| Action | Why instant |
|--------|------------|
| Verdict (swords, 0–5) | A tap is the decision — no "editing session" |
| Smoulder (candles, 0–5) | Same as above |
| Read / Unread toggle | Binary, one tap |
| Shelf toggle (Owned ↔ Wishlist) | Binary, one tap |
| Format toggles (Print / Kindle / Audio) | Binary per format |

**Feedback:** a quiet "saved" flash animates next to the control that changed
(CSS `ht-saved-flash`, a 0.6s background fade from `rgba(168,139,250,0.35)`
to transparent). No toast, no modal — it confirms without interrupting flow.

### Buffered save (edit freely → Save or Discard)

These are *editing sessions* — the user types, adjusts, experiments, and
commits when satisfied. Buffering prevents half-finished edits from persisting
and lets the user back out cleanly.

| Field | Why buffered |
|-------|-------------|
| Title | Typos mid-edit shouldn't persist character by character |
| Author | Same |
| Genres (add/remove chips) | User may add several, remove one, reconsider |
| Progress (page/percent/hours) | Multi-field — page AND total pages updated together |
| Notes / Marginalia (new note text) | User might draft, rethink, discard |

**In the Inscribe modal specifically:** all fields are buffered because the
entire add flow is one editing session — nothing should persist until the user
taps "Inscribe to Owned" or "Inscribe to Wishlist." The modal's confirm
buttons ARE the save action; no separate save bar is needed inside the modal
since the inscribe buttons already serve that purpose.

## Dirty-state indicators

Three signals tell the user they have unsaved work. All three are required —
don't implement only one, because each catches a different attention pattern:

1. **Card border shifts to pink** (`border-pink-400/50`) — a peripheral visual
   change the user notices without reading anything.
2. **"Unsaved changes" badge** — a small `bg-pink-500/30 text-pink-200` pill
   next to the section heading. Explicit for users who didn't notice the border.
3. **Save bar slides up from the bottom** — the primary action surface. Only
   appears when `isDirty === true`; animates in with `ht-slide-up` (0.25s
   ease-out translateY). Contains two buttons:
   - **Discard changes** — reverts all buffered fields to their last-saved
     state. Style: `bg-purple-800/70`, understated.
   - **Save & Close** — persists all buffered fields in one write. Style:
     `bg-gradient-to-r from-fuchsia-500 to-pink-500`, prominent.

## Dirty detection

```js
const isDirty =
  title !== saved.title ||
  author !== saved.author ||
  JSON.stringify(genres) !== JSON.stringify(saved.genres) ||
  JSON.stringify(progress) !== JSON.stringify(saved.progress);
```

Use `JSON.stringify` for deep comparison on arrays/objects. This is simple and
correct for the small data shapes involved. For notes, compare the draft text
field (not the saved notes array — adding a note is a discrete action, not a
buffered edit of the array).

## Implementation notes

### Detail panel

- Instant-save fields call `updateBook(id, { [field]: value })` → Supabase
  immediately, same as today.
- Buffered fields update local component state only. On "Save & Close,"
  collect all dirty fields into one `updateBook(id, { title, author, genres,
  progress })` call — one Supabase write, not N.
- On "Discard," reset local state from the `book` prop (the last-saved values).
- On close (X button or backdrop click) while dirty: close without saving
  (same as Discard). Don't add a "you have unsaved changes" confirm dialog —
  it's a catalog app, not a document editor. The visual indicators are
  sufficient warning; a blocking dialog would feel heavy.
  - **Exception to reconsider later:** if user testing reveals people
    accidentally losing progress edits, add a lightweight "Discard unsaved
    changes?" confirm — but start without it.

### Inscribe modal

- Everything is buffered by nature — nothing exists in the database until the
  user taps "Inscribe to Owned" or "Inscribe to Wishlist."
- No save bar needed inside the modal; the Inscribe buttons ARE the commit
  action.
- On close (X or backdrop) while fields are filled: same rule as above — close
  silently. The user can re-open and start fresh.
- AI-filled fields (from cover scan or Divine Details) update the local
  buffer, not the database — the user reviews and commits via the Inscribe
  button, so AI suggestions are always human-confirmed before persisting.

### Interaction between instant and buffered

This is the subtle part: a user can tap swords (instant save) *while* having
unsaved text edits (buffered). Both must work independently:

- Instant saves fire immediately, regardless of dirty state on buffered fields.
- The save bar stays visible as long as buffered fields are dirty, even if
  instant saves happen in between.
- "Discard changes" only reverts buffered fields — it does NOT undo instant
  saves (swords, read status, etc.). Those are already persisted.
- The "saved" flash on instant actions continues to appear even when the save
  bar is visible — they're independent feedback channels.

## Supabase write optimization

Today's instant-save fires one Supabase `update` per field change. The hybrid
model doesn't change this for instant fields (the writes are infrequent — a
user taps swords once, not continuously). For buffered fields, the single
"Save & Close" call batches everything into one `update` — this is strictly
better than instant-save-everything, which would fire an update on every
keystroke or field blur.

## CSS / animation additions

```css
@keyframes ht-flash {
  0% { background: rgba(168,139,250,0.35); }
  100% { background: transparent; }
}
.ht-saved-flash { animation: ht-flash 0.6s ease-out; }

@keyframes ht-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.ht-save-bar { animation: ht-slide-up 0.25s ease-out; }
```

Add these to the `FONT_CSS` block alongside the existing `ht-pulse` and
`ht-recording` animations.

## Test cases

- [ ] Tap Verdict to 4 swords → "saved" flash appears → refresh page →
      value persists (instant save works)
- [ ] Edit title → "unsaved changes" badge + pink border + save bar appear
- [ ] Edit title → tap swords while bar is showing → swords save immediately,
      bar remains (independent channels)
- [ ] Edit title + genres → "Save & Close" → one Supabase write, both fields
      persist → bar disappears
- [ ] Edit title → "Discard changes" → title reverts to last saved value →
      bar disappears
- [ ] Edit title → close modal via X → reopen → title shows saved value, not
      the discarded edit (close = implicit discard)
- [ ] Inscribe modal: fill title + author via AI scan → close without
      inscribing → nothing in the database (buffered, not persisted)
- [ ] Inscribe modal: fill fields → "Inscribe to Owned" → book appears in
      library with all fields correct (the inscribe button is the save)

---

# Addendum — union model + resolved decisions (2026-07-07)

The original spec above predates the union-model shared library. This addendum
governs where they conflict.

## Which panels get hybrid save

| Panel | Behavior |
|-------|----------|
| **Personal detail** (`!book.owners`) | Full hybrid: instant fields + buffered fields + save bar |
| **Archive detail, my book** (`book.owners && book.mineBookId`) | Same hybrid. Writes go through `updateBook(mineBookId, patch)`. After a buffered Save that changed title/author/formats/shelf → call `refreshArchiveUnion()` (title/author change the union dedup key `norm(title)|norm(author)`, so the entry re-keys). Save & Close closes the panel; the union reloads on reopen anyway. |
| **Archive detail, co-member book** (`book.owners && !book.mineBookId`) | READ-ONLY. No editable fields, no save bar. "Add to my library" affordance unchanged. |
| **Inscribe modal** | Unchanged — already all-buffered; "Inscribe to Owned/Wishlist" is the commit. No save bar inside. |

## Instant vs buffered (final)

- **Instant** (fire `updateBook` on tap + `ht-saved-flash`): Verdict, Smoulder, Read/Unread, Shelf, Formats. These already save instantly today — only add the flash.
- **Buffered** (edit → Save & Close / Discard): **Title, Author, Genres, Progress** (all formats).

## Decision A — Progress = BUFFERED

- Typed page/%/hours AND quick-bump +/− buffer to local state (save bar appears).
- **Snap-to-update** (photo scan of a page): the parsed value writes to the local
  BUFFER, not the DB. User reviews, then Save. (AI-suggested → human-confirmed,
  consistent with the modal's AI-fill rule.)
- **Auto-Read at 100%**: today it lives inside `updateBook`. With buffered progress
  it's computed on **Save & Close** — if any format's buffered progress hits 100%,
  the batched write includes `read: true`. The instant Read toggle still works
  independently in between.

## Decision B — Save bar placement

- NOT viewport `fixed bottom-0` (the detail lives inside the shared `Overlay`,
  capped at `max-h-[92dvh]` with its own scroll). A viewport-fixed bar would float
  over the backdrop and fight the modal scroll.
- Render the bar **`sticky bottom-0`** inside the Overlay's scroll container so it
  pins to the modal's bottom edge and scrolls with the modal. Keep the `ht-slide-up`
  entrance (only mounted when `isDirty`).

## Decision C — Notes stay as-is (dropped from the buffered set)

The original spec listed Notes as buffered but then said "adding a note is a
discrete action." To avoid reworking the `NotesSection` notes-diff logic, **keep
notes exactly as today**: the "add note" button writes immediately (discrete). Notes
are NOT part of the save bar / dirty state. Only Title/Author/Genres/Progress buffer.

## Dirty detection (final)

```js
const isDirty =
  title !== saved.title ||
  author !== saved.author ||
  JSON.stringify(genres) !== JSON.stringify(saved.genres) ||
  JSON.stringify(progress) !== JSON.stringify(saved.progress);
// saved = the `book` prop (last-persisted values). Notes excluded (Decision C).
```

## Port notes (prototype is pre-rename — translate on port)

- Prototype uses `Chili` icon + "Smoulder 🕯" and `"📱 Kindle"` for ebook. Repo uses
  the **`Candle`** component and the **Ebook** label (the *import tab* is now
  "Codex"; format label stays "Ebook"). Translate when porting.
- Port ONLY the keyframes (`ht-flash`/`ht-saved-flash`, `ht-slide-up`/`ht-save-bar`)
  into the real `FONT_CSS`. Ignore the prototype's stripped `FONT_CSS`.
- Flash color `rgba(168,139,250,…)` is violet — fine (cyan stays reserved for audio).

## Where this file lives

`docs/HYBRID_SAVE_SPEC.md`. Reference prototype: `prototype/hushthorn-hybrid-save.jsx`.
