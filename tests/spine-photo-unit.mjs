// Spine-photo helper tests. Imports the REAL module (no copied code).
// Run: node tests/spine-photo-unit.mjs
import assert from "node:assert/strict";
import { isSpinePhotoUrl, coverRect } from "../src/lib/spinePhoto.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("ok -", name); };

// ── isSpinePhotoUrl ──
t("accepts webp and jpeg base64 data URLs", () => {
  assert.equal(isSpinePhotoUrl("data:image/webp;base64,UklGRg=="), true);
  assert.equal(isSpinePhotoUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg=="), true);
});
// regression: Safari returns PNG for toDataURL('image/webp'); it must NOT count as saved-OK
t("rejects a PNG data URL (what Safari returns when it cannot encode WebP)", () => {
  assert.equal(isSpinePhotoUrl("data:image/png;base64,iVBORw0KGgo="), false);
});
t("rejects javascript:, remote URLs and quote/paren injection", () => {
  assert.equal(isSpinePhotoUrl("javascript:alert(1)"), false);
  assert.equal(isSpinePhotoUrl("https://evil.example/x.webp"), false);
  assert.equal(isSpinePhotoUrl('data:image/webp;base64,AAAA");background:url("x'), false);
  assert.equal(isSpinePhotoUrl("data:image/webp;base64,AAAA)"), false);
});
t("rejects empty body, empty string, null, undefined, non-strings", () => {
  assert.equal(isSpinePhotoUrl("data:image/webp;base64,"), false);
  for (const v of ["", null, undefined, 42, {}, []]) assert.equal(isSpinePhotoUrl(v), false);
});

// ── coverRect ──
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
t("landscape 4000x3000 into 480x84: full width, centred strip", () => {
  const r = coverRect(4000, 3000, 480, 84);
  near(r.sw, 4000); near(r.sh, 4000 * 84 / 480); near(r.sx, 0); near(r.sy, (3000 - r.sh) / 2);
});
t("portrait 3000x4000 into 84x480: keeps full height, crops a centred narrow column", () => {
  const r = coverRect(3000, 4000, 84, 480);
  near(r.sh, 4000); near(r.sw, 4000 * 84 / 480); near(r.sy, 0); near(r.sx, (3000 - r.sw) / 2);
});
t("source already the target ratio: whole image", () => {
  assert.deepEqual(coverRect(168, 960, 84, 480), { sx: 0, sy: 0, sw: 168, sh: 960 });
});
t("crop keeps the destination aspect and stays inside the source", () => {
  for (const [w, h] of [[1000, 1000], [4032, 3024], [3024, 4032], [200, 3000], [3000, 200], [1, 1]]) {
    const r = coverRect(w, h, 84, 480);
    near(r.sw / r.sh, 84 / 480);
    assert.ok(r.sx >= -1e-9 && r.sy >= -1e-9 && r.sx + r.sw <= w + 1e-9 && r.sy + r.sh <= h + 1e-9, `${w}x${h}`);
  }
});
t("zero, negative, NaN, Infinity, non-number sizes → null (no NaN canvas draw)", () => {
  for (const bad of [0, -5, NaN, Infinity, "10", null, undefined]) {
    assert.equal(coverRect(bad, 100, 84, 480), null);
    assert.equal(coverRect(100, bad, 84, 480), null);
    assert.equal(coverRect(100, 100, bad, 480), null);
    assert.equal(coverRect(100, 100, 84, bad), null);
  }
});

console.log(`\n${passed} passed`);
