// What the trope backfill announces. Imports the real module.
// Run: node tests/live-status-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkTropeStatusText } from '../src/lib/liveStatus.js';

const run = (done, total = 59) => bulkTropeStatusText({ running: true, done, total });

test('a 59-book run speaks at the start, every 10 books, and nowhere in between', () => {
  const said = [];
  for (let d = 0; d <= 59; d++) { const t = run(d); if (said[said.length - 1] !== t) said.push(t); }
  assert.deepEqual(said, [
    'Divining tropes for 59 tomes…',
    'Divining… 10 of 59', 'Divining… 20 of 59', 'Divining… 30 of 59', 'Divining… 40 of 59', 'Divining… 50 of 59',
  ]);
});

test('between milestones the text is identical, so the live region stays quiet', () => {
  assert.equal(run(11), run(19));
  assert.equal(run(1), run(9));
  assert.notEqual(run(9), run(10));
});

test('the finish: tagged, failed, stopped', () => {
  assert.equal(bulkTropeStatusText({ results: { touched: [1, 2, 3], failed: [] } }), '3 tagged. Review the list below.');
  assert.equal(bulkTropeStatusText({ results: { touched: [1], failed: [1, 2], stopped: true } }), 'Stopped early. 1 tagged, 2 could not be saved. Review the list below.');
  assert.equal(bulkTropeStatusText({ results: { touched: [], failed: [] } }), '0 tagged. Review the list below.');
});

test('one tome, empty, and idle', () => {
  assert.equal(run(0, 1), 'Divining tropes for 1 tome…');
  assert.equal(run(1, 1), 'Divining tropes for 1 tome…');
  assert.equal(bulkTropeStatusText({}), '');
  assert.equal(bulkTropeStatusText(), '');
});

test('malformed input does not throw', () => {
  assert.equal(bulkTropeStatusText({ running: true, done: 'x', total: null }), 'Divining tropes for 0 tomes…');
  assert.equal(run(500, 20), 'Divining… 20 of 20');       // done past total is capped
  assert.equal(bulkTropeStatusText({ running: true, done: 30, total: 59, step: 0 }), 'Divining… 30 of 59'); // bad step falls back to 10
  assert.equal(bulkTropeStatusText({ results: { touched: 'oops', failed: null } }), '0 tagged. Review the list below.');
});

test('run twice: same answer', () => {
  assert.equal(run(23), run(23));
});
