// Reading a streamed Claude reply. Imports the real module.
// Run: node tests/sse-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSse } from '../src/lib/sse.js';

const ev = (o) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
const delta = (t) => ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } });

test('text deltas come out in order; other events are ignored', () => {
  const buf = ev({ type: 'message_start' }) + delta('Hel') + delta('lo') + ev({ type: 'message_stop' });
  assert.deepEqual(readSse(buf), { texts: ['Hel', 'lo'], error: false, rest: '' });
});

test('an event cut in half is kept as the rest for the next chunk', () => {
  const full = delta('A') + delta('B');
  const cut = full.slice(0, full.length - 10);
  const first = readSse(cut);
  assert.deepEqual(first.texts, ['A']);
  const second = readSse(first.rest + full.slice(full.length - 10));
  assert.deepEqual(second.texts, ['B']);
});

test('CRLF line endings are read too', () => {
  assert.deepEqual(readSse(delta('X').replace(/\n/g, '\r\n')).texts, ['X']);
});

test('an error event is reported', () => {
  assert.equal(readSse(ev({ type: 'error', error: { type: 'overloaded_error' } })).error, true);
});

test('empty, junk data and thinking deltas give no text', () => {
  assert.deepEqual(readSse('').texts, []);
  assert.deepEqual(readSse(undefined).texts, []);
  assert.deepEqual(readSse('data: not json\n\n').texts, []);
  assert.deepEqual(readSse(ev({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } })).texts, []);
});

test('reading the same buffer twice gives the same result', () => {
  const b = delta('A');
  assert.deepEqual(readSse(b), readSse(b));
});
