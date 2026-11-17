# Trope Tagging & Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag books with romantasy tropes from a controlled vocabulary — Claude suggests, the reader confirms — and let the library be filtered by them.

**Architecture:** One `TROPE_GROUPS` constant is the single source of truth for suggestion, tagging and filtering. Every value entering `tropes` passes through one validator, so an off-vocabulary string can never reach the DB. Whole app is one file (`src/App.jsx`) by established convention — navigate by symbol, do not restructure.

**Tech Stack:** Vite + React, Tailwind + `ht-*` classes, Supabase (`books.tropes text[]`).

**Spec:** `docs/superpowers/specs/2026-09-20-trope-filtering-design.md` — read it before Task 1.

## Verification model — READ THIS FIRST

**No test runner exists** (no `npm test`, no Jest/Vitest). Do not add one; do not write `*.test.js`.
Verification per task is:

1. `npm run build` — must pass. Paste real output.
2. The named browser checks, run on **`npm run dev:staging` → http://localhost:5174`**.

⚠️ **Use port 5174 (staging) for all testing. NEVER 5173 — that is production with the owner's real
80-book library.** Staging shows an amber "Staging · throwaway data" bar at the bottom; if you don't see it,
you are on production, so stop. Staging already has the `tropes` column; production does NOT (deliberately).

Seeded staging logins: `qa.alpha@hushthorn.local` / `qa.beta@hushthorn.local`, password in `.env.staging.local` (gitignored, never commit it).

If you cannot drive a browser, say so plainly and list what is unverified. Never claim an unobserved pass.

## Global Constraints

- **The vocabulary is closed.** Only canonical strings from `TROPE_GROUPS` may be written to `tropes`. Every write path goes through `normalizeTropes()`.
- **No new DB work.** `books.tropes text[] not null default '{}'` already exists on staging, and `archive_shelf` already exposes `tropes`. Do not write migrations.
- Tropes are **separate from `genres`** — never copy between them.
- Suggestions cap at **6** per book.
- An AI failure must leave the reader tagging by hand — never a dead end (CLAUDE.md fallback rule).
- Cyan stays reserved for audio; trope UI uses the violet/pink/fuchsia palette.
- Sharp corners (`rounded-sm`/`rounded-md`).
- `npm run build` must pass.

---

### Task 1: Vocabulary, validator, and persistence

**Files:** `src/App.jsx` — new constants near `cleanGenres` (~line 356); `FIELD_MAP` (~2021); `addBook` insert (~2171); the book load mapping (~1599); the archive-union mapping (`loadArchiveUnion`).

**Interfaces produced (later tasks depend on these exact names):**
- `TROPE_GROUPS` — `{ [groupName: string]: string[] }`
- `TROPES` — flat `string[]` of every canonical trope
- `normalizeTropes(list, max = 6) => string[]` — canonicalises, dedupes, drops off-vocabulary values, caps
- `book.tropes` — always a `string[]` on every book object in state

- [ ] **Step 1: Add the vocabulary and validator**

Insert directly after `cleanGenres` (~line 371):

```jsx
/* ── tropes ─────────────────────────────────────────────────
   A CLOSED vocabulary. Filtering only works if every book spells a trope the
   same way, so free text is never stored: `normalizeTropes` maps whatever it
   is given (AI output, older rows) onto these canonical strings and silently
   drops anything else. Adding a trope here is safe; removing one orphans
   stored values and needs a data migration. */
const TROPE_GROUPS = {
  Relationship: [
    "Enemies to Lovers", "Rivals to Lovers", "Friends to Lovers", "Lovers to Enemies",
    "Second Chance", "Fake Dating", "Marriage of Convenience", "Arranged Marriage",
    "Forbidden Love", "Forced Proximity", "Only One Bed", "Slow Burn", "Insta-Love",
    "Love Triangle", "Grumpy/Sunshine", "Touch Her and Die", "Possessive MMC",
    "Morally Grey MMC", "Golden Retriever MMC", "Touch Aversion",
  ],
  "Fantasy & Paranormal": [
    "Fated Mates", "Mate Bond", "Chosen One", "Hidden Royalty", "Secret Heir",
    "Dragon Rider", "Fae Court", "Vampire", "Shifter", "Witch", "Demon", "Angel",
    "God/Immortal", "Magic Academy", "Portal Fantasy",
  ],
  "Plot & Structure": [
    "Found Family", "Redemption Arc", "Revenge", "Trials/Tournament",
    "Court Intrigue", "Heist", "Road Trip", "Betrayal", "Prophecy",
  ],
  Heat: ["Closed Door", "Open Door", "Why Choose"],
};

const TROPES = Object.values(TROPE_GROUPS).flat();

// lowercase -> canonical, so AI output and hand-typed casing both resolve
const TROPE_CANON = new Map(TROPES.map((t) => [t.toLowerCase(), t]));

// The ONLY gate into `tropes`. Anything not in the vocabulary is dropped.
function normalizeTropes(list, max = 6) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const canon = TROPE_CANON.get(raw.trim().toLowerCase());
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
    if (out.length >= max) break;
  }
  return out;
}
```

- [ ] **Step 2: Persist through the existing update path**

In `FIELD_MAP` (~2021), add the `tropes` mapping. Find:

```jsx
  const FIELD_MAP = { title: 'title', author: 'author', coverUrl: 'cover_url', overall: 'overall', smut: 'smut', shelf: 'shelf', read: 'read', genres: 'genres', spineColor: 'spine_color', formats: 'formats', progress: 'progress', hidden: 'hidden_from_archives' };
```

Replace with:

```jsx
  const FIELD_MAP = { title: 'title', author: 'author', coverUrl: 'cover_url', overall: 'overall', smut: 'smut', shelf: 'shelf', read: 'read', genres: 'genres', spineColor: 'spine_color', formats: 'formats', progress: 'progress', hidden: 'hidden_from_archives', tropes: 'tropes' };
```

- [ ] **Step 3: Write tropes on insert**

In `addBook`'s insert (~2178), find:

```jsx
      genres: book.genres,
```

Replace with:

```jsx
      genres: book.genres,
      tropes: normalizeTropes(book.tropes),
```

- [ ] **Step 4: Read tropes on load**

In the book load mapping (~1601), find:

```jsx
        coverUrl: b.cover_url, genres: b.genres || [], shelf: b.shelf,
```

Replace with:

```jsx
        coverUrl: b.cover_url, genres: b.genres || [], tropes: b.tropes || [], shelf: b.shelf,
```

Then find `loadArchiveUnion` and do the same for archive entries: wherever it maps a shared row's
`genres`, map `tropes: r.tropes || []` alongside it (the `archive_shelf` view already returns the column).
If the union merges two readers' copies of one title, union their trope arrays through
`normalizeTropes([...a, ...b])` so a merged card shows every trope either reader tagged.

- [ ] **Step 5: Verify**

`npm run build` → expect `✓ built in …`.

Then on **http://localhost:5174** (amber staging bar visible), in the browser console:

```js
// tropes round-trip through the real client
const m = await import('/src/lib/supabase.js');
const { data } = await m.supabase.from('books').select('id,title,tropes').limit(3);
console.log(data);
```

- Every row has a `tropes` array (empty is fine)
- No console errors on load
- `normalizeTropes(['enemies to lovers','NOT A TROPE','Fated Mates','fated mates'])` returns exactly `['Enemies to Lovers','Fated Mates']` — canonicalised, junk dropped, deduped

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tropes): closed vocabulary, validator, and persistence"
```

---

### Task 2: Suggestion + the trope picker

**Files:** `src/App.jsx` — `divineDetails` (~4476 area, inside `AddBookModal`); the add-book manual form's genre block (~5104, "genres: divined by AI, editable by hand"); `DetailPanel` (the book detail modal).

**Interfaces consumed:** `TROPE_GROUPS`, `TROPES`, `normalizeTropes` (Task 1).
**Interfaces produced:** `<TropePicker value={string[]} onChange={(next) => void} suggested={string[]} />`

- [ ] **Step 1: Build the picker**

Add next to `GenreChips`:

```jsx
/* Toggle chips over the closed vocabulary. `suggested` are AI proposals shown
   first and marked — they are NOT applied until tapped (the reader confirms).
   "Show all" opens the full grouped list for manual tagging. */
function TropePicker({ value = [], onChange, suggested = [] }) {
  const [showAll, setShowAll] = useState(false);
  const selected = new Set(value);
  const quick = [...new Set([...value, ...suggested])];
  const toggle = (t) => {
    const next = selected.has(t) ? value.filter((v) => v !== t) : [...value, t];
    onChange(normalizeTropes(next, 12));
  };
  const chip = (t, isSuggestion) => (
    <button
      key={t}
      type="button"
      onClick={() => toggle(t)}
      aria-pressed={selected.has(t)}
      className={`ht-display text-[9px] uppercase px-2 py-1 rounded-sm border transition-colors ${
        selected.has(t)
          ? "border-pink-400/70 bg-pink-500/30 text-pink-100"
          : isSuggestion
            ? "border-fuchsia-500/40 bg-purple-900/40 text-fuchsia-200/90 hover:bg-purple-800/60"
            : "border-purple-500/40 bg-purple-950/50 text-purple-200/90 hover:bg-purple-900/60"
      }`}
    >
      {t}
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {quick.length === 0 && (
          <span className="text-sm text-purple-400/60 italic">No tropes yet.</span>
        )}
        {quick.map((t) => chip(t, !selected.has(t)))}
      </div>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="ht-display mt-2 text-[10px] uppercase tracking-widest text-purple-300 hover:text-pink-300"
      >
        {showAll ? "▴ Close the index" : "▾ Browse all tropes"}
      </button>
      {showAll && (
        <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
          {Object.entries(TROPE_GROUPS).map(([group, list]) => (
            <div key={group}>
              <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400/70 mb-1">{group}</p>
              <div className="flex flex-wrap gap-1.5">{list.map((t) => chip(t, false))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Ask Claude for tropes**

In `divineDetails`, the prompt currently asks for `{author, genres}`. Replace that `content` string with:

```jsx
            content: `For the book titled "${title.trim()}"${author?.trim() ? ` by ${author.trim()}` : ""}: identify the author (if you recognize the book), its genres, and its romance/fantasy tropes.

Choose tropes ONLY from this exact list, copying the spelling verbatim:
${TROPES.join(", ")}

If you do not recognize the book, set author to null, infer plausible genres from the title, and return an EMPTY tropes array rather than guessing. Never invent a trope that is not on the list.

Respond with ONLY a valid JSON object, nothing else: {"author": string or null, "genres": array of 2 to 4 short genre strings, "tropes": array of 0 to 6 strings from the list above}.`,
```

- [ ] **Step 3: Hold suggestions as suggestions**

`AddBookModal` needs suggestion state. Add alongside its other state:

```jsx
  const [suggestedTropes, setSuggestedTropes] = useState([]);
```

In `divineDetails`'s `setManual` callback, after the `genres` merge, capture the proposals **without**
applying them — add this immediately after the `setManual((m) => { … });` block:

```jsx
      // Suggestions only: normalizeTropes drops anything off-vocabulary, and
      // nothing is written until the reader taps a chip (spec decision 2).
      setSuggestedTropes(normalizeTropes(parsed.tropes));
```

`manual` must carry tropes too. Wherever `manual` is initialised (both the `seed` and empty branches), add
`tropes: []`. In the `seed` branch use `tropes: normalizeTropes(seed.tropes)`.

- [ ] **Step 4: Put the picker in the add-book form**

In the manual form, directly after the genre chips block, add:

```jsx
          {/* tropes: suggested by AI, confirmed by tapping */}
          <div>
            <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60 mb-1.5">Tropes</p>
            <TropePicker
              value={manual.tropes}
              suggested={suggestedTropes}
              onChange={(next) => setManual((m) => ({ ...m, tropes: next }))}
            />
          </div>
```

- [ ] **Step 5: Put the picker in the detail panel**

In `DetailPanel`, after its `GenreChips`/genre editing section, add the same picker wired to the book:

```jsx
        <div className="mt-3">
          <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60 mb-1.5">Tropes</p>
          <TropePicker
            value={book.tropes || []}
            onChange={(next) => onUpdate({ tropes: next })}
          />
        </div>
```

- [ ] **Step 6: Verify**

`npm run build`, then on **http://localhost:5174**:
- Inscribe → type a well-known romantasy title (e.g. `A Court of Thorns and Roses`) → "✨ Divine details" → trope chips appear **unselected** and visually distinct as suggestions
- Tapping a suggestion selects it (fills pink); tapping again clears it
- "Browse all tropes" opens the grouped list; picking from any group works
- Add the book → reopen it from the shelf → the tropes you selected are still there
- In the detail panel, add and remove a trope → close and reopen → change persisted
- Turn off the network and hit "Divine details" → no crash, no dead end, you can still tag by hand

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tropes): AI suggestions and the confirm picker"
```

---

### Task 3: Filter the shelf by trope

**Files:** `src/App.jsx` — `ControlsBar` (~1323) and its call site (~2328); the shelf filtering pipeline in `Hushthorn` (where `shelfFilter`/`query` narrow the books before `gridBooks`).

**Interfaces consumed:** `TROPE_GROUPS`, `TROPES` (Task 1); `book.tropes` populated (Task 1).

- [ ] **Step 1: Add filter state**

In `Hushthorn`, beside the other filter state:

```jsx
  // Trope filter. `tropeMode` 'all' = a book must carry every selected trope,
  // 'any' = at least one. Empty selection means the filter is off.
  const [tropeFilter, setTropeFilter] = useState([]);
  const [tropeMode, setTropeMode] = useState("all");
```

- [ ] **Step 2: Apply it in the filtering pipeline**

Find where the shelf list is narrowed by `shelfFilter` and `query`, and add the trope narrowing to the
same chain (after the shelf/search filters, before sorting):

```jsx
  // Trope narrowing. A book with no tropes is excluded whenever the filter is
  // active — under ALL it can't match, and under ANY it has nothing to match.
  const tropeNarrowed = tropeFilter.length === 0
    ? shelfShown
    : shelfShown.filter((b) => {
        const has = new Set(b.tropes || []);
        return tropeMode === "all"
          ? tropeFilter.every((t) => has.has(t))
          : tropeFilter.some((t) => has.has(t));
      });
```

Then use `tropeNarrowed` wherever `shelfShown` currently feeds the grid/spine views and the
"N tomes · M read" count, so the count matches what is displayed.

- [ ] **Step 3: Derive the available tropes with counts**

```jsx
  // Only offer tropes that actually appear on this shelf, most common first.
  const tropeCounts = shelfShown.reduce((acc, b) => {
    for (const t of b.tropes || []) acc.set(t, (acc.get(t) || 0) + 1);
    return acc;
  }, new Map());
  const availableTropes = [...tropeCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
```

- [ ] **Step 4: Render the control**

Change the `ControlsBar` signature to:

```jsx
function ControlsBar({ layout, onLayout, sortKey, onSort, query, onQuery, availableTropes = [], tropeFilter = [], onTropeFilter, tropeMode = "all", onTropeMode }) {
```

and add, after the search input inside it:

```jsx
      {availableTropes.length > 0 && (
        <div className="w-full flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <span className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">Tropes</span>
            <div className="flex rounded-sm overflow-hidden border border-purple-700/50">
              {["all", "any"].map((m) => (
                <button
                  key={m}
                  onClick={() => onTropeMode(m)}
                  className={`ht-display px-2.5 py-1 text-[9px] uppercase font-semibold transition-colors ${
                    tropeMode === m ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"
                  }`}
                >
                  {m === "all" ? "Match all" : "Match any"}
                </button>
              ))}
            </div>
            {tropeFilter.length > 0 && (
              <button
                onClick={() => onTropeFilter([])}
                className="ht-display text-[10px] uppercase tracking-widest text-purple-300 hover:text-pink-300"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-3xl">
            {availableTropes.map(([t, n]) => {
              const on = tropeFilter.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => onTropeFilter(on ? tropeFilter.filter((x) => x !== t) : [...tropeFilter, t])}
                  aria-pressed={on}
                  className={`ht-display text-[9px] uppercase px-2 py-1 rounded-sm border transition-colors ${
                    on ? "border-pink-400/70 bg-pink-500/30 text-pink-100" : "border-purple-500/40 bg-purple-950/50 text-purple-200/90 hover:bg-purple-900/60"
                  }`}
                >
                  {t} <span className="text-purple-400/70">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
```

Pass the new props at the call site (~2328):

```jsx
          availableTropes={availableTropes}
          tropeFilter={tropeFilter}
          onTropeFilter={setTropeFilter}
          tropeMode={tropeMode}
          onTropeMode={setTropeMode}
```

- [ ] **Step 5: Verify**

`npm run build`, then on **http://localhost:5174** with several tagged books:
- The Tropes row lists only tropes present on the shelf, each with a count
- Selecting one narrows the shelf; the "N tomes" count matches the number of cards shown
- With two selected, **Match all** shows only books having both; **Match any** shows books having either
- Switching all↔any re-filters immediately and keeps the selection
- Clear restores the full shelf
- The trope filter combines with a shelf tab (e.g. Owned) and with an active search
- An untagged book never appears while any trope is selected
- Works in the Spines view too, not just Covers

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tropes): filter the shelf by trope with all/any"
```

---

### Task 4: Bulk backfill with review summary

**Files:** `src/App.jsx` — a bulk action in `AvatarPage` (the profile modal, near the Reading Chronicle), plus a shared suggestion helper.

**Interfaces consumed:** `TROPES`, `normalizeTropes` (Task 1); `callClaude`, `parseClaudeJson` (existing top-level helpers); `updateBook` (existing).

**This task is the one place tropes are written without a per-book confirm** — that is the spec's single
deliberate exception (§5). It must therefore: state the count before starting, run sequentially, be
stoppable, skip already-tagged books, and show a review summary at the end.

- [ ] **Step 1: Extract one shared suggestion helper**

Both the bulk pass and the per-book button need "tropes for this title", so define it **once** as a
top-level helper (place it next to `normalizeTropes`). Do not inline this prompt twice.

```jsx
// Tropes for a single known title. Returns [] on any failure or when Claude
// doesn't recognise the book — callers must treat [] as "nothing to suggest",
// never as an error worth blocking on.
async function suggestTropes(title, author) {
  if (!title || !title.trim()) return [];
  try {
    const data = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `For the book "${title.trim()}"${author?.trim() ? ` by ${author.trim()}` : ""}: list its romance/fantasy tropes.

Choose ONLY from this exact list, copying the spelling verbatim:
${TROPES.join(", ")}

If you do not recognize the book, return an empty array rather than guessing.

Respond with ONLY valid JSON: {"tropes": array of 0 to 6 strings from the list above}.`,
      }],
    });
    return normalizeTropes(parseClaudeJson(data, "{").tropes);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Add the bulk runner**

In `AvatarPage`, add state and the runner:

```jsx
  // Bulk trope backfill. Sequential on purpose — parallel calls would hammer
  // the API. Stoppable mid-run, and skips books that already have tropes so a
  // re-run is cheap. This is the one path that writes without a per-book
  // confirm, so it reports everything it touched for review.
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkResults, setBulkResults] = useState(null);
  const bulkStopRef = useRef(false);

  const untagged = books.filter((b) => !(b.tropes || []).length);

  const runBulkTropes = async () => {
    if (!untagged.length) return;
    if (!window.confirm(`Divine tropes for ${untagged.length} untagged tome${untagged.length === 1 ? "" : "s"}? Results are applied directly — you can review and correct them afterwards.`)) return;
    bulkStopRef.current = false;
    setBulkRunning(true);
    setBulkDone(0);
    const touched = [];
    for (const b of untagged) {
      if (bulkStopRef.current) break;
      const tropes = await suggestTropes(b.title, b.author); // [] on failure
      if (tropes.length) {
        try {
          await onUpdateBook(b.id, { tropes });
          touched.push({ id: b.id, title: b.title, tropes });
        } catch {
          /* one book failing must not abort the run */
        }
      }
      setBulkDone((n) => n + 1);
    }
    setBulkRunning(false);
    setBulkResults({ touched, stopped: bulkStopRef.current });
  };
```

`AvatarPage` does not currently receive an update function — add `onUpdateBook` to its props and pass
`updateBook` from `Hushthorn` at the `<AvatarPage …>` call site.

- [ ] **Step 3: Render the control and the summary**

Add above the Reading Chronicle heading:

```jsx
      {/* bulk trope backfill */}
      <div className="ht-card rounded-md p-3 mb-4">
        <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">Tropes</p>
        {untagged.length === 0 && !bulkResults ? (
          <p className="mt-1.5 text-[15px] text-purple-300/70 italic">Every tome is tagged.</p>
        ) : (
          <>
            <p className="mt-1.5 text-[15px] text-purple-300/70 italic">
              {bulkRunning
                ? `Divining… ${bulkDone} of ${untagged.length}`
                : `${untagged.length} tome${untagged.length === 1 ? "" : "s"} have no tropes yet.`}
            </p>
            <div className="mt-2 flex gap-2">
              {bulkRunning ? (
                <button onClick={() => { bulkStopRef.current = true; }} className="ht-display px-3 py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-[10px] uppercase font-semibold">
                  Stop
                </button>
              ) : (
                <button onClick={runBulkTropes} disabled={!untagged.length} className="ht-display px-3 py-2 rounded-sm bg-indigo-500/70 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] uppercase font-semibold">
                  ✨ Divine tropes for my library
                </button>
              )}
            </div>
          </>
        )}
        {bulkResults && (
          <div className="mt-3">
            <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">
              {bulkResults.stopped ? "Stopped early — " : ""}{bulkResults.touched.length} tagged · review below
            </p>
            {bulkResults.touched.length === 0 ? (
              <p className="mt-1 text-[15px] text-purple-300/70 italic">Nothing could be divined.</p>
            ) : (
              <ul className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-1">
                {bulkResults.touched.map((t) => (
                  <li key={t.id} className="text-sm text-purple-200/90">
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-purple-400/70 italic"> — {t.tropes.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify**

`npm run build`, then on **http://localhost:5174** (log in as an account with several untagged books):
- The card states how many tomes are untagged
- Starting it asks for confirmation **and names the count** before any write
- Progress advances ("Divining… 2 of 5")
- **Stop** halts it; books already tagged keep their tropes; re-running offers only the remaining ones
- The summary lists each book touched with the tropes applied
- Re-running with nothing untagged shows "Every tome is tagged." and the button is disabled
- One book failing does not abort the run

- [ ] **Step 5: Add the per-book "Divine tropes" button**

Spec §5 requires this alongside the bulk pass, and it is the confirm-first path. In `DetailPanel`, beside
the trope picker added in Task 2:

```jsx
          <button
            type="button"
            onClick={async () => {
              setTropeBusy(true);
              const s = await suggestTropes(book.title, book.author);
              setTropeSuggestions(s);
              setTropeBusy(false);
            }}
            disabled={tropeBusy}
            className="ht-display mt-2 text-[10px] uppercase tracking-widest text-purple-300 hover:text-pink-300 disabled:opacity-40"
          >
            {tropeBusy ? "Divining…" : "✨ Divine tropes"}
          </button>
```

with `const [tropeSuggestions, setTropeSuggestions] = useState([]);` and
`const [tropeBusy, setTropeBusy] = useState(false);` in `DetailPanel`, and the picker receiving
`suggested={tropeSuggestions}`. Suggestions here are **not** applied until tapped — unlike bulk, this path
keeps the confirm step.

Verify: open a book with no tropes → "✨ Divine tropes" → unselected suggestions appear → tapping one and
closing the panel persists it; an unrecognised title yields no suggestions and no error.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tropes): bulk backfill and per-book divination"
```

---

### Task 5: Genre cleanup

**Files:** `src/App.jsx` — `cleanGenres` (~356).

**Why it's needed:** `Fiction, romance, general` is 25 characters with no colon, so it passes every existing
filter untouched — which is why raw BISAC headings are showing up as chips today.

- [ ] **Step 1: Collapse BISAC headings**

Replace `cleanGenres` with:

```jsx
// BISAC headings arrive as "Fiction, romance, fantasy" or "Fiction / Romance /
// Fantasy" — they pass the length and colon filters intact, which is how raw
// publishing categories ended up on the cards. Split them, drop the generic
// qualifiers, and keep the meaningful leaves.
const GENRE_GENERIC = /^(fiction|nonfiction|non-fiction|general|juvenile|young adult|adult|literary)$/i;

function cleanGenres(subjects, max = 3) {
  if (!Array.isArray(subjects)) return [];
  const seen = new Set();
  const out = [];
  for (const s of subjects) {
    if (typeof s !== "string") continue;
    // one heading can yield several usable genres
    const parts = s.includes(",") || s.includes("/") ? s.split(/[,/]/) : [s];
    for (const part of parts) {
      const g = part.trim();
      if (!g || g.length > 28 || g.includes(":") || GENRE_JUNK.test(g)) continue;
      if (GENRE_GENERIC.test(g)) continue;
      const key = g.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(g.charAt(0).toUpperCase() + g.slice(1).toLowerCase());
      if (out.length >= max) return out;
    }
  }
  return out;
}
```

- [ ] **Step 2: Verify the transform before touching any data**

`npm run build`, then in the browser console on **http://localhost:5174**:

```js
// expected: ['Romance','Fantasy']
cleanGenres(['Fiction, romance, fantasy']);
// expected: ['Romance','Fantasy'] (slash form)
cleanGenres(['Fiction / Romance / Fantasy']);
// expected: [] — nothing meaningful survives
cleanGenres(['Fiction, general']);
// expected: ['Fae','Romantasy'] — already-clean genres are untouched
cleanGenres(['Fae','Romantasy']);
```

(`cleanGenres` is module-scoped, so reach it via a temporary `window.cleanGenres = cleanGenres` line if the
console cannot see it — remove that line before committing.)

- [ ] **Step 3: Dry-run the existing rows**

**Do not write anything yet.** In the console on staging, print what would change:

```js
const m = await import('/src/lib/supabase.js');
const { data } = await m.supabase.from('books').select('id,title,genres');
const plan = data.map(b => ({ title: b.title, from: b.genres, to: cleanGenres(b.genres) }))
                 .filter(r => JSON.stringify(r.from) !== JSON.stringify(r.to));
console.table(plan); console.log('rows that would change:', plan.length);
```

Report the table. If any row would lose a genre that was **not** a BISAC heading, stop and report it —
the reader may have curated those by hand.

- [ ] **Step 4: Apply on staging only, then verify**

Only after the dry-run looks right:

```js
for (const b of data) {
  const next = cleanGenres(b.genres);
  if (JSON.stringify(next) !== JSON.stringify(b.genres)) {
    await m.supabase.from('books').update({ genres: next }).eq('id', b.id);
  }
}
```

Then reload and confirm the chips read cleanly, and that no card shows `Fiction, …` any more.

**Do NOT run this against production** — promoting it is a separate, explicitly-approved step.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "style(genres): collapse raw BISAC headings into readable genres"
```

---

## Done criteria

All five tasks committed, `npm run build` passing, and the spec's QE checklist
(`docs/superpowers/specs/2026-09-20-trope-filtering-design.md` §9) walked on **staging**. Promotion to
production — the `tropes` migration plus the genre cleanup — is a separate step requiring the owner's
explicit go-ahead.
