// Snap-to-update unit tests. Imports the REAL module (no copied code).
// Run: node tests/progress-snap-unit.mjs
import assert from "node:assert/strict";
import {
  shapeProgressShot, guessChapterPage, planPrintSnap, isPastTotal,
  applyPrintSnap, applySimpleSnap, knownChapters,
} from "../src/lib/progressSnap.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

// ── shapeProgressShot: nothing read → null (regression: used to return
// {page:null,pages:null}, show Apply, and wipe saved progress) ──
t("print: nothing read → null", () => assert.equal(shapeProgressShot({ page: null, chapter: null }, "print"), null));
t("ebook: nothing read → null", () => assert.equal(shapeProgressShot({ percent: null }, "ebook"), null));
t("audio: nothing read → null", () => assert.equal(shapeProgressShot({ listened: null, hours: null }, "audio"), null));
t("garbage / non-object → null", () => {
  assert.equal(shapeProgressShot(null, "print"), null);
  assert.equal(shapeProgressShot("4", "print"), null);
  assert.equal(shapeProgressShot({ page: 4 }, "bogus"), null);
});
t("print: page only", () => assert.deepEqual(shapeProgressShot({ page: 4, chapter: null }, "print"), { page: 4, chapter: null }));
t("print: chapter only", () => assert.deepEqual(shapeProgressShot({ page: null, chapter: 3 }, "print"), { page: null, chapter: 3 }));
t("print: numeric strings coerced", () => assert.deepEqual(shapeProgressShot({ page: "12", chapter: " 2 " }, "print"), { page: 12, chapter: 2 }));
t("print: 0, negative, fractional, junk → null fields", () => {
  assert.equal(shapeProgressShot({ page: 0, chapter: -1 }, "print"), null);
  assert.equal(shapeProgressShot({ page: 4.5, chapter: "three" }, "print"), null);
});
t("print: legacy 'pages' field is ignored (a page never shows the total)", () =>
  assert.deepEqual(shapeProgressShot({ page: 4, pages: 999 }, "print"), { page: 4, chapter: null }));
t("ebook: out-of-range percent → null", () => assert.equal(shapeProgressShot({ percent: 140 }, "ebook"), null));

// ── applyPrintSnap: never blanks a stored number ──
t("page-only snap keeps stored total (regression)", () =>
  assert.deepEqual(applyPrintSnap({ page: 2, pages: 384 }, { page: 4 }), { page: 4, pages: 384 }));
t("null page writes nothing", () =>
  assert.deepEqual(applyPrintSnap({ page: 2, pages: 384 }, { page: null, chapter: 3 }), { page: 2, pages: 384 }));
t("learns chapter → page", () =>
  assert.deepEqual(applyPrintSnap({ pages: 384 }, { page: 5, chapter: 3 }), { pages: 384, page: 5, chapters: { 3: 5 } }));
t("keeps earlier chapters, overwrites a re-confirmed one", () =>
  assert.deepEqual(applyPrintSnap({ chapters: { 1: 1, 3: 6 } }, { page: 5, chapter: 3 }).chapters, { 1: 1, 3: 5 }));
t("corrected total written only when valid", () => {
  assert.equal(applyPrintSnap({ pages: 300 }, { page: 412, pages: 420 }).pages, 420);
  assert.equal(applyPrintSnap({ pages: 300 }, { page: 412, pages: null }).pages, 300);
});
t("idempotent: same snap twice → same result", () => {
  const once = applyPrintSnap({ pages: 384 }, { page: 5, chapter: 3 });
  assert.deepEqual(applyPrintSnap(once, { page: 5, chapter: 3 }), once);
});
t("malformed stored progress doesn't throw", () => {
  assert.deepEqual(applyPrintSnap(null, { page: 4 }), { page: 4 });
  assert.deepEqual(applyPrintSnap({ chapters: "junk" }, { page: 4, chapter: 1 }).chapters, { 1: 4 });
});
t("does not mutate stored object", () => {
  const stored = { page: 1, pages: 384, chapters: { 1: 1 } };
  applyPrintSnap(stored, { page: 5, chapter: 3 });
  assert.deepEqual(stored, { page: 1, pages: 384, chapters: { 1: 1 } });
});

// ── applySimpleSnap (ebook/audio) ──
t("ebook null percent keeps prior", () => assert.deepEqual(applySimpleSnap({ percent: 40 }, { percent: null }), { percent: 40 }));
t("audio partial read keeps stored hours", () =>
  assert.deepEqual(applySimpleSnap({ listened: 1, hours: 9.5 }, { listened: 2.25, hours: null }), { listened: 2.25, hours: 9.5 }));

// ── chapter guesses ──
t("known chapter → exact page from map", () => assert.deepEqual(guessChapterPage(3, { 3: 5 }, 0), { page: 5, source: "map" }));
t("interpolates between known chapters", () => assert.equal(guessChapterPage(3, { 1: 1, 5: 17 }, 0).page, 9));
t("extrapolates past known range", () => assert.equal(guessChapterPage(6, { 1: 1, 3: 9 }, 0).page, 21));
t("one lower chapter + further saved page → saved+1", () => assert.equal(guessChapterPage(4, { 1: 1 }, 6).page, 7));
t("one lower chapter, saved page behind it → that chapter + 1", () => assert.equal(guessChapterPage(2, { 1: 1 }, 0).page, 2));
t("no map, saved page → saved+1", () => assert.equal(guessChapterPage(9, {}, 40).page, 41));
t("nothing to go on → null (reader types it)", () => assert.deepEqual(guessChapterPage(1, undefined, 0), { page: null, source: "guess" }));
t("guess never lands at/after the next known chapter", () => assert.equal(guessChapterPage(1, { 2: 3 }, 40).page, 2));
t("guess never lands at/before the previous known chapter", () => assert.equal(guessChapterPage(5, { 4: 50 }, 10).page, 51));
t("bad map entries ignored", () => assert.deepEqual(knownChapters({ x: 3, 2: "y", 3: 0, 4: 12 }), [{ chapter: 4, page: 12 }]));

// ── planPrintSnap ──
t("printed page → no question", () =>
  assert.deepEqual(planPrintSnap({ page: 4, chapter: null }, { pages: 384 }), { page: 4, chapter: null, needsPage: false, pages: 384 }));
t("chapter in map → filled, no question", () =>
  assert.equal(planPrintSnap({ page: null, chapter: 3 }, { chapters: { 3: 5 } }).needsPage, false));
t("chapter not in map → guess + ask", () => {
  const plan = planPrintSnap({ page: null, chapter: 3 }, { page: 4 });
  assert.equal(plan.needsPage, true);
  assert.equal(plan.page, 5);
});
t("stored garbage total → pages null", () => assert.equal(planPrintSnap({ page: 4 }, { pages: "abc" }).pages, null));

// ── past-total flag ──
t("isPastTotal", () => {
  assert.equal(isPastTotal(412, 384), true);
  assert.equal(isPastTotal(384, 384), false);
  assert.equal(isPastTotal(412, null), false);
  assert.equal(isPastTotal(null, 384), false);
});

// ── The reported session: Perfect Assassin, four photos in order ──
t("reported photos end to end", () => {
  let print = {};
  // 1. Chapter TWO opener next to numbered page 2 → Claude reports page 3, chapter 2.
  print = applyPrintSnap(print, planPrintSnap({ page: 3, chapter: 2 }, print));
  assert.deepEqual(print, { page: 3, chapters: { 2: 3 } });
  // 2. Chapter ONE opener, no number, no map below it → nothing to guess from; reader types 1.
  let plan = planPrintSnap({ page: null, chapter: 1 }, print);
  assert.equal(plan.needsPage, true);
  assert.equal(plan.page, 2); // clamped before chapter 2's page 3, not saved+1 = 4
  print = applyPrintSnap(print, { page: 1, chapter: 1 });
  // 3. Page "4 · JAMES PATTERSON" → page 4, no chapter.
  print = applyPrintSnap(print, planPrintSnap({ page: 4, chapter: null }, print));
  // 4. Chapter THREE opener, no number → extrapolated guess 5, confirmed.
  plan = planPrintSnap({ page: null, chapter: 3 }, print);
  assert.deepEqual([plan.needsPage, plan.page], [true, 5]);
  print = applyPrintSnap(print, { page: plan.page, chapter: 3 });
  assert.deepEqual(print, { page: 5, chapters: { 1: 1, 2: 3, 3: 5 } });
  // Later: snapping chapter THREE again fills itself.
  assert.deepEqual(planPrintSnap({ page: null, chapter: 3 }, print).needsPage, false);
});

console.log(`\n${passed} passed`);
