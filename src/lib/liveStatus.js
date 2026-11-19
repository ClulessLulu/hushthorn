/* ── What a long run says in its polite live region ──
   Pure, so tests/live-status-unit.mjs runs the real code.
   Your Profile's trope backfill used to change its status text on every book,
   so a screen reader spoke up to 59 times (review m2). The text now changes at
   the start, every `step` books, and at the end; between those it is the same
   string, and an unchanged live region says nothing.
──────────────────────────────────────────────────────────────── */
const count = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

export function bulkTropeStatusText({ running = false, done = 0, total = 0, results = null, step = 10 } = {}) {
  const t = count(total);
  if (running) {
    const every = count(step) || 10;
    const milestone = Math.floor(Math.min(count(done), t) / every) * every;
    if (milestone === 0) return `Divining tropes for ${t} tome${t === 1 ? '' : 's'}…`;
    return `Divining… ${milestone} of ${t}`;
  }
  if (results && typeof results === 'object') {
    const tagged = Array.isArray(results.touched) ? results.touched.length : 0;
    const failed = Array.isArray(results.failed) ? results.failed.length : 0;
    return `${results.stopped ? 'Stopped early. ' : ''}${tagged} tagged${failed ? `, ${failed} could not be saved` : ''}. Review the list below.`;
  }
  return '';
}
