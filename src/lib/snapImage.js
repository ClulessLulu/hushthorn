/* ── Snap-to-update: prepare the photo before it is sent ──────────
   A raw phone photo is 3-6 MB; as base64 it is a third bigger again, and
   Vercel Functions reject request bodies over 4.5 MB (the /api/claude proxy
   would answer 413 and the user only saw "Couldn't read that screen").
   So the photo is downscaled and re-encoded as JPEG in the browser first.

   1568 px is the longest edge the vision API keeps for the standard-tier
   models (claude-sonnet-4-6 is one); anything larger is resized server-side
   anyway, so nothing the model would have seen is lost. Raise this only when
   the app moves to a high-resolution-tier model.

   Browser-only (canvas). The size maths is the pure `fitWithin` in
   progressSnap.js. Never throws: returns { dataUrl } or { error }.
──────────────────────────────────────────────────────────────── */
import { fitWithin } from "./progressSnap.js";

export const SNAP_MAX_EDGE = 1568;
export const SNAP_JPEG_QUALITY = 0.85;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // 'from-image' applies the EXIF rotation, so a portrait phone photo is not sideways.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close && bmp.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// error: "unreadable" (the browser can't decode it: HEIC on most browsers, a corrupt or non-image file)
export async function prepareSnapImage(file, { maxEdge = SNAP_MAX_EDGE, quality = SNAP_JPEG_QUALITY } = {}) {
  try {
    if (!file) return { error: "unreadable" };
    const img = await decode(file);
    if (!img) return { error: "unreadable" };
    try {
      const size = fitWithin(img.width, img.height, maxEdge);
      if (!size) return { error: "unreadable" };
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "unreadable" };
      ctx.fillStyle = "#fff"; // transparent PNG screenshots would turn black as JPEG
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(img.source, 0, 0, size.width, size.height);
      return { dataUrl: canvas.toDataURL("image/jpeg", quality), width: size.width, height: size.height };
    } finally {
      img.close();
    }
  } catch {
    return { error: "unreadable" };
  }
}
