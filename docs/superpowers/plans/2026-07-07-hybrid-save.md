# Hybrid Save Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the book detail panel, keep ratings/toggles saving instantly (with a quiet "saved" flash), but buffer typed edits (title, author, genres, progress) behind a Save & Close / Discard bar that appears only when there are unsaved changes.

**Architecture:** All in `src/App.jsx`. Instant fields already call `updateBook` today — we only add a flash. New work is a local buffer in `DetailPanel` for title/author/genres/progress, a `sticky` save bar inside the shared `Overlay`, and one batched `updateBook` write on save. Applies to the personal detail and the archive "my book" variant; co-member archive books stay read-only. The Inscribe modal is already buffered and is out of scope.

**Tech Stack:** React 18 (single-file), Tailview utility classes + `FONT_CSS` `<style>` block, Supabase via `updateBook(id, patch)`.

## Global Constraints

- Spec of record: `docs/HYBRID_SAVE_SPEC.md` (including the **2026-07-07 Addendum**, which governs on conflict).
- No UI unit-test runner exists. Verification per task = `npm run build` passes (only the pre-existing 500 kB chunk advisory is acceptable) + the manual checklist quoted in each task. There is no `pytest`/`jest`; do not invent one.
- Instant fields (fire `updateBook` on tap, show `ht-saved-flash`): Verdict, Smoulder, Read/Unread, Shelf, Formats. These already persist today.
- Buffered fields (edit → Save & Close / Discard): **Title, Author, Genres, Progress**. Notes are NOT buffered (Decision C) — leave `NotesSection` exactly as-is.
- Save bar is `sticky bottom-0` INSIDE the Overlay scroll container (Decision B), NOT viewport `fixed`. Mount only when `isDirty`; entrance via `ht-save-bar`/`ht-slide-up`.
- Progress is buffered (Decision A): typed + quick-bump + snap-to-update all write the local buffer, not the DB. Auto-Read-at-100% is computed by the existing `updateBook` when the batched `{ progress }` write happens on Save.
- Union re-key: editing **title or author** changes the archive dedup key `norm(title)|norm(author)`, so after a save that changed title/author/formats/shelf, the render-site handler must call `refreshArchiveUnion()`.
- Read-only guard: the buffered editors + save bar render only when `isMine` (personal book, or archive book with `mineBookId`). Co-member archive books (`isUnion && !mineBookId`) stay read-only.
- Design system: sharp corners (`rounded-sm`/`rounded-md`), Cinzel via `ht-display`, cyan reserved for audio only. Flash color `rgba(168,139,250,…)` is violet (allowed). Themed but clear copy. Modals use the shared `Overlay` (`max-h-[92dvh]`); never add `ht-bg` to a modal card without `!min-h-0`.
- `close = implicit discard` — no "unsaved changes?" confirm dialog (spec §Detail panel).

---

### Task 1: CSS keyframes + "saved" flash on instant controls

**Files:**
- Modify: `src/App.jsx` — `FONT_CSS` template (starts line ~71); `Meter` (~1386); `ToggleRow` (~5451); `FormatToggles` (~5414).

**Interfaces:**
- Produces: CSS classes `ht-saved-flash` and `ht-save-bar` (Task 2 uses `ht-save-bar`). A reusable `SavedFlash` component: `function SavedFlash({ show })` renders a transient "saved" pill when `show` is a truthy changing key.

- [ ] **Step 1: Add keyframes to `FONT_CSS`.** Inside the `FONT_CSS` template literal (near the other `@keyframes`), add:

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

- [ ] **Step 2: Add a `SavedFlash` helper** (module scope, near `Meter`):

```jsx
// Quiet "saved" confirmation for instant-save controls. Render with a changing
// `show` key each time the value persists; the pill fades over 0.6s.
function SavedFlash({ show }) {
  if (!show) return null;
  return (
    <span key={show} className="ht-saved-flash text-[9px] uppercase tracking-wide text-indigo-300 px-1.5 py-0.5 rounded-sm ml-1">
      saved
    </span>
  );
}
```

- [ ] **Step 3: Flash on `Meter` change.** In `Meter`, add a flash counter and render `SavedFlash` after the buttons. The counter bumps only on a real change (respect the tap-again-to-clear behavior — still counts as a save):

```jsx
function Meter({ value, onChange, Icon, label, readOnly = false, size }) {
  const [flash, setFlash] = useState(0);
  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : "radiogroup"} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => { if (onChange) { onChange(n === value ? 0 : n); setFlash((f) => f + 1); } }}
          className={`p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${readOnly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"}`}
          aria-label={`${label}: ${n} of 5`}
        >
          <Icon filled={n <= value} size={size} />
        </button>
      ))}
      {!readOnly && <SavedFlash show={flash} />}
    </div>
  );
}
```

- [ ] **Step 4: Flash on `ToggleRow`.** `ToggleRow` (the Owned/Read rows) — bump a counter on click and render `SavedFlash` next to the action button. Keep its existing markup; wrap the `onClick` to also `setFlash`.

- [ ] **Step 5: Flash on `FormatToggles`.** In `FormatToggles`, after a successful toggle (not the blocked last-format case), render a `SavedFlash` in the label row. Bump a counter inside `toggle()` only when the change is applied.

- [ ] **Step 6: Build + manual check.**

Run: `npm run build`
Expected: passes (only the 500 kB advisory).
Manual: open a book detail; tap Verdict/Smoulder/Read/Shelf/a Format → a violet "saved" pill flashes and fades next to each control. Refresh → values persisted (unchanged from today).

- [ ] **Step 7: Commit.**

```bash
git add src/App.jsx
git commit -m "feat(save): saved-flash on instant fields + hybrid-save keyframes"
```

---

### Task 2: Buffered title/author/genres + save bar in DetailPanel

**Files:**
- Modify: `src/App.jsx` — `DetailPanel` (~5219–5404); the `<DetailPanel …>` render site (~2328).

**Interfaces:**
- Consumes: `onUpdate(patch)` prop (batched writer at the render site) and `onClose`. `GenreChips` exists; the Inscribe modal's genre-chip editor markup (title input + chip add/remove) is the visual reference.
- Produces: a `buf` state object `{ title, author, genres }` (Task 3 extends it with `progress`), `isDirty`, and `saveAndClose()` — all local to `DetailPanel`. The save bar reads `isDirty`.

- [ ] **Step 1: Force a fresh panel per book.** At the render site (~2328), add a `key` so the buffer resets when the user opens a different book:

```jsx
<DetailPanel
  key={activeBook.id || activeBook.key}
  book={activeBook}
  …unchanged props…
/>
```

- [ ] **Step 2: Add buffer state + dirty detection in `DetailPanel`.** Near the top of `DetailPanel` (after `isMine`), seed a buffer from the book. Title/author/genres only in this task:

```jsx
const [buf, setBuf] = useState({
  title: book.title || "",
  author: book.author || "",
  genres: book.genres || [],
});
const [genreInput, setGenreInput] = useState("");
const isDirty = isMine && (
  buf.title !== (book.title || "") ||
  buf.author !== (book.author || "") ||
  JSON.stringify(buf.genres) !== JSON.stringify(book.genres || [])
);
const discard = () => { setBuf({ title: book.title || "", author: book.author || "", genres: book.genres || [] }); setGenreInput(""); };
const saveAndClose = () => {
  onUpdate({ title: buf.title.trim(), author: buf.author.trim(), genres: buf.genres });
  onClose();
};
const addGenre = () => {
  const g = genreInput.trim();
  if (!g || buf.genres.some((x) => x.toLowerCase() === g.toLowerCase())) return;
  setBuf((b) => ({ ...b, genres: [...b.genres, g].slice(0, 6) }));
  setGenreInput("");
};
```

- [ ] **Step 3: Add an "Editable details" card** (title/author/genres inputs). Build a shared JSX block (a local `const editable = isMine ? (<div className="ht-card rounded-md p-4 space-y-3">…</div>) : null;`) with:
  - an "unsaved changes" pill (`bg-pink-500/30 text-pink-200`, `rounded-sm`) next to the heading when `isDirty`;
  - Title `<input value={buf.title} onChange={e => setBuf(b => ({...b, title: e.target.value}))} />` (reuse the Inscribe modal input classes);
  - Author input likewise;
  - Genres: render `buf.genres` as removable chips (`onClick` removes from `buf.genres`) + an add input wired to `addGenre` (Enter/comma commits), mirroring the Inscribe modal's genre editor.
  - Card border shifts pink when dirty: `className={\`ht-card rounded-md p-4 space-y-3 ${isDirty ? "border-pink-400/50" : ""}\`}`.

- [ ] **Step 4: Render `editable` in BOTH variants.** In the personal variant's right column, insert `{editable}` above `<ProgressEditor …>`. In the archive variant's `isMine` branch, insert `{editable}` above `<ProgressEditor …>`. Also make the shared `header` title/author READ-ONLY still (it mirrors saved values) — leave `header` as-is; the editable inputs are the edit surface.

- [ ] **Step 5: Add the sticky save bar.** As the LAST child inside each Overlay (personal + archive), before `</Overlay>`, render:

```jsx
{isDirty && (
  <div className="ht-save-bar sticky bottom-0 -mx-1 mt-4 flex justify-center gap-3 py-3"
       style={{ background: "linear-gradient(180deg, transparent, rgba(12,7,20,0.96) 35%)" }}>
    <button onClick={discard}
      className="ht-display px-5 py-2.5 rounded-sm bg-purple-800/70 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase">
      Discard changes
    </button>
    <button onClick={saveAndClose}
      className="ht-display px-6 py-2.5 rounded-sm bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white text-xs font-semibold uppercase shadow-lg">
      Save &amp; Close
    </button>
  </div>
)}
```

(`sticky bottom-0` pins it to the bottom of the Overlay's scroll area; the gradient fades content behind it. If the Overlay content isn't a positioned scroll container, wrap the returned children so the bar is the last child of the scrolling element.)

- [ ] **Step 6: Extend the render-site handler for the union re-key.** At ~2331, add `title`/`author` to the refresh condition so a title/author edit re-keys the union entry:

```jsx
if (currentLibraryId != null && ('formats' in patch || 'shelf' in patch || 'title' in patch || 'author' in patch)) {
  refreshArchiveUnion();
}
```

- [ ] **Step 7: Build + manual check.**

Run: `npm run build`
Expected: passes.
Manual (personal + an archive book you own):
- Edit the title → card border turns pink, "unsaved changes" pill appears, save bar slides up.
- Tap Verdict while the bar shows → sword saves instantly (flash), bar stays.
- Save & Close → panel closes; reopen → new title persisted.
- Edit author → Discard → author reverts, bar disappears.
- Edit genres (add/remove) → Save → persists.
- Open a co-member's archive book → NO editable card, NO save bar (read-only).

- [ ] **Step 8: Commit.**

```bash
git add src/App.jsx
git commit -m "feat(save): buffered title/author/genres + sticky save bar in detail"
```

---

### Task 3: Buffer progress + snap-to-update + auto-Read on save

**Files:**
- Modify: `src/App.jsx` — `DetailPanel` (buffer + ProgressEditor wiring); `ProgressEditor` (~771) only if it hard-codes an instant write (it takes `onUpdate` — no change expected).

**Interfaces:**
- Consumes: Task 2's `buf`/`isDirty`/`saveAndClose`. `ProgressEditor({ book, onUpdate })` where `onUpdate` receives `{ progress }` (and possibly `{ read }`). `updateBook` already computes auto-Read-at-100% when a `progress` patch is written.
- Produces: `buf.progress` added to the buffer; the batched save now writes `{ title, author, genres, progress }`.

- [ ] **Step 1: Add `progress` to the buffer + dirty.** Extend the `useState` seed and `isDirty`/`discard`/`saveAndClose` from Task 2:

```jsx
const [buf, setBuf] = useState({
  title: book.title || "",
  author: book.author || "",
  genres: book.genres || [],
  progress: (book.progress && typeof book.progress === "object") ? book.progress : {},
});
// isDirty: add
//   || JSON.stringify(buf.progress) !== JSON.stringify(book.progress || {})
// discard: add progress reset
// saveAndClose: onUpdate({ title: buf.title.trim(), author: buf.author.trim(), genres: buf.genres, progress: buf.progress });
```

- [ ] **Step 2: Route `ProgressEditor` to the buffer.** Replace both `<ProgressEditor book={book} onUpdate={onUpdate} />` usages with a buffered version that renders the buffered progress and writes to the buffer (so typed edits, quick-bumps, AND snap-to-update all fill the buffer, not the DB):

```jsx
<ProgressEditor
  book={{ ...book, progress: buf.progress }}
  onUpdate={(patch) => { if ('progress' in patch) setBuf((b) => ({ ...b, progress: patch.progress })); }}
/>
```

Note: `ProgressEditor` shows progress from `book.progress`, so passing the buffered progress makes it render the in-progress edits. Snap-to-update inside `ProgressEditor` calls the same `onUpdate({ progress })` → buffer. Nothing persists until Save & Close.

- [ ] **Step 3: Verify auto-Read.** No code change — confirm by reading `updateBook`: when the batched `saveAndClose` writes `{ progress }`, the existing auto-Read logic marks the book Read if any format hit 100%. The instant Read toggle still works independently between edits.

- [ ] **Step 4: Build + manual check.**

Run: `npm run build`
Expected: passes.
Manual:
- Bump a page number / quick-bump → save bar appears (buffered), value does NOT persist until Save.
- Snap-to-update a page photo → parsed value fills the field, bar shows, still buffered.
- Set a format to 100% → Save & Close → reopen → progress persisted AND the book shows Read (auto-Read fired on save).
- Discard after a progress edit → reverts.
- Archive book you own: edit progress → Save → persists via `mineBookId`; editing title there → Save → `refreshArchiveUnion` runs (entry re-keys), panel closes.

- [ ] **Step 5: Commit.**

```bash
git add src/App.jsx
git commit -m "feat(save): buffer reading progress incl snap-to-update; auto-Read on save"
```

---

### Task 4: QA + design-guardian

**Files:**
- Create: `tests/hybrid-save-test-plan.md` (manual + real-JWT checklist); append `tests/report.md`.

- [ ] **Step 1: Run the spec's test cases** (`docs/HYBRID_SAVE_SPEC.md` §Test cases) against the running dev server, plus the addendum's union cases: personal detail, archive-my-book detail, co-member read-only, union re-key after a title edit, auto-Read on save. For persistence assertions use the real-JWT method already established in `tests/` (create a confirmed user, exercise `books` reads to confirm one batched write landed; confirm instant fields wrote separately).

- [ ] **Step 2: design-guardian review** of the save bar + editable card + flash: sharp corners, `ht-display` labels, cyan reserved for audio (the flash is violet — allowed), the save bar contained within the Overlay (no viewport-fixed overlap), no `ht-bg` misuse.

- [ ] **Step 3: Report** PASS/FAIL per case with evidence; commit the artifacts:

```bash
git add tests/hybrid-save-test-plan.md tests/report.md
git commit -m "test(save): hybrid-save QA (instant/buffered, union, auto-Read)"
```

---

## Self-review

- **Spec coverage:** instant flash (T1) · buffered title/author/genres + save bar + dirty indicators + close=discard (T2) · buffered progress + snap + auto-Read (T3) · Inscribe modal already-buffered (no task, correct) · Notes stay discrete (Decision C, no task, correct) · union/read-only/re-key (T2 step 6 + T3 step 4) · QA (T4). All addendum decisions mapped.
- **Type consistency:** `buf` shape `{title, author, genres, progress}` defined T2/T3 and consumed by `saveAndClose`/`isDirty`/ProgressEditor consistently. `SavedFlash({ show })`, `Meter` flash counter, `onUpdate(patch)` batched writer names match the current code.
- **No placeholders:** every code step shows real code; verification is build + the quoted manual checklist (no fake test runner).
