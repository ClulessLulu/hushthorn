// Where Tab goes inside a modal (Overlay). Imports the real module.
// Run: node tests/focus-trap-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapTab, pickOpener, firstConnected, trackPresses, PRESS_FRESH_MS } from '../src/lib/focusTrap.js';

test('Tab on the last element wraps to the first; Shift+Tab on the first wraps to the last', () => {
  assert.equal(wrapTab(4, 3, false), 0);
  assert.equal(wrapTab(4, 0, true), 3);
});

test('Tab in the middle is left to the browser', () => {
  assert.equal(wrapTab(4, 1, false), null);
  assert.equal(wrapTab(4, 2, true), null);
  assert.equal(wrapTab(4, 0, false), null);
  assert.equal(wrapTab(4, 3, true), null);
});

test('focus on the panel itself (or outside) goes to the first, or the last with Shift', () => {
  assert.equal(wrapTab(4, -1, false), 0);
  assert.equal(wrapTab(4, -1, true), 3);
});

test('one element: Tab and Shift+Tab both stay on it', () => {
  assert.equal(wrapTab(1, 0, false), 0);
  assert.equal(wrapTab(1, 0, true), 0);
  assert.equal(wrapTab(1, -1, false), 0);
});

test('nothing focusable: keep focus where it is', () => {
  assert.equal(wrapTab(0, -1, false), -1);
  assert.equal(wrapTab(0, 0, true), -1);
});

test('malformed input does not throw and is treated as "not inside"', () => {
  assert.equal(wrapTab(undefined, 0, false), -1);
  assert.equal(wrapTab(-3, 0, false), -1);
  assert.equal(wrapTab(3, 7, false), 0);       // stale index past the end
  assert.equal(wrapTab(3, 1.5, true), 2);      // not an integer
  assert.equal(wrapTab(3, null, false), 0);
  assert.equal(wrapTab('3', 0, false), -1);    // count must be a number
});

test('run twice: the same answer (no hidden state)', () => {
  assert.equal(wrapTab(5, 4, false), wrapTab(5, 4, false));
  assert.equal(wrapTab(5, 0, true), wrapTab(5, 0, true));
});

// ── Focus return on close (review R2-W1, R2-F1) ──
// Element stand-ins: only isConnected, focus and contains are read.
const el = (name, { connected = true, kids = [] } = {}) => ({
  name, isConnected: connected, focus() {}, contains: (x) => kids.includes(x),
});
const body = el('body');

test('opener: a focused control wins (Chromium, keyboard)', () => {
  const chip = el('chip');
  const other = el('other');
  assert.equal(pickOpener({ active: chip, body, pressed: other, pressedAt: 1000, now: 1100 }), chip);
});

test('opener: focus on <body> falls back to the control just pressed (Safari tap, R2-W1)', () => {
  const chip = el('chip');
  assert.equal(pickOpener({ active: body, body, pressed: chip, pressedAt: 1000, now: 1200 }), chip);
  assert.equal(pickOpener({ active: null, body, pressed: chip, pressedAt: 1000, now: 1000 }), chip);
});

test('opener: a press inside the focused panel is the more exact opener', () => {
  const owned = el('+ Owned');
  const panel = el('panel', { kids: [owned] });
  assert.equal(pickOpener({ active: panel, body, pressed: owned, pressedAt: 0, now: 10 }), owned);
});

test('opener: a stale, removed, future-dated or missing press is ignored', () => {
  const chip = el('chip');
  assert.equal(pickOpener({ active: body, body, pressed: chip, pressedAt: 0, now: PRESS_FRESH_MS + 1 }), null);
  assert.equal(pickOpener({ active: body, body, pressed: el('gone', { connected: false }), pressedAt: 0, now: 1 }), null);
  assert.equal(pickOpener({ active: body, body, pressed: chip, pressedAt: 50, now: 10 }), null);
  assert.equal(pickOpener({ active: body, body, pressed: null, pressedAt: 0, now: 1 }), null);
  assert.equal(pickOpener({ active: body, body, pressed: chip, pressedAt: 'soon', now: 1 }), null);
  assert.equal(pickOpener(), null);
  assert.equal(pickOpener({}), null);
});

test('opener: the boundary press age still counts', () => {
  const chip = el('chip');
  assert.equal(pickOpener({ active: body, body, pressed: chip, pressedAt: 0, now: PRESS_FRESH_MS }), chip);
});

test('return target: a removed opener falls back along the chain (R2-F1: + Owned -> + Inscribe)', () => {
  const owned = el('+ Owned', { connected: false });
  const inscribe = el('+ Inscribe');
  assert.equal(firstConnected([owned, inscribe]), inscribe);
  assert.equal(firstConnected([inscribe, owned]), inscribe);
});

test('return target: nothing left, empty or malformed chain gives null', () => {
  assert.equal(firstConnected([el('a', { connected: false }), null, undefined, {}, { isConnected: true }]), null);
  assert.equal(firstConnected([]), null);
  assert.equal(firstConnected(null), null);
  assert.equal(firstConnected('chip'), null);
});

function fakeDoc() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn, opts) { listeners.set(type, [...(listeners.get(type) || []), { fn, opts }]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((l) => l.fn !== fn)); },
    fire(type, target) { for (const l of listeners.get(type) || []) l.fn({ target }); },
    count() { return [...listeners.values()].reduce((n, ls) => n + ls.length, 0); },
  };
}

test('press tracker: remembers the nearest pressable control, in the capture phase', () => {
  const doc = fakeDoc();
  let now = 100;
  const chip = el('chip');
  const span = { closest: (sel) => (sel.includes('button') ? chip : null) };
  const t = trackPresses(doc, () => now);
  assert.ok(doc.listeners.get('pointerdown')[0].opts.capture);
  doc.fire('pointerdown', span);
  assert.deepEqual(t.last(), { el: chip, at: 100 });
  now = 200;
  doc.fire('mousedown', { closest: () => null }); // a press on plain page clears it
  assert.deepEqual(t.last(), { el: null, at: 200 });
  doc.fire('touchstart', null); // malformed event target
  assert.equal(t.last().el, null);
  t.stop();
});

test('press tracker: stop removes every listener, and a second start/stop (StrictMode) leaves none', () => {
  const doc = fakeDoc();
  const a = trackPresses(doc);
  a.stop();
  assert.equal(doc.count(), 0);
  const b = trackPresses(doc);
  assert.equal(doc.count(), 3);
  b.stop();
  b.stop();
  assert.equal(doc.count(), 0);
  assert.equal(b.last().el, null);
});
