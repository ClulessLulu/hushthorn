import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_KEY, parseSavedView } from '../src/lib/savedView.js';

test('the storage key is stable', () => {
  assert.equal(VIEW_KEY, 'ht-view');
});

test('oracle and pair are restored', () => {
  assert.equal(parseSavedView('oracle'), 'oracle');
  assert.equal(parseSavedView('pair'), 'pair');
});

test('missing values mean the library', () => {
  assert.equal(parseSavedView(null), 'library');
  assert.equal(parseSavedView(undefined), 'library');
  assert.equal(parseSavedView(''), 'library');
});

test('"library" and junk mean the library', () => {
  assert.equal(parseSavedView('library'), 'library');
  assert.equal(parseSavedView('settings'), 'library');
  assert.equal(parseSavedView('#error=access_denied'), 'library');
  assert.equal(parseSavedView('__proto__'), 'library');
  assert.equal(parseSavedView('constructor'), 'library');
});

test('wrong case or whitespace is not accepted', () => {
  assert.equal(parseSavedView('Oracle'), 'library');
  assert.equal(parseSavedView('PAIR'), 'library');
  assert.equal(parseSavedView(' oracle'), 'library');
  assert.equal(parseSavedView('pair\n'), 'library');
});

test('non-strings mean the library', () => {
  for (const v of [0, 1, true, false, {}, [], ['oracle'], () => 'oracle', NaN]) {
    assert.equal(parseSavedView(v), 'library');
  }
});

test('running it twice gives the same answer', () => {
  for (const v of ['oracle', 'pair', 'x', null]) {
    assert.equal(parseSavedView(v), parseSavedView(v));
    assert.equal(parseSavedView(parseSavedView(v)), parseSavedView(v));
  }
});
