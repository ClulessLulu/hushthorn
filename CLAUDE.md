# CLAUDE.md — Hushthorn

Rewritten 2026-11-13 from a full read of the repo and the production schema.
Numbers in this file were recounted that day: `App.jsx` 8,336 lines, 69 `ht-*`
classes, 6 unit-test files, 31 UI tests, 5 AI call sites, 9 tables, 3 views,
6 database functions, 25 production migrations, 7 subagents.
Where this file disagrees with `CLAUDE.local.md`, `AGENTS.md`, `.claude/agents/*`,
`.codex/*`, `README.md` or anything under `docs/`, this file wins. Where this
file disagrees with the code, the code wins: fix this file in the same change.

## 1. What this is

Hushthorn is a gothic book-cataloging web app for romantasy / spicy-romance
readers: shelves (owned, wishlist, read, unread), two ratings, per-format
reading progress, notes ("marginalia"), book search and camera scanning, AI
helpers, Kindle/Goodreads import, shared libraries, and a painted "cathedral"
spine shelf that unlocks decorations as you finish books.

It is live and has real data. The owner (Crystal) is a QE/SDET shipping this as
a portfolio piece, so correctness, tests and evidence matter more than speed.

**Stack (all verified in `package.json`):** Vite 8, React 18, Tailwind 3,
`@supabase/supabase-js` 2, `papaparse`, `@zxing/browser`, `react-image-crop`.
Plain JavaScript/JSX, ES modules. No TypeScript, no ESLint, no router, no state
library, no test framework beyond Node's built-in runner. Do not add any of
these without being asked.

**Runtime shape:**

- Browser SPA, hosted on Vercel. One serverless function, `api/claude.js`.
- Supabase does auth, Postgres, and Storage. The browser talks to it directly
  with the anon key; Row Level Security is the only thing protecting data.
- AI: every call goes `callClaude()` (top of `src/App.jsx`) → `/api/claude` →
  Anthropic. The proxy holds `ANTHROPIC_API_KEY` server-side and rejects callers
  without a valid Supabase session. In local dev only, if
  `VITE_ANTHROPIC_API_KEY` is set, `callClaude()` calls Anthropic straight from
  the browser (Vite serves no `/api`).
- Book data: Google Books is the primary search, Open Library is the fallback,
  the ISBN lookup, and the page-count source.

**Two Supabase projects. Know which one you are touching.**

| Name | Ref | Use |
| --- | --- | --- |
| `hushthorn` | `ujxsrcxbhcbihhdluzyl` | PRODUCTION. The owner's real library. Never test against it. |
| `hushthorn-staging` | `shwhzfpqjbwukjztlzee` | Same schema, throwaway data. All testing that writes goes here. |

## 2. Folder map

The workspace is `Documents/Hushthorn/` with two siblings: the app repo
(`hushthorn/`, a git repo, default branch `master`) and `toolbox/` (planning and
checks, not in git).

```
hushthorn/
  src/
    App.jsx              THE APP. ~8,300 lines: every screen, most helpers, and the
                         FONT_CSS <style> block holding all .ht-* classes. Find things
                         by searching for the function name, never by line number.
    main.jsx             Entry. Renders <App/> inside React.StrictMode.
    index.css            Tailwind directives only.
    button-preview.jsx   Dev-only review page for EnamelButton (button-preview.html).
    components/
      EnamelButton.jsx/.css   The button. Variants: primary, secondary, quiet, metal, rose.
      NavTab.jsx/.css         Stained-glass arch tabs (Oracle, + Inscribe, Codex).
    lib/                 Pure, importable, unit-tested logic. New logic goes here.
      supabase.js        Client. THROWS at import if the two VITE_SUPABASE_* vars are missing.
      progressSnap.js    Snap-to-update maths (print / ebook / audio).
      snapImage.js       Downscale a photo before it is sent to the AI proxy.
      shelfLayout.js     Spine widths and shelf row packing.
      importMerge.js     noteFingerprint and mergeImport (import and batch-add merge).
      authErrors.js      Auth error text and emailed-link error parsing.
      oracle.js          The Oracle's prompt, model, JSON Lines parsing, already-suggested titles.
      sse.js             Reads a streamed Claude reply (callClaude with onText).
  api/claude.js          Vercel serverless proxy to Anthropic (session required).
  tests/
    *.mjs                Unit tests. These are what `npm test` runs.
    e2e/                 Playwright UI tests for the critical paths. Staging only.
                         `npm test` does NOT run these; CI does not run them yet.
    *-test-plan.md, report.md, *-qa-report.md, manual-test-tracker.md   QA plans and evidence.
    screenshots/         Gitignored QA evidence.
  public/
    brand/               Wordmark, crown, button art (webp + 9-slice pieces).
    cathedral/           Runtime cathedral art (optimized webp).
  docs/
    BOOK_DESIGN.md       Spec for spines, cover cards, controls, modals. Read before UI work.
    BUTTON_REDESIGN.md   Button family spec.
    CATHEDRAL_ART_SPEC.md  Painted layers and the asset audit.
    HYBRID_SAVE_SPEC.md, VISAGE_SPEC.md, PROTOTYPE_SPEC.md   Feature specs.
    BUGS.md              QA bug log, with fixes and measurements.
    CODE_REVIEW_TODO.md  Open review findings. Check before touching spine code.
    TODO.md              Parked features.
    superpowers/specs, superpowers/plans   Dated design specs and build plans.
  prototype/             Design-phase references. NOT built, NOT imported. Port logic, never markup.
  output/                Gitignored art sources (large PNGs). Never load at runtime.
  dist/                  Build output. Gitignored.
  playwright.config.js   UI test config (port 5174, one worker, staging).
  .github/workflows/ci.yml   Unit tests + build on every PR and on push to master.
  .claude/agents/        7 subagent definitions, each with its model (section 8).
  .agents/, agent/, .claude/skills/   Vendored third-party Vercel skills. Not project code.
  .remember/, .superpowers/, .playwright-mcp/, test-results/   Tool scratch. Ignore.
  .env, .env.staging, .env.*.local   Secrets. Never print, paste, or commit their values.

toolbox/
  NEXT.md                The single action for the next work session. Read it first.
  MILESTONES.md          v1 plan, M0-M5. Decides whether a task belongs now.
  PARKING.md             Parked ideas. New ideas go here, not into the session.
  scripts/check-dist-for-keys.mjs   Fails if a build contains a secret key.
  api-checks/            Playwright API checks against STAGING (host-guarded).
```

**Inside `App.jsx`, in file order:** Claude helpers (`callClaude`,
`parseClaudeJson`) → `FONT_CSS` → icons → genres and tropes → cathedral progress
engine → covers and spine color → progress (`ProgressEditor`) → `Spine`,
cathedral pieces, `SpineShelf`, `ControlsBar`, `ArchiveSwitcher` → **`Hushthorn`
(the root: all state, all data loading, every write)** → import parsers
(`parseClippings`, `parseGoodreads`, `noteFingerprint`, `mergeImport`,
`PairSection`) → `OracleSection` → username gate → Visage (avatar) → shared
archives → auth pages → `AddBookModal` → cover crop/editor → `DetailPanel`,
notes → `Overlay`.

## 3. Commands

Run from `hushthorn/` in PowerShell. Use Chrome or Edge (voice notes and native
barcode detection are Chromium-only).

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server, port 5173, **production** Supabase via `.env` |
| `npm run dev:staging` | Dev server, port 5174, **staging** Supabase via `.env.staging`. Shows a staging badge |
| `npm test` | Runs every `tests/*.mjs` with `node --test` (8 files, all passing on 2026-11-17) |
| `node tests/<file>.mjs` | Run one test file |
| `npm run build` | Production build into `dist/` |
| `node ..\toolbox\scripts\check-dist-for-keys.mjs` | After every build: must print `OK` |
| `npm run preview` | Serve the built `dist/` |
| `npm run test:e2e` | Playwright UI tests (`tests/e2e`) against **staging**; starts the staging server itself. One file: `npx playwright test auth`. See `tests/e2e/README.md` |
| `npm run test:e2e:report` | Open the last UI test report, with traces of failures |
| `cd ..\toolbox\api-checks; npx playwright test` | API/RLS checks against staging only |

CI (`.github/workflows/ci.yml`, Node 22) runs `npm ci`, `npm test`,
`npm run build` with placeholder Supabase vars, then greps the bundle for the
text `Enter the Archive`. That last step exists because a build with missing
Supabase vars prints "built" while shipping an empty app. If you rename that
button, update the CI grep in the same commit.

Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required);
`VITE_ENABLE_GOOGLE_AUTH` (`true` shows Google sign-in; off by default);
`VITE_ANTHROPIC_API_KEY` (local dev only; it belongs in `.env.development.local`,
or `.env.staging.local` for staging, never in `.env`, which builds also read).
The staging test accounts (`E2E_*`) live in `.env.staging.local`. Server-side on Vercel:
`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Anything named
`VITE_*` is compiled into the public bundle.

## 4. Data model (verified against production, 2026-11-13)

Tables, all with RLS on: `books`, `notes`, `avatars`, `profiles`, `libraries`,
`library_members`, `library_invites`, `invite_attempts`, `cathedral_progress`.

- `books`: `id, user_id, title, author, year, cover_url, genres[], tropes[],
  shelf ('owned'|'wishlist'), read, overall (int), smut (int), spine_color,
  formats[], progress (jsonb), hidden_from_archives, created_at`.
  `overall` is the Verdict rating, `smut` is the Smoulder rating.
- `progress` shape: `{ print: {page, pages, chapters}, ebook: {percent, pages},
  audio: {listened, hours} }`. Any part may be missing or malformed; read it
  through `formatPercent` / `num` / `asPageCount`, never directly.
- `notes`: `id, book_id, user_id, page, is_quote, text, is_voice, is_time, date`.
- `avatars`: legacy cosmetic columns, Visage columns (`form, traits, image_path,
  preset_name`), and the view prefs `pref_layout`, `pref_sort`.
- Views: `archive_shelf`, `archive_reveal`, `archive_avatar`. Functions:
  `create_library`, `accept_library_invite`, `username_available`,
  `bump_cathedral_progress`, `my_library_ids`, `is_library_owner`.
- Storage buckets: `covers`, `avatar-assets` (both public; path starts with the
  user id).

**There is no migrations folder.** Schema changes are applied through the
Supabase MCP (`apply_migration`), to staging first, then proven with a query,
then to production only after the owner says so.

**In-memory book** (camelCase) is mapped by hand from the row (snake_case) in
the root load effect, and written back through `FIELD_MAP`. Adding a book field
means touching all of: the migration (both projects), the load mapping,
`FIELD_MAP`, the `addBook` insert, the `importBooks` insert, and
`loadArchiveUnion`. If co-members should see it, the views too.

**Rules the code depends on:**

1. **One book per title.** Books are unique by title, case-insensitive. A second
   format is added to `formats`, never a second row. `mergeImport` and
   `isTitleTaken` enforce it.
2. **Imports are idempotent.** Notes dedupe by `noteFingerprint()`. Importing the
   same file twice must write nothing.
3. **Books are personal. A shared archive is a lens, not a table.** It merges
   members' own rows by `title|author` key. Co-members' data is read ONLY
   through the three `archive_*` views. `archive_shelf` has no ratings columns;
   `archive_reveal` only returns marks for members who opted in
   (`library_members.share_reading`); notes are never shared; `archive_avatar`
   exposes `image_path` only.
4. **Two book shapes share the UI.** Personal books have `id`. Archive entries
   (UnionBooks) have `key`, `owners[]`, `reveals[]`, `mineBookId` (undefined if I
   don't own it), `tropes` (merged) and `myTropes` (mine). Every write goes to
   `mineBookId ?? id`. Check `b.owners` before assuming `b.id` exists.
5. **Tropes are a closed list.** `normalizeTropes()` is the only way into
   `tropes`; unknown strings are dropped. Removing a trope from `TROPE_GROUPS`
   orphans stored data and needs a migration. Genres are open text, snapped to
   known spellings by `canonicalGenre()`. Raw API subjects go through
   `cleanGenres()` first.
6. **Auto-read.** `updateBook` marks a book read when any format reaches 100%.
   A patch that should not finish a book must not push progress to 100%.
7. **Cathedral progress is private, monotonic, and silent about numbers.** It
   counts finished books (read, not wishlist, deduped by title). `peak` never
   goes down. `runCathedralCheck` runs once per mutation or once per import
   batch, never per book in a loop. It is never read for another member.
8. **Covers load only from allowlisted hosts** (`isAllowedCoverSrc`). A
   co-member controls their `cover_url`, so do not bypass `CoverImage`.
9. **AI calls** use model `claude-sonnet-4-6` (4 call sites), except The Oracle,
   which uses `ORACLE_MODEL` (`claude-haiku-5-5`, thinking off, 7 picks) from
   `src/lib/oracle.js` for speed (owner's call, 2026-11-17). All ask for strict
   JSON and parse with `parseClaudeJson()`, except The Oracle, which streams
   (`callClaude(body, { onText })`, passed through by `api/claude.js`) and
   reads one pick per line with `parseRecLines()`. Every one has a manual fallback.
   `SNAP_MAX_EDGE = 1568` in `snapImage.js` is tied to that model tier; do not
   change the model without asking.

## 5. Coding rules

- Match the file you are in: functional components, hooks, the quote style of
  the surrounding code, Tailwind classes inline, `ht-*` classes for anything
  reusable.
- New logic that can be wrong (parsing, merging, maths, validation, error
  mapping) goes in `src/lib/` as pure functions with no DOM and no Supabase, and
  is imported by both `App.jsx` and its test. Do not grow `App.jsx` with
  testable logic. Do not split `App.jsx` into modules unless asked; that
  refactor is deliberately parked (`toolbox/PARKING.md`).
- **Every bug fix ships with a test in `tests/` that fails without the fix.**
  Test files are plain `.mjs`, import `node:assert/strict`, import the real
  module, and must exit non-zero on failure. List the cases: happy path, empty,
  malformed, boundary, and run-it-twice.
- Supabase calls never throw; they return `{ data, error }`. Check `error` on
  every call, log it with a label (`console.error('addBook:', error.message)`),
  and leave the UI in a usable state. `updateBook` returns `false` on a failed
  write; callers that report success must check it.
- Update local state only after the write succeeds, or roll back on failure when
  a wrong value would mislead (see `setHidden`).
- `React.StrictMode` runs effects twice in dev. Camera, scanner, timers and
  subscriptions must be idempotent and cleaned up. State updaters stay pure.
- No dead ends. Camera blocked → file upload. Speech unsupported → typing. AI
  fails or returns junk → manual fields. Lookup finds nothing → enter by hand.
- Never show raw server or URL text to the user. Map errors to fixed strings.
- External input (API responses, AI output, imported files, another member's
  rows) is untrusted: tolerate missing fields and wrong types.
- Comments explain why, and name the bug they prevent. Keep that habit.
- Git: commit style is `type(scope): what the user gets` (`feat`, `fix`, `docs`,
  `ci`, `chore`). Line endings are LF (`.gitattributes`). Do not commit, push,
  merge, or deploy unless asked. Never commit `.env*`, `output/`, `dist/`.

## 6. Design rules

Read `docs/BOOK_DESIGN.md` before changing any shelf, card, control or modal.

- **Palette.** Background `#0c0714`. Blue-violet cards. Fuchsia/pink accents
  (`#f0a6e0`, `#e267b0`, `#f59ad0`). Violet = print progress, indigo = ebook.
  **Cyan is for audio only.** Antique gold/brass (`#e8c877`) only on cathedral
  furniture and plaques. No browns or greens in UI chrome.
- **Type.** Cinzel for headings, labels and buttons: uppercase, letter-spaced,
  small (9-12px). EB Garamond for body and italics. The wordmark is an image
  (`/brand/hushthorn-wordmark.webp`). No blackletter faces. (The class
  `.ht-blackletter` is Rozha One despite its name.)
- **Corners are sharp.** `rounded-sm` / `rounded-md`, or 2px in CSS. Existing
  exceptions only: the page frame, the avatar arch, and round dots, halos and
  avatars. Do not add `rounded-lg` or larger. (The three sign-in cards still use
  `rounded-xl`; that is a logged defect, not a precedent.)
- **Buttons.** Use `<EnamelButton variant=…>` for actions and `<NavTab>` for the
  three arch tabs; shelf filters use `.ht-ribbon`. Do not hand-roll a new button
  style. Art is decorative: the label is live HTML text, the element is a real
  `<button>`.
- **Art is never stretched.** Assets are 2x; size elements to the art's own
  ratio or use the 9-slice pieces. Runtime art is optimized `.webp` in
  `public/`. Sources stay in `output/`.
- **Spines and cover cards are drawn in code** because they carry data (color,
  rating gem, progress rails, wishlist ghost, owner count). Never bake a book
  into an image. Decoration never replaces a data mark.
- **Cathedral unlocks never show a number, a count, or a progress bar.** Only
  the unlock name, its description, or a hint.
- **Modals** use the shared `Overlay`. If you put `.ht-bg` on any other panel,
  add `!min-h-0`: `.ht-bg` sets `min-height:100vh` and breaks the height cap.
- **`FONT_CSS` is injected as-is.** Source order decides ties, so a
  `prefers-reduced-motion` rule must come after the rule it overrides. The
  cathedral backdrop relies on `z-index:-1` plus `isolation:isolate` on
  `.ht-bg`; do not "tidy" either.
- **Accessibility is part of the design.** Every animation has a
  `prefers-reduced-motion` rule. Focus uses `:focus-visible` with the `#ffd5ee`
  outline. Touch targets are at least 44px. Text over art needs measured
  contrast (see the comments in `EnamelButton.css` and `NavTab.css`). Buttons
  keep a `forced-colors` fallback.
- **Layout must hold at 390px and 1280px** with no sideways scroll, and at 200%
  zoom. Grid cards reserve space for title and genre rows so rows stay aligned.
- **Voice.** Themed nouns and verbs: Inscribe (add), tome (book), marginalia
  (notes), The Oracle (recommendations), Codex / The Binding (import), archive
  (library), "Banish from the archive" (delete). Error messages are plain and
  always end with what to do next.
- **Ratings.** Verdict = 5 swords. Smoulder = 5 candles. Tapping the current
  value clears it to 0. The prototypes and README say "Spicy" with chili
  peppers; that name is dead. Translate on sight. (The sort key is still
  `'spice'` and the column is still `smut`; leave both.)
- `.impeccable/config.json` deliberately ignores four detector rules (palette,
  gradient text, accent border, broken image). Do not "fix" those findings.

## 7. Mistakes a weaker model makes here, and what to do instead

1. **Trusting a doc over the code.** `README.md` says there is no persistence
   and uses "Spicy". `SHARED_LIBRARY_SPEC.md` describes a design that was
   replaced by the union model. `VISAGE_SPEC.md` points at two docs that do not
   exist. Older plans under `docs/superpowers/` quote line numbers that moved
   long ago. → Search the code and
   believe it.
2. **Reading `App.jsx` top to bottom, or quoting line numbers.** It is 8,300
   lines and numbers move daily. → Search for the function name, read that
   function and its callers, and cite names.
3. **Testing on production.** `npm run dev` is the real library. → Anything that
   creates, edits or deletes uses `npm run dev:staging` and the staging project.
   Check for the staging badge before you click.
4. **Leaking the Anthropic key.** A local `npm run build` with
   `VITE_ANTHROPIC_API_KEY` in `.env` bakes the key into `dist/`. → Never add a
   secret under a `VITE_` name. Run the key check after every build. Never
   deploy a local `dist/`. Never echo `.env` contents.
5. **Calling Anthropic some other way.** → Only `callClaude()`. Only
   `parseClaudeJson()`. Always a manual fallback.
6. **Breaking the privacy seam.** Selecting another user's `books`, `avatars` or
   `cathedral_progress` rows directly, adding rating columns to
   `archive_shelf`, or widening an RLS policy "to make it work". → Co-member
   data only through the `archive_*` views. After any schema or policy change,
   prove with two staging accounts that B cannot read A's private data.
7. **Treating an archive entry like a personal book.** Using `b.id` on a
   UnionBook writes with `undefined`. → Branch on `b.owners`; write to
   `mineBookId ?? id`; after changing shelf, formats, title or author inside an
   archive call `refreshArchiveUnion()`.
8. **Creating duplicates.** Inserting a second row for a new format, or
   bypassing `mergeImport`. → Merge into the existing title.
9. **Writing free-text tropes**, or raw API subjects into genres. →
   `normalizeTropes`, `cleanGenres`, `canonicalGenre`.
10. **Adding a column in one place.** The field saves but vanishes on reload, or
    works on staging and 400s on production. → Follow the full list in section 4.
11. **A "test" that copies the function into the test file.**
    `tests/_progress_unit.mjs` does this for code still inside `App.jsx`; it can
    pass while the app is broken. → Do not add more. When you touch
    `formatPercent` or `num`, move them to `src/lib/` and import them in both
    places (`mergeImport` and `noteFingerprint` already live in
    `src/lib/importMerge.js`).
12. **Saying "tests pass" as proof a UI change works.** Unit tests cover six
    small modules. → Open the app on staging, do the thing, and look, at 390px
    and at desktop width. Say exactly what you checked and what you did not.
13. **Design drift.** Rounded cards, cyan on non-audio UI, a new button style, a
    progress bar for unlocks, stretched art, generic copy, an error with no next
    step. → Section 6. Reuse existing `ht-*` classes before adding one.
14. **Dropping motion or accessibility rules** when adding a class. → Add the
    reduced-motion, focus-visible and forced-colors rules with it.
15. **Camera and scanner bugs from StrictMode.** Two streams, two decoders, a
    camera left on. → Guard against a second start; stop everything in cleanup.
16. **A green build that ships nothing.** → Never remove the env placeholders or
    the bundle grep in CI.
17. **Scope creep.** Refactoring `App.jsx`, adding TypeScript or a linter,
    renaming `smut`, launching the Visage, "cleaning up" vendored skill folders
    or `output/`. → Do the task asked. Park the idea in `toolbox/PARKING.md`.
18. **Flipping `VISAGE_ENABLED`.** The avatar builder is built but dormant.
    Launch needs the broad `co-members read avatars` policy dropped first. It
    still exists in production and the owner has accepted that until the Visage
    is picked up again (2026-11-13): leave the policy, the flag and the Visage
    code exactly as they are. → Keep it `false` and hidden unless asked; follow
    `docs/VISAGE_SPEC.md` if asked.
19. **Changing the database casually.** → Inspect first, staging first, additive
    and reversible, verify with a query, run the security advisors, then ask
    before production.
20. **Agreeing to be agreeable.** → If the request has a flaw, say so first, with
    the evidence, then do the best version of it.

## 8. How to work in this repo

- Start by reading `toolbox/NEXT.md` and `toolbox/MILESTONES.md`. Work on one
  thing. If the task is outside the current milestone, say so before starting.
- Before editing: read the function, its callers, the matching spec in `docs/`,
  and `docs/CODE_REVIEW_TODO.md` / `docs/BUGS.md` for known issues in that area.
- The working tree usually holds uncommitted work and untracked files that are
  not yours. Do not stage, revert, reformat or delete them. Ask.
- Keep changes small and reviewable. No drive-by reformatting; a whitespace-only
  diff across `App.jsx` hides the real change.
- Report plainly: what changed, how you verified it, what you could not verify,
  what is still broken. No praise, no padding. If you are unsure, say so and
  check rather than guess.
- Subagents in `.claude/agents/` and the model each runs on (chosen by what a
  mistake costs, not by habit): `supabase-migrator`, `parser-qe`, `qa-tester`
  and `frontend-dev` on `opus` (privacy rules, data-corrupting edge cases,
  sceptical verification, edits inside the 8,300-line file); `backend-dev`,
  `book-data` and `design-guardian` on `sonnet` (small, well-specified work).
  This file overrides them if they ever disagree.
- The models the APP calls are a separate thing: `claude-sonnet-4-6`, and
  `claude-haiku-5-5` for The Oracle (section 4).

## 9. Before you say a task is done

Tick every line, or state which one you skipped and why.

- [ ] I re-read my diff. It contains only what the task needs. No stray edits,
      no debug logs, no secrets, no changes to files that were not mine.
- [ ] `npm test` passes, and I looked at the output.
- [ ] If I fixed a bug or added logic: there is a test in `tests/` that imports
      the real module and fails without my change.
- [ ] `npm run build` succeeds, and `check-dist-for-keys.mjs` prints `OK`.
- [ ] I ran it on **staging** in Chrome and did the actual user action. For UI:
      checked at 390px and desktop, with keyboard focus, and with no console
      errors.
- [ ] If I touched sign-in, books, navigation or any text or role those screens
      show: `npm run test:e2e` passes, and I updated `tests/e2e` to match.
- [ ] Failure paths behave: bad input, AI or network failure, permission denied.
      Each ends somewhere usable with a plain next step.
- [ ] If data is involved: reload keeps the change; doing it twice changes
      nothing the second time; no duplicate title was created.
- [ ] If it touches shared archives, avatars or RLS: a second staging account
      cannot see anything private.
- [ ] If the schema changed: applied to staging, verified by query, advisors
      clean, and production either done with approval or listed as pending.
- [ ] Design rules in section 6 hold. No new radius, colour, font or button style.
- [ ] Docs match: this file, the relevant spec, `docs/CODE_REVIEW_TODO.md`,
      `docs/BUGS.md`, and the CI grep if sign-in copy changed.
- [ ] My report says what I verified, what I did not, and what is left.
