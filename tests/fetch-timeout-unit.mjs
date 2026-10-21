// withTimeout: give up on a hung AI request. Imports the REAL module.
// Run: npm test   (or: node --test tests/fetch-timeout-unit.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout, AI_VISION_TIMEOUT_MS } from "../src/lib/fetchTimeout.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A job that honours the abort signal, like fetch does.
const hangsUntilAborted = (signal) => new Promise((_, reject) => {
  signal.addEventListener("abort", () => { const e = new Error("The operation was aborted"); e.name = "AbortError"; reject(e); });
});

test("no limit when timeoutMs is missing, zero, negative, NaN or not a number", async () => {
  for (const t of [undefined, null, 0, -5, NaN, "30"]) {
    let sawSignal = "unset";
    const out = await withTimeout(t, async (signal) => { sawSignal = signal; return "ok"; });
    assert.equal(out, "ok");
    assert.equal(sawSignal, undefined, `timeoutMs=${String(t)} should pass no signal`);
  }
});

test("a job that finishes in time returns its value and is never aborted", async () => {
  let signal;
  const out = await withTimeout(50, async (s) => { signal = s; await sleep(5); return { content: [1] }; });
  assert.deepEqual(out, { content: [1] });
  await sleep(120); // well past the limit: the timer must have been cleared
  assert.equal(signal.aborted, false);
});

test("a job that fails fast keeps its own error (name and message untouched)", async () => {
  const boom = Object.assign(new Error("Claude API error 413"), { status: 413 });
  await assert.rejects(withTimeout(200, async () => { throw boom; }), (e) => e === boom);
});

test("a hung job that honours the signal times out with TimeoutError and the signal is aborted", async () => {
  let signal;
  await assert.rejects(
    withTimeout(30, (s) => { signal = s; return hangsUntilAborted(s); }),
    (e) => e.name === "TimeoutError" && /30 ms/.test(e.message),
  );
  assert.equal(signal.aborted, true);
});

test("the surfaced error is TimeoutError, not the AbortError the abort causes", async () => {
  try { await withTimeout(20, hangsUntilAborted); assert.fail("should have thrown"); }
  catch (e) { assert.equal(e.name, "TimeoutError"); }
});

test("a hung job that IGNORES the signal is still given up on, in bounded time", async () => {
  const started = Date.now();
  await assert.rejects(withTimeout(40, () => new Promise(() => {})), (e) => e.name === "TimeoutError");
  assert.ok(Date.now() - started < 1000, "must not wait for the stuck job");
});

test("a job that fails after the limit does not cause an unhandled rejection", async () => {
  const unhandled = [];
  const onUnhandled = (r) => unhandled.push(r);
  process.on("unhandledRejection", onUnhandled);
  await assert.rejects(withTimeout(20, (s) => new Promise((_, rej) => setTimeout(() => rej(new Error("late")), 60))), (e) => e.name === "TimeoutError");
  await sleep(120);
  process.off("unhandledRejection", onUnhandled);
  assert.deepEqual(unhandled, []);
});

test("the vision limit is finite, positive and under a minute", () => {
  assert.ok(Number.isFinite(AI_VISION_TIMEOUT_MS) && AI_VISION_TIMEOUT_MS > 0 && AI_VISION_TIMEOUT_MS <= 60000);
});
