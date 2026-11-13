// Pure helpers for the "actual spine photo" feature (no DOM, so they are unit-tested).

// Only data URLs we produced ourselves are rendered. JPEG is the fallback for
// browsers whose canvas cannot encode WebP (Safari / older iOS silently return PNG).
// The strict base64 body also keeps the value safe to interpolate into css url().
const SPINE_PHOTO_RE = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/;
export const isSpinePhotoUrl = (s) => typeof s === "string" && SPINE_PHOTO_RE.test(s);

// Centre "cover" crop: the largest source rectangle with the destination's aspect
// ratio, so the photo is cropped to the spine instead of being squashed.
// Returns null for unusable sizes.
export function coverRect(srcW, srcH, dstW, dstH) {
  const ok = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (![srcW, srcH, dstW, dstH].every(ok)) return null;
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale, sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}
