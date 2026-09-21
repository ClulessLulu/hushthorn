# Trope Tagging & Filtering

**Status:** Designed and approved (2026-09-20).

**Feature in one line:** Tag each book with romantasy **tropes** drawn from a controlled vocabulary — suggested
by Claude, confirmed by the reader — and let the library be filtered by them.

---

## Why a controlled vocabulary (the load-bearing decision)

Tropes must come from a **fixed list**. Free text kills filtering: `enemies to lovers`,
`enemies-to-lovers` and `Enemies To Lovers` become three separate filters and the feature collapses within a
week of use. Everything below depends on this:

- The AI may only return values **from the list**; anything else is dropped at parse time.
- The filter is built from the list, not from whatever strings happen to be in the data.
- Stored values are the canonical strings, byte-for-byte.

## Why this data is generated, not fetched

There is no usable trope API. Investigated and rejected:

| Source | Why not |
|---|---|
| Google Books categories | BISAC publishing headings (`FICTION / Romance / Fantasy`). Never trope-level. |
| Open Library subjects | Crowd tags, inconsistent, mostly noise. |
| Goodreads shelves | Would be ideal; API discontinued Dec 2020, no new keys, scraping breaks ToS. |
| StoryGraph | Best trope data that exists; no public API. |
| Romance.io | Trope-focused; no public API. |

So tropes are **inferred by Claude and confirmed by the reader**. Claude is reliable on well-known romantasy
and guesses on obscure indie titles — which is exactly why the confirm step is mandatory and why
auto-applying was rejected.

## Decisions (locked)

1. Tropes live in their own **`tropes text[]`** column on `books` — not folded into `genres`.
2. **AI suggests, the reader confirms.** Nothing is written without confirmation.
3. The filter supports **AND / OR**, switchable by the reader.
4. Existing books get tropes via **both** a bulk pass and a per-book button.
5. Raw BISAC strings in `genres` get **cleaned up** as part of this work.

## 1. The vocabulary

A top-level `TROPES` constant in `src/App.jsx` — the single source of truth for suggestion, tagging and
filtering. Grouped for the picker UI; stored as flat canonical strings.

**Relationship** — Enemies to Lovers · Rivals to Lovers · Friends to Lovers · Lovers to Enemies ·
Second Chance · Fake Dating · Marriage of Convenience · Arranged Marriage · Forbidden Love ·
Forced Proximity · Only One Bed · Slow Burn · Insta-Love · Love Triangle · Grumpy/Sunshine ·
Touch Her and Die · Possessive MMC · Morally Grey MMC · Golden Retriever MMC · Touch Aversion

**Fantasy & Paranormal** — Fated Mates · Mate Bond · Chosen One · Hidden Royalty · Secret Heir ·
Dragon Rider · Fae Court · Vampire · Shifter · Witch · Demon · Angel · God/Immortal · Magic Academy ·
Portal Fantasy

**Plot & Structure** — Found Family · Redemption Arc · Revenge · Trials/Tournament · Court Intrigue ·
Heist · Road Trip · Betrayal · Prophecy

**Heat** — Closed Door · Open Door · Why Choose

The list is a constant, so adding a trope later is a one-line change. Removing one is not — it would orphan
stored values, so removals need a data migration and are out of scope.

## 2. Schema

```sql
alter table books add column if not exists tropes text[] not null default '{}';
```

- RLS: unchanged. `books` is already owner-only (`user_id = auth.uid()`).
- `FIELD_MAP` in `src/App.jsx` gains `tropes: 'tropes'` so the existing update path persists it.
- **Shared archives:** the union model reads members' books through SECURITY DEFINER views. If tropes should
  be visible on a co-member's book, `tropes` must be added to those views' select lists. Tropes are not
  sensitive (they describe the book, not the reader), so exposing them is acceptable — but it is a deliberate
  choice and must be made explicitly, not by accident. If the views are left alone, tropes simply don't show
  on archive entries.

## 3. Suggestion

Extend the existing `divineDetails` in `AddBookModal` rather than adding a parallel AI path. It already
calls `callClaude`, parses defensively via `parseClaudeJson`, and fails quietly to manual entry.

- The prompt gains a `tropes` field and **the full vocabulary inline**, with an explicit instruction to
  choose only from it and to return `[]` when unsure.
- **Validation is not optional.** Every returned value is matched against `TROPES` (case-insensitive,
  trimmed); non-members are discarded silently. A hallucinated trope must never reach the DB.
- Cap suggestions at 6 per book.
- Existing failure behaviour is preserved: an AI failure leaves the reader tagging by hand, never a dead end.

## 4. Confirming

Suggested tropes render as **toggle chips**, off until tapped, in two places:

- **Add-book modal** — under the genre chips, after "✨ Divine details" runs.
- **Detail panel** — a trope section with the same picker, so any book can be tagged or re-tagged later.

The picker shows the reader's selected tropes plus the suggestions; a "show all" affordance opens the full
grouped vocabulary for manual selection. Selection state writes through the existing `onUpdate({ tropes })`
path.

## 5. Backfill

Both entry points, sharing one function:

- **Per book** — "Divine tropes" in the detail panel. Suggests, reader confirms, as above.
- **Bulk** — one action that walks every book with `tropes = []`, with a visible progress count and a
  **stop control**. Requirements: sequential (never parallel — it would hammer the API), resumable (stopping
  leaves already-tagged books tagged), and skips books already tagged so re-running is cheap.

Bulk is roughly one Claude call per untagged book (~70 today). That cost is real and the reader is told the
count before it starts.

Bulk results are written **as suggestions to review**, consistent with decision 2 — the bulk pass must not
silently apply tropes. Practical approach: bulk writes tropes and flags the books it touched so the reader
can review them, rather than blocking on 70 individual confirmations.

## 6. Filtering

A **Tropes** control in the `ControlsBar`, beside Sort. The nav ribbon is already three rows on mobile and
cannot absorb ~48 more buttons.

- Lists only tropes **present in the reader's library**, each with a count. An empty library shows nothing.
- Multi-select, with an **AND/OR toggle**:
  - **ALL** (AND) — a book must carry every selected trope.
  - **ANY** (OR) — a book must carry at least one.
- The current mode and selection are visible at a glance, and clearing is one action.
- Combines with the existing shelf filters and search rather than replacing them.

## 7. Genre cleanup

`cleanGenres()` already exists and is already applied to incoming subjects, but raw BISAC headings
(`FICTION, ROMANCE, GENERAL`) are reaching the UI today.

- Extend `cleanGenres()` to collapse BISAC headings to their meaningful leaf (`FICTION / ROMANCE / FANTASY`
  → `Fantasy Romance`-style readable output) and to drop empty qualifiers like bare `GENERAL`.
- Apply to existing rows in a **one-time** pass. It must be **dry-run first** — print what would change
  before changing anything — because it rewrites data the reader may have curated by hand.
- Genres and tropes stay separate. This cleanup does not move anything into `tropes`.

## 8. Non-goals

- Scraping Goodreads/StoryGraph, or any ToS-violating source.
- Trope-based recommendations (the Oracle already owns recommendations).
- Editing the vocabulary from the UI.
- Removing tropes from the vocabulary.
- Sharing or syncing tropes between readers beyond what the archive views already expose.

## 9. Test cases (QE checklist)

- [ ] A book tagged with 2 tropes persists them; reload restores exactly those strings
- [ ] AI returning a trope outside the vocabulary → that value is discarded, valid ones still applied
- [ ] AI returning malformed JSON → no crash, reader can tag by hand
- [ ] AI returning `[]` → no chips suggested, no error shown
- [ ] Filter ALL with two tropes returns only books carrying both
- [ ] Filter ANY with two tropes returns books carrying either
- [ ] Switching AND↔OR re-filters immediately without losing the selection
- [ ] Trope filter combines correctly with a shelf filter and an active search
- [ ] Clearing the trope filter restores the full shelf
- [ ] The trope list shows only tropes present in the library, with correct counts
- [ ] Bulk backfill: stopping mid-run leaves already-tagged books tagged and re-running skips them
- [ ] Bulk backfill on a library with no untagged books does nothing and says so
- [ ] A book with no tropes is unaffected by an AND filter and excluded from an OR filter
- [ ] Genre cleanup dry-run lists changes without writing; the real run matches the dry-run
- [ ] `npm run build` passes
