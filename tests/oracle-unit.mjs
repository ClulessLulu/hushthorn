// The Oracle's prompt building and reply cleaning. Imports the real module.
// Run: node tests/oracle-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oracleLibraryLines, buildOraclePrompt, cleanRecs, rememberSeen, ORACLE_SEEN_MAX, ORACLE_MODEL, ORACLE_COUNT, parseRecLines, verifyPick, dropSeen } from '../src/lib/oracle.js';

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
  assert.ok(p.includes('at most 15 words'));
  assert.ok(p.includes('ONLY JSON Lines'));
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

test('the Oracle asks Haiku for exactly 10 picks', () => {
  assert.equal(ORACLE_MODEL, 'claude-haiku-5-5');
  assert.equal(ORACLE_COUNT, 10);
  assert.ok(buildOraclePrompt([book({})]).includes('Recommend exactly 10 real, published books'));
});

const line = (t) => JSON.stringify({ title: t, author: 'A', genre: 'G', reason: 'R', spice: 3 });

test('parseRecLines: while streaming, only complete lines count', () => {
  const partial = `${line('One')}\n${line('Two')}\n{"title":"Thr`;
  assert.deepEqual(parseRecLines(partial).map((r) => r.title), ['One', 'Two']);
  assert.deepEqual(parseRecLines(`${line('One')}`).map((r) => r.title), []); // no newline yet
  assert.deepEqual(parseRecLines(`${line('One')}`, true).map((r) => r.title), ['One']);
});

test('parseRecLines: tolerates fences, an array wrapper and trailing commas', () => {
  const text = '```json\n[\n' + line('A') + ',\n' + line('B') + '\n]\n```';
  assert.deepEqual(parseRecLines(text, true).map((r) => r.title), ['A', 'B']);
});

test('parseRecLines: a pretty-printed array is read once the reply is done', () => {
  const pretty = JSON.stringify([{ title: 'P', author: 'A' }], null, 2);
  assert.deepEqual(parseRecLines(pretty).map((r) => r.title), []);
  assert.deepEqual(parseRecLines(pretty, true).map((r) => r.title), ['P']);
});

test('parseRecLines: empty, junk and not-a-string give nothing', () => {
  assert.deepEqual(parseRecLines('', true), []);
  assert.deepEqual(parseRecLines('The stars are silent.\n', true), []);
  assert.deepEqual(parseRecLines(null, true), []);
});

test('parseRecLines run twice on the same text gives the same picks', () => {
  const t = `${line('A')}\n${line('B')}\n`;
  assert.deepEqual(parseRecLines(t), parseRecLines(t));
});

const ol = (...docs) => ({ docs });

test('verifyPick: same title and author shows, with the Open Library cover', () => {
  assert.deepEqual(verifyPick({ title: 'Serpent & Dove', author: 'Shelby Mahurin' },
    ol({ title: 'Serpent and Dove', author_name: ['Shelby Mahurin'], cover_i: 42 })),
    { status: 'ok', coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg' });
  assert.deepEqual(verifyPick({ title: 'The Cruel Prince', author: 'Holly Black' }, ol({ title: 'Cruel Prince', author_name: ['Holly Black'] })),
    { status: 'ok', coverUrl: '' });
});

test('verifyPick: an invented book or the wrong author is dropped', () => {
  assert.equal(verifyPick({ title: 'Ruthless Shadows', author: 'Liv Morris' }, ol()).status, 'gone');
  assert.equal(verifyPick({ title: 'Bloodmarked', author: 'Tracy Wolff' }, ol({ title: 'Bloodmarked', author_name: ['Tracy Deonn'], cover_i: 1 })).status, 'gone');
  assert.equal(verifyPick({ title: 'Blood and Honey', author: '' }, ol({ title: 'Blood and Honey', author_name: ['Tony Robinson'] })).status, 'gone');
});

test('verifyPick: no usable reply means unchecked, not dropped', () => {
  assert.equal(verifyPick({ title: 'A', author: 'B' }, null).status, 'unknown');
  assert.equal(verifyPick({ title: 'A', author: 'B' }, { error: 'x' }).status, 'unknown');
});

test('verifyPick: junk inside the reply does not throw', () => {
  assert.equal(verifyPick({ title: 'A', author: 'Bee' }, ol(null, { title: 7 }, { title: 'A', author_name: 'Bee' })).status, 'gone');
});

test('dropSeen removes already-suggested titles in any case, keeps the rest in order', () => {
  const recs = [{ title: 'Iron Widow' }, { title: 'New One' }, { title: 'serpent & dove' }];
  assert.deepEqual(dropSeen(recs, ['IRON WIDOW', 'Serpent & Dove']).map((r) => r.title), ['New One']);
  assert.deepEqual(dropSeen(recs, []).length, 3);
  assert.deepEqual(dropSeen(null, ['A']), []);
  assert.deepEqual(dropSeen(dropSeen(recs, ['Iron Widow']), ['Iron Widow']).map((r) => r.title), ['New One', 'serpent & dove']);
});
