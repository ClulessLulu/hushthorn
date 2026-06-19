// Per-format progress unit harness. Functions copied VERBATIM from src/App.jsx
// (lines ~478-518) so we test the real logic, not a paraphrase.

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatPercent(book, fmt) {
  const p = (book && book.progress) || {};
  const d = p[fmt];
  if (!d || typeof d !== "object") return 0;
  let pct = 0;
  if (fmt === "print") {
    const pages = num(d.pages);
    pct = pages > 0 ? (num(d.page) / pages) * 100 : 0;
  } else if (fmt === "ebook") {
    pct = num(d.percent);
  } else if (fmt === "audio") {
    const hours = num(d.hours);
    pct = hours > 0 ? (num(d.listened) / hours) * 100 : 0;
  }
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function maxPercent(book) {
  const fmts = (book && book.formats) || ["print"];
  return fmts.reduce((m, f) => Math.max(m, formatPercent(book, f)), 0);
}

function activeProgress(book) {
  const fmts = (book && book.formats) || ["print"];
  let best = null;
  for (const f of fmts) {
    const pct = formatPercent(book, f);
    if (pct <= 0 || pct >= 100) continue;
    if (!best || pct > best.pct) best = { fmt: f, pct };
  }
  return best;
}

// CardProgress render predicate (returns null when no row has motion).
function cardProgressRendersNull(book) {
  const fmts = (book && book.formats) || ["print"];
  const rows = fmts
    .map((f) => ({ fmt: f, pct: formatPercent(book, f) }))
    .filter((r) => r.pct > 0);
  return rows.length === 0; // true => component returns null
}

// updateBook auto-Read merge (the centralized logic at App.jsx:1146-1149).
function deriveRead(current, patch) {
  let p = { ...patch };
  if (current && 'progress' in p && !p.read && !current.read) {
    const merged = { ...current, ...p };
    if (maxPercent(merged) >= 100) p = { ...p, read: true };
  }
  return p.read === true;
}

let pass = 0, fail = 0;
const fails = [];
function check(id, desc, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; }
  else { fail++; fails.push(`${id} ${desc}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
}

// ── U-formatPercent ──
check("U-FP-print", "150/300 print", formatPercent({ progress: { print: { page: 150, pages: 300 } } }, "print"), 50);
check("U-FP-ebook", "ebook 42%", formatPercent({ progress: { ebook: { percent: 42 } } }, "ebook"), 42);
check("U-FP-audio", "5/10h audio", formatPercent({ progress: { audio: { listened: 5, hours: 10 } } }, "audio"), 50);
check("U-FP-round", "1/3 print rounds", formatPercent({ progress: { print: { page: 1, pages: 3 } } }, "print"), 33);
check("U-FP-clamp-hi", "page>pages clamps 100", formatPercent({ progress: { print: { page: 400, pages: 300 } } }, "print"), 100);
check("U-FP-clamp-ebook", "ebook 150 clamps 100", formatPercent({ progress: { ebook: { percent: 150 } } }, "ebook"), 100);
check("U-FP-neg", "negative page -> 0", formatPercent({ progress: { print: { page: -5, pages: 300 } } }, "print"), 0);
// divide-by-zero guards
check("U-FP-pages0", "pages=0 -> 0 (no NaN)", formatPercent({ progress: { print: { page: 50, pages: 0 } } }, "print"), 0);
check("U-FP-hours0", "hours=0 -> 0 (no NaN)", formatPercent({ progress: { audio: { listened: 3, hours: 0 } } }, "audio"), 0);
check("U-FP-pagesMissing", "pages missing -> 0", formatPercent({ progress: { print: { page: 50 } } }, "print"), 0);

// ── E-malformed ──
check("E-empty", "{} progress -> 0", formatPercent({ progress: {} }, "print"), 0);
check("E-null", "null progress -> 0", formatPercent({ progress: null }, "print"), 0);
check("E-noProgress", "no progress key -> 0", formatPercent({}, "print"), 0);
check("E-nullBook", "null book -> 0", formatPercent(null, "print"), 0);
check("E-entryString", "non-object entry (string) -> 0", formatPercent({ progress: { print: "garbage" } }, "print"), 0);
check("E-entryNumber", "non-object entry (number) -> 0", formatPercent({ progress: { ebook: 55 } }, "ebook"), 0);
check("E-entryNull", "null entry -> 0", formatPercent({ progress: { audio: null } }, "audio"), 0);
check("E-strNumeric", "string numeric coerces", formatPercent({ progress: { ebook: { percent: "30" } } }, "ebook"), 30);
check("E-card-empty", "CardProgress null on {}", cardProgressRendersNull({ progress: {}, formats: ["print", "audio"] }), true);
check("E-card-null", "CardProgress null on null progress", cardProgressRendersNull({ progress: null, formats: ["print"] }), true);
check("E-card-malformed", "CardProgress null on malformed entry", cardProgressRendersNull({ progress: { print: "x" }, formats: ["print"] }), true);

// ── U-maxPercent ──
check("U-MP-multi", "max across formats", maxPercent({ formats: ["print", "audio"], progress: { print: { page: 30, pages: 300 }, audio: { listened: 8, hours: 10 } } }), 80);
check("U-MP-default", "no formats -> defaults to print", maxPercent({ progress: { print: { page: 100, pages: 200 } } }), 50);
check("U-MP-zero", "all zero -> 0", maxPercent({ formats: ["print", "ebook"], progress: {} }), 0);

// ── U-activeProgress ──
check("U-AP-furthest-unfinished", "skips 100% print, returns audio 40%",
  activeProgress({ formats: ["print", "audio"], progress: { print: { page: 300, pages: 300 }, audio: { listened: 4, hours: 10 } } }),
  { fmt: "audio", pct: 40 });
check("U-AP-furthest-of-two", "returns the furthest unfinished",
  activeProgress({ formats: ["print", "ebook"], progress: { print: { page: 30, pages: 100 }, ebook: { percent: 70 } } }),
  { fmt: "ebook", pct: 70 });
check("U-AP-all-zero", "all zero -> null", activeProgress({ formats: ["print", "audio"], progress: {} }), null);
check("U-AP-all-done", "all 100% -> null", activeProgress({ formats: ["print", "audio"], progress: { print: { page: 300, pages: 300 }, audio: { listened: 10, hours: 10 } } }), null);
check("U-AP-malformed", "malformed -> null (no throw)", activeProgress({ formats: ["print"], progress: { print: 7 } }), null);

// ── F-auto-Read via merge (all three sources funnel here) ──
// number field: print page reaches pages
check("F-AR-number", "print 300/300 -> read true", deriveRead(
  { read: false, formats: ["print"], progress: {} },
  { progress: { print: { page: 300, pages: 300 } } }), true);
// quick-bump Done: ebook percent 100
check("F-AR-quickbump", "ebook 100% -> read true", deriveRead(
  { read: false, formats: ["ebook"], progress: {} },
  { progress: { ebook: { percent: 100 } } }), true);
// slider-to-100: audio listened == hours
check("F-AR-slider", "audio 10/10h -> read true", deriveRead(
  { read: false, formats: ["audio"], progress: {} },
  { progress: { audio: { listened: 10, hours: 10 } } }), true);
// below 100 does NOT flip
check("F-AR-below", "60% does not flip read", deriveRead(
  { read: false, formats: ["print"], progress: {} },
  { progress: { print: { page: 60, pages: 100 } } }), false);
// one format done flips even when book has multiple formats
check("F-AR-onefmt", "one of two formats done flips read", deriveRead(
  { read: false, formats: ["print", "audio"], progress: { audio: { listened: 1, hours: 10 } } },
  { progress: { print: { page: 100, pages: 100 }, audio: { listened: 1, hours: 10 } } }), true);

console.log(`PASS ${pass}  FAIL ${fail}`);
if (fails.length) { console.log("FAILURES:"); for (const f of fails) console.log("  " + f); }
process.exit(fail ? 1 : 0);
