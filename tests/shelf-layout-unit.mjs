// Spine width + shelf packing tests. Imports the REAL module (no copied code).
// Run: node tests/shelf-layout-unit.mjs
import assert from "node:assert/strict";
import { spineWidthOf, layoutShelfRows, asPageCount, hashStr, SPINE_GAP, URN_W, TREE_W } from "../src/lib/shelfLayout.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };
const book = (title, pages, kind = "print") => ({ title, author: "A", progress: pages === undefined ? {} : { [kind]: { pages } } });
const decoW = (it) => it.deco === "urn" ? URN_W : it.deco === "tree" ? TREE_W : spineWidthOf(it);
const used = (row) => row.reduce((n, it, i) => n + decoW(it) + (i ? SPINE_GAP : 0), 0);

// ── spineWidthOf ──
t("bucket edges: 249→17, 250→24, 499→24, 500→32", () => {
  assert.equal(spineWidthOf(book("a", 1)), 17);
  assert.equal(spineWidthOf(book("a", 249)), 17);
  assert.equal(spineWidthOf(book("a", 250)), 24);
  assert.equal(spineWidthOf(book("a", 499)), 24);
  assert.equal(spineWidthOf(book("a", 500)), 32);
  assert.equal(spineWidthOf(book("a", 5000)), 32);
});
t("print pages win over ebook pages; ebook used when print missing", () => {
  assert.equal(spineWidthOf({ title: "x", progress: { print: { pages: 100 }, ebook: { pages: 900 } } }), 17);
  assert.equal(spineWidthOf(book("x", 900, "ebook")), 32);
});
t("invalid page counts fall back to the stable decorative width 17-28", () => {
  for (const bad of [0, -3, 12.5, "300", null, NaN, undefined]) {
    const w = spineWidthOf({ title: "T", author: "A", progress: { print: { pages: bad } } });
    assert.ok(Number.isInteger(w) && w >= 17 && w <= 28, `${bad} → ${w}`);
  }
});
t("no progress / audio-only / empty book never throws and stays 17-28", () => {
  for (const b of [{}, { title: "T" }, { title: "T", progress: { audio: { hours: 9 } } }, { progress: null }]) {
    const w = spineWidthOf(b);
    assert.ok(w >= 17 && w <= 28);
  }
});
t("fallback width is stable for the same book", () => {
  const b = { title: "Souls in Ruin", author: "Someone" };
  assert.equal(spineWidthOf(b), spineWidthOf({ ...b }));
});
t("asPageCount and hashStr behave as before", () => {
  assert.equal(asPageCount(5), 5);
  for (const bad of [0, -1, 1.5, "5", null, undefined]) assert.equal(asPageCount(bad), null);
  assert.equal(hashStr(""), 0);
  assert.equal(hashStr("ab"), "a".charCodeAt(0) * 31 + "b".charCodeAt(0));
});

// ── layoutShelfRows ──
const many = (n) => Array.from({ length: n }, (_, i) => book("Book " + i, [100, 300, 700][i % 3]));
t("empty shelf → one empty row", () => assert.deepEqual(layoutShelfRows([], 600, 0), [[]]));
t("keeps every book once, in order", () => {
  const books = many(40);
  const flat = layoutShelfRows(books, 400, books.length).flat().filter(x => !x.deco);
  assert.deepEqual(flat, books);
});
t("no row (with 2+ items) is wider than the shelf, at the 32px maximum width too", () => {
  for (const [n, W] of [[5, 300], [40, 400], [120, 640], [60, 120], [30, 1000]]) {
    for (const mix of [[100], [300], [700], [100, 300, 700]]) {
      const books = Array.from({ length: n }, (_, i) => book("B" + i, mix[i % mix.length]));
      for (const row of layoutShelfRows(books, W, n)) {
        if (row.length > 1) assert.ok(used(row) <= Math.max(W, 120), `n=${n} W=${W} used=${used(row)}`);
      }
    }
  }
});
t("a width below 120 is treated as 120", () => {
  const books = many(12);
  assert.deepEqual(layoutShelfRows(books, 0, 12), layoutShelfRows(books, 120, 12));
});
t("urn appears once at peak>=10, never below; tree once at peak>=21, last row only", () => {
  const books = many(30);
  const count = (rows, d) => rows.flat().filter(x => x.deco === d).length;
  const low = layoutShelfRows(books, 300, 9);
  assert.equal(count(low, "urn"), 0); assert.equal(count(low, "tree"), 0);
  const mid = layoutShelfRows(books, 300, 10);
  assert.equal(count(mid, "urn"), 1); assert.equal(count(mid, "tree"), 0);
  const high = layoutShelfRows(books, 300, 21);
  assert.equal(count(high, "urn"), 1); assert.equal(count(high, "tree"), 1);
  assert.ok(high[high.length - 1].some(x => x.deco === "tree"));
});
t("a short library still gets its urn", () => {
  const rows = layoutShelfRows(many(3), 600, 10);
  assert.equal(rows.flat().filter(x => x.deco === "urn").length, 1);
});
// regression guard for the reflow concern: filling in a page count changes the width
// but must not drop or duplicate books.
t("changing one book's page count re-packs without losing books", () => {
  const books = many(25);
  const before = layoutShelfRows(books, 360, 25).flat().filter(x => !x.deco).length;
  const edited = books.map((b, i) => i === 3 ? book(b.title, 900) : b);
  const after = layoutShelfRows(edited, 360, 25).flat().filter(x => !x.deco).length;
  assert.equal(before, 25); assert.equal(after, 25);
});

console.log(`\n${passed} passed`);
