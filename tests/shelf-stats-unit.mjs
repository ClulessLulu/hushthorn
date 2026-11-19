// Your Profile: "N of M owned books read" (review R2-P1). Imports the real module.
// Run: node tests/shelf-stats-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOwned, countOwnedRead } from '../src/lib/shelfStats.js';

const shelf = [
  { title: 'A', shelf: 'owned', read: true },
  { title: 'B', shelf: 'owned', read: false },
  { title: 'C', shelf: 'owned', read: true },
  { title: 'D', shelf: 'wishlist', read: false },
];

test('happy path: counts read books on the Owned shelf', () => {
  assert.equal(countOwned(shelf), 3);
  assert.equal(countOwnedRead(shelf), 2);
});

test('a read wishlist book is not an owned book read (48 of 46)', () => {
  const books = [...shelf, { title: 'E', shelf: 'wishlist', read: true }, { title: 'F', shelf: 'wishlist', read: true }];
  assert.equal(countOwned(books), 3);
  assert.equal(countOwnedRead(books), 2);
  assert.ok(countOwnedRead(books) <= countOwned(books));
});

test('empty or missing list gives 0', () => {
  for (const v of [[], undefined, null, 'books', 42, {}]) {
    assert.equal(countOwned(v), 0);
    assert.equal(countOwnedRead(v), 0);
  }
});

test('malformed rows are skipped, and only read === true counts', () => {
  const books = [
    null, undefined, 7, 'owned',
    { shelf: 'owned' },                 // read missing
    { shelf: 'owned', read: 'yes' },    // wrong type
    { shelf: 'owned', read: 1 },
    { read: true },                     // shelf missing
    { shelf: 'OWNED', read: true },     // not the stored spelling
    { shelf: 'owned', read: true },
  ];
  assert.equal(countOwned(books), 4);
  assert.equal(countOwnedRead(books), 1);
});

test('never more read than owned, whatever the mix', () => {
  const books = [];
  for (let i = 0; i < 60; i++) books.push({ shelf: i % 3 ? 'owned' : 'wishlist', read: i % 2 === 0 });
  assert.ok(countOwnedRead(books) <= countOwned(books));
});

test('run twice: same answer, and the list is not changed', () => {
  const copy = JSON.parse(JSON.stringify(shelf));
  assert.equal(countOwnedRead(shelf), countOwnedRead(shelf));
  assert.equal(countOwned(shelf), countOwned(shelf));
  assert.deepEqual(shelf, copy);
});
