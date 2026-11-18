/* ── The Oracle: prompt building and reply cleaning ──
   Pure, so tests/oracle-unit.mjs runs the real code.
   Why each piece exists:
   - Compact lines instead of JSON: fewer input tokens for a big library.
   - Tropes are sent: they are the strongest taste signal and were missing.
   - `seen` lists titles already offered, so "Consult again" gives fresh picks
     (the same prompt used to return the same list every time).
   - Short reasons: output tokens are most of the wait.
   - JSON Lines (one book per line) so each pick can be shown the moment its
     line is complete while the reply streams in.
──────────────────────────────────────────────────────────────── */

// Haiku + 7 picks (owner's call, 2026-11-17): Sonnet 4.6 took ~14.5 s for 10.
// Only 5 show at a time, so 7 still leaves 2 in reserve.
export const ORACLE_MODEL = 'claude-haiku-5-5';
export const ORACLE_COUNT = 7;
export const ORACLE_SEEN_MAX = 60;

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const list = (a) => (Array.isArray(a) ? a.map(clean).filter(Boolean) : []);

// One line per book: "Title — Author | read | verdict 5 | smoulder 3 | tropes: A, B | genres: C".
export function oracleLibraryLines(books) {
  return (Array.isArray(books) ? books : [])
    .filter((b) => b && clean(b.title))
    .map((b) => {
      const parts = [`${clean(b.title)} — ${clean(b.author) || 'Unknown author'}`];
      parts.push(b.shelf === 'wishlist' ? 'wishlist' : b.read ? 'read' : 'owned, unread');
      if (b.overall > 0) parts.push(`verdict ${b.overall}`);
      if (b.smut > 0) parts.push(`smoulder ${b.smut}`);
      const tropes = list(b.tropes);
      if (tropes.length) parts.push(`tropes: ${tropes.join(', ')}`);
      const genres = list(b.genres).slice(0, 2);
      if (genres.length) parts.push(`genres: ${genres.join(', ')}`);
      return parts.join(' | ');
    })
    .join('\n');
}

export function buildOraclePrompt(books, seen = []) {
  const avoid = list(seen);
  return `You are the recommendation oracle for Hushthorn, a gothic book-cataloging app for romantasy and spicy-romance readers.

The reader's library, one book per line. "verdict" is their 1-5 overall rating, "smoulder" their 1-5 heat rating; missing means unrated:
${oracleLibraryLines(books)}

Infer their taste (tropes, heat, vibes), weighting highly rated, read and wishlisted books most. Recommend exactly ${ORACLE_COUNT} real, published books that are NOT in the library, best fit first.
At most 3 may be widely known bestsellers; the rest should be strong fits a well-read fan may not have found yet.${avoid.length ? `
Do NOT recommend any of these, already suggested to this reader: ${avoid.join('; ')}.` : ''}

Respond with ONLY JSON Lines: one JSON object per line, one line per book, best first. No array brackets, no preamble, no markdown fences. Each object has exactly these keys:
"title" (string), "author" (string), "genre" (short string, e.g. "Vampire romantasy"), "reason" (at most 15 words, why it fits THIS reader's taste), "spice" (integer 1-5, your estimate of its heat).`;
}

// AI output is untrusted: drop entries with no title, repeats, and junk types.
export function cleanRecs(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const title = clean(r?.title);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const spice = Number.parseInt(r.spice, 10);
    out.push({
      title,
      author: clean(r.author),
      genre: clean(r.genre),
      reason: clean(r.reason),
      spice: Number.isFinite(spice) ? Math.max(0, Math.min(5, spice)) : 0,
    });
  }
  return out;
}

// Titles offered so far, newest first, no repeats (any case), capped.
export function rememberSeen(prev, recs, max = ORACLE_SEEN_MAX) {
  const out = [];
  const keys = new Set();
  for (const t of [...(Array.isArray(recs) ? recs.map((r) => r?.title) : []), ...list(prev)]) {
    const title = clean(t);
    if (!title || keys.has(title.toLowerCase())) continue;
    keys.add(title.toLowerCase());
    out.push(title);
  }
  return out.slice(0, max);
}

// Picks from a reply that may still be arriving. Only complete lines count until
// `done`; the last line may be cut mid-object. Tolerates the model wrapping the
// lines in an array or fences anyway; if it pretty-printed a JSON array instead,
// the whole array is parsed once the reply is complete.
export function parseRecLines(text, done = false) {
  const s = typeof text === 'string' ? text : '';
  const lines = s.split(/\r?\n/);
  if (!done) lines.pop();
  const objs = [];
  for (const raw of lines) {
    const line = raw.trim().replace(/^[[,\s]+/, '').replace(/[\],\s]+$/, '');
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try { objs.push(JSON.parse(line)); } catch { /* half a line or junk: skip */ }
  }
  if (!objs.length && done) {
    const a = s.indexOf('['), b = s.lastIndexOf(']');
    if (a !== -1 && b > a) { try { return cleanRecs(JSON.parse(s.slice(a, b + 1))); } catch { /* not JSON */ } }
  }
  return cleanRecs(objs);
}
