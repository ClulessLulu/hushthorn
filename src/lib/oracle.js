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

// Haiku (owner's call, 2026-11-17): Sonnet 4.6 took ~14.5 s. Haiku invents or
// misattributes some books, and each pick is checked against Open Library
// before it shows (verifyPick), so ask for 10 to leave 5 after drops.
export const ORACLE_MODEL = 'claude-haiku-5-5';
export const ORACLE_COUNT = 10;
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
At most 3 may be widely known bestsellers. Only recommend books you are certain exist, with the author's name exactly as printed on the cover; never invent a title.${avoid.length ? `
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

// Loose title key: case, punctuation, "&" vs "and", and a leading article don't matter.
const titleKey = (t) => clean(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/^(the|a|an) /, '').replace(/\s+/g, ' ').trim();

// Check a pick against an Open Library search reply (title + author query).
// 'ok' with a cover when a result has the same title and the pick's author;
// 'gone' when Open Library answered and nothing matches (an invented book, or
// the wrong author: Haiku credited Tracy Deonn's "Bloodmarked" to Tracy Wolff);
// 'unknown' when there was no usable reply, so the pick is shown unchecked.
export function verifyPick(rec, olReply) {
  if (!olReply || !Array.isArray(olReply.docs)) return { status: 'unknown', coverUrl: '' };
  const want = titleKey(rec?.title);
  const surname = clean(rec?.author).toLowerCase().split(' ').pop();
  const doc = olReply.docs.find((d) => titleKey(d?.title) === want &&
    surname && (Array.isArray(d?.author_name) ? d.author_name : []).some((n) => clean(n).toLowerCase().includes(surname)));
  if (!want || !doc) return { status: 'gone', coverUrl: '' };
  const id = doc.cover_i;
  return { status: 'ok', coverUrl: Number.isInteger(id) && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : '' };
}

// Picks already suggested are dropped here too: the prompt asks the model to
// avoid them, but Haiku sometimes repeats one anyway ("Iron Widow ... Already
// suggested and excluded; replaced below." showed up as a card).
export function dropSeen(recs, seen) {
  const keys = new Set(list(seen).map((t) => t.toLowerCase()));
  return (Array.isArray(recs) ? recs : []).filter((r) => !keys.has(clean(r?.title).toLowerCase()));
}

// What the Oracle's polite live region says (a11y audit O1). One short line per
// phase, not per card: the text only changes when the phase changes, so a
// screen reader is not read the whole list again each time a pick lands.
// An error says nothing here; the error has its own role="alert".
// With no picks on screen the same line is shown, so its copy is the visible copy.
export function oracleStatusText({ loading = false, checking = false, shown = 0, consulted = false, error = false } = {}) {
  if (error) return '';
  const n = Number.isInteger(shown) && shown > 0 ? shown : 0;
  const busy = !!(loading || checking);
  if (busy) return n === 0 ? 'Reading the leaves of your library…' : 'Picks are arriving…';
  if (n > 0) return `${n} ${n === 1 ? 'pick' : 'picks'} from the Oracle.`;
  if (consulted) return 'The Oracle has given all it saw — consult again for a fresh reading.';
  return '';
}
