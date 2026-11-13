// Spine widths and shelf row packing. Pure functions, unit-tested in
// tests/shelf-layout-unit.mjs. Rendering (Spine) and packing share spineWidthOf.

export function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Valid page counts are positive integers; anything else (0, negative, float,
// string, null, undefined) coerces to null. Shared by the add/scan paths and
// the lazy backfill.
export const asPageCount = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0) ? v : null;

export const SPINE_GAP = 5;
export const URN_W = 66, TREE_W = 92; // match .ht-deco-urn / .ht-deco-tree

// Prefer the print edition's page total (then ebook); keep the stable decorative
// width (17-28px) when no page count is known, e.g. audio-only books.
export function spineWidthOf(book) {
  const pages = asPageCount(book.progress?.print?.pages) ?? asPageCount(book.progress?.ebook?.pages);
  if (pages !== null) return pages < 250 ? 17 : pages < 500 ? 24 : 32;
  return 17 + (hashStr((book.author || "") + (book.title || "")) % 12);
}

// Rows are packed by real width, so a shelf fills edge to edge at any screen
// size. Decorations take their own width: the rose urn ends shelf 2 (or the
// last shelf when the library is shorter) and the thorn tree ends the very
// last shelf, i.e. the apse of the last bookcase.
export function layoutShelfRows(books, innerW, peak, widthOf = spineWidthOf) {
  const W = Math.max(innerW, 120);
  const wOf = (it) => (it.deco === "urn" ? URN_W : it.deco === "tree" ? TREE_W : widthOf(it));
  const used = (row) => row.reduce((n, it, i) => n + wOf(it) + (i ? SPINE_GAP : 0), 0);
  const withUrn = peak >= 10;
  const rows = [];
  let row = [], urnPlaced = false;
  const flush = () => {
    if (withUrn && !urnPlaced && rows.length === 1) { row.push({ deco: "urn" }); urnPlaced = true; }
    rows.push(row);
    row = [];
  };
  for (const b of books) {
    const reserve = withUrn && !urnPlaced && rows.length === 1 ? URN_W + SPINE_GAP : 0;
    if (row.length && used(row) + SPINE_GAP + wOf(b) > W - reserve) flush();
    row.push(b);
  }
  if (row.length) flush();
  if (!rows.length) rows.push([]);
  const last = () => rows[rows.length - 1];
  if (withUrn && !urnPlaced) {
    if (last().length && used(last()) + SPINE_GAP + URN_W > W) rows.push([]);
    last().push({ deco: "urn" });
  }
  if (peak >= 21) {
    if (last().length && used(last()) + SPINE_GAP + TREE_W > W) rows.push([]);
    last().push({ deco: "tree" });
  }
  return rows;
}
