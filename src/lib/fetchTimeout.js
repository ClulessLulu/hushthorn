/* ── Give up on a hung request ───────────────────────────────────
   callClaude() had no timeout, so a request that never answered left the Snap
   button disabled ("Reading the screen…") until the panel was closed, and the
   cover scan spinner running forever. This wraps one async job with an
   AbortController. `run` receives the signal and must pass it to fetch, and
   must read the response body inside `run` so a stalled body is covered too.
   Pure of the DOM (AbortController exists in Node), so tests/fetch-timeout-unit.mjs
   runs the real code.

   On timeout it aborts the signal and throws an Error named "TimeoutError", even
   if `run` ignores the signal; any other error from `run` passes through
   untouched. timeoutMs <= 0 / undefined / not a number means no limit.
──────────────────────────────────────────────────────────────── */

// A vision read normally takes a few seconds; this is generous but finite.
export const AI_VISION_TIMEOUT_MS = 30000;

export async function withTimeout(timeoutMs, run) {
  if (!(typeof timeoutMs === "number" && timeoutMs > 0)) return run(undefined);
  const controller = new AbortController();
  let timer;
  // Race against the timer instead of only relying on the abort: a job that
  // ignores the signal must still be given up on.
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`Request timed out after ${timeoutMs} ms`);
      e.name = "TimeoutError";
      // Reject BEFORE aborting: abort() runs the job's abort handler synchronously,
      // and its AbortError would otherwise settle first and win the race.
      reject(e);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
