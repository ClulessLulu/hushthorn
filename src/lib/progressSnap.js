/* ── Snap-to-update: pure progress logic ─────────────────────────
   Shared by ProgressEditor (src/App.jsx) and tests/progress-snap-unit.mjs,
   so the tests exercise the real code, not a copy.

   Invariants:
   - A snap NEVER writes null/blank over a stored number. Unread fields are
     left untouched (a page photo never shows the total page count).
   - A snap that read nothing is "nothing" (null), never a 0% result.
   - Print books learn chapter → page per book in progress.print.chapters
     ({ "3": 5 }), so a later snap of that chapter's heading fills the page.
──────────────────────────────────────────────────────────────── */

// Coerce a vision value to a finite number, or null (never a false 0).
export function coerceShotNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Positive whole number (page, chapter) or null.
export function posInt(v) {
  const n = coerceShotNum(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

// Reduce Claude's parsed JSON to the fields this format reads. Returns null
// when nothing usable was read, so the UI shows the manual fallback instead
// of an Apply button that would write blanks.
export function shapeProgressShot(parsed, fmt) {
  if (!parsed || typeof parsed !== "object") return null;
  let shot = null;
  if (fmt === "print") {
    shot = { page: posInt(parsed.page), chapter: posInt(parsed.chapter) };
  } else if (fmt === "ebook") {
    const p = coerceShotNum(parsed.percent);
    shot = { percent: p !== null && p >= 0 && p <= 100 ? p : null };
  } else if (fmt === "audio") {
    const pos = (v) => { const n = coerceShotNum(v); return n !== null && n >= 0 ? n : null; };
    // `remaining` is the "time left" many players show instead of time listened.
    shot = { listened: pos(parsed.listened), remaining: pos(parsed.remaining), hours: pos(parsed.hours) };
  }
  if (!shot) return null;
  return Object.values(shot).some((v) => v !== null) ? shot : null;
}

// Stored chapter map as sorted [{ chapter, page }], ignoring malformed entries.
export function knownChapters(chapters) {
  if (!chapters || typeof chapters !== "object") return [];
  return Object.entries(chapters)
    .map(([c, p]) => ({ chapter: posInt(c), page: posInt(p) }))
    .filter((e) => e.chapter !== null && e.page !== null)
    .sort((a, b) => a.chapter - b.chapter);
}

// Best page for a chapter heading with no printed page number.
// { page, source: "map" | "guess" } — page is null when there's nothing to go on.
export function guessChapterPage(chapter, chapters, savedPage) {
  const known = knownChapters(chapters);
  const hit = known.find((e) => e.chapter === chapter);
  if (hit) return { page: hit.page, source: "map" };

  const lower = [...known].reverse().find((e) => e.chapter < chapter);
  const upper = known.find((e) => e.chapter > chapter);
  const saved = posInt(savedPage);
  let page = null;

  if (lower && upper) {
    // Between two known chapters: interpolate.
    const per = (upper.page - lower.page) / (upper.chapter - lower.chapter);
    page = lower.page + per * (chapter - lower.chapter);
  } else if (known.length >= 2) {
    // Outside the known range: extrapolate at the average chapter length.
    const first = known[0], last = known[known.length - 1];
    const per = (last.page - first.page) / (last.chapter - first.chapter);
    const anchor = lower || upper;
    page = anchor.page + per * (chapter - anchor.chapter);
  } else if (lower) {
    page = saved && saved > lower.page ? saved + 1 : lower.page + 1;
  } else if (saved) {
    page = saved + 1;
  }
  if (page === null) return { page: null, source: "guess" };
  page = Math.round(page);
  // Keep the guess in order: after the chapter before it, before the one after.
  if (upper && page >= upper.page) page = upper.page - 1;
  if (lower && page <= lower.page) page = lower.page + 1;
  return { page: Math.max(1, page), source: "guess" };
}

// Turn a print shot into what the confirm strip shows.
// needsPage: true when the reader must confirm/enter the page (no printed
// number and the chapter isn't in this book's map yet).
export function planPrintSnap(shot, storedPrint) {
  const prev = storedPrint && typeof storedPrint === "object" ? storedPrint : {};
  const chapter = shot ? posInt(shot.chapter) : null;
  let page = shot ? posInt(shot.page) : null;
  let needsPage = false;
  if (page === null && chapter !== null) {
    const g = guessChapterPage(chapter, prev.chapters, prev.page);
    page = g.page;
    needsPage = g.source !== "map";
  } else if (page === null) {
    needsPage = true;
  }
  return { page, chapter, needsPage, pages: posInt(prev.pages) };
}

// True when the snapped page runs past this edition's stored total.
export function isPastTotal(page, pages) {
  const p = posInt(page), t = posInt(pages);
  return p !== null && t !== null && p > t;
}

// Merge a confirmed print snap into stored progress.print. Only valid numbers
// are written; a chapter is learned only alongside a valid page.
export function applyPrintSnap(storedPrint, { page, chapter, pages } = {}) {
  const prev = storedPrint && typeof storedPrint === "object" ? storedPrint : {};
  const next = { ...prev };
  const p = posInt(page), c = posInt(chapter), t = posInt(pages);
  if (p !== null) next.page = p;
  if (t !== null) next.pages = t;
  if (p !== null && c !== null) {
    const map = prev.chapters && typeof prev.chapters === "object" ? prev.chapters : {};
    next.chapters = { ...map, [c]: p };
  }
  return next;
}

// Merge an ebook/audio shot: write only the fields that were read.
export function applySimpleSnap(storedFmt, shot) {
  const prev = storedFmt && typeof storedFmt === "object" ? storedFmt : {};
  const next = { ...prev };
  for (const [k, v] of Object.entries(shot || {})) {
    if (typeof v === "number" && Number.isFinite(v)) next[k] = v;
  }
  return next;
}

/* ── Audiobook ────────────────────────────────────────────────────
   Players show either time listened or time LEFT. Recording a "left" value
   as "listened" makes progress run backwards, and a listened time longer than
   the book clamps to 100%, which auto-marks the book Read (updateBook).
   So: derive listened from time left when the total is known, and never let a
   listened > total pair through to a write.
──────────────────────────────────────────────────────────────── */

// Positive decimal number from a number or an input string, else null.
function posNum(v) {
  const n = typeof v === "string" && v.trim() === "" ? null : coerceShotNum(v);
  return n !== null && n > 0 ? n : null;
}
// Non-negative decimal number (0 allowed) from a number or input string, else null.
function nonNegNum(v) {
  const n = typeof v === "string" && v.trim() === "" ? null : coerceShotNum(v);
  return n !== null && n >= 0 ? n : null;
}
const round2 = (n) => Math.round(n * 100) / 100;

// What the audio confirm strip should show for a shot.
// reason: "needs-total" (screen showed only time left and no total is known)
//       | "inconsistent" (time left is longer than the total) | null.
export function planAudioSnap(shot, storedAudio) {
  const prev = storedAudio && typeof storedAudio === "object" ? storedAudio : {};
  let listened = nonNegNum(shot && shot.listened);
  // Screens that show both "listened" and "time left" give the total for free.
  const lp = posNum(shot && shot.listened);
  const rp = posNum(shot && shot.remaining);
  const sum = lp !== null && rp !== null ? round2(lp + rp) : null;
  const hours = posNum(shot && shot.hours) ?? sum ?? posNum(prev.hours);
  let derived = false;
  let reason = null;
  if (listened === null) {
    const remaining = nonNegNum(shot && shot.remaining);
    if (remaining !== null) {
      if (hours === null) reason = "needs-total";
      else if (remaining > hours) reason = "inconsistent";
      else { listened = round2(hours - remaining); derived = true; }
    }
  }
  return { listened, hours, derived, reason };
}

// Validate the (editable) listened/total pair before writing. Inputs may be
// strings straight from <input>. ok=false means Apply must stay disabled.
// problem: "nothing" | "past-total" | null.
export function checkAudioSnap(listenedIn, hoursIn) {
  const listened = nonNegNum(listenedIn);
  const hours = posNum(hoursIn);
  let problem = null;
  if (listened === null && hours === null) problem = "nothing";
  else if (listened !== null && hours !== null && listened > hours) problem = "past-total";
  return { ok: problem === null, listened, hours, problem };
}

/* ── Photo size ───────────────────────────────────────────────────
   Phone photos can exceed Vercel's 4.5 MB request-body limit once base64'd.
   Shots are downscaled in the browser first (see src/lib/snapImage.js).
──────────────────────────────────────────────────────────────── */

// Scale (w,h) down so the longest edge is at most `max`; never upscales.
// Returns whole-pixel { width, height } (each at least 1), or null for bad input.
export function fitWithin(w, h, max) {
  if (![w, h, max].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
