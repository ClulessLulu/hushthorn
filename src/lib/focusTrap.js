/* ── Keeping Tab inside a modal (Overlay) ──
   Pure, so tests/focus-trap-unit.mjs runs the real code. Overlay finds the
   focusable elements and asks where Tab should go (a11y audit P2: Tab used to
   walk out of "Your Profile" into the page behind it, though it said
   aria-modal="true").
   count: how many focusable elements the modal has.
   index: where focus is among them, -1 if on the panel itself or outside.
   shift: Shift+Tab.
   Returns the index to focus, -1 to keep focus where it is (nothing to focus),
   or null to let the browser move focus normally.
──────────────────────────────────────────────────────────────── */
export function wrapTab(count, index, shift) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  if (n === 0) return -1;
  const i = Number.isInteger(index) && index >= 0 && index < n ? index : -1;
  if (i === -1) return shift ? n - 1 : 0;
  if (!shift && i === n - 1) return 0;
  if (shift && i === 0) return n - 1;
  return null;
}

// Elements Tab can land on. Callers still drop the ones that are not rendered
// (display:none file inputs, closed sections) by checking getClientRects().
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/* ── Where focus goes back to when a modal closes (Overlay) ──
   Review R2-W1: Safari never focuses a button on click or tap, so
   document.activeElement is <body> when the window opens and focus was dropped
   at the top of the page on close. Overlay then uses the control the reader
   last pressed. Review R2-F1: "+ Owned" opens the book window and unmounts with
   Inscribe in the same commit, so the opener is gone on close; Overlay falls
   back along a chain (the opener of the window that held the opener, e.g.
   + Inscribe). Pure, so tests/focus-trap-unit.mjs runs the real code.
──────────────────────────────────────────────────────────────── */

// The nearest element a press is "on": what focus should return to.
export const PRESSABLE =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="switch"], [role="tab"], ' +
  '[tabindex]:not([tabindex="-1"])';

// A press older than this is not taken as the opener (a window opened by a
// timer or after a network wait should not jump focus to an old button).
export const PRESS_FRESH_MS = 5000;

// active: document.activeElement when the window first renders; body: document.body;
// pressed / pressedAt: the last pressed control and when; now: the clock.
// Returns the element to give focus back to, or null.
export function pickOpener({ active, body, pressed, pressedAt, now } = {}) {
  const fresh = !!pressed && pressed.isConnected === true &&
    Number.isFinite(pressedAt) && Number.isFinite(now) && now - pressedAt >= 0 && now - pressedAt <= PRESS_FRESH_MS;
  if (!active || active === body) return fresh ? pressed : null;
  // Focus sits on a container (another window's panel) that holds the pressed
  // control: the control is the more exact opener.
  if (fresh && active !== pressed && typeof active.contains === 'function' && active.contains(pressed)) return pressed;
  return active;
}

// The first element of the chain still on the page and focusable, or null.
export function firstConnected(chain) {
  if (!Array.isArray(chain)) return null;
  for (const el of chain) {
    if (el && el.isConnected === true && typeof el.focus === 'function') return el;
  }
  return null;
}

// Remembers the last control pressed (mouse, pen, touch). Capture phase, so a
// handler that stops propagation cannot hide the press. Returns { last, stop };
// stop() removes the listeners, so a StrictMode double mount leaves one set.
const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart'];
export function trackPresses(doc, clock = () => Date.now()) {
  let el = null;
  let at = 0;
  const onPress = (e) => {
    const t = e && e.target;
    el = t && typeof t.closest === 'function' ? t.closest(PRESSABLE) : null;
    at = clock();
  };
  const opts = { capture: true, passive: true };
  for (const type of PRESS_EVENTS) doc.addEventListener(type, onPress, opts);
  return {
    last: () => ({ el, at }),
    stop: () => {
      for (const type of PRESS_EVENTS) doc.removeEventListener(type, onPress, opts);
      el = null;
    },
  };
}
