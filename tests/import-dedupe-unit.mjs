// The Binding import — dedupe/merge unit harness.
// Functions copied VERBATIM from src/App.jsx (noteFingerprint, mergeImport) so
// we test the real logic, not a paraphrase. Run: node tests/import-dedupe-unit.mjs
//
// Invariants under test (CLAUDE.md):
//  - Books unique by title (case-insensitive) — merge, never a duplicate row.
//  - Notes dedupe by noteFingerprint() (normalized text); re-importing the
//    same file is idempotent (zero additions, zero updates, identical state).

// Fingerprint a highlight for dedupe: lowercase, strip punctuation and quote
// glyphs, collapse whitespace. The same passage from different sources
// (clippings re-export, notebook export, re-import) converges to one stable
// string — the `noteFingerprint()` invariant documented in CLAUDE.md. Ported
// from the design prototype (prototype/hushthorn-demo.jsx) with a non-string
// guard added.
function noteFingerprint(text) {
  return (typeof text === "string" ? text : "")
    .toLowerCase()
    .replace(/[“”"'‘’.,!?;:—–\-…()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Pure smart-merge for The Binding / batch add. Given the current shelf and
// the parsed import items, computes the next local state plus exactly what
// must be persisted. Books are unique by title (case-insensitive): a match
// merges into the existing entry — including entries created earlier in the
// SAME batch, so one file can never mint duplicate rows. Notes dedupe by
// noteFingerprint(), both against the book's existing marginalia and within
// the batch (Kindle clippings can repeat a highlight verbatim). Pure — ids
// and the date stamp are injected — so tests/import-dedupe-unit.mjs can
// exercise it directly. Returns { next, additions, updates }:
//   next      — the full next books array (for setBooks)
//   additions — brand-new book objects with notes attached (INSERT books+notes)
//   updates   — { id, fields, newNotes } per changed existing book
//               (UPDATE books when fields is non-empty; INSERT newNotes)
function mergeImport(prevBooks, items, today, makeId) {
  const updated = (prevBooks || []).map((b) => ({ ...b, notes: [...(b.notes || [])] }));
  const byTitle = new Map(updated.map((b) => [b.title.toLowerCase(), b]));
  const additions = [];
  const addedIds = new Set(); // books minted earlier in THIS batch
  const updates = [];
  for (const item of items || []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) continue;
    const key = item.title.toLowerCase();
    // Build note objects: drop empty/non-string text (a fingerprint of "" means
    // no textual content) and dedupe within the batch itself.
    const seen = new Set();
    const newNotes = [];
    for (const n of item.notes || []) {
      const fp = noteFingerprint(n && n.text);
      if (!fp || seen.has(fp)) continue;
      seen.add(fp);
      newNotes.push({
        id: makeId(),
        page: (n && n.page) || "",
        isQuote: !!(n && n.isQuote),
        text: n.text,
        isVoice: false,
        isTime: false,
        date: today,
      });
    }
    const existing = byTitle.get(key);
    if (existing) {
      const have = new Set((existing.notes || []).map((n) => noteFingerprint(n.text)));
      const fresh = newNotes.filter((n) => !have.has(noteFingerprint(n.text)));
      // Only genuine upgrades become fields — an unchanged book yields no write.
      const fields = {};
      if (!existing.read && item.read) fields.read = true;
      if (item.shelf === "owned" && existing.shelf !== "owned") fields.shelf = "owned";
      if (!existing.overall && item.overall) fields.overall = item.overall;
      if ((!existing.genres || existing.genres.length === 0) && item.genres?.length) fields.genres = item.genres;
      if (!existing.coverUrl && item.coverUrl) fields.coverUrl = item.coverUrl;
      Object.assign(existing, fields);
      existing.notes = [...fresh, ...existing.notes];
      if (addedIds.has(existing.id)) {
        // Same title twice within one file (e.g. casing variants): merged into
        // the pending addition object — its INSERT already carries this.
      } else if (fresh.length || Object.keys(fields).length) {
        updates.push({ id: existing.id, fields, newNotes: fresh });
      }
    } else {
      const book = {
        id: makeId(),
        title: item.title,
        author: item.author || "Unknown author",
        year: null,
        coverUrl: item.coverUrl || "",
        genres: item.genres || [],
        shelf: item.shelf || "owned",
        read: !!item.read,
        overall: item.overall || 0,
        smut: 0,
        formats: ["print"],
        progress: item.progress || {},
        notes: newNotes,
      };
      additions.push(book);
      addedIds.add(book.id);
      byTitle.set(key, book); // unique-by-title holds within the batch too
    }
  }
  return { next: [...additions, ...updated], additions, updates };
}

/* ── harness (same style as tests/_progress_unit.mjs) ── */

let pass = 0, fail = 0;
const fails = [];
function check(id, desc, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; }
  else { fail++; fails.push(`${id} ${desc}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
}
const mkId = () => { let i = 0; return () => `id-${++i}`; };
const TODAY = "Jul 6";

/* ── U-NF: noteFingerprint normalization ── */
check("U-NF-identity", "same string, same fp",
  noteFingerprint("He was villain and savior both.") === noteFingerprint("He was villain and savior both."), true);
check("U-NF-case", "case-insensitive",
  noteFingerprint("Love is a Dagger") === noteFingerprint("love is a dagger"), true);
check("U-NF-ws", "whitespace variants collapse",
  noteFingerprint("  He was\tvillain\nand  savior both. ") === noteFingerprint("He was villain and savior both."), true);
check("U-NF-punct", "smart quotes/em-dash/ellipsis stripped",
  noteFingerprint("“He was villain — and savior, both…”") === noteFingerprint("He was villain and savior both"), true);
check("U-NF-nbsp", "NBSP treated as space",
  noteFingerprint("It’s quiet") === noteFingerprint("its quiet"), true);
check("U-NF-bom", "leading BOM ignored",
  noteFingerprint("﻿hello there") === noteFingerprint("hello there"), true);
check("U-NF-diff", "different text, different fp",
  noteFingerprint("he was villain") === noteFingerprint("he was a villain"), false);
check("U-NF-accents", "accents NOT folded (prototype parity)",
  noteFingerprint("café") === noteFingerprint("cafe"), false);

/* ── E-NF: malformed fingerprint input ── */
check("E-NF-empty", "empty string", noteFingerprint(""), "");
check("E-NF-null", "null", noteFingerprint(null), "");
check("E-NF-undef", "undefined", noteFingerprint(undefined), "");
check("E-NF-num", "number (no throw)", noteFingerprint(42), "");
check("E-NF-obj", "object (no throw)", noteFingerprint({ text: "x" }), "");
check("E-NF-punct-only", "punctuation-only", noteFingerprint("…!!! —"), "");
{
  const big = "Sing in me, Muse — and through me tell the story. ".repeat(20000); // ~1MB
  check("E-NF-huge-stable", "1MB input stable", noteFingerprint(big) === noteFingerprint(big), true);
  check("E-NF-huge-diff", "1MB input still discriminates", noteFingerprint(big) === noteFingerprint(big + "y"), false);
}

/* ── M: merge decision ── */

// M-new: fresh shelf, one book, two notes
{
  const items = [{
    title: "A Court of Thorns", author: "SJM", read: true, shelf: "owned", overall: 4,
    notes: [
      { page: "12", isQuote: true, text: "He was villain and savior both." },
      { page: "loc 340", isQuote: false, text: "Second thought" },
    ],
  }];
  const r = mergeImport([], items, TODAY, mkId());
  check("M-new-counts", "1 addition, 0 updates", [r.additions.length, r.updates.length], [1, 0]);
  check("M-new-note-shape", "note carries page/isQuote/text/isVoice/isTime/date",
    r.additions[0].notes[0],
    { id: "id-1", page: "12", isQuote: true, text: "He was villain and savior both.", isVoice: false, isTime: false, date: TODAY });
  check("M-new-defaults", "defaults: formats print, smut 0, year null",
    [r.additions[0].formats, r.additions[0].smut, r.additions[0].year], [["print"], 0, null]);
  check("M-new-next", "next contains the addition first", r.next[0].title, "A Court of Thorns");

  // M-idem: importing the same file into the resulting state is a no-op
  const r2 = mergeImport(r.next, items, TODAY, mkId());
  check("M-idem-counts", "re-import: 0 additions, 0 updates", [r2.additions.length, r2.updates.length], [0, 0]);
  check("M-idem-state", "re-import: state identical", JSON.stringify(r2.next) === JSON.stringify(r.next), true);

  // M-idem-variant: same highlights, different whitespace/case/punctuation
  const variants = [{
    title: "a court of thorns", read: true, shelf: "owned",
    notes: [
      { page: "12", isQuote: true, text: "  He was VILLAIN — and savior, both!  " },
      { page: "loc 340", isQuote: false, text: "second   thought…" },
    ],
  }];
  const r3 = mergeImport(r.next, variants, TODAY, mkId());
  check("M-idem-variant", "variant re-import: 0 additions, 0 updates", [r3.additions.length, r3.updates.length], [0, 0]);
}

// M-merge-notes: existing note + one variant + one genuinely new
{
  const shelf = [{ id: "b1", title: "Bride", author: "AH", coverUrl: "c.jpg", genres: ["g"], shelf: "owned",
    read: true, overall: 5, smut: 0, formats: ["print"], progress: {}, notes: [{ id: "n1", text: "Hello world.", page: "1" }] }];
  const r = mergeImport(shelf, [{ title: "bride", notes: [
    { page: "1", isQuote: true, text: "hello,  WORLD" },
    { page: "9", isQuote: true, text: "Brand new line" },
  ] }], TODAY, mkId());
  check("M-merge-notes-counts", "0 additions, 1 update", [r.additions.length, r.updates.length], [0, 1]);
  check("M-merge-notes-fresh", "only the genuinely-new note inserted",
    r.updates[0].newNotes.map((n) => n.text), ["Brand new line"]);
  check("M-merge-notes-id", "update targets existing book id", r.updates[0].id, "b1");
  check("M-merge-notes-state", "book now has 2 notes", r.next.find((b) => b.id === "b1").notes.length, 2);
}

// M-merge-fields: genuine upgrades only
{
  const shelf = [{ id: "b2", title: "Bride", author: "AH", coverUrl: "", genres: [], shelf: "wishlist",
    read: false, overall: 0, smut: 0, formats: ["print"], progress: {}, notes: [] }];
  const r = mergeImport(shelf, [{ title: "BRIDE", read: true, shelf: "owned", overall: 4,
    genres: ["romantasy"], coverUrl: "https://x/y.jpg", notes: [] }], TODAY, mkId());
  check("M-merge-fields", "exactly the 5 upgrades", r.updates[0].fields,
    { read: true, shelf: "owned", overall: 4, genres: ["romantasy"], coverUrl: "https://x/y.jpg" });
  check("M-merge-fields-state", "state reflects the upgrades",
    [r.next[0].read, r.next[0].shelf, r.next[0].overall], [true, "owned", 4]);
  check("M-title-case", "case-variant title merged, not added", r.additions.length, 0);
}

// M-no-clobber: weaker import must not downgrade
{
  const shelf = [{ id: "b3", title: "Bride", author: "AH", coverUrl: "c.jpg", genres: ["g"], shelf: "owned",
    read: true, overall: 5, smut: 0, formats: ["print"], progress: {}, notes: [] }];
  const r = mergeImport(shelf, [{ title: "bride", read: false, shelf: "wishlist", overall: 3,
    genres: ["other"], coverUrl: "z.jpg", notes: [] }], TODAY, mkId());
  check("M-no-clobber-writes", "no update row at all", r.updates.length, 0);
  check("M-no-clobber-state", "book untouched",
    [r.next[0].read, r.next[0].shelf, r.next[0].overall, r.next[0].coverUrl, r.next[0].genres],
    [true, "owned", 5, "c.jpg", ["g"]]);
}

// M-batch-dup-title: one file, same title twice (casing variants) = ONE row
{
  const r = mergeImport([], [
    { title: "Fourth Wing", notes: [{ page: "1", isQuote: true, text: "Dragons choose" }] },
    { title: "FOURTH WING", read: true, notes: [{ text: "dragons   choose!" }, { text: "Second highlight" }] },
  ], TODAY, mkId());
  check("M-batch-dup-title-counts", "1 addition, 0 updates (merged into pending insert)",
    [r.additions.length, r.updates.length], [1, 0]);
  check("M-batch-dup-title-notes", "notes unioned by fingerprint",
    r.additions[0].notes.map((n) => n.text).sort(), ["Dragons choose", "Second highlight"]);
  check("M-batch-dup-title-fields", "later item's read merged into the pending insert",
    r.additions[0].read, true);
}

// M-batch-dup-note: same highlight repeated within one item
{
  const r = mergeImport([], [{ title: "Solo", notes: [
    { text: "Only once" }, { text: "Only once" }, { text: "  only ONCE!  " },
  ] }], TODAY, mkId());
  check("M-batch-dup-note", "kept exactly one note", r.additions[0].notes.length, 1);
}

/* ── E-M: malformed merge input ── */
{
  const prev = [{ id: "b9", title: "Keep", author: "A", coverUrl: "", genres: [], shelf: "wishlist",
    read: false, overall: 0, smut: 0, formats: ["print"], progress: {}, notes: [{ id: "n1", text: "old" }] }];
  const snapshot = JSON.stringify(prev);

  const rNull = mergeImport(prev, null, TODAY, mkId());
  check("E-M-null-items", "null items: no changes", [rNull.additions.length, rNull.updates.length, rNull.next.length], [0, 0, 1]);

  const rEmpty = mergeImport(prev, [], TODAY, mkId());
  check("E-M-empty-items", "empty items: no changes", [rEmpty.additions.length, rEmpty.updates.length], [0, 0]);

  const rBadTitles = mergeImport(prev, [null, {}, { title: "" }, { title: "   " }, { title: 42 }], TODAY, mkId());
  check("E-M-no-title", "missing/empty/non-string titles all skipped",
    [rBadTitles.additions.length, rBadTitles.updates.length], [0, 0]);

  const rBadNotes = mergeImport(prev, [{ title: "Ok", notes: [null, {}, { text: 42 }, { text: "" }, { text: "…" }] }], TODAY, mkId());
  check("E-M-bad-notes", "book added, every malformed note dropped",
    [rBadNotes.additions.length, rBadNotes.additions[0].notes.length], [1, 0]);

  mergeImport(prev, [{ title: "keep", read: true, notes: [{ text: "new note" }] }], TODAY, mkId());
  check("M-immutable", "prev books not mutated", JSON.stringify(prev) === snapshot, true);
}

// M-ids: injected id factory used for both books and notes, all unique
{
  const r = mergeImport([], [{ title: "T", notes: [{ text: "a" }, { text: "b" }] }], TODAY, mkId());
  const ids = [r.additions[0].id, ...r.additions[0].notes.map((n) => n.id)];
  check("M-ids-unique", "book + note ids distinct", new Set(ids).size, 3);
}

console.log(`PASS ${pass}  FAIL ${fail}`);
if (fails.length) { console.log("FAILURES:"); for (const f of fails) console.log("  " + f); }
process.exit(fail ? 1 : 0);
