/* ── Shelf counts shown in Your Profile ──
   Review R2-P1: "48 of 46 owned books read". The read count included read
   wishlist books while the "of N owned" part counted the Owned shelf only.
   Both halves now use the same rule: a book is owned when shelf === 'owned'
   (the Owned filter and the owned count use the same test). Rows come from the
   database or another member, so tolerate a missing list, nulls and odd fields.
   Pure, so tests/shelf-stats-unit.mjs runs the real code.
──────────────────────────────────────────────────────────────── */

const isOwned = (b) => !!b && typeof b === 'object' && b.shelf === 'owned';

export function countOwned(books) {
  return Array.isArray(books) ? books.filter(isOwned).length : 0;
}

// Read books on the Owned shelf. Never more than countOwned(books).
export function countOwnedRead(books) {
  return Array.isArray(books) ? books.filter((b) => isOwned(b) && b.read === true).length : 0;
}
