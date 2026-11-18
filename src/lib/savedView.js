// Which screen to reopen after a page refresh. Kept in sessionStorage (this tab
// only), never in the URL hash or query: Supabase puts tokens and `#error=...`
// in the hash for emailed links, and authErrors.js reads and rewrites it.
export const VIEW_KEY = 'ht-view';

const RESTORABLE = ['oracle', 'pair'];

// Only the Oracle and the Codex are worth restoring. Missing, "library", junk,
// a wrong-case value or one from an older build all mean the library, so a bad
// stored value can never strand the reader on a blank screen.
export function parseSavedView(raw) {
  return typeof raw === 'string' && RESTORABLE.includes(raw) ? raw : 'library';
}
