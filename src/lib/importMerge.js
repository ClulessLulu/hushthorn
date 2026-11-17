// Import / batch-add merge logic. Pure functions, unit-tested in
// tests/import-dedupe-unit.mjs, which imports this file.

// Fingerprint a highlight for dedupe: lowercase, strip punctuation and quote
// glyphs, collapse whitespace. The same passage from different sources
// (clippings re-export, notebook export, re-import) converges to one stable
// string — the `noteFingerprint()` invariant documented in CLAUDE.md. Ported
// from the design prototype (prototype/hushthorn-demo.jsx) with a non-string
// guard added.
export function noteFingerprint(text) {
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
export function mergeImport(prevBooks, items, today, makeId) {
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
        // Keep the year a search pick carries (it used to be dropped here); file
        // imports have none, and anything that is not a whole number is ignored.
        year: Number.isInteger(item.year) ? item.year : null,
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
