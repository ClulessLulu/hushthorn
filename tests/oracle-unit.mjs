// The Oracle's prompt building and reply cleaning. Imports the real module.
// Run: node tests/oracle-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oracleLibraryLines, buildOraclePrompt, cleanRecs, rememberSeen, ORACLE_SEEN_MAX, ORACLE_MODEL, ORACLE_COUNT } from '../src/lib/oracle.js';

const book = (o) => ({ title: 'T', author: 'A', shelf: 'owned', read: false, overall: 0, smut: 0, tropes: [], genres: [], ...o });

test('library lines carry status, ratings, tropes and at most two genres', () => {
  const s = oracleLibraryLines([book({ title: 'Dark Thing', author: 'Ann', read: true, overall: 5, smut: 4,
    tropes: ['Slow Burn', 'Enemies to Lovers'], genres: ['Fantasy', 'Romance', 'Gothic'] })]);
  assert.equal(s, 'Dark Thing — Ann | read | verdict 5 | smoulder 4 | tropes: Slow Burn, Enemies to Lovers | genres: Fantasy, Romance');
});

test('library lines: wishlist, unrated, no author, and broken rows', () => {
  const s = oracleLibraryLines([book({ title: 'Wish', shelf: 'wishlist', author: '' }), null, { title: '  ' }, book({ title: 'X', tropes: 'oops', genres: null })]);
  assert.equal(s, 'Wish — Unknown author | wishlist\nX — A | owned, unread');
});

test('library lines: empty or not a list gives an empty string', () => {
  assert.equal(oracleLibraryLines([]), '');
  assert.equal(oracleLibraryLines(undefined), '');
});

test('prompt names already-suggested titles only when there are some', () => {
  assert.ok(!buildOraclePrompt([book({})], []).includes('already suggested'));
  const p = buildOraclePrompt([book({})], ['Old One', 'Old Two']);
  assert.ok(p.includes('Do NOT recommend any of these, already suggested to this reader: Old One; Old Two.'));
  assert.ok(p.includes('at most 20 words'));
  assert.ok(p.includes('At most 3 may be widely known bestsellers'));
});

test('cleanRecs drops untitled entries and repeats, and clamps spice', () => {
  const out = cleanRecs([null, {}, { title: '  ' }, { title: 'A', spice: 99 }, { title: 'a', spice: 2 },
    { title: 'B', spice: 'very', author: 7 }, { title: ' C ', spice: '3', reason: 'Good\n fit' }]);
  assert.deepEqual(out, [
    { title: 'A', author: '', genre: '', reason: '', spice: 5 },
    { title: 'B', author: '', genre: '', reason: '', spice: 0 },
    { title: 'C', author: '', genre: '', reason: 'Good fit', spice: 3 },
  ]);
});

test('cleanRecs: not an array gives an empty list', () => {
  assert.deepEqual(cleanRecs(null), []);
  assert.deepEqual(cleanRecs({ title: 'A' }), []);
});

test('rememberSeen puts newest first, drops repeats in any case, caps the list', () => {
  assert.deepEqual(rememberSeen(['Old', 'NEW'], [{ title: 'New' }, { title: 'Fresh' }, null]), ['New', 'Fresh', 'Old']);
  const many = Array.from({ length: 100 }, (_, i) => ({ title: `T${i}` }));
  assert.equal(rememberSeen([], many).length, ORACLE_SEEN_MAX);
  assert.deepEqual(rememberSeen(undefined, undefined), []);
});

test('rememberSeen run twice with the same recs changes nothing', () => {
  const once = rememberSeen(['Old'], [{ title: 'A' }]);
  assert.deepEqual(rememberSeen(once, [{ title: 'A' }]), once);
});

test('the Oracle asks Haiku for exactly 7 picks', () => {
  assert.equal(ORACLE_MODEL, 'claude-haiku-5-5');
  assert.equal(ORACLE_COUNT, 7);
  assert.ok(buildOraclePrompt([book({})]).includes('Recommend exactly 7 real, published books'));
});
