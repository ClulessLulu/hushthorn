# Test Plan — Profile TOTAL Stat (Library/Profile Reconciliation)

Feature: `AvatarPage` now shows a headline TOTAL tile (`books.length`) above the
existing 2×2 stats (owned / read / wishlist / avg). Goal: the profile total
matches the library total so users stop reading "library 22 vs profile owned 15"
as a mismatch.

Scope: pure display change, no DB change. Builder: frontend-dev (`completed`).

Code anchors (`src/App.jsx`):
- Profile TOTAL tile number: `:2331` → `{books.length}`
- Profile TOTAL tile label/plural: `:2332` → `tome{books.length === 1 ? '' : 's'} in your archive`
- 2×2 subset stats (unchanged): `:2336-2339` (owned.length / readCount / wishlistCount / avgRating)
- Library/spine-shelf header count: `:1138` → `{books.length} tome{books.length > 1 ? "s" : ""} · {readCount} read`
- Props: `AvatarPage` gets `books={books}` (`:1744`); `SpineShelf` gets `books={sorted}` (`:1678`)
- View pipeline: `filtered = books.filter(shelfFilter)` (`:1404`) → `sorted = sortBooks(filtered)` (`:1416`); `shelfFilter` default `"all"` (`:1307`); `sortBooks` is a pure permutation, never drops rows (`:481`)

| ID | Check | Method | PASS criterion |
|----|-------|--------|----------------|
| F-01 | Profile TOTAL tile renders `books.length` | Code | `:2331` reads `{books.length}` on the `books` prop passed at `:1744`. |
| F-02 | Profile total == library total at default filter | Code | Library header (`:1138`) renders `books.length` of `sorted`; `sorted` ← `filtered` ← `books`. With `shelfFilter==="all"` (default, `:1307`) `filtered.length===books.length`, and `sortBooks` only permutes (`:481`), so `sorted.length===books.length`. Both sites equal at default. |
| F-03 | Reconciliation: owned+wishlist == total when every shelf ∈ {owned,wishlist} | Unit | For inputs with `other=0`, `owned.length + wishlistCount === books.length`. |
| F-04 | 2×2 subset stats unchanged; owned/wishlist are subsets of total | Code | `:2336/:2338` still use `owned.length` / `wishlistCount` filtered from the same `books`; both ≤ `books.length`. No other stat touched. |
| B-01 | Real data reconciles for target user | MCP | `total = owned + wishlist` and `other = 0` for user `07b8…`. |
| B-02 | No unknown-shelf books for ANY user (latent-bug sweep) | MCP | `other = 0` for every `user_id` in `books`. |
| U-01 | Edge: 0 books | Unit | tile number `0`; label pluralizes (English: "tomes"). |
| U-02 | Edge: 1 book → singular | Unit | label = "tome … " (no trailing s). |
| U-03 | Edge: 2+ books → plural | Unit | label = "tomes …". |
| E-01 | Library header diverges under an active shelf filter | Code | When `shelfFilter !== "all"`, the spine-shelf header shows the FILTERED count while the profile tile shows full `books.length`. Expected/by-design (header reflects the view), but documents that the two are NOT literally "the same array" outside the default. |
| E-02 | Build passes | Build | `npm run build` exits 0. |