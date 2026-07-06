import { useState, useRef, useEffect, Fragment } from "react";
import Papa from "papaparse";
import { supabase } from './lib/supabase';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

/* ── Claude API configuration ───────────────────────────────
   Option A (recommended): point CLAUDE_API_URL at your own proxy
   server, like Kindled's Express proxy — keeps the key server-side.
     e.g. "http://localhost:3001/api/hushthorn/claude"
   Option B (local dev only): set VITE_ANTHROPIC_API_KEY in a .env
   file for direct browser access. NEVER ship a key in client code.
──────────────────────────────────────────────────────────── */
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

async function callClaude(body) {
  const headers = { "Content-Type": "application/json" };
  if (CLAUDE_API_KEY) {
    headers["x-api-key"] = CLAUDE_API_KEY;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  return res.json();
}

/* ───────────────────────── Hushthorn ─────────────────────────
   Gothic century book archive · demo build
   Shelves: Owned / Wishlist · Read / Unread
   Dual ratings: Verdict (swords) + Smoulder (candles)
   Marginalia with page refs & quotes · voice transcription
─────────────────────────────────────────────────────────────── */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rozha+One&family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');

.ht-blackletter { font-family: 'Rozha One', serif; letter-spacing: 0.01em; }
.ht-display { font-family: 'Cinzel', serif; letter-spacing: 0.06em; }
.ht-body { font-family: 'EB Garamond', serif; }

.ht-bg {
  background-color: #0c0714;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.45), transparent 70%),
    radial-gradient(ellipse 45% 35% at 50% 18%, rgba(217,70,239,0.13), transparent 70%),
    radial-gradient(ellipse 35% 30% at 8% 96%, rgba(236,72,153,0.15), transparent 70%),
    radial-gradient(ellipse 35% 30% at 92% 96%, rgba(168,85,247,0.15), transparent 70%);
  min-height: 100vh;
}

.ht-card {
  background: linear-gradient(165deg, rgba(38,23,64,0.92), rgba(17,10,30,0.96));
  border: 1px solid rgba(217,131,222,0.20);
  box-shadow: inset 0 0 0 1px rgba(10,6,18,0.9), 0 0 18px rgba(124,58,237,0.10);
}
.ht-card:hover { border-color: rgba(240,166,224,0.55); transform: translateY(-2px); box-shadow: inset 0 0 0 1px rgba(10,6,18,0.9), 0 0 22px rgba(217,70,239,0.18); }
.ht-card { transition: border-color .25s ease, transform .25s ease, box-shadow .25s ease; }

.ht-ribbon {
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%);
}

.ht-quote {
  font-family: 'EB Garamond', serif;
  font-style: italic;
  border-left: 2px solid rgba(236,153,221,0.6);
}

.ht-rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(240,166,224,0.55), transparent);
}

/* ornate frame around the whole page, like the artwork's border */
.ht-frame {
  position: fixed; inset: 10px; border-radius: 26px; pointer-events: none; z-index: 40;
  border: 1px solid rgba(240,166,224,0.30);
  box-shadow:
    inset 0 0 0 4px rgba(12,7,20,0.9),
    inset 0 0 0 5px rgba(168,85,247,0.28),
    inset 0 0 60px rgba(124,58,237,0.12);
}

.ht-glow { filter: drop-shadow(0 0 16px rgba(217,70,239,0.40)); }

@keyframes ht-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(244,114,182,0.5); }
  50% { box-shadow: 0 0 0 10px rgba(244,114,182,0); }
}
.ht-recording { animation: ht-pulse 1.4s ease infinite; }
@media (prefers-reduced-motion: reduce) { .ht-recording { animation: none; } .ht-card { transition: none; } }

/* per-format progress sliders — sanctioned accents: violet print, indigo
   ebook, cyan audio (cyan is reserved for audio). Sharp 2px track + thumb. */
.ht-progress-range {
  -webkit-appearance: none; appearance: none;
  height: 16px; background: transparent; cursor: pointer;
}
.ht-progress-range::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: rgba(40,24,64,0.85);
}
.ht-progress-range::-moz-range-track {
  height: 4px; border-radius: 2px;
  background: rgba(40,24,64,0.85);
}
.ht-progress-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; margin-top: -4px; border-radius: 2px;
  border: 1px solid rgba(12,7,20,0.9);
}
.ht-progress-range::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 2px;
  border: 1px solid rgba(12,7,20,0.9);
}
.ht-range-violet::-webkit-slider-thumb { background: #a78bfa; }
.ht-range-violet::-moz-range-thumb { background: #a78bfa; }
.ht-range-indigo::-webkit-slider-thumb { background: #818cf8; }
.ht-range-indigo::-moz-range-thumb { background: #818cf8; }
.ht-range-cyan::-webkit-slider-thumb { background: #22d3ee; }
.ht-range-cyan::-moz-range-thumb { background: #22d3ee; }
`;

/* ── image crop utility ─────────────────────────────────────── */

/* Canvas extraction for react-image-crop. Accounts for the displayed
   scale + rotate, drawing the source image around its centre and
   reading out exactly the completed crop region. Returns a JPEG dataURL.
   Adapted from react-image-crop's documented canvasPreview pattern. */
function getCroppedDataUrl(image, crop, scale = 1, rotate = 0) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // crop is in the displayed-image space; map to natural pixels.
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = 'high';

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const rotateRads = (rotate * Math.PI) / 180;
  const centerX = image.naturalWidth / 2;
  const centerY = image.naturalHeight / 2;

  ctx.save();
  // Move the crop origin to the canvas origin (0,0).
  ctx.translate(-cropX, -cropY);
  // Move the image centre to the origin so rotate/scale pivot there.
  ctx.translate(centerX, centerY);
  ctx.rotate(rotateRads);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(
    image, 0, 0, image.naturalWidth, image.naturalHeight,
    0, 0, image.naturalWidth, image.naturalHeight,
  );
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}

/* ── icons ─────────────────────────────────────────────────── */

function Sword({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* blade, point up */}
      <path d="M12 1.5 L14 5 L13.2 13.8 L10.8 13.8 L10 5 Z"
        fill={filled ? "#a5b4fc" : "transparent"}
        stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="1.3" strokeLinejoin="round" />
      {/* fuller line */}
      {filled && <path d="M12 4 L12 13" stroke="#6d7ae8" strokeWidth="0.9" strokeLinecap="round" />}
      {/* crossguard */}
      <path d="M7.6 14.6 H16.4" stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="2" strokeLinecap="round" />
      {/* grip */}
      <path d="M12 15.6 V19.2" stroke={filled ? "#a5b4fc" : "#5b4a78"} strokeWidth="2.2" strokeLinecap="round" />
      {/* pommel */}
      <circle cx="12" cy="21" r="1.5"
        fill={filled ? "#c7d2fe" : "transparent"}
        stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="1.2" />
    </svg>
  );
}

function Candle({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* flame — lit only */}
      {filled && (
        <>
          <path d="M12 2.5 C 14 5, 14.5 7.2, 12 9 C 9.5 7.2, 10 5, 12 2.5 Z"
            fill="#fb7185" stroke="#fda4af" strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M12 5 C 12.9 6.2, 13 7.4, 12 8.4 C 11.3 7.6, 11.2 6.4, 12 5 Z"
            fill="#fecdd3" opacity="0.85" />
        </>
      )}
      {/* wick */}
      <path d="M12 9 L12 10.6" stroke={filled ? "#7c5a4e" : "#5b4a78"} strokeWidth="1.1" strokeLinecap="round" />
      {/* candle body */}
      <rect x="9" y="10.5" width="6" height="10.5" rx="1.4"
        fill={filled ? "#fbcfe8" : "transparent"}
        stroke={filled ? "#fda4af" : "#5b4a78"} strokeWidth="1.3" />
      {/* wax sheen — lit only */}
      {filled && <path d="M10.7 12.5 L10.7 19" stroke="#fff1f5" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />}
    </svg>
  );
}

function Crown({ size = 52 }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 60 33" aria-hidden="true" className="mx-auto mb-1">
      <path d="M7 26 L9 10 L19 19 L30 4 L41 19 L51 10 L53 26 Z"
        fill="none" stroke="#f0a6e0" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="30" cy="3.2" r="2" fill="#f0a6e0" />
      <circle cx="8.6" cy="8.6" r="1.7" fill="#f0a6e0" />
      <circle cx="51.4" cy="8.6" r="1.7" fill="#f0a6e0" />
      <path d="M7 29.5 H53" stroke="#f0a6e0" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5 a6.5 6.5 0 0 0 13 0 M12 18 v3 M9 21 h6" />
    </svg>
  );
}

/* ── genres ────────────────────────────────────────────────── */

// Open Library subjects are noisy; keep the few that read like genres.
const GENRE_JUNK = /(accessible|protected|in library|large type|reading level|staff picks|nyt|times bestseller|literature$|^fiction$|translations|collections|specimens)/i;
function cleanGenres(subjects, max = 3) {
  if (!Array.isArray(subjects)) return [];
  const seen = new Set();
  const out = [];
  for (const s of subjects) {
    if (typeof s !== "string") continue;
    const g = s.trim();
    if (!g || g.length > 28 || g.includes(":") || GENRE_JUNK.test(g)) continue;
    const key = g.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g.charAt(0).toUpperCase() + g.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

function GenreChips({ genres, max = 3, className = "" }) {
  if (!genres || genres.length === 0) return null;
  return (
    <div className={`flex gap-1 flex-wrap ${className}`}>
      {genres.slice(0, max).map((g) => (
        <span key={g} className="ht-display text-[9px] uppercase px-1.5 py-0.5 rounded-sm border border-purple-500/40 bg-purple-900/40 text-purple-200/90">
          {g}
        </span>
      ))}
    </div>
  );
}

/* ── covers ────────────────────────────────────────────────── */

// The artifact sandbox blocks <img> from external domains, so covers are
// fetched as bytes and rendered as data URLs instead. Cached per session.
const coverCache = new Map();
function CoverImage({ src, alt, className, fallback }) {
  const [resolved, setResolved] = useState(() =>
    src && (src.startsWith("data:") || src.startsWith("blob:")) ? src : coverCache.get(src) || ""
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!src) { setResolved(""); return; }
    if (src.startsWith("data:") || src.startsWith("blob:")) { setResolved(src); return; }
    if (coverCache.has(src)) { setResolved(coverCache.get(src)); return; }
    setResolved("");
    fetch(src)
      .then((r) => { if (!r.ok) throw new Error("cover fetch failed"); return r.blob(); })
      .then((blob) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      }))
      .then((dataUrl) => {
        coverCache.set(src, dataUrl);
        if (!cancelled) setResolved(dataUrl);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src]);

  if (!src || failed || !resolved) return fallback || null;
  return <img src={resolved} alt={alt} className={className} />;
}

/* ── spine colors ──────────────────────────────────────────────
   Ported from prototype/hushthorn-demo.jsx:204-378, adapted for the
   Supabase data model (lazy backfill via onPersist).
─────────────────────────────────────────────────────────────── */

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const GENRE_SPINE_COLORS = [
  [/vampire|blood/i, "#5b1f3f"],
  [/fae|fairy/i, "#33306e"],
  [/romance|romantasy|lovers/i, "#7c2a5e"],
  [/witch|magic|occult/i, "#46246b"],
  [/dark academia|mystery/i, "#3b2f4e"],
  [/gothic|horror|dark/i, "#2a1f3d"],
  [/dragon|epic|fantasy/i, "#1f3a5c"],
];

function genreFallbackColor(book) {
  for (const g of book.genres || [])
    for (const [re, c] of GENRE_SPINE_COLORS) if (re.test(g)) return c;
  return `hsl(${hashStr(book.title || "") % 360} 35% 24%)`;
}

// Session-level dedupe of sampled colors (DB spine_color dedupes across sessions).
const spineColorCache = new Map();

// Session-level dedupe for page-count backfill. Holds book ids that have been
// attempted this session (whether or not OL/GB returned a result). Prevents
// repeat network calls when a panel is opened, closed, and re-opened.
const pageCountTriedIds = new Set();

// Average the cover's pixels on an 8×12 canvas, darkened to "library light"
// (brightest channel ≤ 150). Returns 'rgb(r,g,b)'. Rejects on load/draw error.
function sampleCoverColor(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 8; c.height = 12;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 8, 12);
        const d = ctx.getImageData(0, 0, 8, 12).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r /= n; g /= n; b /= n;
        const f = Math.min(1, 150 / Math.max(r, g, b, 1));
        resolve(`rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`);
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Resolve a cover URL to a dataURL: pass through data:, reuse the CoverImage
// coverCache, else fetch → blob → dataURL (and seed the cache). Throws on
// failure. Shared by useSpineColor and the add/cover-change write points.
async function coverToDataUrl(url) {
  if (!url) throw new Error("no cover");
  if (url.startsWith("data:")) return url;
  if (coverCache.has(url)) return coverCache.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error("cover fetch failed");
  const blob = await r.blob();
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  coverCache.set(url, dataUrl);
  return dataUrl;
}

// Best-effort cover sampler for the add/cover-change paths: resolves and
// samples a cover URL, returning a stored spine color or null on any failure.
async function computeSpineColor(url) {
  try {
    const dataUrl = await coverToDataUrl(url);
    const color = await sampleCoverColor(dataUrl);
    spineColorCache.set(url, color);
    return color;
  } catch { return null; }
}

// Lazy page-count resolver for existing print books that have no page count.
// Primary: Open Library search.json (no quota). Fallback: Google Books.
// Always returns a positive integer or null — NEVER throws.
//
// Failure modes handled:
//   • Network error / non-OK HTTP response → null
//   • Missing docs / empty docs array → falls through to GB fallback
//   • number_of_pages_median is 0, negative, non-integer, or absent → falls through
//   • GB items absent or pageCount absent/non-positive → null
//   • Malformed JSON from either endpoint → null
async function fetchPageCount(title, author) {
  try {
    const t = encodeURIComponent((title || "").trim());
    const a = encodeURIComponent((author || "").trim());
    // --- Open Library (primary) ---
    try {
      const olRes = await fetch(
        `https://openlibrary.org/search.json?title=${t}&author=${a}&limit=1&fields=number_of_pages_median`
      );
      if (olRes.ok) {
        const olData = await olRes.json();
        const med = olData.docs?.[0]?.number_of_pages_median;
        if (typeof med === "number" && Number.isInteger(med) && med > 0) return med;
      }
    } catch { /* OL unreachable — fall through to GB */ }
    // --- Google Books (fallback) ---
    try {
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=intitle:${t}+inauthor:${a}&maxResults=1&printType=books`
      );
      if (gbRes.ok) {
        const gbData = await gbRes.json();
        const pc = gbData.items?.[0]?.volumeInfo?.pageCount;
        if (typeof pc === "number" && Number.isInteger(pc) && pc > 0) return pc;
      }
    } catch { /* GB unreachable — fall through to null */ }
    return null;
  } catch { return null; }
}

function useSpineColor(book, onPersist) {
  const key = book.coverUrl || "";
  const [color, setColor] = useState(
    () => book.spineColor || spineColorCache.get(key) || genreFallbackColor(book)
  );
  useEffect(() => {
    let cancelled = false;
    // Already persisted: trust the stored color, seed the cache, never resample.
    if (book.spineColor) {
      if (key) spineColorCache.set(key, book.spineColor);
      setColor(book.spineColor);
      return;
    }
    if (key && spineColorCache.has(key)) { setColor(spineColorCache.get(key)); return; }
    if (!key) { setColor(genreFallbackColor(book)); return; }
    (async () => {
      try {
        const dataUrl = await coverToDataUrl(key);
        const c = await sampleCoverColor(dataUrl);
        spineColorCache.set(key, c);
        if (cancelled) return;
        setColor(c);
        // One-shot lazy backfill — only for books whose spineColor is null.
        if (onPersist) onPersist(c);
      } catch { /* keep the genre fallback; no DB write */ }
    })();
    return () => { cancelled = true; };
  }, [key, book.spineColor]); // eslint-disable-line react-hooks/exhaustive-deps
  return color;
}

/* ── sort + search (pure, unit-testable) ───────────────────── */

// Stable sort over a shallow copy. null overall/smut treated as 0; recent
// preserves incoming order (books fetch is created_at desc, new books prepend).
function sortBooks(list, key) {
  const l = [...list];
  switch (key) {
    case "title":
      return l.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "author":
      return l.sort((a, b) =>
        (a.author || "").localeCompare(b.author || "") ||
        (a.title || "").localeCompare(b.title || ""));
    case "verdict":
      return l.sort((a, b) => (b.overall || 0) - (a.overall || 0));
    case "spice":
      return l.sort((a, b) => (b.smut || 0) - (a.smut || 0));
    default:
      return l; // recent: preserve incoming order (newest first)
  }
}

// Case-insensitive substring match on title / author / any genre. Empty or
// whitespace-only query matches everything.
function matchesQuery(book, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return true;
  return (
    (book.title || "").toLowerCase().includes(s) ||
    (book.author || "").toLowerCase().includes(s) ||
    (book.genres || []).some((g) => g.toLowerCase().includes(s))
  );
}

/* ── per-format reading progress ───────────────────────────────
   Progress lives on `book.progress` (jsonb, default {}), keyed by format:
     print  → { page, pages }
     ebook  → { percent }
     audio  → { listened, hours }   (cyan-accented: audio is the only feature
                                      allowed to wear cyan)
   All readers tolerate a missing/empty/malformed object — they coerce to 0
   and never throw, so an old book with `progress: {}` (or null) just reads 0%.
─────────────────────────────────────────────────────────────── */

// Format display metadata. `bar`/`text` are the sanctioned accents:
// violet print, indigo ebook, cyan audio (cyan reserved for audio).
const FORMAT_META = {
  print: { label: "Print", glyph: "📖", bar: "bg-violet-400/85", text: "text-violet-200", ring: "focus:border-violet-400" },
  ebook: { label: "Ebook", glyph: "📱", bar: "bg-indigo-400/85", text: "text-indigo-200", ring: "focus:border-indigo-400" },
  audio: { label: "Audio", glyph: "🎧", bar: "bg-cyan-400/85", text: "text-cyan-200", ring: "focus:border-cyan-400" },
};
const FORMAT_ORDER = ["print", "ebook", "audio"];

// Coerce any value to a finite number >= 0 (null/NaN/strings → 0).
function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Percent (0-100) through a single format, defensively. Unknown/empty → 0.
function formatPercent(book, fmt) {
  const p = (book && book.progress) || {};
  const d = p[fmt];
  if (!d || typeof d !== "object") return 0;
  let pct = 0;
  if (fmt === "print") {
    const pages = num(d.pages);
    pct = pages > 0 ? (num(d.page) / pages) * 100 : 0;
  } else if (fmt === "ebook") {
    pct = num(d.percent);
  } else if (fmt === "audio") {
    const hours = num(d.hours);
    pct = hours > 0 ? (num(d.listened) / hours) * 100 : 0;
  }
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// Furthest percent across every format the book carries (0 if none tracked).
function maxPercent(book) {
  const fmts = (book && book.formats) || ["print"];
  return fmts.reduce((m, f) => Math.max(m, formatPercent(book, f)), 0);
}

// Furthest *unfinished* format → { fmt, pct }, or null when nothing is in
// progress. A finished format (100%) is skipped so a half-read audiobook still
// surfaces even when the print copy is done.
function activeProgress(book) {
  const fmts = (book && book.formats) || ["print"];
  let best = null;
  for (const f of fmts) {
    const pct = formatPercent(book, f);
    if (pct <= 0 || pct >= 100) continue;
    if (!best || pct > best.pct) best = { fmt: f, pct };
  }
  return best;
}

/* ── Snap-to-update: Claude-vision progress reader ─────────────
   Reads a photo/screenshot of a Kindle, Libby, or audiobook player and
   pulls the native progress shape for that format. Mirrors `scanCover`:
   split the dataUrl → base64 + media_type, ask Claude (via the single
   `callClaude` helper) for ONLY a JSON object, then parse defensively.

   Pure-ish: in = (dataUrl, fmt), out = parsed object | null. The UI owns
   confirm/apply. This NEVER throws — any failure (network, HTTP error,
   empty content, ```-fenced JSON, trailing prose, total garbage, missing
   fields) degrades to `null` so the snap UI can fall back to manual entry.
─────────────────────────────────────────────────────────────── */

// Format-specific prompts. We always know `fmt`, so each is precise and
// demands ONLY a JSON object in the native progress shape for that format.
const PROGRESS_SHOT_PROMPTS = {
  print:
    'This is a photo of a printed book page or an e-reader showing a print-style page count. ' +
    'Read the current page number and the total page count. Respond with ONLY a valid JSON ' +
    'object, nothing else: {"page": number or null, "pages": number or null}. ' +
    '"page" is the current page; "pages" is the total. Use null for anything you cannot read confidently.',
  ebook:
    'This is a screenshot of an e-reader (e.g. Kindle, Libby, Kobo) showing reading progress. ' +
    'Read the percent complete. Respond with ONLY a valid JSON object, nothing else: ' +
    '{"percent": number or null}. "percent" is 0 to 100 (the portion of the book completed). ' +
    'Use null if you cannot read it confidently.',
  audio:
    'This is a screenshot of an audiobook player (e.g. Audible, Libby) showing listening progress. ' +
    'Respond with ONLY a valid JSON object, nothing else: {"listened": number or null, "hours": number or null}. ' +
    '"listened" is the time listened so far and "hours" is the total length, BOTH in DECIMAL hours ' +
    '(convert hours and minutes, e.g. 2h15m is 2.25, 45m is 0.75). Use null for anything you cannot read confidently.',
};

// Coerce a vision value to a finite number, or null. Unlike the display-side
// `num()` (which floors to 0), an unreadable field stays null here so the
// confirm strip can show "couldn't read this one" rather than a false 0.
function coerceShotNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Reduce a parsed object to only the fields the format expects, coerced.
function shapeProgressShot(parsed, fmt) {
  if (!parsed || typeof parsed !== "object") return null;
  if (fmt === "print") {
    return { page: coerceShotNum(parsed.page), pages: coerceShotNum(parsed.pages) };
  }
  if (fmt === "ebook") {
    return { percent: coerceShotNum(parsed.percent) };
  }
  if (fmt === "audio") {
    return { listened: coerceShotNum(parsed.listened), hours: coerceShotNum(parsed.hours) };
  }
  return null;
}

async function readProgressShot(dataUrl, fmt) {
  const prompt = PROGRESS_SHOT_PROMPTS[fmt];
  // Unknown format or no image → nothing to read.
  if (!prompt || typeof dataUrl !== "string" || !dataUrl.includes(",")) return null;
  try {
    const [prefix, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mediaType = (prefix.match(/data:(.*?);/) || [])[1] || "image/jpeg";
    const data = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text", text: prompt },
        ],
      }],
    });
    // Defensive parse, same contract as scanCover: pull text from content,
    // strip ``` / ```json fences, slice to the outermost { … }, parse.
    const text = (data && data.content || [])
      .filter((c) => c && c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return shapeProgressShot(parsed, fmt);
  } catch {
    // Network error, non-2xx (callClaude throws), non-JSON, empty content —
    // any failure degrades to null. The UI owns the manual fallback.
    return null;
  }
}

/* ── per-format progress bars (cards + detail) ─────────────── */

// Compact stack of per-format bars for grid cards. Renders nothing until at
// least one tracked format has motion, so unread/untracked tomes stay clean.
function CardProgress({ book }) {
  const fmts = (book && book.formats) || ["print"];
  const rows = fmts
    .map((f) => ({ fmt: f, pct: formatPercent(book, f) }))
    .filter((r) => r.pct > 0);
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {rows.map(({ fmt, pct }) => {
        const meta = FORMAT_META[fmt] || FORMAT_META.print;
        return (
          <div key={fmt} className="flex items-center gap-1.5">
            <span className="text-[10px] leading-none flex-shrink-0" aria-hidden="true">{meta.glyph}</span>
            <span
              className="h-1.5 flex-1 rounded-sm bg-purple-950/70 overflow-hidden border border-purple-800/40"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${meta.label} progress`}
            >
              <span className={`block h-full rounded-sm ${meta.bar} transition-all`} style={{ width: `${pct}%` }} />
            </span>
            <span className={`ht-display text-[9px] tabular-nums flex-shrink-0 ${meta.text}`}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// Per-format reading-progress editor for the DetailPanel. Edits live on
// `book.progress` ({ print:{page,pages}, ebook:{percent}, audio:{listened,hours} })
// and persist through onUpdate({ progress }). Defensive: a missing/empty/
// malformed `progress` reads as zeros and never throws. Auto-Read is handled
// centrally in updateBook (maxPercent >= 100 → read), so the editor only writes
// the numbers. Cyan stays reserved for the audio format.
function ProgressEditor({ book, onUpdate }) {
  const fmts = (book && book.formats) || ["print"];
  const prog = (book && book.progress && typeof book.progress === "object") ? book.progress : {};

  // Merge a partial change into one format, leaving the others untouched.
  const writeFmt = (fmt, partial) => {
    const prev = (prog[fmt] && typeof prog[fmt] === "object") ? prog[fmt] : {};
    onUpdate({ progress: { ...prog, [fmt]: { ...prev, ...partial } } });
  };

  /* ── Snap to update: read a photo/screenshot, confirm, then write ──
     One control per format. Hidden file input (capture="environment" so
     mobile opens the camera; desktop opens the screenshot picker — the same
     input is the upload fallback when the camera is blocked). Nothing touches
     `progress` until the user taps Apply: handleSnap only sets local state
     (loading → confirm | error). cyan stays reserved for audio. */
  const snapRefs = useRef({});                 // { [fmt]: <input> }
  const [snapState, setSnapState] = useState({}); // { [fmt]: 'loading' }
  const [snapResult, setSnapResult] = useState({}); // { [fmt]: parsed | null }

  const openSnap = (fmt) => { snapRefs.current[fmt]?.click(); };

  const handleSnap = (e, fmt) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file (Retry)
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setSnapState((s) => ({ ...s, [fmt]: "loading" }));
      setSnapResult((r) => ({ ...r, [fmt]: undefined }));
      const parsed = await readProgressShot(reader.result, fmt);
      if (!parsed) {
        // Unreadable / network / garbage AI → manual fallback, no write.
        setSnapState((s) => ({ ...s, [fmt]: "error" }));
        setSnapResult((r) => ({ ...r, [fmt]: null }));
      } else {
        setSnapState((s) => ({ ...s, [fmt]: "confirm" }));
        setSnapResult((r) => ({ ...r, [fmt]: parsed }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Apply the confirmed snap into progress[fmt] (idempotent: same parsed →
  // same write). Routes through onUpdate so auto-Read at 100% still fires.
  const applySnap = (fmt) => {
    const parsed = snapResult[fmt];
    if (parsed) onUpdate({ progress: { ...prog, [fmt]: parsed } });
    clearSnap(fmt);
  };

  const clearSnap = (fmt) => {
    setSnapState((s) => ({ ...s, [fmt]: undefined }));
    setSnapResult((r) => ({ ...r, [fmt]: undefined }));
  };

  // Format the parsed snap for the confirm strip; "—" for any unread field.
  const fmtSnapField = (v) => (typeof v === "number" && Number.isFinite(v) ? v : "—");
  const snapSummary = (fmt, p) => {
    if (!p) return "";
    if (fmt === "print") {
      const pct = formatPercent({ progress: { print: p } }, "print");
      return `${fmtSnapField(p.page)} / ${fmtSnapField(p.pages)} (${pct}%)`;
    }
    if (fmt === "ebook") return `${fmtSnapField(p.percent)}%`;
    return `${fmtSnapField(p.listened)}h / ${fmtSnapField(p.hours)}h`;
  };

  return (
    <div className="ht-card rounded-md p-4 mt-4 space-y-3">
      <span className="ht-display text-xs uppercase text-indigo-200 font-semibold">The Reading 📖</span>
      {fmts.map((fmt) => {
        const meta = FORMAT_META[fmt] || FORMAT_META.print;
        const d = (prog[fmt] && typeof prog[fmt] === "object") ? prog[fmt] : {};
        const pct = formatPercent(book, fmt);
        const accent = fmt === "audio" ? "cyan" : fmt === "ebook" ? "indigo" : "violet";
        return (
          <div key={fmt} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={`ht-display text-[11px] uppercase tracking-wide ${meta.text}`}>
                {meta.glyph} {meta.label}
              </span>
              <span className={`ht-display text-[11px] tabular-nums ${meta.text}`}>{pct}%</span>
            </div>

            {/* ── Snap to update ── camera (mobile) / screenshot picker (desktop).
                The same hidden input is the upload fallback when the camera is
                blocked. Themed; cyan only on the audio row via meta.text. */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={(el) => { snapRefs.current[fmt] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleSnap(e, fmt)}
                  aria-label={`Snap a ${meta.label} progress screen`}
                />
                <button
                  onClick={() => openSnap(fmt)}
                  disabled={snapState[fmt] === "loading"}
                  className={`ht-display text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-sm border border-purple-700/50 bg-purple-900/50 hover:bg-purple-800/70 ${meta.text} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  📸 Snap to update
                </button>
                {snapState[fmt] === "loading" && (
                  <span className="text-[11px] italic text-purple-300/80">Reading the screen…</span>
                )}
              </div>

              {snapState[fmt] !== "confirm" && (
                <p className="text-[10px] italic text-purple-400/60">
                  Reads the screen you show it — Hushthorn can't sync from Kindle or Libby.
                </p>
              )}

              {/* Unreadable → clear next step, no write; manual fields stay below. */}
              {snapState[fmt] === "error" && (
                <p className="text-[11px] text-pink-300/90">
                  Couldn't read that screen — enter it by hand below.
                </p>
              )}

              {/* Confirm strip — confirm-first: nothing writes until Apply. */}
              {snapState[fmt] === "confirm" && (
                <div className="flex items-center gap-2 flex-wrap rounded-sm border border-purple-700/50 bg-purple-950/60 px-2.5 py-2">
                  <span className="ht-display text-[10px] uppercase tracking-wide text-purple-300/70">Snapped</span>
                  <span className={`ht-display text-[12px] tabular-nums ${meta.text}`}>
                    {snapSummary(fmt, snapResult[fmt])}
                  </span>
                  <div className="flex gap-1.5 ml-auto">
                    <button
                      onClick={() => applySnap(fmt)}
                      className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-pink-600/80 hover:bg-pink-500/90 text-pink-50"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => openSnap(fmt)}
                      className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-purple-800/60 hover:bg-purple-700/80 text-purple-100"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => clearSnap(fmt)}
                      className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-purple-900/50 hover:bg-purple-800/70 text-purple-200"
                    >
                      Enter by hand
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-sm text-purple-200">
              {fmt === "print" && (
                <>
                  <input
                    type="number" min="0" step="1"
                    value={num(d.page) || ""}
                    onChange={(e) => writeFmt("print", { page: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    placeholder="0"
                    className={`w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none ${meta.ring}`}
                    aria-label="Current page"
                  />
                  <span className="text-purple-300/70">of</span>
                  <input
                    type="number" min="0" step="1"
                    value={num(d.pages) || ""}
                    onChange={(e) => writeFmt("print", { pages: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    placeholder="?"
                    className={`w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none ${meta.ring}`}
                    aria-label="Total pages"
                  />
                  <span className="text-purple-300/70">pages</span>
                </>
              )}

              {fmt === "ebook" && (
                <>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={num(d.percent) || ""}
                    onChange={(e) => writeFmt("ebook", { percent: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                    placeholder="0"
                    className={`w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none ${meta.ring}`}
                    aria-label="Percent read"
                  />
                  <span className="text-purple-300/70">% read</span>
                </>
              )}

              {fmt === "audio" && (
                <>
                  <input
                    type="number" min="0" step="0.1"
                    value={num(d.listened) || ""}
                    onChange={(e) => writeFmt("audio", { listened: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0"
                    className={`w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none ${meta.ring}`}
                    aria-label="Hours listened"
                  />
                  <span className="text-purple-300/70">of</span>
                  <input
                    type="number" min="0" step="0.1"
                    value={num(d.hours) || ""}
                    onChange={(e) => writeFmt("audio", { hours: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="?"
                    className={`w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none ${meta.ring}`}
                    aria-label="Total hours"
                  />
                  <span className="text-purple-300/70">hours</span>
                </>
              )}

              {/* quick bump buttons — nudge progress without the keyboard */}
              <div className="flex gap-1">
                {fmt === "ebook" || fmt === "audio" ? (
                  [25, 50, 100].map((q) => (
                    <button
                      key={q}
                      onClick={() =>
                        fmt === "ebook"
                          ? writeFmt("ebook", { percent: q })
                          : writeFmt("audio", { listened: Math.round(num(d.hours) * (q / 100) * 10) / 10 })
                      }
                      disabled={fmt === "audio" && num(d.hours) <= 0}
                      className="ht-display text-[9px] uppercase px-2 py-1 rounded-sm bg-purple-800/50 hover:bg-purple-700/70 text-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {q === 100 ? "Done" : `${q}%`}
                    </button>
                  ))
                ) : (
                  [25, 50, 100].map((q) => (
                    <button
                      key={q}
                      onClick={() => writeFmt("print", { page: Math.round(num(d.pages) * (q / 100)) })}
                      disabled={num(d.pages) <= 0}
                      className="ht-display text-[9px] uppercase px-2 py-1 rounded-sm bg-purple-800/50 hover:bg-purple-700/70 text-purple-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {q === 100 ? "Done" : `${q}%`}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* 0-100 slider — drags map back onto the format's own fields */}
            <input
              type="range" min="0" max="100" step="1"
              value={pct}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                if (fmt === "print") writeFmt("print", { page: Math.round(num(d.pages) * (v / 100)) });
                else if (fmt === "ebook") writeFmt("ebook", { percent: v });
                else writeFmt("audio", { listened: Math.round(num(d.hours) * (v / 100) * 10) / 10 });
              }}
              disabled={(fmt === "print" && num(d.pages) <= 0) || (fmt === "audio" && num(d.hours) <= 0)}
              aria-label={`${meta.label} progress slider`}
              className={`w-full ht-progress-range ht-range-${accent} disabled:opacity-40 disabled:cursor-not-allowed`}
            />

            <div className="h-1.5 rounded-sm bg-purple-950/70 overflow-hidden border border-purple-800/40">
              <div className={`h-full rounded-sm ${meta.bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            {pct >= 100 && (
              <p className={`text-[11px] italic ${meta.text}`}>
                The telling is complete — this tome reads as finished.
              </p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-purple-400/60 italic">
        Track each format on its own. When any copy reaches the final page, the tome marks itself Read.
      </p>
    </div>
  );
}

/* ── spine + shelf ─────────────────────────────────────────── */

// Edge-glow tint per format — violet print / indigo ebook / cyan audio.
const SPINE_GLOW = {
  print: "rgba(167,139,250,0.9)",
  ebook: "rgba(129,140,248,0.9)",
  audio: "rgba(34,211,238,0.95)",
};

function Spine({ book, onOpen, dimmed, onPersist }) {
  const color = useSpineColor(book, onPersist);
  const h = 122 + (hashStr(book.title || "") % 48);
  const w = 17 + (hashStr((book.author || "") + (book.title || "")) % 12);
  const wish = book.shelf === "wishlist";
  const hasAudio = (book.formats || []).includes("audio");
  // UnionBook detection — personal books have `id`; archive entries have `owners`.
  const isUnion = !!book.owners;
  // Two thin vertical EDGE RAILS rise from the foot of the spine — NEITHER is
  // gated on book.read, so a tome finished in audio still shows its partial
  // print rail. Defensive `formatPercent` coerces missing/malformed progress
  // to 0, so a rail simply doesn't render rather than throwing.
  //   Left rail  = READING, always violet. Print & ebook share the page concept,
  //                so the furthest of the two drives it.
  //   Right rail = AUDIO, always cyan (cyan is reserved for audio).
  const printPct = formatPercent(book, "print");
  const ebookPct = formatPercent(book, "ebook");
  const readPct = Math.max(printPct, ebookPct);
  const readFmt = ebookPct > printPct ? "ebook" : "print"; // label by the driver
  const audioPct = formatPercent(book, "audio");
  const tip =
    `${book.title} — ${book.author}` +
    (readPct > 0 ? ` · ${readPct}% ${FORMAT_META[readFmt].label}` : "") +
    (audioPct > 0 ? ` · ${audioPct}% ${FORMAT_META.audio.label}` : "");
  return (
    <button
      onClick={onOpen}
      title={tip}
      className={`relative flex flex-col items-center justify-between rounded-t-[3px] rounded-b-[2px] transition-all duration-200 hover:-translate-y-2 hover:-rotate-3 hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${
        dimmed ? "opacity-20" : wish ? "opacity-60" : ""
      }`}
      style={{
        width: w,
        height: h,
        background: `linear-gradient(90deg, rgba(0,0,0,0.35), transparent 30%, transparent 70%, rgba(0,0,0,0.45)), ${color}`,
        boxShadow: "1px 0 2px rgba(0,0,0,0.6)",
        border: wish ? "1px dashed rgba(240,166,224,0.45)" : "none",
      }}
    >
      {/* progress edge rails — thin vertical bars rising from the foot to
          `pct` height. Left = reading (violet), right = audio (cyan). They sit
          on the spine's vertical edges and start just above the 5px spice band
          so they never muddy it. Sharp corners. */}
      {readPct > 0 && (
        <span
          className="absolute left-0 bottom-[5px] w-[2px] pointer-events-none"
          aria-hidden="true"
          style={{
            height: `calc(${readPct}% - 5px)`,
            background: SPINE_GLOW.print,
            boxShadow: `0 0 4px ${SPINE_GLOW.print}`,
          }}
        />
      )}
      {audioPct > 0 && (
        <span
          className="absolute right-0 bottom-[5px] w-[2px] pointer-events-none"
          aria-hidden="true"
          style={{
            height: `calc(${audioPct}% - 5px)`,
            background: SPINE_GLOW.audio,
            boxShadow: `0 0 4px ${SPINE_GLOW.audio}`,
          }}
        />
      )}
      {/* For UnionBooks: compact ownership count dot. For personal books: verdict gem. */}
      {isUnion ? (
        /* Compact ownership hint — a small pink dot with owner count. No
           WhoHasIt/RevealGrid block here; the full view lives in the detail panel.
           This is the fix for spine #7 misalignment. */
        <span
          className="mt-1.5 flex-shrink-0 flex items-center justify-center rounded-sm bg-pink-500/60"
          style={{ width: 14, height: 14, fontSize: 7, lineHeight: 1, color: "rgba(255,235,255,0.9)" }}
          title={`${(book.owners || []).length} reader${(book.owners || []).length === 1 ? "" : "s"}`}
          aria-label={`${(book.owners || []).length} readers`}
        >
          {(book.owners || []).length}
        </span>
      ) : (
        <span
          className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: book.overall >= 5 ? "#fbbf24" : book.overall > 0 ? "#a5b4fc" : "rgba(255,255,255,0.15)" }}
        />
      )}
      {/* audio ring — dormant until books carry a formats array */}
      {hasAudio && (
        <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 border border-cyan-300/90 bg-transparent" />
      )}
      <span
        className="ht-display text-[8px] leading-none text-pink-50/85 overflow-hidden"
        style={{ writingMode: "vertical-rl", maxHeight: h - 44, letterSpacing: "0.06em" }}
      >
        {(book.title || "").length > 24 ? book.title.slice(0, 23) + "…" : book.title}
      </span>
      {/* spice band */}
      <span
        className="w-full flex-shrink-0"
        style={{ height: 5, background: book.smut > 0 ? `rgba(244,114,182,${0.2 + book.smut * 0.16})` : "rgba(255,255,255,0.08)" }}
      />
    </button>
  );
}

const MAX_SPINE_W = 29;
const SPINE_GAP = 5;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function SpineShelf({ books, onOpen, query, onPersist }) {
  const ref = useRef(null);
  const [perRow, setPerRow] = useState(10);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width) => {
      if (!width) return;
      setPerRow(clamp(Math.floor(width / (MAX_SPINE_W + SPINE_GAP)), 6, 14));
    };
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) measure(e.contentRect.width);
      });
      ro.observe(el);
      measure(el.clientWidth);
      return () => ro.disconnect();
    }
    // Fallback: clientWidth on mount + window resize listener.
    const onResize = () => measure(el.clientWidth);
    measure(el.clientWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // Re-run across the empty<->filled boundary so the observer re-attaches to
    // the current div (the empty state renders a different element).
  }, [books.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (books.length === 0) {
    return (
      <div ref={ref} className="text-center py-20 text-purple-300/60">
        <p className="ht-display text-xl">This bookcase stands empty.</p>
        <p className="mt-2 text-[15px] italic">Inscribe a tome to begin the collection.</p>
      </div>
    );
  }

  const readCount = books.filter((b) => b.read).length;
  const rows = [];
  for (let i = 0; i < books.length; i += perRow) rows.push(books.slice(i, i + perRow));

  return (
    <div ref={ref} className="max-w-3xl mx-auto">
      <p className="ht-display text-center text-[10px] uppercase tracking-widest text-purple-300/60 mb-4">
        {books.length} tome{books.length === 1 ? "" : "s"} · {readCount} read
      </p>
      {rows.map((row, ri) => (
        <div key={ri}>
          <div className="flex items-end gap-[5px] px-3 min-h-[178px]">
            {row.map((b) => {
              const isUnion = !!b.owners;
              const openId = isUnion ? b.key : b.id;
              return (
                <Spine
                  key={b.id || b.key}
                  book={b}
                  onOpen={() => onOpen(openId)}
                  dimmed={!!query && !matchesQuery(b, query)}
                  onPersist={(!isUnion && onPersist) ? (c) => onPersist(b.id, c) : undefined}
                />
              );
            })}
          </div>
          <div
            className="h-2.5 rounded-sm mb-6"
            style={{
              background: "linear-gradient(180deg, #3a2350, #1c1030)",
              boxShadow: "0 4px 8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(240,166,224,0.18)",
            }}
          />
        </div>
      ))}
      <p className="text-center text-sm text-purple-400/60 italic mt-2">
        Hover a spine to ease it from the shelf — tap to pull it out. Wishlist spines are ghosts in dashed glass.
      </p>
    </div>
  );
}

/* ── controls bar ──────────────────────────────────────────── */

function ControlsBar({ layout, onLayout, sortKey, onSort, query, onQuery }) {
  return (
    <div className="max-w-5xl mx-auto px-5 pb-5 flex flex-wrap items-center justify-center gap-2">
      <div className="flex rounded-sm overflow-hidden border border-purple-700/50">
        <button
          onClick={() => onLayout("grid")}
          className={`ht-display px-3 py-1.5 text-[10px] uppercase font-semibold transition-colors ${layout === "grid" ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
        >
          ▦ Covers
        </button>
        <button
          onClick={() => onLayout("spines")}
          className={`ht-display px-3 py-1.5 text-[10px] uppercase font-semibold transition-colors ${layout === "spines" ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
        >
          ▤ Spines
        </button>
      </div>
      <select
        value={sortKey}
        onChange={(e) => onSort(e.target.value)}
        className="ht-display bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1.5 text-[10px] uppercase text-purple-200 focus:outline-none focus:border-pink-400"
        aria-label="Sort the shelves"
      >
        <option value="recent">Recently inscribed</option>
        <option value="author">By author</option>
        <option value="title">By title</option>
        <option value="verdict">By verdict</option>
        <option value="spice">By Smoulder</option>
      </select>
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search the shelves…"
        className="bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400 w-44"
        aria-label="Search the shelves"
      />
    </div>
  );
}

/* ── archive switcher ──────────────────────────────────────── */

// Swaps the shelf between the personal library (`null`) and a shared archive.
// `current` is the active library id (null = My Library); `archives` is
// `[{id,name,role}]`; `onSwitch(id|null)` sets `currentLibraryId`. Custom
// dropdown styled to match ControlsBar — Cinzel labels, sharp corners,
// purple/pink palette, no cyan. Closes on outside-click or Escape.
function ArchiveSwitcher({ current, archives = [], onSwitch }) {
  const inArchive = current !== null;
  const activeName = inArchive
    ? (archives.find((a) => a.id === current)?.name ?? "Shared archive")
    : "My Library";
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside-click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const choose = (id) => { onSwitch(id); setOpen(false); };

  return (
    <div className="max-w-5xl mx-auto px-5 pb-4 flex flex-wrap items-center justify-center gap-2">
      <span className="ht-display text-[9px] uppercase tracking-widest text-purple-400/70">
        Shelf
      </span>
      <div className="relative" ref={ref}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Choose which shelf to browse"
          onClick={() => setOpen((o) => !o)}
          className={`ht-display flex items-center gap-2 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-wide focus:outline-none focus:border-pink-400 transition-colors ${
            inArchive
              ? "bg-purple-800/60 border-pink-400/60 text-pink-100 hover:bg-purple-700/70"
              : "bg-purple-950/60 border-purple-700/50 text-purple-200 hover:bg-purple-900/60"
          }`}
        >
          {inArchive && <span aria-hidden="true" className="text-pink-300/80">♥</span>}
          <span>{activeName}</span>
          <span aria-hidden="true" className={`text-[9px] transition-transform ${open ? "rotate-180" : ""} ${inArchive ? "text-pink-200/80" : "text-purple-400/70"}`}>▾</span>
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="Choose which shelf to browse"
            className="absolute z-50 top-full left-0 mt-0.5 min-w-full bg-[#130b22] border border-purple-700/60 rounded-sm shadow-xl overflow-hidden"
          >
            <li>
              <button
                role="option"
                aria-selected={current === null}
                type="button"
                onClick={() => choose(null)}
                className={`ht-display w-full text-left px-3 py-2 text-[11px] uppercase tracking-wide hover:bg-purple-800/60 transition-colors ${
                  current === null ? "text-pink-200 bg-purple-800/40" : "text-purple-200"
                }`}
              >
                My Library
              </button>
            </li>
            {archives.map((a) => (
              <li key={a.id}>
                <button
                  role="option"
                  aria-selected={current === a.id}
                  type="button"
                  onClick={() => choose(a.id)}
                  className={`ht-display w-full text-left px-3 py-2 text-[11px] uppercase tracking-wide hover:bg-purple-800/60 transition-colors flex items-center gap-1.5 ${
                    current === a.id ? "text-pink-200 bg-purple-800/40" : "text-purple-200"
                  }`}
                >
                  <span aria-hidden="true" className="text-pink-400/60 text-[9px]">♥</span>
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── rating meters ─────────────────────────────────────────── */

function Meter({ value, onChange, Icon, label, readOnly = false, size }) {
  return (
    <div className="flex items-center gap-1" role={readOnly ? undefined : "radiogroup"} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange && onChange(n === value ? 0 : n)}
          className={`p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${readOnly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"}`}
          aria-label={`${label}: ${n} of 5`}
        >
          <Icon filled={n <= value} size={size} />
        </button>
      ))}
    </div>
  );
}


/* ── main app ──────────────────────────────────────────────── */

export default function Hushthorn() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Shared-library archive switcher (Phase 2). `currentLibraryId` null = the
  // personal library (unchanged behaviour). `archives` is the list of shared
  // archives the user belongs to, each with the user's own membership role.
  // No UI sets `currentLibraryId` yet (Task 6 wires the switcher), so the app
  // renders exactly as before until then.
  const [currentLibraryId, setCurrentLibraryId] = useState(null);
  const [archives, setArchives] = useState([]);
  // Books loaded for the active shared archive (empty while personal).
  const [sharedBooks, setSharedBooks] = useState([]);
  // Identity. `profile` is the user's claimed username row (or null until claimed).
  // `profileReady` gates the UsernameGate so the app never flashes before we know.
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setAuthReady(true);
      })
      .catch(() => setAuthReady(true));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const [books, setBooks] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [avatar, setAvatar] = useState({
    name: 'Keeper of the Archive',
    gender: 'nonbinary',
    hair_color: '#1e1b4b',
    skin_tone: '#c4956a',
    robe_color: '#5b21b6',
  });
  const [avatarOpen, setAvatarOpen] = useState(false);
  // View preferences, persisted on the avatars row (cross-device). Defaults
  // apply until an avatar row loads or the first savePrefs creates one.
  const [prefs, setPrefs] = useState({ pref_layout: 'grid', pref_sort: 'recent' });

  useEffect(() => {
    if (!session) {
      setBooks([]); setDataLoading(false);
      setProfile(null); setProfileReady(false);
      setArchives([]); setSharedBooks([]); setCurrentLibraryId(null);
      return;
    }
    setDataLoading(true);
    const uid = session.user.id;
    Promise.all([
      // Personal shelf — every book I own. Books are personal again (union model);
      // there is no `library_id` column and no shared-book rows to filter out.
      supabase.from('books').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('notes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('avatars').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('profiles').select('username').eq('user_id', uid).maybeSingle(),
      // Shared archives this user belongs to, with the user's own role.
      supabase.from('libraries').select('id,name,library_members(user_id,role)'),
    ]).then(([{ data: booksData, error: bErr }, { data: notesData, error: nErr }, { data: avatarData }, { data: profileData }, { data: libsData, error: lErr }]) => {
      if (bErr) console.error('books fetch:', bErr.message);
      if (nErr) console.error('notes fetch:', nErr.message);
      if (lErr) console.error('libraries fetch:', lErr.message);
      const notesByBook = {};
      for (const n of (notesData || [])) {
        if (!notesByBook[n.book_id]) notesByBook[n.book_id] = [];
        notesByBook[n.book_id].push({
          id: n.id, page: n.page, isQuote: n.is_quote,
          text: n.text, isVoice: n.is_voice, date: n.date, isTime: n.is_time,
        });
      }
      setBooks((booksData || []).map(b => ({
        id: b.id, title: b.title, author: b.author, year: b.year,
        coverUrl: b.cover_url, genres: b.genres || [], shelf: b.shelf,
        read: b.read, overall: b.overall, smut: b.smut,
        spineColor: b.spine_color,
        formats: b.formats || ['print'],
        progress: (b.progress && typeof b.progress === 'object') ? b.progress : {},
        hidden: !!b.hidden_from_archives,
        notes: notesByBook[b.id] || [],
      })));
      if (avatarData) setAvatar({
        name: avatarData.name, gender: avatarData.gender,
        hair_color: avatarData.hair_color, skin_tone: avatarData.skin_tone,
        robe_color: avatarData.robe_color,
      });
      if (avatarData) setPrefs({
        pref_layout: avatarData.pref_layout ?? 'grid',
        pref_sort: avatarData.pref_sort ?? 'recent',
      });
      setProfile(profileData || null);
      // Map libraries → [{ id, name, role }] where role is THIS user's
      // membership role. A library with no matching membership row is skipped
      // defensively (shouldn't happen under RLS, but never a dead end).
      setArchives((libsData || []).reduce((acc, lib) => {
        const mine = (lib.library_members || []).find(m => m.user_id === uid);
        if (mine) acc.push({ id: lib.id, name: lib.name, role: mine.role });
        return acc;
      }, []));
    }).catch(err => console.error('data load:', err))
      .finally(() => { setDataLoading(false); setProfileReady(true); });
  }, [session]);

  // ── shared archive union read model (Union model, Task 2) ───────────
  // An archive is a *lens*: it merges every member's PERSONAL library, deduped
  // by normalized title+author, and tags each entry with who owns it. Books stay
  // personal (owner-only `books` rows); co-members are read ONLY through the two
  // SECURITY DEFINER views:
  //   • archive_shelf  — shareable metadata, NO marks columns (structurally can't leak)
  //   • archive_reveal — a co-member's marks, ONLY where they opted into sharing
  // My own row is the source of MY marks/notes/hidden; the views exclude my rows
  // (and everyone's hidden rows for co-members).
  //
  // Produces UnionBook[]:
  //   { key, title, author, coverUrl, genres, formats(union),
  //     mineBookId?, read, overall, smut, progress, notes, hidden, shelf,   // from MY copy; defaults if I lack it
  //     owners:  [{ user_id, username, av, formats, shelf }],               // me + every archive_shelf owner
  //     reveals: [{ user_id, overall, smut, progress, read }] }             // archive_reveal rows for this key
  //
  // key = norm(title)+'|'+norm(author), norm(s)=(s||'').trim().toLowerCase().
  // Every Supabase call is defensive: errors are logged and treated as empty, so
  // a partial failure degrades to a thinner shelf rather than throwing.
  // Union dedup key: one entry per normalized title+author (the app's
  // unique-by-title rule). Shared by loadArchiveUnion (dedup) and addBook
  // (reopen the archive panel by key after "Add to my library"), so the two
  // key derivations can never drift and silently break the reopen.
  const unionKeyOf = (title, author) =>
    `${(title || '').trim().toLowerCase()}|${(author || '').trim().toLowerCase()}`;

  const loadArchiveUnion = async (uid, libraryId) => {
    if (!uid || !libraryId) return [];
    const keyOf = unionKeyOf;

    // Fetch my books, the two co-member views, my notes, and the roster in parallel.
    const [
      { data: mineRows, error: bErr },
      { data: shelfRows, error: sErr },
      { data: revealRows, error: rvErr },
      { data: myNotes, error: nErr },
      { data: memRows, error: mErr },
    ] = await Promise.all([
      supabase.from('books').select('*').eq('user_id', uid),
      supabase.from('archive_shelf').select('*').eq('library_id', libraryId),
      supabase.from('archive_reveal').select('*').eq('library_id', libraryId),
      supabase.from('notes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('library_members').select('user_id,role').eq('library_id', libraryId),
    ]);
    if (bErr) console.error('union my books fetch:', bErr.message);
    if (sErr) console.error('archive_shelf fetch:', sErr.message);
    if (rvErr) console.error('archive_reveal fetch:', rvErr.message);
    if (nErr) console.error('union notes fetch:', nErr.message);
    if (mErr) console.error('union roster fetch:', mErr.message);

    const mine = mineRows || [];
    const shelf = shelfRows || [];
    const reveal = revealRows || [];
    const members = memRows || [];

    // Roster identity: `library_members` has no FK to profiles/avatars (both key
    // on user_id → auth.users), so PostgREST can't embed them. Load members, then
    // fetch profiles + avatars by user_id in a second round (the Phase-1 idiom).
    // Seed with me so my avatar shows even before the roster resolves.
    const memberIds = Array.from(new Set([uid, ...members.map(m => m.user_id)]));
    let profsData = [];
    let avsData = [];
    if (memberIds.length) {
      const [{ data: profs, error: prErr }, { data: avs, error: avErr }] = await Promise.all([
        supabase.from('profiles').select('user_id, username').in('user_id', memberIds),
        supabase.from('avatars').select('user_id, gender, hair_color, skin_tone, robe_color').in('user_id', memberIds),
      ]);
      if (prErr) console.error('union roster profiles fetch:', prErr.message);
      if (avErr) console.error('union roster avatars fetch:', avErr.message);
      profsData = profs || [];
      avsData = avs || [];
    }
    const profBy = Object.fromEntries(profsData.map(p => [p.user_id, p]));
    const avBy = Object.fromEntries(avsData.map(a => [a.user_id, a]));
    const identity = (userId) => {
      const a = avBy[userId];
      return {
        user_id: userId,
        username: profBy[userId]?.username,
        av: a
          ? { gender: a.gender, hair_color: a.hair_color, skin_tone: a.skin_tone, robe_color: a.robe_color }
          : null,
      };
    };

    // My notes, grouped by book id (personal-load shape).
    const notesByBook = {};
    for (const n of (myNotes || [])) {
      if (!notesByBook[n.book_id]) notesByBook[n.book_id] = [];
      notesByBook[n.book_id].push({
        id: n.id, page: n.page, isQuote: n.is_quote,
        text: n.text, isVoice: n.is_voice, date: n.date, isTime: n.is_time,
      });
    }

    const map = new Map();

    // 1) Seed from MY books first (include ALL of mine, even hidden — hidden books
    //    still show to ME; the views already exclude my hidden books for others).
    for (const b of mine) {
      const key = keyOf(b.title, b.author);
      const meId = identity(uid);
      const myFormats = b.formats || ['print'];
      const myShelf = b.shelf || 'wishlist';
      map.set(key, {
        key,
        title: b.title,
        author: b.author,
        coverUrl: b.cover_url,
        genres: b.genres || [],
        formats: Array.from(new Set(myFormats)),
        mineBookId: b.id,
        read: !!b.read,
        overall: b.overall ?? 0,
        smut: b.smut ?? 0,
        progress: (b.progress && typeof b.progress === 'object') ? b.progress : {},
        notes: notesByBook[b.id] || [],
        hidden: !!b.hidden_from_archives,
        shelf: myShelf,
        owners: [{ user_id: uid, username: meId.username, av: meId.av, formats: myFormats, shelf: myShelf }],
        reveals: [],
      });
    }

    // 2) Fold in each co-member's archive_shelf row (metadata + ownership only).
    for (const s of shelf) {
      const key = keyOf(s.title, s.author);
      const ownerFormats = s.formats || ['print'];
      let entry = map.get(key);
      if (!entry) {
        // A title only co-members have — I don't own it, so marks default.
        entry = {
          key,
          title: s.title,
          author: s.author,
          coverUrl: s.cover_url,
          genres: s.genres || [],
          formats: [],
          mineBookId: undefined,
          read: false,
          overall: 0,
          smut: 0,
          progress: {},
          notes: [],
          hidden: false,
          shelf: 'wishlist',
          owners: [],
          reveals: [],
        };
        map.set(key, entry);
      }
      // coverUrl/genres: prefer mine; else fall back to the first owner's.
      if (!entry.coverUrl && s.cover_url) entry.coverUrl = s.cover_url;
      if ((!entry.genres || entry.genres.length === 0) && (s.genres || []).length) entry.genres = s.genres;
      // formats = union of every owner's formats.
      entry.formats = Array.from(new Set([...(entry.formats || []), ...ownerFormats]));
      const who = identity(s.owner_id);
      entry.owners.push({
        user_id: s.owner_id,
        username: who.username,
        av: who.av,
        formats: ownerFormats,
        shelf: s.shelf || 'wishlist',
      });
    }

    // 3) Attach co-member reveals (opted-in marks) by key.
    for (const r of reveal) {
      const key = keyOf(r.title, r.author);
      const entry = map.get(key);
      if (!entry) continue; // a reveal with no shelf metadata — nothing to attach it to
      entry.reveals.push({
        user_id: r.owner_id,
        overall: r.overall ?? 0,
        smut: r.smut ?? 0,
        progress: (r.progress && typeof r.progress === 'object') ? r.progress : {},
        read: !!r.read,
      });
    }

    return [...map.values()];
  };

  // Reload the active archive's union on demand. Extracted from the switch effect
  // so a post-mutation flow (e.g. "Add to my library" from an archive) can refresh
  // the merged shelf immediately instead of waiting for the next archive switch.
  const refreshArchiveUnion = async () => {
    if (currentLibraryId == null || !session) { setSharedBooks([]); return; }
    try {
      setSharedBooks(await loadArchiveUnion(session.user.id, currentLibraryId));
    } catch (err) {
      console.error('loadArchiveUnion:', err);
      setSharedBooks([]);
    }
  };

  // Load the active archive's union when switched; clear when personal (null).
  useEffect(() => {
    if (currentLibraryId == null || !session) { setSharedBooks([]); return; }
    let cancelled = false;
    loadArchiveUnion(session.user.id, currentLibraryId)
      .then(union => { if (!cancelled) setSharedBooks(union); })
      .catch(err => { console.error('loadArchiveUnion:', err); if (!cancelled) setSharedBooks([]); });
    return () => { cancelled = true; };
  }, [currentLibraryId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active shelf source: personal library (null) → `books`; else the loaded
  // shared-archive union (`sharedBooks`). The switcher is live, so
  // `currentLibraryId` is routinely non-null while browsing an archive.
  const shelfBooks = currentLibraryId === null ? books : sharedBooks;

  const [shelfFilter, setShelfFilter] = useState("all");
  // Switch the active shelf (null = My Library). The filter tab set differs
  // between contexts (personal Owned/Wishlist vs. archive I own/Others own/
  // Nobody), so reset to "All" on switch to avoid a stale, un-highlighted tab.
  // Also drop back to the library view so the switch is immediately visible.
  const switchLibrary = (id) => {
    setCurrentLibraryId(id);
    setShelfFilter("all");
    setActiveId(null);
    setView("library");
  };
  const [activeId, setActiveId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  // Seed for "Add to my library" from an archive entry — prefills the modal with
  // the UnionBook's title/author/cover/genres so the user just picks format/shelf.
  const [addSeed, setAddSeed] = useState(null);
  const [view, setView] = useState("library"); // library | oracle | pair

  // View controls. Initialized from prefs defaults; synced once an avatar row
  // loads (the effect below runs when prefs change after the data fetch).
  const [layout, setLayout] = useState(prefs.pref_layout);   // 'grid' | 'spines'
  const [sortKey, setSortKey] = useState(prefs.pref_sort);   // recent|author|title|verdict|spice
  const [query, setQuery] = useState("");
  useEffect(() => {
    setLayout(prefs.pref_layout);
    setSortKey(prefs.pref_sort);
  }, [prefs.pref_layout, prefs.pref_sort]);

  // Layout writes immediately; sort writes are debounced ~400ms.
  const sortSaveTimer = useRef(null);
  const changeLayout = (next) => { setLayout(next); savePrefs({ pref_layout: next }); };
  const changeSort = (next) => {
    setSortKey(next);
    if (sortSaveTimer.current) clearTimeout(sortSaveTimer.current);
    sortSaveTimer.current = setTimeout(() => savePrefs({ pref_sort: next }), 400);
  };

  // Smart-merge imported books: update existing entries, add new ones.
  const importBooks = async (items) => {
    let additions = [];
    setBooks((prev) => {
      const updated = prev.map((b) => ({ ...b, notes: [...b.notes] }));
      const byTitle = new Map(updated.map((b) => [b.title.toLowerCase(), b]));
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const newAdditions = [];
      for (const item of items) {
        const key = item.title.toLowerCase();
        const newNotes = (item.notes || []).map((n) => ({
          id: crypto.randomUUID(),
          page: n.page || "",
          isQuote: !!n.isQuote,
          text: n.text,
          isVoice: false,
          isTime: false,
          date: today,
        }));
        const existing = byTitle.get(key);
        if (existing) {
          const have = new Set(existing.notes.map((n) => n.text));
          existing.notes = [...newNotes.filter((n) => !have.has(n.text)), ...existing.notes];
          existing.read = existing.read || !!item.read;
          if (item.shelf === "owned") existing.shelf = "owned";
          if (!existing.overall && item.overall) existing.overall = item.overall;
          if ((!existing.genres || existing.genres.length === 0) && item.genres?.length) existing.genres = item.genres;
          if (!existing.coverUrl && item.coverUrl) existing.coverUrl = item.coverUrl;
        } else {
          newAdditions.push({
            id: crypto.randomUUID(),
            title: item.title,
            author: item.author || "Unknown author",
            year: null,
            coverUrl: item.coverUrl || "",
            genres: item.genres || [],
            shelf: item.shelf || "owned",
            read: !!item.read,
            overall: item.overall || 0,
            smut: 0,
            formats: ['print'],
            progress: item.progress || {},
            notes: newNotes,
          });
        }
      }
      additions = newAdditions;
      return [...newAdditions, ...updated];
    });
    // Write new books to Supabase
    if (additions.length) {
      await supabase.from('books').insert(
        additions.map(b => ({
          id: b.id,
          user_id: session.user.id,
          title: b.title,
          author: b.author,
          year: b.year ?? null,
          cover_url: b.coverUrl,
          genres: b.genres,
          shelf: b.shelf,
          read: b.read,
          overall: b.overall,
          smut: b.smut,
          formats: b.formats || ['print'],
          progress: b.progress || {},
        }))
      );
    }
  };

  // In a personal library, entries are looked up by `id`; in an archive, entries
  // are UnionBooks keyed by `key` (they have no `id`). Support both so the grid
  // open-by-key path works without changing the personal-library path.
  const activeBook = shelfBooks.find((b) =>
    b.key ? b.key === activeId : b.id === activeId
  ) || null;

  // `me` scopes the archive ownership filters below. Null-safe: personal books
  // never reach the ownership branches (those keys only exist in an archive).
  const me = session?.user?.id;
  const filtered = shelfBooks.filter((b) => {
    if (shelfFilter === "all") return true;
    // Personal-shelf filters (currentLibraryId === null) — unchanged.
    if (shelfFilter === "owned") return b.shelf === "owned";
    if (shelfFilter === "wishlist") return b.shelf === "wishlist";
    // Archive-only ownership filters (non-exclusive; computed from `owners`).
    // Task 3 rebuilds the tab set (I own / Others own / Wishlist); these keep the
    // current tabs functional against the UnionBook shape in the meantime.
    if (shelfFilter === "iown") return (b.owners || []).some((o) => o.user_id === me && o.shelf === "owned");
    if (shelfFilter === "othersown") return (b.owners || []).some((o) => o.user_id !== me && o.shelf === "owned");
    if (shelfFilter === "nobody") return !(b.owners || []).some((o) => o.shelf === "owned");
    // Shared across both contexts.
    if (shelfFilter === "read") return b.read;
    if (shelfFilter === "unread") return !b.read;
    if (shelfFilter === "audio") return (b.formats || []).includes("audio");
    return true;
  });

  // View pipeline: shelf-filtered → sorted. Grid hides non-matches; the spine
  // shelf dims them (handled per-Spine via the query prop), so it gets `sorted`.
  const sorted = sortBooks(filtered, sortKey);
  const gridBooks = sorted.filter((b) => matchesQuery(b, query));

  // FIELD_MAP maps in-memory book fields → `books` columns. Books are personal
  // again (union model), so there is a single personal write path — marks and
  // metadata all live on the owner's own row. `hidden` maps to the per-book
  // `hidden_from_archives` flag that removes a book from the archive union.
  const FIELD_MAP = { coverUrl: 'cover_url', overall: 'overall', smut: 'smut', shelf: 'shelf', read: 'read', genres: 'genres', spineColor: 'spine_color', formats: 'formats', progress: 'progress', hidden: 'hidden_from_archives' };

  const updateBook = async (id, patch) => {
    // Handle notes diff — detects adds and/or deletes by comparing ID sets
    if ('notes' in patch) {
      const current = books.find(b => b.id === id);
      if (!current) return;
      const currentIds = new Set(current.notes.map(n => n.id));
      const patchIds = new Set(patch.notes.map(n => n.id));
      const added = patch.notes.find(n => !currentIds.has(n.id));
      const removed = current.notes.find(n => !patchIds.has(n.id));
      if (added) {
        const { error } = await supabase.from('notes').insert({
          id: added.id,
          book_id: id,
          user_id: session.user.id,
          page: added.page,
          is_quote: added.isQuote,
          text: added.text,
          is_voice: added.isVoice,
          is_time: added.isTime ?? false,
          date: added.date,
        });
        if (error) { console.error('note insert:', error.message); return; }
      }
      if (removed) {
        const { error } = await supabase.from('notes').delete().eq('id', removed.id);
        if (error) { console.error('note delete:', error.message); return; }
      }
    }
    // Auto-Read: any format reaching 100% marks the book Read. Centralized here
    // so every progress source (editor, quick-bumps, slider) triggers it — no
    // confirm dialog. We project the patch onto the current book first, then
    // re-derive `read` from the merged result.
    const current = books.find(b => b.id === id);
    if (current && 'progress' in patch && !patch.read && !current.read) {
      const merged = { ...current, ...patch };
      if (maxPercent(merged) >= 100) patch = { ...patch, read: true };
    }

    // Handle book field changes (personal path — uses the full FIELD_MAP,
    // hoisted above; personal marks legitimately live on the personal row).
    const dbPatch = Object.fromEntries(
      Object.entries(FIELD_MAP).filter(([k]) => k in patch).map(([k, v]) => [v, patch[k]])
    );
    if (Object.keys(dbPatch).length) {
      const { error } = await supabase.from('books').update(dbPatch).eq('id', id);
      if (error) { console.error('updateBook:', error.message); return; }
    }
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    // Mirror onto the archive union too: a UnionBook keyed on this row (my copy)
    // gets my marks/notes/hidden patched so an open archive detail stays in sync.
    // NOTE: patches top-level fields but NOT the entry's `owners[]` "me" row — fine
    // today (the archive detail edits only marks/progress/hide, never shelf/formats).
    // If an archive entry ever edits shelf/formats, mirror into owners[] here too.
    setSharedBooks(prev => prev.map(b => b.mineBookId === id ? { ...b, ...patch } : b));
  };

  // Delete a personal book row (owner-only). Drop it from the personal shelf and
  // from any archive union entry whose "my copy" is this row.
  const removeBook = async (id) => {
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (error) { console.error('removeBook:', error.message); return; }
    setBooks(prev => prev.filter(b => b.id !== id));
    setSharedBooks(prev => prev.filter(b => b.mineBookId !== id));
    setActiveId(null);
  };

  // Hide/reveal one of MY books from every shared archive union. `hidden_from_archives`
  // is an owner-only flag on my own `books` row; the two archive views exclude
  // hidden rows for co-members, and my personal library still shows it to me.
  // Optimistic: patch `books` immediately and mirror onto any archive union entry
  // whose "my copy" is this row, so the toggle reflects at once. On write failure,
  // roll the optimistic patch back — unlike a cosmetic field, a stuck `hidden`
  // would leave a book the user believes is private still visible to co-members.
  const setHidden = async (bookId, hidden) => {
    const prevHidden = books.find(b => b.id === bookId)?.hidden ?? false;
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, hidden } : b));
    setSharedBooks(prev => prev.map(b => b.mineBookId === bookId ? { ...b, hidden } : b));
    const { error } = await supabase.from('books').update({ hidden_from_archives: hidden }).eq('id', bookId);
    if (error) {
      console.error('setHidden:', error.message);
      setBooks(prev => prev.map(b => b.id === bookId ? { ...b, hidden: prevHidden } : b));
      setSharedBooks(prev => prev.map(b => b.mineBookId === bookId ? { ...b, hidden: prevHidden } : b));
    }
  };

  // Lazy backfill: persist one book's sampled spine color and mirror it locally
  // so the useSpineColor hook never re-fires for the same book. Best-effort —
  // a write failure leaves spine_color null in the DB (retried next session).
  // The color value is supplied by the caller (Frontend); never computed here.
  const persistSpineColor = async (id, spine_color) => {
    const updater = prev => prev.map(b => b.id === id ? { ...b, spineColor: spine_color } : b);
    setBooks(updater);
    setSharedBooks(updater);
    const { error } = await supabase.from('books').update({ spine_color }).eq('id', id);
    if (error) console.error('persistSpineColor:', error.message);
  };

  // Lazy page-count backfill: fires once per session per book when the detail
  // panel opens. Conditions to attempt:
  //   1. A book is active (activeId is set).
  //   2. The book carries the 'print' format.
  //   3. progress.print.pages is falsy (no count stored yet).
  //   4. This book id has not been tried this session (pageCountTriedIds).
  // On success: patches ONLY `pages` via updateBook — never `page` — so
  // maxPercent stays 0 and the auto-Read guard in updateBook is not triggered.
  // On miss or error: marks tried and does nothing; field stays empty.
  useEffect(() => {
    if (!activeId) return;
    const book = shelfBooks.find((b) => b.key ? b.key === activeId : b.id === activeId);
    if (!book) return;
    // UnionBooks have no personal `id` to write back to — skip the page-count
    // backfill for archive entries (it would call updateBook with undefined id).
    if (book.owners) return;
    if (!(book.formats || ["print"]).includes("print")) return;
    if (book.progress?.print?.pages) return; // already has a page count
    if (pageCountTriedIds.has(activeId)) return; // already attempted this session
    pageCountTriedIds.add(activeId);
    (async () => {
      try {
        const count = await fetchPageCount(book.title, book.author);
        if (typeof count === "number" && Number.isInteger(count) && count > 0) {
          await updateBook(activeId, {
            progress: {
              ...book.progress,
              print: { ...(book.progress?.print || {}), pages: count },
            },
          });
        }
      } catch { /* defensive: updateBook should never throw, but guard anyway */ }
    })();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Partial upsert of view prefs on the avatars row, keyed on user_id. Writes
  // only pref_layout/pref_sort (+ updated_at) so it never clobbers name/colors.
  // Updates local prefs state immediately; write failures log and don't block.
  const savePrefs = async (patch) => {
    if (!session) return;
    setPrefs(prev => ({ ...prev, ...patch }));
    const { error } = await supabase.from('avatars').upsert({
      user_id: session.user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('savePrefs:', error.message);
  };

  const addBook = async (book) => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('books').insert({
      id,
      user_id: session.user.id,
      title: book.title,
      author: book.author,
      year: book.year ?? null,
      cover_url: book.coverUrl,
      genres: book.genres,
      shelf: book.shelf,
      read: book.read,
      overall: book.overall,
      smut: book.smut,
      spine_color: book.spineColor ?? null,
      formats: book.formats || ['print'],
      progress: book.progress || {},
    });
    if (error) { console.error('addBook:', error.message); return; }
    setBooks(prev => [{ ...book, id, progress: book.progress || {}, notes: [] }, ...prev]);
    setAddOpen(false);
    // In an archive the active shelf is the union (entries resolve by `key`, not
    // `id`), and it doesn't auto-refresh on insert. So after adding from an archive,
    // reload the union and reopen by the union key — otherwise the panel orphans and
    // the book keeps reading as "not mine" until re-entry.
    if (currentLibraryId != null) {
      await refreshArchiveUnion();
      if (book.shelf === 'owned') setActiveId(unionKeyOf(book.title, book.author));
    } else if (book.shelf === 'owned') {
      setActiveId(id);
    }
  };

  // In the personal library (currentLibraryId === null) the tabs are UNCHANGED.
  // Inside a shared archive, ownership is per-member, so Owned/Wishlist give way
  // to non-exclusive ownership filters (I own · Others own · Nobody). Read/Unread
  // and 🎧 Audio stay in both contexts.
  const shelfTabs = currentLibraryId === null
    ? [
        { key: "all", label: "All" },
        { key: "owned", label: "Owned" },
        { key: "wishlist", label: "Wishlist" },
        { key: "read", label: "Read" },
        { key: "unread", label: "Unread" },
        { key: "audio", label: "🎧 Audio" },
      ]
    : [
        { key: "all", label: "All" },
        { key: "iown", label: "I own" },
        { key: "othersown", label: "Others own" },
        { key: "nobody", label: "To be adopted" },
        { key: "read", label: "Read" },
        { key: "unread", label: "Unread" },
        { key: "audio", label: "🎧 Audio" },
      ];

  if (!authReady) return (
    <div className="ht-bg ht-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <p className="ht-display text-purple-300/60 text-sm uppercase tracking-widest">Opening the archive…</p>
    </div>
  );
  if (!session) return <AuthPage />;
  if (!profileReady) return (
    <div className="ht-bg ht-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <p className="ht-display text-purple-300/60 text-sm uppercase tracking-widest">Opening the archive…</p>
    </div>
  );
  if (!profile?.username) return (
    <UsernameGate
      session={session}
      suggested={avatar?.name}
      onClaimed={(username) => setProfile({ username })}
    />
  );

  return (
    <div className="ht-bg ht-body text-purple-100">
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />

      {/* header */}
      <header className="max-w-5xl mx-auto px-5 pt-10 pb-4 text-center">
        <Crown />
        <h1 className="ht-blackletter ht-glow text-6xl sm:text-7xl text-transparent bg-clip-text bg-gradient-to-b from-pink-200 via-fuchsia-300 to-fuchsia-500">
          Hushthorn
        </h1>
        <p className="mt-3 text-[15px] text-pink-200/65 italic">
          a candlelit archive for the books you shouldn't read in public
        </p>
        <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="ht-rule w-24 inline-block" />
          <span className="text-pink-300/70 text-[10px]">◆</span>
          <span className="ht-rule w-24 inline-block" />
        </div>
        <div className="mt-4 flex justify-center">
          <AvatarChip
            avatar={avatar}
            ownedCount={books.filter(b => b.shelf === 'owned').length}
            readCount={books.filter(b => b.read).length}
            onClick={() => setAvatarOpen(true)}
          />
        </div>
        <div className="mt-2 flex justify-center">
          <button
            onClick={() => supabase.auth.signOut()}
            className="ht-display text-[9px] uppercase tracking-widest text-purple-400/50 hover:text-pink-300/70 transition-colors"
          >
            leave the archive
          </button>
        </div>
      </header>

      {/* archive switcher — only when the reader belongs to a shared archive */}
      {archives.length > 0 && (
        <ArchiveSwitcher
          current={currentLibraryId}
          archives={archives}
          onSwitch={switchLibrary}
        />
      )}

      {/* shelf banners */}
      <nav className="max-w-5xl mx-auto px-5 flex flex-wrap justify-center gap-2 pb-6" aria-label="Shelves">
        {shelfTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setShelfFilter(t.key); setView("library"); }}
            className={`ht-ribbon ht-display px-5 pt-2 pb-4 text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${
              view === "library" && shelfFilter === t.key
                ? "bg-gradient-to-b from-fuchsia-500/90 to-purple-700/90 text-white"
                : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setView("oracle")}
          className={`ht-ribbon ht-display px-5 pt-2 pb-4 text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${
            view === "oracle"
              ? "bg-gradient-to-b from-indigo-500/80 to-purple-600/80 text-white"
              : "bg-purple-900/40 text-indigo-300 hover:bg-purple-800/50"
          }`}
        >
          🔮 Oracle
        </button>
        <button
          onClick={() => setView("pair")}
          className={`ht-ribbon ht-display px-5 pt-2 pb-4 text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${
            view === "pair"
              ? "bg-gradient-to-b from-indigo-500/80 to-purple-600/80 text-white"
              : "bg-purple-900/40 text-indigo-300 hover:bg-purple-800/50"
          }`}
        >
          📖 Kindle
        </button>
        <button
          onClick={() => setAddOpen(true)}
          className="ht-display ml-2 px-5 py-2 rounded-sm border border-pink-300/40 bg-gradient-to-b from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-white text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          + Inscribe
        </button>
      </nav>

      {/* library controls — only in the library view */}
      {view === "library" && (
        <ControlsBar
          layout={layout}
          onLayout={changeLayout}
          sortKey={sortKey}
          onSort={changeSort}
          query={query}
          onQuery={setQuery}
        />
      )}

      {/* library grid / oracle */}
      <main className="max-w-5xl mx-auto px-5 pb-16">
        {view === "oracle" ? (
          <OracleSection books={books} onAddToWishlist={addBook} />
        ) : view === "pair" ? (
          <PairSection books={books} onImport={importBooks} />
        ) : dataLoading ? (
          <div className="text-center py-20 text-purple-300/60">
            <p className="ht-display text-xl">The archive stirs…</p>
          </div>
        ) : layout === "spines" ? (
          <SpineShelf
            books={sorted}
            onOpen={setActiveId}
            query={query}
            onPersist={persistSpineColor}
          />
        ) : gridBooks.length === 0 ? (
          <div className="text-center py-20 text-purple-300/60">
            <p className="ht-display text-xl">This shelf lies bare.</p>
            <p className="mt-2 text-[15px] italic">
              {query.trim()
                ? "No tome answers to that name. Loose the search to see the shelf."
                : "Inscribe a tome to begin the collection."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {gridBooks.map((b) => {
              // UnionBooks (archive entries) have `owners`; personal books have `id`.
              const isUnion = !!b.owners;
              const openId = isUnion ? b.key : b.id;
              return (
                <button
                  key={b.id || b.key}
                  onClick={() => setActiveId(openId)}
                  className="ht-card rounded-md p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                >
                  <div className="aspect-[2/3] rounded-sm overflow-hidden bg-purple-950/60 flex items-center justify-center">
                    <CoverImage
                      src={b.coverUrl}
                      alt={`Cover of ${b.title}`}
                      className="w-full h-full object-cover"
                      fallback={<span className="ht-display text-purple-400/60 text-xs px-2 text-center">{b.title}</span>}
                    />
                  </div>
                  <h3 className="mt-2 text-[15px] font-semibold leading-tight line-clamp-2">{b.title}</h3>
                  <p className="text-sm text-purple-300/70 line-clamp-1 italic">{b.author}</p>
                  <GenreChips genres={b.genres} max={2} className="mt-1" />

                  {isUnion ? (
                    /* Archive card: WhoHasIt compact + owner count badge */
                    <div className="mt-1.5">
                      <WhoHasIt owners={b.owners} meId={me} compact />
                    </div>
                  ) : (
                    /* Personal card: ratings + status badges */
                    <>
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        <Meter value={b.overall} Icon={Sword} label="Verdict" readOnly size={13} />
                        <Meter value={b.smut} Icon={Candle} label="Smoulder" readOnly size={13} />
                      </div>
                      <div className="mt-1.5 flex gap-1.5 flex-wrap">
                        <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${b.shelf === "owned" ? "bg-indigo-500/30 text-indigo-200" : "bg-pink-500/20 text-pink-200"}`}>
                          {b.shelf === "owned" ? "Owned" : "Wishlist"}
                        </span>
                        <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${b.read ? "bg-purple-500/30 text-purple-200" : "bg-purple-900/60 text-purple-400"}`}>
                          {b.read ? "Read" : "Unread"}
                        </span>
                        {b.notes.length > 0 && (
                          <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-purple-800/50 text-purple-300">
                            {b.notes.length} note{b.notes.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {(b.formats || []).includes("audio") && (
                          <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-cyan-500/20 text-cyan-200">
                            🎧 Audio
                          </span>
                        )}
                      </div>
                      <CardProgress book={b} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>

      {addOpen && (
        <AddBookModal
          onAdd={addBook}
          currentLibraryId={currentLibraryId}
          onAddMany={importBooks}
          onClose={() => { setAddOpen(false); setAddSeed(null); }}
          session={session}
          books={books}
          seed={addSeed}
        />
      )}
      {avatarOpen && (
        <AvatarPage
          avatar={avatar}
          username={profile?.username}
          books={books}
          session={session}
          onSave={(updated) => { setAvatar(updated); setAvatarOpen(false); }}
          onClose={() => setAvatarOpen(false)}
        />
      )}
      {activeBook && (
        <DetailPanel
          book={activeBook}
          onClose={() => setActiveId(null)}
          onUpdate={async (patch) => {
            // UnionBooks update via mineBookId (my personal copy); personal books
            // update directly by id. If there is no mineBookId the book is not
            // mine — the panel offers "Add to my library" instead of edits.
            const id = activeBook.mineBookId ?? activeBook.id;
            if (!id) return;
            await updateBook(id, patch);
            // formats/shelf reshape the union entry's owners[] + top-level union,
            // which the lightweight in-place mirror can't recompute — reload so the
            // archive card / WhoHasIt reflect the change immediately.
            if (currentLibraryId != null && ('formats' in patch || 'shelf' in patch)) {
              refreshArchiveUnion();
            }
          }}
          onRemove={() => { const rid = activeBook.mineBookId ?? activeBook.id; if (rid) removeBook(rid); }}
          session={session}
          archives={archives}
          me={me}
          setHidden={setHidden}
          onOpenAdd={(seed) => { setAddSeed(seed); setAddOpen(true); }}
        />
      )}

      <footer className="text-center pb-8 text-sm text-purple-400/40 italic">
        Hushthorn · your archive, your secrets
      </footer>
    </div>
  );
}

/* ── the binding: kindle pairing ───────────────────────────── */

// Parse Kindle's My Clippings.txt into books with highlight notes.
function parseClippings(text) {
  const entries = text.split(/={5,}/);
  const booksMap = new Map();
  for (const raw of entries) {
    const lines = raw.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const titleLine = lines[0].replace(/^\uFEFF/, "");
    const meta = lines[1];
    if (!meta.startsWith("-")) continue;
    const isHighlight = /your highlight/i.test(meta);
    const isNote = /your note/i.test(meta);
    if (!isHighlight && !isNote) continue; // skip bookmarks
    const content = lines.slice(2).join(" ").trim();
    if (!content) continue;
    const m = titleLine.match(/^(.*)\(([^()]*)\)\s*$/);
    const title = (m ? m[1] : titleLine).trim();
    const author = m ? m[2].trim() : "Unknown author";
    const pageM = meta.match(/page (\d+)/i);
    const locM = meta.match(/location (\d+)/i);
    const page = pageM ? pageM[1] : locM ? `loc ${locM[1]}` : "";
    const key = title.toLowerCase();
    if (!booksMap.has(key)) booksMap.set(key, { title, author, read: true, shelf: "owned", overall: 0, notes: [] });
    booksMap.get(key).notes.push({ page, isQuote: isHighlight, text: content });
  }
  return [...booksMap.values()];
}

// Parse a Goodreads library export CSV into book entries.
function parseGoodreads(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const out = [];
  for (const row of data) {
    const title = (row["Title"] || "").replace(/\s*\(.*?\)\s*$/, "").trim(); // drop series suffix
    if (!title) continue;
    const grShelf = (row["Exclusive Shelf"] || "").toLowerCase();
    out.push({
      title,
      author: (row["Author"] || "").trim() || "Unknown author",
      read: grShelf === "read",
      shelf: grShelf === "to-read" ? "wishlist" : "owned",
      overall: Math.max(0, Math.min(5, parseInt(row["My Rating"], 10) || 0)),
      notes: [],
    });
  }
  return out;
}

function PairSection({ books, onImport }) {
  const [preview, setPreview] = useState(null); // { source, items: [{...book, include, existing}] }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clipRef = useRef(null);
  const csvRef = useRef(null);

  const existingTitles = new Set(books.map((b) => b.title.toLowerCase()));

  const readFile = (file, parser, source) => {
    setError("");
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const items = parser(reader.result);
        if (items.length === 0) {
          setError(`No books could be read from that file. Make sure it's a Kindle ${source === "clippings" ? "My Clippings.txt" : "Goodreads export CSV"}.`);
          return;
        }
        setPreview({
          source,
          items: items.map((it) => ({ ...it, include: true, existing: existingTitles.has(it.title.toLowerCase()) })),
        });
      } catch {
        setError("That file couldn't be parsed. Check that it's the original, unedited export.");
      }
    };
    reader.onerror = () => setError("The file couldn't be read. Try again.");
    reader.readAsText(file);
  };

  const toggleItem = (idx) =>
    setPreview((p) => ({ ...p, items: p.items.map((it, i) => (i === idx ? { ...it, include: !it.include } : it)) }));

  const doImport = async () => {
    if (!preview) return;
    const chosen = preview.items.filter((it) => it.include);
    if (chosen.length === 0) return;
    setBusy(true);
    // Best-effort covers + genres for the first dozen new books.
    const enriched = await Promise.all(
      chosen.map(async (it, i) => {
        if (it.existing || i >= 12) return it;
        try {
          const q = await fetch(
            `https://openlibrary.org/search.json?title=${encodeURIComponent(it.title)}&author=${encodeURIComponent(it.author)}&limit=1&fields=cover_i,subject`
          );
          const d = await q.json();
          const doc = d.docs?.[0];
          return {
            ...it,
            coverUrl: doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "",
            genres: cleanGenres(doc?.subject),
          };
        } catch {
          return it;
        }
      })
    );
    onImport(enriched);
    const noteCount = enriched.reduce((n, it) => n + (it.notes?.length || 0), 0);
    setMessage(
      `Bound ${enriched.length} book${enriched.length > 1 ? "s" : ""} to the archive${noteCount ? ` with ${noteCount} highlight${noteCount > 1 ? "s" : ""} as marginalia` : ""}.`
    );
    setPreview(null);
    setBusy(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="ht-display text-2xl text-indigo-200">The Binding</h2>
        <p className="mt-2 text-[15px] text-purple-300/75 italic">
          Pair Hushthorn with your Kindle. Bring over what you've read, and let your highlights take their place in the marginalia.
        </p>
      </div>

      {!preview && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="ht-card rounded-md p-4">
            <h3 className="ht-display text-sm uppercase text-pink-200 font-semibold">Highlights & notes</h3>
            <p className="mt-2 text-sm text-purple-300/80">
              Connect your Kindle by USB and find <span className="text-purple-100">My Clippings.txt</span> in its documents folder. Your highlights become quotes with their page or location.
            </p>
            <button
              onClick={() => clipRef.current?.click()}
              className="ht-display mt-3 w-full py-2 rounded-sm bg-pink-500/70 hover:bg-pink-500 text-white text-xs font-semibold uppercase"
            >
              Upload My Clippings.txt
            </button>
            <input ref={clipRef} type="file" accept=".txt,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, parseClippings, "clippings"); e.target.value = ""; }} />
          </div>

          <div className="ht-card rounded-md p-4">
            <h3 className="ht-display text-sm uppercase text-indigo-200 font-semibold">Library & read status</h3>
            <p className="mt-2 text-sm text-purple-300/80">
              On Goodreads: My Books → Import/Export → <span className="text-purple-100">Export Library</span>. Read books are marked Read, your to-read shelf becomes the Wishlist, and star ratings carry over.
            </p>
            <button
              onClick={() => csvRef.current?.click()}
              className="ht-display mt-3 w-full py-2 rounded-sm bg-indigo-500/70 hover:bg-indigo-500 text-white text-xs font-semibold uppercase"
            >
              Upload Goodreads CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, parseGoodreads, "goodreads"); e.target.value = ""; }} />
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-center text-[15px] text-pink-300">{error}</p>}
      {message && <p className="mt-4 text-center text-[15px] text-indigo-200 italic">{message} ❦</p>}

      {preview && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <p className="text-[15px] text-purple-200">
              Found <span className="font-semibold">{preview.items.length}</span> book{preview.items.length > 1 ? "s" : ""} — choose what to bind:
            </p>
            <button onClick={() => setPreview(null)} className="text-sm text-purple-400/70 hover:text-pink-300 underline underline-offset-2 italic">
              cancel
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {preview.items.map((it, idx) => (
              <label key={idx} className="ht-card rounded-md p-3 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={it.include} onChange={() => toggleItem(idx)} className="accent-pink-500 mt-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold leading-tight">{it.title}</p>
                  <p className="text-sm text-purple-300/70 italic">{it.author}</p>
                  <div className="mt-1 flex gap-1.5 flex-wrap">
                    <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${it.read ? "bg-purple-500/30 text-purple-200" : "bg-purple-900/60 text-purple-400"}`}>
                      {it.read ? "Read" : "Unread"}
                    </span>
                    <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${it.shelf === "owned" ? "bg-indigo-500/30 text-indigo-200" : "bg-pink-500/20 text-pink-200"}`}>
                      {it.shelf === "owned" ? "Owned" : "Wishlist"}
                    </span>
                    {it.notes?.length > 0 && (
                      <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-pink-500/20 text-pink-200">
                        {it.notes.length} highlight{it.notes.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {it.overall > 0 && (
                      <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-indigo-500/25 text-indigo-200">
                        {it.overall} sword{it.overall > 1 ? "s" : ""}
                      </span>
                    )}
                    {it.existing && (
                      <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm border border-purple-500/40 text-purple-300">
                        already in archive — will update
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={doImport}
            disabled={busy || preview.items.every((it) => !it.include)}
            className="ht-display mt-4 w-full py-2.5 rounded-sm bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-xs font-semibold uppercase"
          >
            {busy ? "Binding… fetching covers…" : `Bind ${preview.items.filter((it) => it.include).length} to the archive`}
          </button>
        </div>
      )}

      {!preview && (
        <p className="mt-6 text-center text-sm text-purple-400/60 italic">
          In the mobile app, this becomes a share-sheet import — and a desktop helper could watch for your Kindle on USB. Live sync with Amazon's cloud isn't possible; the archives must be carried by hand.
        </p>
      )}
    </div>
  );
}

/* ── the oracle: AI recommendations ────────────────────────── */

function OracleSection({ books, onAddToWishlist }) {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState({});
  const [consulted, setConsulted] = useState(false);

  const ownedTitles = new Set(books.map((b) => b.title.toLowerCase()));

  const consult = async () => {
    setLoading(true);
    setError("");
    setRecs([]);
    setAdded({});
    try {
      const library = books.map((b) => ({
        title: b.title,
        author: b.author,
        genres: b.genres || [],
        shelf: b.shelf,
        read: b.read,
        verdict: b.overall || null,
        spicy: b.smut || null,
      }));

      const prompt = `You are the recommendation oracle for Hushthorn, a gothic book-cataloging app focused on romantasy and spicy reads.

Here is the user's current library as JSON. "shelf" is owned or wishlist, "verdict" is their 1-5 overall rating, "spicy" is their 1-5 spice rating (null means unrated):
${JSON.stringify(library)}

Infer the genres, vibes, and spice preferences from this library, weighting highly-rated and wishlisted books most. Recommend exactly 5 real, published books that are NOT already in the library.

Respond with ONLY a valid JSON array and nothing else — no preamble, no markdown fences. Each element must have exactly these keys:
"title" (string), "author" (string), "genre" (short string, e.g. "Vampire romantasy"), "reason" (one sentence explaining why it fits THIS library — reference their taste specifically), "spice" (integer 1-5, your estimate of its spice level).`;

      const data = await callClaude({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
      });
      const text = (data.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      const clean = text.replace(/```json|```/g, "").trim();
      const start = clean.indexOf("[");
      const end = clean.lastIndexOf("]");
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");

      // fetch covers from Open Library, best-effort per book
      const withCovers = await Promise.all(
        parsed.map(async (r) => {
          try {
            const q = await fetch(
              `https://openlibrary.org/search.json?title=${encodeURIComponent(r.title)}&author=${encodeURIComponent(r.author)}&limit=1&fields=cover_i`
            );
            const d = await q.json();
            const cover_i = d.docs?.[0]?.cover_i;
            return { ...r, coverUrl: cover_i ? `https://covers.openlibrary.org/b/id/${cover_i}-M.jpg` : "" };
          } catch {
            return { ...r, coverUrl: "" };
          }
        })
      );
      setRecs(withCovers);
      setConsulted(true);
    } catch {
      setError("The Oracle's vision clouded over. Try consulting again.");
    } finally {
      setLoading(false);
    }
  };

  const addRec = (rec, idx) => {
    onAddToWishlist({
      title: rec.title,
      author: rec.author,
      year: null,
      coverUrl: rec.coverUrl || "",
      genres: rec.genre ? [rec.genre] : [],
      shelf: "wishlist",
      read: false,
      overall: 0,
      smut: 0,
      notes: [],
    });
    setAdded((a) => ({ ...a, [idx]: true }));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="ht-display text-2xl text-indigo-200">The Oracle</h2>
        <p className="mt-2 text-[15px] text-purple-300/75 italic">
          The Oracle reads your shelves — what you own, what you covet, what you rated worthy of swords and candles — and divines what you should read next.
        </p>
        <button
          onClick={consult}
          disabled={loading || books.length === 0}
          className="ht-display mt-4 px-6 py-2.5 rounded-sm border border-indigo-400/50 bg-indigo-500/80 hover:bg-indigo-400/90 disabled:opacity-40 text-white text-xs font-semibold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          {loading ? "Divining…" : consulted ? "Consult the Oracle again" : "Consult the Oracle"}
        </button>
        {books.length === 0 && (
          <p className="mt-3 text-sm text-purple-400/60 italic">The Oracle needs at least one book on your shelves to read your taste.</p>
        )}
      </div>

      {loading && (
        <p className="text-center text-[15px] text-purple-300/70 italic">Reading the leaves of your library…</p>
      )}
      {error && <p className="text-center text-[15px] text-pink-300">{error}</p>}

      <div className="space-y-3">
        {recs.map((r, idx) => {
          const alreadyHave = ownedTitles.has(r.title.toLowerCase());
          return (
            <div key={idx} className="ht-card rounded-md p-3.5 flex gap-3.5">
              <div className="w-16 h-24 rounded-sm overflow-hidden bg-purple-950/60 flex-shrink-0 flex items-center justify-center">
                <CoverImage
                  src={r.coverUrl}
                  alt={`Cover of ${r.title}`}
                  className="w-full h-full object-cover"
                  fallback={<span className="text-purple-500 text-xl">♛</span>}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold leading-tight">{r.title}</h3>
                    <p className="text-sm text-purple-300/70 italic">{r.author}</p>
                  </div>
                  <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-indigo-500/25 text-indigo-200 whitespace-nowrap">
                    {r.genre}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-purple-200/90">{r.reason}</p>
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="ht-display text-[9px] uppercase text-pink-300/80">Smoulder</span>
                    <Meter value={Math.max(0, Math.min(5, r.spice || 0))} Icon={Candle} label="Predicted smoulder" readOnly size={13} />
                  </div>
                  <button
                    onClick={() => addRec(r, idx)}
                    disabled={added[idx] || alreadyHave}
                    className="ht-display text-[10px] uppercase px-3 py-1 rounded-sm bg-pink-500/40 hover:bg-pink-500/70 disabled:opacity-50 disabled:hover:bg-pink-500/40 text-pink-100"
                  >
                    {alreadyHave ? "In your archive" : added[idx] ? "Added ✓" : "+ Wishlist"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {consulted && recs.length > 0 && (
        <p className="mt-5 text-center text-sm text-purple-400/60 italic">
          The Oracle estimates each Smoulder rating — your own judgment, as always, is final.
        </p>
      )}
    </div>
  );
}

/* ── avatar chip + page ────────────────────────────────────── */

function AvatarChip({ avatar, ownedCount, readCount, onClick }) {
  const emoji = AVATAR_EMOJI[avatar.gender] || '🧝';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-purple-900/50 hover:bg-purple-800/60 border border-purple-600/40 hover:border-pink-400/50 rounded-full px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
    >
      <span className="text-xl leading-none">{emoji}</span>
      <div className="text-left">
        <div className="ht-display text-[10px] text-pink-200 leading-tight">{avatar.name}</div>
        <div className="ht-display text-[9px] text-purple-300/80">{ownedCount} owned · {readCount} read</div>
      </div>
    </button>
  );
}

const HAIR_STYLES = {
  female:   'M28 40 Q28 24 44 23 Q60 24 60 40 Q57 28 44 27 Q31 28 28 40Z M28 40 Q24 55 27 65 Q26 50 28 40Z M60 40 Q64 55 61 65 Q62 50 60 40Z',
  male:     'M29 42 Q28 26 44 24 Q60 26 59 42 Q57 30 44 28 Q31 30 29 42Z',
  nonbinary:'M28 40 Q28 24 44 23 Q60 24 60 40 Q57 28 44 27 Q31 28 28 40Z M60 40 Q64 48 61 56 Q62 44 60 40Z',
};
const LASH_STYLES = {
  female:   'M35 43.5 L33.5 41.5 M37.5 43 L37 41 M40 43.2 L40.5 41.2 M47 43.5 L45.5 41.5 M49.5 43 L49 41 M52 43.2 L52.5 41.2',
  male:     '',
  nonbinary:'M37.5 43 L37 41.2 M40 43.2 L40.5 41.4 M49.5 43 L49 41.2 M52 43.2 L52.5 41.4',
};
const HAIR_SWATCHES = ['#1e1b4b','#7c2d12','#c4b5fd','#d1d5db','#fbbf24','#831843'];
const SKIN_SWATCHES = ['#fde68a','#c4956a','#a0522d','#7c4c2a','#4a2c17','#d4a5a5'];
const ROBE_SWATCHES = ['#5b21b6','#831843','#1e3a5f','#064e3b','#1c1c1c','#9333ea'];
const AVATAR_EMOJI  = { female: '🧝‍♀️', male: '🧝‍♂️', nonbinary: '🧝' };

/* ── shared library: identity + membership (Phase 1) ───────── */

// Handle rules: 3–20 chars, letters/numbers/_/- . Matches the DB unique index
// on lower(username); the index + insert are the real guard, this is for UX.
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
function sanitizeUsernameSeed(s) {
  return (s || '').normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
}

// One-time gate: claim a username. Shown to any signed-in user without a profile
// row (new sign-ups AND existing accounts on first login after this shipped).
function UsernameGate({ session, suggested, onClaimed }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('idle'); // idle|invalid|checking|available|taken
  const [claiming, setClaiming] = useState(false);
  const [err, setErr] = useState('');

  // Pre-fill from the old avatar name only if it sanitises to a valid, free handle.
  useEffect(() => {
    const seed = sanitizeUsernameSeed(suggested);
    if (!USERNAME_RE.test(seed)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('username_available', { p_username: seed });
      if (!cancelled && data === true) setValue(seed);
    })();
    return () => { cancelled = true; };
  }, [suggested]);

  // Live availability check (debounced).
  useEffect(() => {
    const u = value.trim();
    if (!u) { setStatus('idle'); return; }
    if (!USERNAME_RE.test(u)) { setStatus('invalid'); return; }
    setStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: u });
      if (cancelled) return;
      if (error) { setStatus('idle'); return; }
      setStatus(data ? 'available' : 'taken');
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  const claim = async () => {
    const u = value.trim();
    if (status !== 'available') return;
    setClaiming(true); setErr('');
    const { error } = await supabase.from('profiles').insert({ user_id: session.user.id, username: u });
    if (error) {
      setClaiming(false);
      if (error.code === '23505') { setStatus('taken'); setErr('That handle was just taken — try another.'); }
      else setErr('Could not save your handle. Please try again.');
      return;
    }
    onClaimed(u);
  };

  const hint = {
    invalid:   '3–20 characters · letters, numbers, _ or -',
    checking:  'Searching the rolls…',
    available: '✓ available',
    taken:     '✗ already claimed',
    idle:      ' ',
  }[status];
  const hintColor = status === 'available' ? 'text-fuchsia-300'
    : (status === 'taken' || status === 'invalid') ? 'text-pink-400'
    : 'text-purple-400/70';

  return (
    <div className="ht-bg ht-body fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <div className="ht-card rounded-xl p-8 w-full max-w-sm text-center" style={{ transform: 'none' }}>
        <Crown size={48} />
        <h1 className="ht-display text-xl text-pink-200 mt-2 mb-1">Choose your handle</h1>
        <p className="text-[13px] italic mb-5 text-purple-300/75">
          This is how fellow readers know you in a shared archive. Pick something you'll keep.
        </p>

        <div className="text-left">
          <label htmlFor="handle" className="block ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1.5">Username</label>
          <div className="flex items-center bg-purple-950/60 border border-purple-700/50 rounded-sm focus-within:border-pink-400 px-3">
            <span className="text-purple-400/70 text-[15px]">@</span>
            <input id="handle" value={value} autoFocus
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && claim()}
              placeholder="ravenquill"
              className="flex-1 min-w-0 bg-transparent px-1.5 py-2.5 text-[15px] placeholder-purple-400/50 focus:outline-none text-purple-100" />
          </div>
          <p className={`text-[11px] mt-1.5 ${hintColor}`}>{hint}</p>
          {err && <p className="text-sm text-pink-300 mt-1">{err}</p>}
        </div>

        <button onClick={claim} disabled={status !== 'available' || claiming}
          className="ht-display w-full mt-4 py-3 rounded-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-semibold uppercase tracking-widest">
          {claiming ? 'Inscribing…' : '✦ Claim handle ✦'}
        </button>
        <button onClick={() => supabase.auth.signOut()}
          className="mt-3 text-[11px] text-purple-400/60 hover:text-purple-300 italic">
          sign out
        </button>
      </div>
    </div>
  );
}

// Small gothic avatar for rosters — a cropped version of the AvatarPage figure.
function MiniAvatar({ av, size = 34 }) {
  const g    = av?.gender    || 'nonbinary';
  const skin = av?.skin_tone || '#c4956a';
  const hair = av?.hair_color || '#1e1b4b';
  const robe = av?.robe_color || '#5b21b6';
  return (
    <div className="rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-800/70 to-pink-900/40"
      style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="22 22 44 50" fill="none">
        <path d="M26 72 Q44 66 62 72 L64 88 H24 Z" fill={robe} opacity=".7" />
        <rect x="40" y="53" width="8" height="8" rx="2" fill={skin} />
        <ellipse cx="44" cy="46" rx="16" ry="17" fill={skin} />
        <path d={HAIR_STYLES[g]} fill={hair} />
        <ellipse cx="38" cy="46" rx="2.4" ry="3" fill="white" />
        <ellipse cx="50" cy="46" rx="2.4" ry="3" fill="white" />
        <ellipse cx="38.5" cy="46.5" rx="1.5" ry="1.7" fill="#4c1d95" />
        <ellipse cx="50.5" cy="46.5" rx="1.5" ry="1.7" fill="#4c1d95" />
      </svg>
    </div>
  );
}

// The Shared Archives panel on the profile. Lists the user's shared libraries,
// and lets them bind a new one or join with a code. Each library expands into
// a roster + invite/owner controls (LibraryDetail).
function SharedArchives({ session }) {
  const me = session.user.id;
  const [libs, setLibs] = useState(null);   // null = loading
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [joinErr, setJoinErr] = useState('');

  const load = async () => {
    const { data, error } = await supabase
      .from('libraries')
      .select('id, name, created_by, library_members(user_id, role)')
      .order('created_at', { ascending: true });
    if (error) { setErr('Could not open your shared archives.'); setLibs([]); return; }
    setErr('');
    setLibs(data || []);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('create_library', { p_name: n });
    setBusy(false);
    if (error) { setErr('Could not bind the archive. Please try again.'); return; }
    setName('');
    await load();
    setOpenId(data);
  };

  const join = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true); setJoinErr('');
    const { data, error } = await supabase.rpc('accept_library_invite', { p_code: c });
    setBusy(false);
    if (error) { setJoinErr('That invite is invalid or expired.'); return; }
    setCode('');
    await load();
    setOpenId(data);
  };

  return (
    <>
      <h3 className="ht-display text-xs uppercase tracking-widest text-purple-300/70 mb-2">Shared Archives</h3>
      <div className="ht-card rounded-md p-3 mb-5 space-y-3">
        <p className="text-[12px] text-purple-300/70 italic">
          A shelf you keep with others — each tome tagged with whose copy is whose.
          Your ratings, progress, and marginalia stay yours alone.
        </p>

        {/* library list */}
        {libs === null ? (
          <p className="text-[12px] text-purple-400/60 italic">Opening…</p>
        ) : libs.length === 0 ? (
          <p className="text-[12px] text-purple-400/60 italic">No shared archives yet. Bind one below, or join with a code.</p>
        ) : (
          <div className="space-y-1.5">
            {libs.map(lib => {
              const members = lib.library_members || [];
              const myRole = members.find(m => m.user_id === me)?.role;
              const isOpen = openId === lib.id;
              return (
                <div key={lib.id} className="rounded-sm border border-purple-700/40 overflow-hidden">
                  <button onClick={() => setOpenId(isOpen ? null : lib.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-900/30">
                    <span className="flex-1 min-w-0">
                      <span className="text-[14px] text-pink-100 truncate block">{lib.name}</span>
                      <span className="text-[11px] text-purple-400/70 italic">
                        {members.length} member{members.length === 1 ? '' : 's'}
                        {myRole === 'owner' ? ' · you keep it' : ''}
                      </span>
                    </span>
                    <span className="text-purple-400 text-xs">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && <LibraryDetail lib={lib} me={me} onChanged={() => { setOpenId(null); load(); }} />}
                </div>
              );
            })}
          </div>
        )}
        {err && <p className="text-[12px] text-pink-300">{err}</p>}

        {/* create + join */}
        <div className="ht-rule my-1" aria-hidden="true" />
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            placeholder="Name a new shared archive…"
            className="flex-1 min-w-0 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400" />
          <button onClick={create} disabled={busy || !name.trim()}
            className="ht-display text-[10px] uppercase px-3 py-1.5 rounded-sm bg-purple-800/60 hover:bg-purple-700 disabled:opacity-40 text-purple-100 flex-shrink-0 whitespace-nowrap">
            Bind
          </button>
        </div>
        <div className="flex gap-2">
          <input value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && join()}
            placeholder="Have a code? Join an archive…"
            className="flex-1 min-w-0 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400" />
          <button onClick={join} disabled={busy || !code.trim()}
            className="ht-display text-[10px] uppercase px-3 py-1.5 rounded-sm bg-purple-800/60 hover:bg-purple-700 disabled:opacity-40 text-purple-100 flex-shrink-0 whitespace-nowrap">
            Join
          </button>
        </div>
        {joinErr && <p className="text-[12px] text-pink-300">{joinErr}</p>}
      </div>
    </>
  );
}

// One expanded library: roster (avatars + handles + roles), an invite-code
// generator (any member), and owner-only rename/remove/delete + member Leave.
function LibraryDetail({ lib, me, onChanged }) {
  const members = lib.library_members || [];
  const isOwner = members.find(m => m.user_id === me)?.role === 'owner';
  const [roster, setRoster] = useState(null);
  const [invite, setInvite] = useState(null); // { code, expires_at }
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Per-archive reveal opt-in (Phase 2). null = not yet loaded; reflects MY
  // library_members.share_reading for this archive.
  const [shareReading, setShareReading] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);

  const loadRoster = async () => {
    const { data: mem, error } = await supabase
      .from('library_members').select('user_id, role, share_reading').eq('library_id', lib.id);
    if (error) { setErr('Could not load the roster.'); return; }
    const ids = (mem || []).map(m => m.user_id);
    const [{ data: profs }, { data: avs }] = await Promise.all([
      supabase.from('profiles').select('user_id, username').in('user_id', ids),
      supabase.from('avatars').select('user_id, gender, hair_color, skin_tone, robe_color').in('user_id', ids),
    ]);
    const pBy = Object.fromEntries((profs || []).map(p => [p.user_id, p]));
    const aBy = Object.fromEntries((avs || []).map(a => [a.user_id, a]));
    setRoster((mem || []).map(m => ({
      ...m, username: pBy[m.user_id]?.username, av: aBy[m.user_id],
    })));
    setShareReading(!!(mem || []).find(m => m.user_id === me)?.share_reading);
  };
  useEffect(() => { loadRoster(); }, [lib.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flip MY per-archive reveal opt-in. Optimistic; reverts on error with a
  // clear message. Only ever writes my own row (user_id = me).
  const setArchiveShareReading = async (on) => {
    if (shareBusy) return;
    setShareBusy(true); setErr('');
    setShareReading(on);
    const { error } = await supabase.from('library_members')
      .update({ share_reading: on }).eq('library_id', lib.id).eq('user_id', me);
    setShareBusy(false);
    if (error) {
      setShareReading(!on); // revert
      setErr('Could not change your sharing. Please try again.');
    }
  };

  const makeInvite = async () => {
    setBusy(true); setErr(''); setCopied(false);
    const { data, error } = await supabase.from('library_invites')
      .insert({ library_id: lib.id, created_by: me })
      .select('code, expires_at').single();
    setBusy(false);
    if (error) { setErr('Could not create an invite.'); return; }
    setInvite(data);
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(invite.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard blocked — the code is shown for manual copy */ }
  };

  const removeMember = async (uid) => {
    if (!window.confirm('Remove this member from the archive?')) return;
    const { error } = await supabase.from('library_members')
      .delete().eq('library_id', lib.id).eq('user_id', uid);
    if (error) { setErr('Could not remove that member.'); return; }
    loadRoster();
  };

  const leave = async () => {
    if (!window.confirm('Leave this shared archive?')) return;
    const { error } = await supabase.from('library_members')
      .delete().eq('library_id', lib.id).eq('user_id', me);
    if (error) { setErr('Could not leave.'); return; }
    onChanged();
  };

  const rename = async () => {
    const next = window.prompt('Rename this archive', lib.name);
    if (next == null || !next.trim()) return;
    const { error } = await supabase.from('libraries').update({ name: next.trim() }).eq('id', lib.id);
    if (error) { setErr('Could not rename.'); return; }
    onChanged();
  };

  const destroy = async () => {
    if (!window.confirm('Delete this shared archive for everyone? This cannot be undone.')) return;
    const { error } = await supabase.from('libraries').delete().eq('id', lib.id);
    if (error) { setErr('Could not delete the archive.'); return; }
    onChanged();
  };

  return (
    <div className="px-3 pb-3 pt-1 bg-purple-950/30 border-t border-purple-700/30 space-y-2.5">
      {/* roster */}
      {roster === null ? (
        <p className="text-[12px] text-purple-400/60 italic pt-1">Gathering the keepers…</p>
      ) : (
        <div className="space-y-1.5 pt-1">
          {roster.map(m => (
            <div key={m.user_id} className="flex items-center gap-2">
              <MiniAvatar av={m.av} />
              <span className="flex-1 min-w-0 truncate text-[13px] text-purple-100">
                @{m.username || 'reader'}{m.user_id === me ? ' (you)' : ''}
              </span>
              <span className={`ht-display text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
                m.role === 'owner' ? 'bg-pink-500/20 text-pink-200' : 'bg-purple-800/50 text-purple-300'
              }`}>{m.role}</span>
              {isOwner && m.user_id !== me && (
                <button onClick={() => removeMember(m.user_id)}
                  className="text-purple-400/60 hover:text-pink-300 text-sm px-1" aria-label="Remove member">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* per-archive reveal opt-in — share MY ratings & progress (never notes) */}
      <div className="rounded-sm border border-purple-700/40 bg-purple-950/40 p-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={!!shareReading}
          disabled={shareReading === null || shareBusy}
          onClick={() => setArchiveShareReading(!shareReading)}
          className="flex items-center gap-2.5 w-full text-left disabled:opacity-50"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-sm border transition-colors ${
              shareReading ? 'bg-pink-600/70 border-pink-400/70' : 'bg-purple-900/70 border-purple-700/60'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-sm bg-purple-50 transition-transform ${shareReading ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
          <span className="ht-display text-[10px] uppercase tracking-wide text-purple-100">
            Share my ratings &amp; progress in this archive
          </span>
        </button>
        <p className="text-[11px] text-purple-400/60 italic mt-1 leading-snug">
          {shareReading
            ? 'Fellow keepers can see your Verdict, Smoulder, and progress here. Your marginalia stays sealed.'
            : 'Your marks stay hidden from co-keepers. Turn this on to let them read your Verdict, Smoulder, and progress — never your notes.'}
        </p>
      </div>

      {/* invite */}
      {invite ? (
        <div className="rounded-sm border border-pink-400/30 bg-purple-950/50 p-2.5">
          <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1">Invite code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-pink-200 text-lg tracking-widest">{invite.code}</code>
            <button onClick={copyCode}
              className="ht-display text-[9px] uppercase px-2 py-1 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-purple-400/60 italic mt-1">
            Share it with a fellow reader · expires {new Date(invite.expires_at).toLocaleDateString()}
          </p>
        </div>
      ) : (
        <button onClick={makeInvite} disabled={busy}
          className="ht-display text-[10px] uppercase px-3 py-1.5 rounded-sm border border-purple-700/50 hover:border-pink-400/60 text-purple-200 disabled:opacity-40">
          ✦ Invite a fellow reader
        </button>
      )}

      {/* owner / member actions */}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {isOwner ? (
          <>
            <button onClick={rename}
              className="ht-display text-[9px] uppercase px-2.5 py-1 rounded-sm text-purple-300 hover:text-pink-200">Rename</button>
            <button onClick={destroy}
              className="ht-display text-[9px] uppercase px-2.5 py-1 rounded-sm text-pink-400/80 hover:text-pink-300">Delete archive</button>
          </>
        ) : (
          <button onClick={leave}
            className="ht-display text-[9px] uppercase px-2.5 py-1 rounded-sm text-pink-400/80 hover:text-pink-300">Leave archive</button>
        )}
      </div>
      {err && <p className="text-[12px] text-pink-300">{err}</p>}
    </div>
  );
}

function AvatarPage({ avatar, username, books, session, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...avatar });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const owned       = books.filter(b => b.shelf === 'owned');
  const readCount   = books.filter(b => b.read).length;
  const wishlistCount = books.filter(b => b.shelf === 'wishlist').length;
  const ratedBooks  = books.filter(b => b.overall > 0);
  const avgRating   = ratedBooks.length
    ? Math.round(ratedBooks.reduce((s, b) => s + b.overall, 0) / ratedBooks.length)
    : 0;

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('avatars').upsert({
        user_id:    session.user.id,
        name:       draft.name,
        gender:     draft.gender,
        hair_color: draft.hair_color,
        skin_tone:  draft.skin_tone,
        robe_color: draft.robe_color,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error('avatar upsert:', error.message);
        setSaveError("The scribe's quill faltered. Please try again.");
      } else {
        onSave({ name: draft.name, gender: draft.gender, hair_color: draft.hair_color, skin_tone: draft.skin_tone, robe_color: draft.robe_color });
      }
    } finally {
      setSaving(false);
    }
  };

  const SwatchRow = ({ label, field, options }) => (
    <div className="flex items-center gap-3">
      <span className="ht-display text-[9px] uppercase tracking-widest text-purple-400 w-12 shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(color => (
          <button key={color} onClick={() => setDraft(d => ({ ...d, [field]: color }))}
            aria-label={`${label}: ${color}`}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none ${
              draft[field] === color ? 'ring-2 ring-pink-400 ring-offset-1 ring-offset-purple-950 scale-110' : ''
            }`}
            style={{ background: color }} />
        ))}
      </div>
    </div>
  );

  const genders = [
    { key: 'female',    icon: '♀', label: 'Female' },
    { key: 'male',      icon: '♂', label: 'Male' },
    { key: 'nonbinary', icon: '⚧', label: 'Non-binary' },
  ];

  const spineColors = ['#7c3aed','#db2777','#6d28d9','#be185d','#4c1d95','#9333ea'];

  return (
    <Overlay onClose={onClose} label="Avatar profile">
      <div className="flex items-center justify-between mb-4">
        <h2 className="ht-display text-xl text-pink-200">Your Avatar</h2>
        <button onClick={onClose} className="text-purple-300 hover:text-pink-300 text-xl px-2" aria-label="Close">✕</button>
      </div>

      {/* avatar SVG preview */}
      <div className="flex flex-col items-center mb-5">
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-purple-800/80 to-pink-900/50 border-2 border-pink-400/40 shadow-[0_0_30px_rgba(217,70,239,0.2)] flex items-center justify-center mb-3 overflow-hidden">
          <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
            <ellipse cx="44" cy="78" rx="22" ry="14" fill={draft.robe_color} opacity=".9"/>
            <path d="M26 72 Q44 66 62 72 L64 88 H24 Z" fill={draft.robe_color} opacity=".7"/>
            <rect x="30" y="63" width="18" height="13" rx="1.5" fill="#db2777" opacity=".9"/>
            <line x1="39" y1="63" x2="39" y2="76" stroke="#f9a8d4" strokeWidth="1"/>
            <rect x="40" y="53" width="8" height="8" rx="2" fill={draft.skin_tone}/>
            <ellipse cx="44" cy="46" rx="16" ry="17" fill={draft.skin_tone}/>
            <path d={HAIR_STYLES[draft.gender]} fill={draft.hair_color}/>
            <ellipse cx="38" cy="46" rx="3" ry="3.5" fill="white"/>
            <ellipse cx="50" cy="46" rx="3" ry="3.5" fill="white"/>
            <ellipse cx="38.5" cy="46.5" rx="2" ry="2.2" fill="#4c1d95"/>
            <ellipse cx="50.5" cy="46.5" rx="2" ry="2.2" fill="#4c1d95"/>
            <circle cx="39" cy="46" r=".7" fill="white" opacity=".7"/>
            <circle cx="51" cy="46" r=".7" fill="white" opacity=".7"/>
            {LASH_STYLES[draft.gender] && (
              <path d={LASH_STYLES[draft.gender]} stroke="#1e1b4b" strokeWidth="1" strokeLinecap="round"/>
            )}
            <ellipse cx="34" cy="50" rx="3.5" ry="2" fill="#f9a8d4" opacity=".4"/>
            <ellipse cx="54" cy="50" rx="3.5" ry="2" fill="#f9a8d4" opacity=".4"/>
            <path d="M40 54 Q44 57 48 54" stroke="#be185d" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
            <path d="M34 29 L36 24 L40 27 L44 22 L48 27 L52 24 L54 29Z" fill="none" stroke="#f0a6e0" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="ht-display text-base text-pink-200">@{username || '…'}</div>
        <p className="text-[11px] text-purple-400/60 italic mt-1">your handle · how readers know you in shared archives</p>
      </div>

      {/* customiser */}
      <div className="ht-card rounded-md p-4 space-y-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="ht-display text-[9px] uppercase tracking-widest text-purple-400 w-12 shrink-0">Form</span>
          <div className="flex gap-2 flex-1">
            {genders.map(g => (
              <button key={g.key} onClick={() => setDraft(d => ({ ...d, gender: g.key }))}
                className={`flex-1 py-1.5 rounded-sm border text-center transition-colors focus:outline-none ${
                  draft.gender === g.key
                    ? 'border-pink-400/60 bg-purple-600/30 text-pink-200'
                    : 'border-purple-700/40 text-purple-400 hover:border-purple-500/60'
                }`}>
                <div className="text-sm">{g.icon}</div>
                <div className="ht-display text-[8px] uppercase tracking-wide">{g.label}</div>
              </button>
            ))}
          </div>
        </div>
        <SwatchRow label="Hair"  field="hair_color" options={HAIR_SWATCHES} />
        <SwatchRow label="Skin"  field="skin_tone"  options={SKIN_SWATCHES} />
        <SwatchRow label="Robe"  field="robe_color" options={ROBE_SWATCHES} />
        <button onClick={save} disabled={saving}
          className="ht-display w-full py-2.5 rounded-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-widest mt-2">
          {saving ? 'Inscribing…' : '✦ Save avatar ✦'}
        </button>
        {saveError && <p className="text-pink-400 text-xs text-center mt-1">{saveError}</p>}
      </div>

      {/* stats */}
      <h3 className="ht-display text-xs uppercase tracking-widest text-purple-300/70 mb-2">Reading Chronicle</h3>
      <div className="ht-card rounded-md p-3 mb-2 text-center">
        <div className="ht-display text-3xl text-pink-200">{books.length}</div>
        <div className="text-xs text-purple-400/70 italic">tome{books.length === 1 ? '' : 's'} in your archive</div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {[
          { n: owned.length,    label: 'tomes owned',    color: 'text-pink-200' },
          { n: readCount,       label: 'tomes read',     color: 'text-purple-300' },
          { n: wishlistCount,   label: 'on the wishlist',color: 'text-indigo-300' },
          { n: avgRating || 0,  label: avgRating ? `avg · ${'⚔'.repeat(avgRating)}` : 'avg verdict', color: 'text-pink-200' },
        ].map(({ n, label, color }) => (
          <div key={label} className="ht-card rounded-md p-3">
            <div className={`ht-display text-2xl ${color}`}>{n}</div>
            <div className="text-xs text-purple-400/70 italic">{label}</div>
          </div>
        ))}
      </div>

      {/* shared archives */}
      <SharedArchives session={session} />

      {/* mini shelf */}
      <h3 className="ht-display text-xs uppercase tracking-widest text-purple-300/70 mb-2">Your Shelf</h3>
      <div className="ht-card rounded-md p-3">
        <div className="flex items-end gap-0.5 h-12 bg-black/20 rounded-sm px-2 pt-1 border-b-2 border-purple-500/40 relative overflow-hidden">
          {owned.slice(0, 20).map((b, i) => (
            <div key={b.id} style={{
              height: `${28 + (i % 3) * 8}px`, width: '10px',
              background: spineColors[i % spineColors.length],
              borderRadius: '2px 2px 0 0',
            }} />
          ))}
          {Array.from({ length: Math.max(0, 8 - owned.length) }).map((_, i) => (
            <div key={i} style={{
              height: '32px', width: '10px', borderRadius: '2px 2px 0 0',
              border: '1px dashed rgba(168,85,247,0.3)',
            }} />
          ))}
          <span className="absolute right-2 bottom-0 text-xl leading-none">
            {AVATAR_EMOJI[draft.gender] || '🧝'}
          </span>
        </div>
        <p className="text-[11px] text-purple-400/60 italic text-center mt-2">
          {readCount} of {owned.length} owned books read
          {owned.length < 8 ? ` · ${8 - owned.length} empty slot${8 - owned.length !== 1 ? 's' : ''} waiting` : ''}
        </p>
      </div>
    </Overlay>
  );
}

/* ── auth page ─────────────────────────────────────────────── */

const AUTH_INPUT ="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2.5 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400 text-purple-100";
const AUTH_LBL = "block ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1.5";

function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        // Supabase obfuscates duplicate signups to block email enumeration: when
        // confirmations are ON, re-using a registered email returns no error and a
        // fake user with an EMPTY identities array (a real new user has one).
        const identities = data?.user?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
          setError('That email is already registered. Sign in instead, or use a different one.');
          return;
        }
        if (!data?.session) {
          setError('Check your inbox to confirm your email before signing in.');
          return;
        }
      }
    } catch (err) {
      // When email confirmations are OFF, a duplicate signup throws a real error
      // instead of the obfuscated path above — theme it to match.
      if (mode === 'signup' && /already\s*(registered|exists)/i.test(err.message || '')) {
        setError('That email is already registered. Sign in instead, or use a different one.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  return (
    <div className="ht-bg ht-body fixed inset-0 overflow-y-auto flex items-center justify-center p-4">
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <div className="ht-card rounded-xl p-8 w-full max-w-sm text-center" style={{ transform: 'none' }}>
        <Crown size={52} />
        <h1 className="ht-blackletter ht-glow text-5xl text-transparent bg-clip-text bg-gradient-to-b from-pink-200 via-fuchsia-300 to-fuchsia-500 mt-1 mb-1">
          Hushthorn
        </h1>
        <p className="text-[13px] italic mb-6" style={{ color: '#c084fc' }}>
          a candlelit archive for the books you shouldn't read in public
        </p>

        <div className="flex mb-6 rounded-sm overflow-hidden border border-purple-700/40">
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2 ht-display text-[10px] uppercase tracking-widest transition-colors ${
                mode === m
                  ? 'bg-gradient-to-r from-purple-600/60 to-pink-600/50 text-pink-200'
                  : 'text-purple-400 hover:text-purple-200'
              }`}>
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3 text-left">
          <div>
            <label htmlFor="auth-email" className={AUTH_LBL}>Email</label>
            <input id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="your@grimoire.com" className={AUTH_INPUT} />
          </div>
          <div>
            <label htmlFor="auth-password" className={AUTH_LBL}>Password</label>
            <input id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••••••" className={AUTH_INPUT} />
          </div>
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-confirm" className={AUTH_LBL}>Confirm password</label>
              <input id="auth-confirm" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••••••" className={AUTH_INPUT} />
            </div>
          )}

          {error && <p className="text-sm text-pink-300 text-center py-1">{error}</p>}

          <div className="ht-rule my-1" aria-hidden="true" />

          <button type="submit" disabled={loading}
            className="ht-display w-full py-3 rounded-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-widest">
            {loading
              ? 'Opening the archive…'
              : mode === 'login' ? 'Enter the Archive' : '✦ Open the Archive ✦'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <span className="ht-rule flex-1 inline-block" />
          <span className="text-purple-400/60 text-xs italic">or</span>
          <span className="ht-rule flex-1 inline-block" />
        </div>

        <button onClick={signInWithGoogle}
          className="ht-display w-full py-2.5 rounded-sm border border-purple-700/40 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}

/* ── add book modal ────────────────────────────────────────── */

// `seed` — optional prefill from a UnionBook's {title,author,coverUrl,genres}.
// When present the modal opens in scan/review mode with the fields pre-populated
// so the user only picks format and shelf before inscribing.
function AddBookModal({ onAdd, currentLibraryId = null, onAddMany, onClose, session, books = [], seed = null }) {
  // Union model: adding always targets the reader's OWN personal library via
  // `onAdd`; the book then appears in any archive automatically. The archive
  // format chooser and "in archive" copy have been removed (Task 3 cleanup).
  // Every confirmed book goes to my personal library.
  const commitAdd = (book) => {
    onAdd(book);
  };
  const [mode, setMode] = useState(() => {
    // Seed prefill: always open in scan/review so the pre-filled fields show.
    if (seed) return "scan";
    // Mobile (coarse pointer + narrow viewport) defaults to Scan; web to Search.
    if (typeof window !== "undefined" && window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches &&
        window.matchMedia("(max-width: 640px)").matches) return "scan";
    return "search";
  }); // search | scan
  const [scanView, setScanView] = useState(seed ? "review" : "capture"); // capture | review
  const [scanMultiple, setScanMultiple] = useState(false);
  const [queue, setQueue] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Prefill from seed (UnionBook "Add to my library" path). Applied once on mount;
  // also switches to the scan/review mode so the user sees the filled fields.
  const [manual, setManual] = useState(() =>
    seed
      ? { title: seed.title || "", author: seed.author || "", coverUrl: seed.coverUrl || "", genres: seed.genres || [], pageCount: null }
      : { title: "", author: "", coverUrl: "", genres: [], pageCount: null }
  );
  const [genreInput, setGenreInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [genreLoading, setGenreLoading] = useState(false);
  const fileRef = useRef(null);
  // live scan
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);      // native BarcodeDetector interval id
  const zxingStopRef = useRef(null);     // ZXing reader controls (stop fn)
  const startingRef = useRef(false);     // a startCamera() is in flight (StrictMode-safe guard)
  const lastScanRef = useRef({ isbn: "", ts: 0 }); // batch cooldown/de-dupe
  const cameraTriedRef = useRef(false);  // avoid re-prompting after a camera error
  const [liveActive, setLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");
  const [batchShelf, setBatchShelf] = useState("owned");
  // Refs mirror state so the scan loop's captured closures read live values
  // (avoids stale-closure bugs when scanMultiple/queue/books change mid-scan).
  const scanMultipleRef = useRef(scanMultiple);
  const queueRef = useRef(queue);
  const booksRef = useRef(books);
  useEffect(() => { scanMultipleRef.current = scanMultiple; }, [scanMultiple]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { booksRef.current = books; }, [books]);
  const [photoPreview, setPhotoPreview] = useState("");
  const [coverChoice, setCoverChoice] = useState("api"); // "api" | "photo"
  const [cropSrc, setCropSrc] = useState("");
  const [originalPhotoSrc, setOriginalPhotoSrc] = useState("");
  const [titleSuggs, setTitleSuggs] = useState([]);
  const [authorSuggs, setAuthorSuggs] = useState([]);
  // Duplicate-title confirmation. When a single-add targets a title already in
  // the archive we stash the pending action here and surface a confirm instead
  // of adding silently. { title, run } — run() commits the add as a separate copy.
  const [pendingDup, setPendingDup] = useState(null);

  // First book in the archive whose title matches `title` (case-insensitive,
  // whitespace-trimmed) — same dedup key the rest of the app uses.
  const existingByTitle = (title) => {
    const key = (title || "").trim().toLowerCase();
    if (!key) return null;
    return books.find((b) => (b.title || "").trim().toLowerCase() === key) || null;
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;

    const OL_FIELDS = "key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median";
    const JUNK = /(study guide|workbook|summary of|analysis of|reader'?s? guide|sparknotes|cliffsnotes)/i;

    const fromGoogleBooks = async (q) => {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=12&printType=books`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      return (data.items || []).map((item) => ({
        key: item.id,
        title: item.volumeInfo.title,
        author_name: item.volumeInfo.authors || [],
        first_publish_year: item.volumeInfo.publishedDate ? parseInt(item.volumeInfo.publishedDate) : null,
        _coverUrl: (item.volumeInfo.imageLinks?.thumbnail || item.volumeInfo.imageLinks?.smallThumbnail || "").replace("http://", "https://"),
        subject: item.volumeInfo.categories || [],
        pageCount: item.volumeInfo.pageCount || null,
      }));
    };

    const fromOpenLibrary = async (q) => {
      const [titleRes, genRes] = await Promise.all([
        fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=10&fields=${OL_FIELDS}`),
        fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=${OL_FIELDS}`),
      ]);
      const [td, gd] = await Promise.all([titleRes.json(), genRes.json()]);
      const seen = new Set();
      const out = [];
      for (const doc of [...(td.docs || []), ...(gd.docs || [])]) {
        if (!doc.title || JUNK.test(doc.title) || seen.has(doc.key)) continue;
        if (!q.includes("/") && doc.title.includes(" / ")) continue;
        seen.add(doc.key);
        out.push({ ...doc, pageCount: doc.number_of_pages_median || null });
      }
      return out.slice(0, 12);
    };

    const timer = setTimeout(async () => {
      try {
        let docs;
        try {
          docs = await fromGoogleBooks(q);
        } catch {
          docs = await fromOpenLibrary(q);
        }
        if (!cancelled) {
          setResults(docs);
          setError(docs.length ? "" : "No tomes found. Try a different title or author.");
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError("The archives are unreachable. Check your connection and try again."); setLoading(false); }
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const pick = async (doc, shelf) => {
    const coverUrl = doc._coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "");
    const spineColor = coverUrl ? await computeSpineColor(coverUrl) : null;
    const rawPageCount = doc.pageCount;
    const pageCount = (typeof rawPageCount === "number" && Number.isInteger(rawPageCount) && rawPageCount > 0) ? rawPageCount : null;
    const book = {
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown author",
      year: doc.first_publish_year || null,
      coverUrl,
      genres: cleanGenres(doc.subject),
      shelf,
      read: false,
      overall: 0,
      smut: 0,
      spineColor,
      notes: [],
      progress: pageCount ? { print: { pages: pageCount } } : {},
    };
    // Already in the archive? Confirm before adding a separate copy.
    if (existingByTitle(doc.title)) {
      setPendingDup({ title: doc.title, run: () => commitAdd(book) });
      return;
    }
    commitAdd(book);
  };

  // Fetch a Google Books cover for a title — runs regardless of whether Claude succeeds.
  const fetchGoogleBooksCover = (title) => {
    fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title.trim())}&maxResults=1&printType=books`)
      .then((r) => r.json())
      .then((d) => {
        const thumbnail = d.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
        if (thumbnail) setManual((m) => {
          if (m.coverUrl && !m.coverUrl.startsWith("data:")) return m;
          return { ...m, coverUrl: thumbnail.replace("http://", "https://") };
        });
      })
      .catch(() => {});
  };

  // Ask Claude for the book's author + genres from the title.
  const divineDetails = async (title, author) => {
    if (!title.trim()) return;
    setGenreLoading(true);
    // Fetch cover from Google Books immediately, independent of Claude
    setManual((m) => {
      if (m.coverUrl && !m.coverUrl.startsWith("data:")) return m;
      fetchGoogleBooksCover(title);
      return m;
    });
    try {
      const data = await callClaude({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `For the book titled "${title.trim()}"${author?.trim() ? ` by ${author.trim()}` : ""}: identify the author (if you recognize the book) and its genres. If you don't recognize it, set author to null and infer plausible genres from the title. Respond with ONLY a valid JSON object, nothing else: {"author": string or null, "genres": array of 2 to 4 short genre strings}.`,
          }],
      });
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      setManual((m) => {
        const have = new Set(m.genres.map((g) => g.toLowerCase()));
        const fresh = (Array.isArray(parsed.genres) ? parsed.genres : [])
          .filter((g) => typeof g === "string" && g.trim() && !have.has(g.trim().toLowerCase()))
          .map((g) => g.trim());
        return {
          ...m,
          author: m.author.trim() ? m.author : (parsed.author || ""),
          genres: [...m.genres, ...fresh].slice(0, 6),
        };
      });
    } catch {
      /* quiet failure — the user can fill details by hand */
    } finally {
      setGenreLoading(false);
    }
  };

  useEffect(() => {
    const title = manual.title.trim();
    if (title.length < 3) return;
    const timer = setTimeout(() => divineDetails(title, manual.author), 700);
    return () => clearTimeout(timer);
  }, [manual.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Title typeahead for photo mode
  useEffect(() => {
    if (mode !== "photo") return;
    const q = manual.title.trim();
    if (q.length < 2) { setTitleSuggs([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&printType=books`);
        const data = await res.json();
        const JUNK = /(study guide|workbook|summary of|analysis of|reader'?s? guide|sparknotes|cliffsnotes)/i;
        setTitleSuggs((data.items || [])
          .map(item => ({
            key: item.id,
            title: item.volumeInfo.title,
            author_name: item.volumeInfo.authors || [],
            first_publish_year: item.volumeInfo.publishedDate ? parseInt(item.volumeInfo.publishedDate) : null,
            _coverUrl: (item.volumeInfo.imageLinks?.thumbnail || "").replace("http://", "https://"),
            subject: item.volumeInfo.categories || [],
            pageCount: item.volumeInfo.pageCount || null,
          }))
          .filter(d => d.title && !JUNK.test(d.title))
          .slice(0, 6));
      } catch { setTitleSuggs([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [manual.title, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Author typeahead for photo mode
  useEffect(() => {
    if (mode !== "photo") return;
    const q = manual.author.trim();
    if (q.length < 2) { setAuthorSuggs([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=inauthor:${encodeURIComponent(q)}&maxResults=10&printType=books`);
        const data = await res.json();
        const names = [...new Set((data.items || []).flatMap(item => item.volumeInfo.authors || []))]
          .filter(a => a.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 5);
        setAuthorSuggs(names);
      } catch { setAuthorSuggs([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [manual.author, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask Claude to read the cover photo and pull out title + author.
  const scanCover = async (dataUrl) => {
    setScanning(true);
    setScanNotice("");
    try {
      const [prefix, b64] = dataUrl.split(",");
      const mediaType = (prefix.match(/data:(.*?);/) || [])[1] || "image/jpeg";
      const data = await callClaude({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: 'This is a photo of a book cover. Read the text on it and respond with ONLY a valid JSON object, nothing else: {"title": string or null, "author": string or null}. Use null for anything you cannot read confidently.' },
            ],
          }],
      });
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      if (parsed.title) {
        setManual((m) => ({ ...m, title: parsed.title, author: parsed.author || m.author }));
        setScanNotice("The scribe read the cover — check the details, then divine or adjust the genres.");
        divineDetails(parsed.title, parsed.author || "");
      } else {
        setScanNotice("The scribe couldn't make out the cover. Inscribe the details by hand below.");
      }
    } catch {
      setScanNotice("The scribe couldn't make out the cover. Inscribe the details by hand below.");
    } finally {
      setScanning(false);
    }
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera(); // free the camera if it was live (no-op otherwise)
    const reader = new FileReader();
    reader.onload = () => { setOriginalPhotoSrc(reader.result); setCropSrc(reader.result); };
    reader.readAsDataURL(file);
  };

  const applyPhoto = (dataUrl) => {
    const hadTitle = manual.title.trim().length > 0;
    setPhotoPreview(dataUrl);
    setCoverChoice("photo");
    setCropSrc("");
    setScanView("review");
    if (!hadTitle) scanCover(dataUrl);
  };

  /* ── live scanning ── */

  const stopCamera = () => {
    startingRef.current = false;
    clearInterval(scanLoopRef.current);
    scanLoopRef.current = null;
    try { zxingStopRef.current?.stop?.(); } catch { /* ignore */ }
    zxingStopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveActive(false);
  };

  useEffect(() => () => stopCamera(), []); // cleanup on close
  useEffect(() => { if (mode !== "scan") stopCamera(); }, [mode]);
  // Auto-open the camera when entering the capture view (one attempt; the
  // cameraTried guard stops a permission-denied loop). "Scan another" resets it.
  // Cleanup tears the camera down so StrictMode's mount→unmount→mount can't leave
  // a second stream/reader running on the same <video> element.
  useEffect(() => {
    if (mode === "scan" && scanView === "capture" && !liveActive && !cameraTriedRef.current) {
      startCamera();
    }
    return () => stopCamera();
  }, [mode, scanView]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    // Idempotent: a stream is already live, or a start is mid-flight. Without
    // this, StrictMode's double-invoke (and rapid re-renders) open two streams.
    if (streamRef.current || startingRef.current) return;
    startingRef.current = true;
    setLiveStatus("");
    cameraTriedRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      // The effect cleanup may have run while getUserMedia was awaiting (StrictMode
      // unmount). If so, this start was cancelled — drop the orphan stream.
      if (!startingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      // Best-effort continuous autofocus so small barcodes stay sharp.
      try {
        const track = stream.getVideoTracks()[0];
        if (track?.applyConstraints) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch { /* unsupported — ignore */ }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLiveActive(true);
      startBarcodeScan();
    } catch {
      setLiveStatus("The camera couldn't be opened — grant permission, or upload a photo instead.");
    } finally {
      startingRef.current = false;
    }
  };

  // Native BarcodeDetector when available (fast); else lazy-load ZXing.
  const startBarcodeScan = async () => {
    // Idempotent: never run two decoders on one <video>. Bail if either the
    // native interval or a ZXing reader is already active.
    if (scanLoopRef.current || zxingStopRef.current) return;
    if ("BarcodeDetector" in window) {
      let detector = null;
      try { detector = new window.BarcodeDetector({ formats: ["ean_13"] }); } catch { detector = null; }
      if (detector) {
        setLiveStatus("Point at the barcode…");
        scanLoopRef.current = setInterval(async () => {
          try {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            const codes = await detector.detect(videoRef.current);
            const isbn = codes.map((c) => c.rawValue).find((v) => /^97[89]\d{10}$/.test(v));
            if (isbn) handleDetectedIsbn(isbn);
          } catch { /* keep watching */ }
        }, 500);
        return;
      }
    }
    // Fallback: ZXing (iOS Safari, unsupported desktops) — only fetched now.
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setLiveStatus("Point at the barcode…");
      const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
        const v = result?.getText?.();
        if (v && /^97[89]\d{10}$/.test(v)) handleDetectedIsbn(v);
      });
      // The camera may have been torn down (StrictMode unmount, modal close)
      // while the dynamic import / decode setup was awaiting. If so, this reader
      // is an orphan — stop it immediately instead of leaking it.
      if (streamRef.current) zxingStopRef.current = controls;
      else { try { controls?.stop?.(); } catch { /* ignore */ } }
    } catch {
      setLiveStatus("Live barcode reading isn't available here — tap Capture cover or upload a photo.");
    }
  };

  // Google Books cover by ISBN — better art coverage than Open Library for
  // indie/romantasy titles. Returns an https cover URL or "" (never throws).
  const fetchGoogleCover = async (isbn) => {
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&printType=books`);
      const d = await res.json();
      const links = d.items?.[0]?.volumeInfo?.imageLinks;
      return (links?.thumbnail || links?.smallThumbnail || "").replace("http://", "https://");
    } catch { return ""; }
  };

  // Open Library lookup by ISBN — pure fetch, returns book data or null.
  const fetchByIsbn = async (isbn) => {
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=isbn:${isbn}&limit=1&fields=title,author_name,cover_i,subject,number_of_pages_median`
      );
      const d = await res.json();
      const doc = d.docs?.[0];
      if (!doc?.title) return null;
      // Cover: prefer OL's cover_i; when OL has no art (common for indie /
      // romantasy), fall back to Google Books. Never the bare OL ISBN endpoint —
      // it serves a blank 200 placeholder for missing covers. Empty string means
      // "no cover found", and the user can capture or upload one.
      let coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "";
      if (!coverUrl) coverUrl = await fetchGoogleCover(isbn);
      const rawPageCount = doc.number_of_pages_median;
      const pageCount = (typeof rawPageCount === "number" && Number.isInteger(rawPageCount) && rawPageCount > 0) ? rawPageCount : null;
      return {
        isbn,
        title: doc.title,
        author: doc.author_name?.[0] || "",
        coverUrl,
        genres: cleanGenres(doc.subject),
        pageCount,
      };
    } catch { return null; }
  };

  // Shared barcode handler. Reads live values via refs to dodge stale closures.
  const handleDetectedIsbn = async (isbn) => {
    if (scanMultipleRef.current) {
      const now = Date.now();
      if (lastScanRef.current.isbn === isbn && now - lastScanRef.current.ts < 2000) return;
      lastScanRef.current = { isbn, ts: now };
      if (queueRef.current.some((q) => q.isbn === isbn)) { setLiveStatus("Already scanned — keep going…"); return; }
      const data = await fetchByIsbn(isbn);
      if (!data) { setLiveStatus(`ISBN ${isbn} not in the archives — keep scanning…`); return; }
      const inArchive = booksRef.current.some((b) => (b.title || "").toLowerCase() === data.title.toLowerCase());
      setQueue((q) => [...q, { ...data, inArchive }]);
      setLiveStatus(inArchive ? `"${data.title}" is already in your archive` : `📖 Added "${data.title}"`);
    } else {
      clearInterval(scanLoopRef.current);
      try { zxingStopRef.current?.stop?.(); } catch { /* ignore */ }
      setLiveStatus(`Found ISBN ${isbn} — consulting the archives…`);
      const data = await fetchByIsbn(isbn);
      stopCamera();
      if (data) {
        setManual((m) => ({
          ...m,
          title: data.title,
          author: data.author || m.author,
          coverUrl: data.coverUrl,
          genres: data.genres.length ? data.genres : m.genres,
          pageCount: data.pageCount ?? null,
        }));
        setScanNotice("Matched from the barcode — confirm the details, then inscribe.");
        if (data.genres.length === 0) divineDetails(data.title, data.author || "");
        setScanView("review");
      } else {
        setLiveStatus("That barcode wasn't in the archives. Try capturing the cover instead.");
        startCamera();
      }
    }
  };

  const removeFromQueue = (isbn) => setQueue((q) => q.filter((b) => b.isbn !== isbn));

  const addBatch = () => {
    const items = queue.filter((q) => !q.inArchive).map((q) => {
      const pc = q.pageCount;
      const validPageCount = (typeof pc === "number" && Number.isInteger(pc) && pc > 0) ? pc : null;
      return {
        title: q.title,
        author: q.author || "Unknown author",
        coverUrl: q.coverUrl,
        genres: q.genres,
        shelf: batchShelf,
        read: false,
        progress: validPageCount ? { print: { pages: validPageCount } } : {},
      };
    });
    if (items.length && onAddMany) onAddMany(items);
    onClose();
  };

  const scanAnother = () => {
    setManual({ title: "", author: "", coverUrl: "", genres: [], pageCount: null });
    setPhotoPreview(""); setOriginalPhotoSrc(""); setCoverChoice("api");
    setScanNotice("");
    cameraTriedRef.current = false;
    setScanView("capture");
  };

  const captureCover = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    setPhotoPreview(dataUrl);
    setCoverChoice("photo");
    setScanView("review");
    scanCover(dataUrl);
  };

  const addGenre = () => {
    const g = genreInput.trim();
    if (!g) return;
    setManual((m) => {
      if (m.genres.some((x) => x.toLowerCase() === g.toLowerCase())) return m;
      return { ...m, genres: [...m.genres, g].slice(0, 6) };
    });
    setGenreInput("");
  };

  const removeGenre = (g) =>
    setManual((m) => ({ ...m, genres: m.genres.filter((x) => x !== g) }));

  // Real commit for manual/upload/single-scan: uploads the cover photo (if any),
  // derives the spine color, then onAdd. Runs only once the user is past any
  // duplicate confirm — so a cancelled add never uploads a cover.
  const commitManual = async (shelf) => {
    let coverUrl = manual.coverUrl;
    if (coverChoice === "photo" && photoPreview && session) {
      try {
        const res = await fetch(photoPreview);
        const blob = await res.blob();
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("covers").upload(path, blob, { contentType: blob.type });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from("covers").getPublicUrl(path);
          coverUrl = publicUrl;
        }
      } catch { /* fall back to API cover */ }
    }
    // Best-effort spine color from the resolved cover; null on any failure.
    const spineColor = coverUrl ? await computeSpineColor(coverUrl) : null;
    const pc = manual.pageCount;
    const validPageCount = (typeof pc === "number" && Number.isInteger(pc) && pc > 0) ? pc : null;
    commitAdd({
      title: manual.title.trim(),
      author: manual.author.trim() || "Unknown author",
      year: null,
      coverUrl,
      genres: manual.genres.slice(0, 6),
      shelf,
      read: false,
      overall: 0,
      smut: 0,
      spineColor,
      notes: [],
      progress: validPageCount ? { print: { pages: validPageCount } } : {},
    });
  };

  const addManual = async (shelf) => {
    if (!manual.title.trim()) return;
    // Check for an existing title BEFORE uploading a cover — a cancelled add
    // must not touch storage. On confirm, commitManual does the real work.
    if (existingByTitle(manual.title)) {
      setPendingDup({ title: manual.title.trim(), run: () => commitManual(shelf) });
      return;
    }
    await commitManual(shelf);
  };

  if (cropSrc) {
    return <ImageCropModal src={cropSrc} onApply={applyPhoto} onSkip={() => applyPhoto(cropSrc)} onReplace={(dataUrl) => setOriginalPhotoSrc(dataUrl)} />;
  }

  return (
    <>
    <Overlay onClose={onClose} label="Inscribe">
      <div className="flex items-center justify-between mb-4">
        <h2 className="ht-display text-xl text-pink-200">Inscribe</h2>
        <button onClick={onClose} className="text-purple-300 hover:text-pink-300 text-xl px-2" aria-label="Close">✕</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <ModeTab active={mode === "search"} onClick={() => setMode("search")}>Scour the grimoire</ModeTab>
        <ModeTab active={mode === "scan"} onClick={() => setMode("scan")}>Scan or upload</ModeTab>
      </div>

      {mode === "search" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author…"
            autoFocus
            className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
          />

          {loading && <p className="mt-4 text-[15px] text-purple-300/70 italic">Consulting the archives…</p>}
          {error && <p className="mt-4 text-[15px] text-pink-300">{error}</p>}

          <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-1">
            {results.map((doc) => (
              <div key={doc.key} className="flex gap-3 items-center bg-purple-950/40 rounded-sm p-2.5 border border-purple-800/40">
                <div className="w-10 h-14 rounded-sm overflow-hidden bg-purple-900/60 flex-shrink-0 flex items-center justify-center">
                  <CoverImage
                    src={doc._coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : "")}
                    alt=""
                    className="w-full h-full object-cover"
                    fallback={<span className="text-purple-500 text-lg">♛</span>}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">{doc.title}</p>
                  <p className="text-sm text-purple-300/70 truncate italic">
                    {doc.author_name?.[0] || "Unknown"} {doc.first_publish_year ? `· ${doc.first_publish_year}` : ""}
                  </p>
                  <GenreChips genres={cleanGenres(doc.subject)} className="mt-1" />
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => pick(doc, "owned")} className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-indigo-500/40 hover:bg-indigo-500/70 text-indigo-100">
                    + Owned
                  </button>
                  <button onClick={() => pick(doc, "wishlist")} className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-pink-500/30 hover:bg-pink-500/60 text-pink-100">
                    + Wishlist
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : mode === "scan" && scanView === "review" ? (
        <div className="space-y-3">
          <button type="button" onClick={scanAnother}
            className="ht-display text-[10px] uppercase tracking-widest text-purple-300 hover:text-pink-300">
            ↻ Scan another
          </button>
          <p className="text-sm text-purple-300/70 italic">
            Confirm the details the scribe gathered — anything it couldn't make out, inscribe by hand.
          </p>
          <div className="relative w-full h-64 rounded-sm border-2 border-dashed border-purple-600/50 overflow-hidden bg-purple-950/40">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full h-full flex items-center justify-center hover:border-pink-400/70">
              <CoverImage
                src={coverChoice === "photo" ? photoPreview : (manual.coverUrl || photoPreview)}
                alt="Uploaded cover"
                className="h-full object-contain"
                fallback={<span className="text-[15px] text-purple-300/70">📷 Tap to upload a cover photo</span>}
              />
            </button>
            {photoPreview && coverChoice === "photo" && (
              <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="ht-display text-[8px] uppercase tracking-widest bg-black/70 hover:bg-purple-900 text-purple-200 px-1.5 py-0.5 rounded-sm">
                  📷 Replace
                </button>
                <button type="button" onClick={() => setCropSrc(originalPhotoSrc)}
                  className="ht-display text-[8px] uppercase tracking-widest bg-black/70 hover:bg-pink-900 text-pink-200 px-1.5 py-0.5 rounded-sm">
                  ✎ Re-crop
                </button>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

          {/* Cover source picker — shown when both options are available */}
          {photoPreview && manual.coverUrl && (
            <div>
              <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1.5">Cover source</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCoverChoice("photo")}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-sm border transition-colors ${
                    coverChoice === "photo"
                      ? "border-pink-400/70 bg-pink-400/10 text-pink-200"
                      : "border-purple-700/40 text-purple-400 hover:border-purple-500/60"
                  }`}>
                  <img src={photoPreview} alt="" className="w-7 h-10 object-cover rounded-sm flex-shrink-0" />
                  <span className="ht-display text-[9px] uppercase tracking-widest">Your photo</span>
                </button>
                <button type="button" onClick={() => setCoverChoice("api")}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-sm border transition-colors ${
                    coverChoice === "api"
                      ? "border-pink-400/70 bg-pink-400/10 text-pink-200"
                      : "border-purple-700/40 text-purple-400 hover:border-purple-500/60"
                  }`}>
                  <img src={manual.coverUrl} alt="" className="w-7 h-10 object-cover rounded-sm flex-shrink-0" />
                  <span className="ht-display text-[9px] uppercase tracking-widest">From the web</span>
                </button>
              </div>
            </div>
          )}

          {scanning && <p className="text-sm text-purple-300/70 italic">The scribe is reading the cover…</p>}
          {scanNotice && !scanning && <p className="text-sm text-pink-200/90 italic">{scanNotice}</p>}
          <div className="relative">
            <input
              value={manual.title}
              onChange={(e) => { setManual({ ...manual, title: e.target.value }); }}
              onBlur={() => setTimeout(() => setTitleSuggs([]), 150)}
              placeholder="Title"
              className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
            />
            {titleSuggs.length > 0 && (
              <div className="absolute z-20 w-full bg-[#130b22] border border-purple-700/60 rounded-sm mt-0.5 shadow-xl max-h-56 overflow-y-auto">
                {titleSuggs.map(doc => (
                  <button key={doc.key} type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setManual(m => ({
                        ...m,
                        title: doc.title,
                        author: doc.author_name?.[0] || m.author,
                        coverUrl: doc._coverUrl || m.coverUrl,
                        genres: cleanGenres(doc.subject).length ? cleanGenres(doc.subject) : m.genres,
                      }));
                      setTitleSuggs([]);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-purple-800/50 text-left border-b border-purple-800/30 last:border-0"
                  >
                    {doc._coverUrl && <img src={doc._coverUrl} alt="" className="w-7 h-10 object-cover rounded-sm flex-shrink-0 opacity-80" />}
                    <div>
                      <div className="text-[13px] text-pink-100 leading-tight">{doc.title}</div>
                      {doc.author_name?.[0] && <div className="text-[11px] text-purple-400">{doc.author_name[0]}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <input
              value={manual.author}
              onChange={(e) => { setManual({ ...manual, author: e.target.value }); }}
              onBlur={() => setTimeout(() => setAuthorSuggs([]), 150)}
              placeholder="Author"
              className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
            />
            {authorSuggs.length > 0 && (
              <div className="absolute z-20 w-full bg-[#130b22] border border-purple-700/60 rounded-sm mt-0.5 shadow-xl">
                {authorSuggs.map(name => (
                  <button key={name} type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setManual(m => ({ ...m, author: name }));
                      setAuthorSuggs([]);
                    }}
                    className="w-full px-3 py-2 hover:bg-purple-800/50 text-left text-[13px] text-pink-100 border-b border-purple-800/30 last:border-0"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* genres: divined by AI, editable by hand */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="ht-display text-[10px] uppercase text-purple-300 font-semibold">Genres</span>
              <button
                onClick={() => divineDetails(manual.title, manual.author)}
                disabled={!manual.title.trim() || genreLoading}
                className="ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm bg-indigo-500/40 hover:bg-indigo-500/70 disabled:opacity-40 text-indigo-100"
              >
                {genreLoading ? "Divining…" : "✨ Divine details"}
              </button>
            </div>
            {manual.genres.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {manual.genres.map((g) => (
                  <span key={g} className="ht-display text-[9px] uppercase pl-1.5 pr-1 py-0.5 rounded-sm border border-purple-500/40 bg-purple-900/40 text-purple-200/90 flex items-center gap-1">
                    {g}
                    <button onClick={() => removeGenre(g)} aria-label={`Remove genre ${g}`} className="text-purple-400 hover:text-pink-300 px-0.5">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGenre(); } }}
                placeholder={manual.title.trim() ? "Add a genre…" : "Inscribe a title first, then divine or add genres"}
                className="flex-1 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
              />
              <button onClick={addGenre} disabled={!genreInput.trim()} className="ht-display text-[10px] uppercase px-3 rounded-sm bg-purple-800/60 hover:bg-purple-700 disabled:opacity-40 text-purple-100">
                Add
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => addManual("owned")} disabled={!manual.title.trim()} className="ht-display flex-1 py-2 rounded-sm bg-indigo-500/70 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold uppercase">
              Inscribe to Owned
            </button>
            <button onClick={() => addManual("wishlist")} disabled={!manual.title.trim()} className="ht-display flex-1 py-2 rounded-sm bg-pink-500/70 hover:bg-pink-500 disabled:opacity-40 text-white text-xs font-semibold uppercase">
              Inscribe to Wishlist
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative w-full aspect-[3/4] rounded-sm overflow-hidden bg-purple-950/60 border border-purple-700/40 flex items-center justify-center">
            <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${liveActive ? "" : "hidden"}`} />
            {!liveActive && <span className="text-[15px] text-purple-300/70">📷 Camera preview</span>}
            {liveActive && (
              <div className="absolute inset-x-8 top-1/2 h-px bg-pink-400/80 shadow-[0_0_8px_rgba(244,114,182,0.8)]" aria-hidden="true" />
            )}
          </div>
          {liveStatus && <p className="text-sm text-pink-200/90 italic">{liveStatus}</p>}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={scanMultiple} onChange={(e) => setScanMultiple(e.target.checked)} className="accent-pink-500" />
            <span className="ht-display text-[10px] uppercase tracking-widest text-purple-200">Scan multiple</span>
            <span className="text-xs text-purple-400/60 italic">— queue barcodes, add them all at once</span>
          </label>

          <div className="flex gap-2 flex-wrap">
            {!liveActive ? (
              <button onClick={startCamera} className="ht-display flex-1 py-2 rounded-sm bg-indigo-500/70 hover:bg-indigo-500 text-white text-xs font-semibold uppercase">
                Open the camera
              </button>
            ) : (
              <button onClick={stopCamera} className="ht-display px-4 py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase">
                Stop camera
              </button>
            )}
            {!scanMultiple && (
              <>
                <button onClick={captureCover} disabled={!liveActive} className="ht-display flex-1 py-2 rounded-sm bg-pink-500/80 hover:bg-pink-400 disabled:opacity-40 text-white text-xs font-semibold uppercase">
                  📸 Capture cover
                </button>
                <button onClick={() => fileRef.current?.click()} className="ht-display flex-1 py-2 rounded-sm bg-purple-700/60 hover:bg-purple-600 text-white text-xs font-semibold uppercase">
                  ⬆ Upload a photo
                </button>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

          {scanMultiple && (
            <div className="ht-card rounded-md p-3 space-y-2">
              <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300">{queue.length} queued</p>
              {queue.length === 0 ? (
                <p className="text-sm text-purple-400/60 italic">Point at a barcode — matches drop in here.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {queue.map((b) => (
                    <div key={b.isbn} className={`flex items-center gap-2 rounded-sm p-1.5 border ${b.inArchive ? "border-purple-800/40 opacity-50" : "border-purple-700/40 bg-purple-950/40"}`}>
                      <div className="w-7 h-10 rounded-sm overflow-hidden bg-purple-900/60 flex-shrink-0">
                        <CoverImage src={b.coverUrl} alt="" className="w-full h-full object-cover" fallback={<span className="text-purple-500 text-xs flex items-center justify-center h-full">♛</span>} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-pink-100 truncate">{b.title}</p>
                        <p className="text-[11px] text-purple-400 truncate italic">{b.author || "Unknown"}{b.inArchive ? " · already in archive" : ""}</p>
                      </div>
                      <button onClick={() => removeFromQueue(b.isbn)} aria-label="Remove from queue" className="text-purple-400 hover:text-pink-300 px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {queue.some((q) => !q.inArchive) && (
                <div className="flex gap-2 items-center">
                  <button onClick={addBatch} className="ht-display flex-1 py-2 rounded-sm bg-gradient-to-r from-indigo-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white text-xs font-semibold uppercase">
                    Add {queue.filter((q) => !q.inArchive).length} to
                  </button>
                  <select value={batchShelf} onChange={(e) => setBatchShelf(e.target.value)}
                    className="bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-2 text-sm text-purple-100 focus:outline-none focus:border-pink-400">
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-purple-400/60 italic">
            Barcode matches use the book's ISBN against Open Library. Camera blocked? Upload a cover photo instead.
          </p>
        </div>
      )}
    </Overlay>

    {/* Duplicate-title confirm — this tome already lives in the archive.
        Confirm adds a SEPARATE copy; cancel leaves nothing and keeps the add flow. */}
    {pendingDup && (
      <Overlay onClose={() => setPendingDup(null)} label="Already in your archive">
        <h2 className="ht-display text-lg uppercase text-pink-200 mb-2">Already in your archive</h2>
        <p className="text-[15px] text-purple-100 mb-1">
          <span className="text-pink-200 italic">“{pendingDup.title}”</span> is already in your archive.
        </p>
        <p className="text-sm text-purple-300/80 mb-5">
          Add it anyway and a second, separate copy will be inscribed.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPendingDup(null)}
            className="ht-display flex-1 py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase"
          >
            Cancel
          </button>
          <button
            onClick={() => { const dup = pendingDup; setPendingDup(null); dup.run(); }}
            className="ht-display flex-1 py-2 rounded-sm bg-pink-500/80 hover:bg-pink-400 text-white text-xs font-semibold uppercase"
          >
            Add anyway
          </button>
        </div>
      </Overlay>
    )}
    </>
  );
}

function ModeTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`ht-display px-3 py-1.5 rounded-sm text-[10px] font-semibold uppercase transition-colors ${
        active ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-800/50"
      }`}
    >
      {children}
    </button>
  );
}

/* ── image crop modal ──────────────────────────────────────── */

/* Pink crop chrome — react-image-crop's default selection/handles are
   blue/white; restyle to the Hushthorn pink accent. (Cyan stays audio-only.) */
const CROP_CSS = `
.ht-crop .ReactCrop__crop-selection {
  border: 1px solid #f472b6;
  box-shadow: 0 0 0 9999em rgba(7,4,14,0.72);
}
.ht-crop .ReactCrop__drag-handle::after {
  background-color: #f472b6;
  border: 1px solid rgba(12,7,20,0.9);
}
.ht-crop .ReactCrop__drag-bar { background-color: rgba(244,114,182,0.55); }
.ht-crop .ReactCrop__rule-of-thirds-vt::before,
.ht-crop .ReactCrop__rule-of-thirds-vt::after,
.ht-crop .ReactCrop__rule-of-thirds-hz::before,
.ht-crop .ReactCrop__rule-of-thirds-hz::after { background-color: rgba(244,114,182,0.4); }
`;

const CROP_ASPECTS = [
  { label: 'Portrait', value: 3 / 4 },
  { label: 'Landscape', value: 4 / 3 },
  { label: 'Square', value: 1 },
  { label: 'Free', value: undefined },
];

function centeredCrop(width, height, aspect) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
    width, height,
  );
}

function ImageCropModal({ src, onApply, onSkip, onReplace }) {
  const [imgSrc, setImgSrc] = useState(src);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [aspect, setAspect] = useState(3 / 4);
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [applying, setApplying] = useState(false);
  const imgRef = useRef(null);
  const replaceRef = useRef(null);

  const onImageLoad = (e) => {
    if (typeof aspect === 'number') {
      const { width, height } = e.currentTarget;
      setCrop(centeredCrop(width, height, aspect));
    }
  };

  const chooseAspect = (value) => {
    setAspect(value);
    if (typeof value === 'number' && imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(centeredCrop(width, height, value));
    }
    // Free → leave the current crop for the user to draw/resize.
  };

  const handleReplace = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      setImgSrc(url);
      setCrop(undefined);
      setCompletedCrop(null);
      setScale(1);
      setRotate(0);
      onReplace?.(url);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const apply = () => {
    if (!completedCrop?.width || !imgRef.current) return;
    setApplying(true);
    try {
      const dataUrl = getCroppedDataUrl(imgRef.current, completedCrop, scale, rotate);
      if (dataUrl) onApply(dataUrl);
    } finally { setApplying(false); }
  };

  const canApply = !!completedCrop && completedCrop.width > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#07040e' }}>
      <style>{FONT_CSS}</style>
      <style>{CROP_CSS}</style>

      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-purple-900/60">
        <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300">Adjust cover</p>
        <button onClick={onSkip}
          className="ht-display text-[9px] uppercase tracking-widest text-purple-400/70 hover:text-pink-300 transition-colors">
          Skip — use as-is
        </button>
      </div>

      {/* cropper area */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-auto p-3">
        <ReactCrop
          className="ht-crop"
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={setCompletedCrop}
          aspect={aspect}
          minWidth={40}
        >
          <img
            ref={imgRef}
            src={imgSrc}
            alt=""
            style={{ transform: `scale(${scale}) rotate(${rotate}deg)`, maxHeight: '70vh' }}
            onLoad={onImageLoad}
          />
        </ReactCrop>
      </div>

      {/* controls */}
      <div className="flex-shrink-0 px-4 py-4 space-y-3 border-t border-purple-900/60" style={{ background: '#0c0714' }}>
        {/* aspect presets */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {CROP_ASPECTS.map(({ label, value }) => {
            const active = aspect === value;
            return (
              <button key={label} onClick={() => chooseAspect(value)}
                className={`ht-display px-3 py-1.5 rounded-sm text-[9px] font-semibold uppercase tracking-widest transition-colors border ${
                  active
                    ? "bg-pink-600/70 text-white border-pink-400/50"
                    : "bg-purple-950/50 text-purple-300 hover:bg-purple-800/50 border-purple-700/40"
                }`}>
                {label}
              </button>
            );
          })}
        </div>

        {/* rotation buttons */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setRotate(r => r - 90)}
            className="ht-display text-[10px] uppercase px-4 py-2 rounded-sm bg-purple-900/70 hover:bg-purple-800 text-purple-100 border border-purple-700/40">
            ↺ Left 90°
          </button>
          <span className="ht-display text-[10px] text-purple-400/60 w-10 text-center">{((rotate % 360) + 360) % 360}°</span>
          <button onClick={() => setRotate(r => r + 90)}
            className="ht-display text-[10px] uppercase px-4 py-2 rounded-sm bg-purple-900/70 hover:bg-purple-800 text-purple-100 border border-purple-700/40">
            ↻ Right 90°
          </button>
        </div>

        {/* zoom slider */}
        <div className="flex items-center gap-3">
          <span className="ht-display text-[9px] uppercase text-purple-400 w-8 flex-shrink-0">Zoom</span>
          <input type="range" min={0.3} max={4} step={0.05} value={scale}
            onChange={e => setScale(Number(e.target.value))}
            className="flex-1 h-1.5 rounded-sm appearance-none cursor-pointer accent-pink-400"
            style={{ accentColor: '#f472b6' }} />
          <span className="ht-display text-[9px] text-purple-400/60 w-8 text-right">{scale.toFixed(1)}×</span>
        </div>

        {/* replace + apply */}
        <div className="flex items-center gap-3">
          <button onClick={() => replaceRef.current?.click()}
            className="ht-display flex-shrink-0 text-[10px] uppercase px-4 py-3 rounded-sm bg-purple-900/70 hover:bg-purple-800 text-purple-100 border border-purple-700/40 tracking-widest">
            ⟳ Replace photo
          </button>
          <input ref={replaceRef} type="file" accept="image/*" onChange={handleReplace} className="hidden" />
          <button onClick={apply} disabled={applying || !canApply}
            className="ht-display flex-1 py-3 rounded-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-widest">
            {applying ? 'Cropping…' : '✦ Crop & use this cover'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── cover editor ──────────────────────────────────────────── */

function CoverEditor({ book, onUpdate, session }) {
  const [editing, setEditing] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const [originalPhotoSrc, setOriginalPhotoSrc] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [apiCoverUrl, setApiCoverUrl] = useState(book.coverUrl || "");
  const [coverChoice, setCoverChoice] = useState("api");
  const [searchQuery, setSearchQuery] = useState(book.title);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failedCovers, setFailedCovers] = useState(new Set());
  const fileRef = useRef(null);

  const searchCovers = async (q) => {
    if (!q.trim()) return;
    setSearching(true);
    setFailedCovers(new Set());
    try {
      const out = [];
      const seen = new Set();
      const pushHit = (id, title, coverUrl) => {
        if (!coverUrl || seen.has(coverUrl)) return;
        seen.add(coverUrl);
        out.push({ id, title, coverUrl });
      };

      // Google Books — derive an Open Library cover from the ISBN when no thumbnail
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`);
        const data = await res.json();
        for (const item of data.items || []) {
          const v = item.volumeInfo || {};
          const links = v.imageLinks || {};
          let cover = (links.thumbnail || links.smallThumbnail || "").replace("http://", "https://");
          if (!cover) {
            const isbn = (v.industryIdentifiers || []).find(x => x.type === "ISBN_13" || x.type === "ISBN_10");
            if (isbn) cover = `https://covers.openlibrary.org/b/isbn/${isbn.identifier}-M.jpg?default=false`;
          }
          pushHit(item.id, v.title, cover);
        }
      } catch { /* ignore */ }

      // Open Library — reliable cover_i, fills in when Google has no art
      try {
        const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=key,title,cover_i,isbn`);
        const data = await res.json();
        for (const doc of data.docs || []) {
          if (doc.cover_i) pushHit(doc.key, doc.title, `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`);
          else if (doc.isbn?.[0]) pushHit(doc.key, doc.title, `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-M.jpg?default=false`);
        }
      } catch { /* ignore */ }

      setSearchResults(out.slice(0, 12));
    } finally { setSearching(false); }
  };

  // On open, search by title + author so the official cover matches this exact book
  useEffect(() => {
    if (editing) searchCovers([book.title, book.author].filter(Boolean).join(" "));
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setOriginalPhotoSrc(reader.result); setCropSrc(reader.result); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const applyPhoto = (dataUrl) => {
    setPhotoPreview(dataUrl);
    setCoverChoice("photo");
    setCropSrc("");
  };

  const save = async () => {
    setSaving(true);
    try {
      let coverUrl = apiCoverUrl || book.coverUrl;
      if (coverChoice === "photo" && photoPreview && session) {
        const res = await fetch(photoPreview);
        const blob = await res.blob();
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("covers").upload(path, blob, { contentType: blob.type });
        if (!error) {
          const { data: { publicUrl } } = supabase.storage.from("covers").getPublicUrl(path);
          coverUrl = publicUrl;
        }
      }
      // Resample the spine color for the new cover; null on any failure.
      const spineColor = coverUrl ? await computeSpineColor(coverUrl) : null;
      await onUpdate({ coverUrl, spineColor });
      setEditing(false);
      setPhotoPreview("");
    } finally { setSaving(false); }
  };

  const cancel = () => { setEditing(false); setPhotoPreview(""); setCropSrc(""); setOriginalPhotoSrc(""); setApiCoverUrl(book.coverUrl || ""); setCoverChoice("api"); };

  const previewSrc = coverChoice === "photo" ? photoPreview : (apiCoverUrl || book.coverUrl);

  if (cropSrc) {
    return <ImageCropModal src={cropSrc} onApply={applyPhoto} onSkip={() => applyPhoto(cropSrc)} onReplace={(dataUrl) => setOriginalPhotoSrc(dataUrl)} />;
  }

  if (!editing) {
    return (
      <div className="relative group cursor-pointer" onClick={() => setEditing(true)}>
        <div className="aspect-[2/3] rounded-sm overflow-hidden bg-purple-950/60 flex items-center justify-center">
          <CoverImage src={book.coverUrl} alt={`Cover of ${book.title}`} className="w-full h-full object-cover"
            fallback={<span className="ht-display text-purple-400/60 text-xs px-2 text-center">{book.title}</span>} />
        </div>
        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-black/0 group-hover:bg-black/40 transition-colors rounded-sm pointer-events-none">
          <span className="ht-display text-[9px] uppercase tracking-widest text-transparent group-hover:text-white/90 transition-colors bg-black/50 px-2 py-1 rounded-sm">
            ✎ Change cover
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Live preview */}
      <div className="relative w-full aspect-[2/3] rounded-sm border-2 border-dashed border-purple-600/50 overflow-hidden bg-purple-950/40">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full h-full flex items-center justify-center hover:border-pink-400/70">
          <CoverImage src={previewSrc} alt="Cover preview" className="w-full h-full object-cover"
            fallback={<span className="text-sm text-purple-300/70">📷 Upload photo</span>} />
        </button>
        {photoPreview && coverChoice === "photo" ? (
          <div className="absolute bottom-1.5 right-1.5 flex gap-1">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="ht-display text-[8px] uppercase tracking-widest bg-black/70 hover:bg-purple-900 text-purple-200 px-1.5 py-0.5 rounded-sm">
              📷 Replace
            </button>
            <button type="button" onClick={() => setCropSrc(originalPhotoSrc)}
              className="ht-display text-[8px] uppercase tracking-widest bg-black/70 hover:bg-pink-900 text-pink-200 px-1.5 py-0.5 rounded-sm">
              ✎ Re-crop
            </button>
          </div>
        ) : (
          <span className="absolute bottom-1.5 right-1.5 pointer-events-none ht-display text-[8px] uppercase tracking-widest bg-black/60 text-purple-200 px-1.5 py-0.5 rounded-sm">
            tap to upload
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

      {/* Source picker */}
      {photoPreview && (apiCoverUrl || book.coverUrl) && (
        <div className="flex gap-2">
          {[
            { key: "photo", src: photoPreview, label: "Your photo" },
            { key: "api",   src: apiCoverUrl || book.coverUrl, label: "From the web" },
          ].map(({ key, src, label }) => (
            <button key={key} type="button" onClick={() => setCoverChoice(key)}
              className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-sm border transition-colors ${
                coverChoice === key ? "border-pink-400/70 bg-pink-400/10 text-pink-200" : "border-purple-700/40 text-purple-400 hover:border-purple-500/60"
              }`}>
              <img src={src} alt="" className="w-6 h-9 object-cover rounded-sm flex-shrink-0" />
              <span className="ht-display text-[9px] uppercase tracking-widest">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* API cover search */}
      <div className="flex gap-2">
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && searchCovers(searchQuery)}
          placeholder="Search covers by title…"
          className="flex-1 min-w-0 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400" />
        <button onClick={() => searchCovers(searchQuery)} disabled={searching}
          className="ht-display text-[10px] uppercase px-3 py-1.5 rounded-sm bg-purple-800/60 hover:bg-purple-700 disabled:opacity-40 text-purple-100 flex-shrink-0 whitespace-nowrap">
          {searching ? "…" : "Search"}
        </button>
      </div>
      {(book.coverUrl || searchResults.length > 0) && (
        <div>
          <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1.5">
            Covers from Google Books — tap to use the official art
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {/* Current cover — always first so the user can compare and revert */}
            {book.coverUrl && (
              <button type="button" title="Current cover"
                onClick={() => { setApiCoverUrl(book.coverUrl); setCoverChoice("api"); }}
                className={`relative flex-shrink-0 rounded-sm overflow-hidden border-2 transition-colors ${
                  apiCoverUrl === book.coverUrl && coverChoice === "api" ? "border-pink-400" : "border-purple-700/40 hover:border-purple-500/60"
                }`} style={{ width: 40, height: 60 }}>
                <img src={book.coverUrl} alt="Current cover" className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 ht-display text-[6px] uppercase text-center bg-black/60 text-purple-200 leading-tight py-0.5">now</span>
              </button>
            )}
            {searchResults.filter(r => !failedCovers.has(r.coverUrl)).map((r, i) => (
              <button key={r.id} type="button" title={r.title}
                onClick={() => { setApiCoverUrl(r.coverUrl); setCoverChoice("api"); }}
                className={`relative flex-shrink-0 rounded-sm overflow-hidden border-2 transition-colors ${
                  apiCoverUrl === r.coverUrl && coverChoice === "api" ? "border-pink-400" : "border-purple-700/40 hover:border-purple-500/60"
                }`} style={{ width: 40, height: 60 }}>
                <img src={r.coverUrl} alt={r.title} className="w-full h-full object-cover"
                  onError={() => setFailedCovers(s => new Set(s).add(r.coverUrl))} />
                {i === 0 && (
                  <span className="absolute bottom-0 inset-x-0 ht-display text-[6px] uppercase text-center bg-pink-900/80 text-pink-100 leading-tight py-0.5">official</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="ht-display flex-1 py-2 rounded-sm bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white text-xs font-semibold uppercase tracking-widest">
          {saving ? "Saving…" : "✦ Save cover"}
        </button>
        <button onClick={cancel}
          className="ht-display px-3 py-2 rounded-sm border border-purple-700/40 hover:border-purple-500/60 text-purple-400 text-xs uppercase">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── shared-archive card blocks (union model) ─────────────────
   Reusable pieces for an archive entry's card/detail (rebuilt & wired by Task 3
   against the UnionBook shape). "Who has it" = one row per owner with the
   editions that owner has; the reveal grid = an aligned grid of everyone's
   Verdict / Smoulder / % where you always see your own marks and co-members
   appear only if they opted in. Notes are NEVER rendered here (the reveal never
   carries them). */

// Per-format ownership glyphs. Audio keeps the app's cyan-for-audio rule; the
// glyph itself lives in a cyan span so the tint reads as "audio" even inline.
const FORMAT_GLYPHS = [
  { fmt: "print", glyph: "📖", label: "Print", cyan: false },
  { fmt: "ebook", glyph: "📱", label: "Ebook", cyan: false },
  { fmt: "audio", glyph: "🎧", label: "Audio", cyan: true },
];

// "Who has it" — one row per `owners` entry from the UnionBook.
// `compact` = card-grid mode: shows only the owner count badge, no full rows
// (fixes spine/card alignment bug #7).
// Full mode (detail panel): avatar · name · owned-format glyphs (audio in cyan),
// or italic "wants it" when shelf === 'wishlist'.
function WhoHasIt({ owners = [], meId, compact = false }) {
  if (!owners.length) return null;

  if (compact) {
    // Compact: small owner-count badge only, no layout-busting rows.
    return (
      <div className="mt-1 flex items-center gap-1">
        <span className="ht-display text-[9px] uppercase tracking-widest text-purple-400/70">
          {owners.length} reader{owners.length === 1 ? "" : "s"}
        </span>
        <span className="flex -space-x-1">
          {owners.slice(0, 3).map((o) => (
            <span key={o.user_id} className="inline-block rounded-full ring-1 ring-purple-700/50" style={{ width: 14, height: 14 }}>
              <MiniAvatar av={o.av} size={14} />
            </span>
          ))}
          {owners.length > 3 && (
            <span className="ht-display text-[8px] text-purple-400/70 pl-1.5">+{owners.length - 3}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400/80 mb-1.5">
        Who has it
      </p>
      <div className="space-y-1">
        {owners.map((owner) => {
          const isMe = owner.user_id === meId;
          const name = isMe ? "You" : `@${owner.username || "reader"}`;
          const isOwned = owner.shelf === "owned";
          const fmts = isOwned
            ? FORMAT_GLYPHS.filter((g) => (owner.formats || []).includes(g.fmt))
            : [];
          return (
            <div key={owner.user_id} className="flex items-center gap-2">
              <MiniAvatar av={owner.av} size={20} />
              <span className="flex-1 min-w-0 truncate text-[13px] text-purple-100/90">
                {name}
              </span>
              {isOwned ? (
                fmts.length ? (
                  <span className="flex items-center gap-1.5 text-[13px] leading-none">
                    {fmts.map((g) => (
                      <span
                        key={g.fmt}
                        className={g.cyan ? "text-cyan-300" : ""}
                        title={g.label}
                        aria-label={g.label}
                      >
                        {g.glyph}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-[11px] italic text-purple-400/60">owned</span>
                )
              ) : (
                <span className="text-[11px] italic text-purple-400/60">wants it</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A single reveal row (name · Verdict swords · Smoulder candles · percent).
// Marks render with the app's real Sword/Candle icons via readOnly Meter — never
// the ⚔/🕯 unicode the sketch used. `progress`-driven percent reuses maxPercent.
// Each Meter is wrapped in min-w-0 + overflow-hidden so icons never overflow the
// card width (fix for reveal Meter overflow bug #6).
function RevealRow({ name, overall, smut, progress, read, formats }) {
  const pct = read
    ? 100
    : maxPercent({ formats, progress: progress || {} });
  return (
    <>
      <span className="text-[13px] italic text-purple-300/80 truncate">{name}</span>
      <span className="flex items-center min-w-0 overflow-hidden">
        <Meter value={overall} Icon={Sword} label="Verdict" readOnly size={13} />
      </span>
      <span className="flex items-center min-w-0 overflow-hidden">
        <Meter value={smut} Icon={Candle} label="Smoulder" readOnly size={13} />
      </span>
      <span className="text-[12px] tabular-nums text-purple-300/70 text-right">{pct}%</span>
    </>
  );
}

// The reveal grid. Sources co-member rows from `book.owners` (filtered to
// user_id !== me). The "You" row is shown ONLY when `book.mineBookId` is set
// (I own the title) — sourced from `book.overall/smut/progress/read`. When I
// don't own the title there is no You row; "Add to my library" is the CTA.
// Co-member rows show their `book.reveals` entry when present, else a note that
// they haven't shared. Notes are NEVER shown for co-members (reveals carry none).
function RevealGrid({ book, meId }) {
  const owners  = book.owners  || [];
  const reveals = book.reveals || [];
  // Co-members = everyone in owners who is NOT me.
  const others  = owners.filter((o) => o.user_id !== meId);
  const iMine   = !!book.mineBookId;

  if (!iMine && others.length === 0) return null;

  return (
    <div className="mt-3 pt-2.5 border-t border-purple-700/25">
      <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400/80 mb-1.5">
        Ratings &amp; progress
      </p>
      {/* min-w-0 + overflow-hidden on the grid container prevents Meter overflow */}
      <div
        className="grid items-center gap-x-2.5 gap-y-1 min-w-0 overflow-hidden"
        style={{ gridTemplateColumns: "minmax(52px,auto) auto auto 1fr" }}
      >
        {/* You — only when I own the title, sourced from my merged private state. */}
        {iMine && (
          <RevealRow
            name="You"
            overall={book.overall}
            smut={book.smut}
            progress={book.progress}
            read={book.read}
            formats={book.formats}
          />
        )}
        {others.map((owner) => {
          const name = `@${owner.username || "reader"}`;
          const r = reveals.find((x) => x.user_id === owner.user_id);
          if (r) {
            return (
              <RevealRow
                key={owner.user_id}
                name={name}
                overall={r.overall}
                smut={r.smut}
                progress={r.progress}
                read={r.read}
                formats={book.formats}
              />
            );
          }
          return (
            <Fragment key={owner.user_id}>
              <span className="text-[13px] italic text-purple-300/80 truncate">
                {name}
              </span>
              <span className="col-start-2 col-end-5 text-[12px] italic text-purple-400/60">
                hasn&rsquo;t shared their marks
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── detail panel ──────────────────────────────────────────── */

// Branches on whether `book` is a UnionBook (has `owners`) or a personal book
// (has `id`). The personal path is unchanged. The archive path shows WhoHasIt +
// RevealGrid, my private marks with a "Hide from shared archives" toggle (when I
// own the title), or a read-only view with "Add to my library" (when I don't).
//
// Props added in Task 3:
//   `me`        — session.user.id for archive branch ownership checks
//   `setHidden` — toggles hidden_from_archives on my book row
//   `onOpenAdd` — opens AddBookModal prefilled from the UnionBook
function DetailPanel({ book, onClose, onUpdate, onRemove, session, archives = [], me, setHidden, onOpenAdd }) {
  const isUnion = !!book.owners;
  const isMine  = isUnion ? !!book.mineBookId : true; // personal books are always mine

  // "Hide from shared archives" local toggle state — initialised from my merged
  // copy of the book's hidden flag. Tracks the optimistic value during the write.
  const [hiddenLocal, setHiddenLocal] = useState(!!book.hidden);
  useEffect(() => { setHiddenLocal(!!book.hidden); }, [book.hidden]);

  const toggleHidden = () => {
    const next = !hiddenLocal;
    setHiddenLocal(next);
    if (setHidden && book.mineBookId) setHidden(book.mineBookId, next);
  };

  // Header is shared between both variants.
  const header = (
    <div className="flex items-start justify-between mb-4 gap-3">
      <div>
        <h2 className="ht-display text-2xl text-pink-100 leading-tight">{book.title}</h2>
        <p className="text-[15px] text-purple-300/80 mt-0.5 italic">
          {book.author} {book.year ? `· ${book.year}` : ""}
        </p>
        <GenreChips genres={book.genres} max={4} className="mt-1.5" />
      </div>
      <button onClick={onClose} className="text-purple-300 hover:text-pink-300 text-xl px-2 flex-shrink-0" aria-label="Close">✕</button>
    </div>
  );

  // ── Archive variant ──────────────────────────────────────────────────────────
  if (isUnion) {
    return (
      <Overlay onClose={onClose} label={book.title} wide>
        {header}

        <div className="flex flex-col sm:flex-row gap-5">
          {/* Left column: cover + social view */}
          <div className="sm:w-52 flex-shrink-0 space-y-3">
            <div className="aspect-[2/3] rounded-sm overflow-hidden bg-purple-950/60 flex items-center justify-center">
              <CoverImage
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                className="w-full h-full object-cover"
                fallback={<span className="ht-display text-purple-400/60 text-xs px-2 text-center">{book.title}</span>}
              />
            </div>

            {/* WhoHasIt — owners list */}
            <WhoHasIt owners={book.owners} meId={me} />

            {/* Add to my library — only when this title is NOT mine yet */}
            {!isMine && (
              <button
                onClick={() => onOpenAdd({ title: book.title, author: book.author, coverUrl: book.coverUrl, genres: book.genres })}
                className="ht-display w-full py-2 rounded-sm border border-pink-400/50 bg-pink-500/15 hover:bg-pink-500/25 text-pink-200 text-[10px] uppercase tracking-wide transition-colors"
              >
                + Add to my library
              </button>
            )}
          </div>

          {/* Right column: my marks (if I own it) + RevealGrid */}
          <div className="flex-1 min-w-0 space-y-3">
            {isMine ? (
              <>
                {/* My private marks — identical to the personal panel */}
                <div className="ht-card rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="ht-display text-xs uppercase text-purple-200 font-semibold">Verdict ⚔</span>
                    <Meter value={book.overall} onChange={(v) => onUpdate({ overall: v })} Icon={Sword} label="Verdict" />
                  </div>
                  <div className="ht-rule" aria-hidden="true" />
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="ht-display text-xs uppercase text-pink-200 font-semibold">Smoulder 🕯️</span>
                    <Meter value={book.smut} onChange={(v) => onUpdate({ smut: v })} Icon={Candle} label="Smoulder" />
                  </div>
                  <p className="text-sm text-purple-400/60 italic">
                    Your private marks — only you see these unless you share.
                  </p>
                </div>

                <ProgressEditor book={book} onUpdate={onUpdate} />

                {/* Formats I have — editing my editions refreshes the union. */}
                <div className="ht-card rounded-md p-4">
                  <FormatToggles book={book} onUpdate={onUpdate} />
                </div>

                {/* Hide from shared archives toggle */}
                <div className="rounded-sm border border-purple-700/40 bg-purple-950/40 p-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hiddenLocal}
                    onClick={toggleHidden}
                    className="flex items-center gap-2.5 w-full text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-sm border transition-colors ${
                        hiddenLocal ? "bg-pink-600/70 border-pink-400/70" : "bg-purple-900/70 border-purple-700/60"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-sm bg-purple-50 transition-transform ${hiddenLocal ? "translate-x-4" : "translate-x-0.5"}`} />
                    </span>
                    <span className="ht-display text-[10px] uppercase tracking-wide text-purple-100">
                      Hide from shared archives
                    </span>
                  </button>
                  <p className="mt-1 text-[11px] text-purple-400/60 italic pl-[2.375rem]">
                    When hidden, co-members cannot see this tome in the archive union.
                  </p>
                </div>
              </>
            ) : (
              /* Not my title — read-only notice */
              <div className="ht-card rounded-md p-4">
                <p className="text-[13px] text-purple-300/70 italic">
                  This tome belongs to another keeper. Add it to your own library to inscribe marks and marginalia.
                </p>
              </div>
            )}

            {/* RevealGrid — always shown (You row only if I own the title) */}
            <RevealGrid book={book} meId={me} />
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Personal variant (unchanged) ─────────────────────────────────────────────
  return (
    <Overlay onClose={onClose} label={book.title} wide>
      {header}

      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:w-52 flex-shrink-0">
          <CoverEditor book={book} onUpdate={onUpdate} session={session} />
          <div className="mt-3 flex flex-col gap-1.5">
            <ToggleRow
              label={book.shelf === "owned" ? "On the Owned shelf" : "On the Wishlist"}
              action={book.shelf === "owned" ? "Move to Wishlist" : "Mark as Owned"}
              onClick={() => onUpdate({ shelf: book.shelf === "owned" ? "wishlist" : "owned" })}
            />
            <ToggleRow
              label={book.read ? "Read ✓" : "Not yet read"}
              action={book.read ? "Mark Unread" : "Mark as Read"}
              onClick={() => onUpdate({ read: !book.read })}
            />
            <button onClick={onRemove} className="mt-1 text-sm text-purple-400/60 hover:text-pink-300 underline underline-offset-2 italic">
              Banish from the archive
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="ht-card rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-purple-200 font-semibold">Verdict ⚔</span>
              <Meter value={book.overall} onChange={(v) => onUpdate({ overall: v })} Icon={Sword} label="Verdict" />
            </div>
            <div className="ht-rule" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-pink-200 font-semibold">Smoulder 🕯️</span>
              <Meter value={book.smut} onChange={(v) => onUpdate({ smut: v })} Icon={Candle} label="Smoulder" />
            </div>
            <p className="text-sm text-purple-400/60 italic">
              One sword: barely worth its steel. Five: a masterwork. One candle: a faint flicker. Five: do not read in the chapel.
            </p>
          </div>

          <ProgressEditor book={book} onUpdate={onUpdate} />

          {/* Formats I have — same right-column placement (after progress) as the
              archive detail, so editing formats feels identical in both contexts. */}
          <div className="ht-card rounded-md p-4 mt-4">
            <FormatToggles book={book} onUpdate={onUpdate} />
          </div>

          <NotesSection book={book} onUpdate={onUpdate} />
        </div>
      </div>
    </Overlay>
  );
}

// Per-format ownership selector for the detail panel. Print/Ebook/Audio chips
// in the sanctioned per-format accents (violet print · indigo ebook · cyan audio).
// A tome must keep at least one format (reading progress is keyed by format), so
// the last remaining chip can't be switched off.
const FORMAT_OPTIONS = [
  { fmt: "print", label: "Print", on: "bg-violet-600/40 border-violet-400/60 text-violet-100" },
  { fmt: "ebook", label: "Ebook", on: "bg-indigo-600/40 border-indigo-400/60 text-indigo-100" },
  { fmt: "audio", label: "Audio", on: "bg-cyan-600/30 border-cyan-400/60 text-cyan-200" },
];
function FormatToggles({ book, onUpdate }) {
  const fmts = (book.formats && book.formats.length) ? book.formats : ["print"];
  const toggle = (fmt) => {
    const has = fmts.includes(fmt);
    if (has && fmts.length === 1) return; // keep at least one format
    onUpdate({ formats: has ? fmts.filter((f) => f !== fmt) : [...fmts, fmt] });
  };
  return (
    <div>
      <p className="ht-display text-[9px] uppercase tracking-widest text-purple-400/80 mb-1.5">
        Formats I have
      </p>
      <div className="flex gap-1.5">
        {FORMAT_OPTIONS.map((o) => {
          const on = fmts.includes(o.fmt);
          const isLast = on && fmts.length === 1;
          return (
            <button
              key={o.fmt}
              type="button"
              onClick={() => toggle(o.fmt)}
              aria-pressed={on}
              disabled={isLast}
              title={isLast ? "A tome must keep at least one format" : undefined}
              className={`ht-display flex-1 text-[10px] uppercase tracking-wide px-2 py-1.5 rounded-sm border transition-colors ${
                on ? o.on : "bg-purple-950/50 border-purple-700/50 text-purple-400/60 hover:text-purple-200 hover:border-purple-600/60"
              } ${isLast ? "cursor-default" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({ label, action, onClick }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-purple-300/80 italic min-w-0 truncate">{label}</span>
      <button onClick={onClick} className="ht-display text-[10px] uppercase px-2 py-1 rounded-sm bg-purple-800/50 hover:bg-purple-700/70 text-purple-100 whitespace-nowrap flex-shrink-0">
        {action}
      </button>
    </div>
  );
}

/* ── marginalia & voice ────────────────────────────────────── */

function NotesSection({ book, onUpdate }) {
  const isAudio = (book.formats || []).includes("audio");
  const [page, setPage] = useState("");
  const [isQuote, setIsQuote] = useState(false);
  const [isTime, setIsTime] = useState(isAudio); // audiobooks default to a timestamp ref
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recRef = useRef(null);
  const wasVoiceRef = useRef(false);

  const speechSupported =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => recRef.current?.stop?.(), []);

  const toggleRecording = () => {
    setVoiceError("");
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Voice transcription needs Chrome or Edge with mic access. You can still write your note.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalSoFar = text ? text + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalSoFar += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setText((finalSoFar + interim).trim());
      wasVoiceRef.current = true;
    };
    rec.onerror = (e) => {
      setRecording(false);
      if (e.error === "not-allowed") setVoiceError("Mic permission was blocked. Allow microphone access and try again.");
      else setVoiceError("Voice capture hit a snag. You can still write your note.");
    };
    rec.onend = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const addNote = () => {
    if (!text.trim()) return;
    const note = {
      id: crypto.randomUUID(),
      page: page.trim(),
      isQuote,
      isTime: isAudio && isTime,
      text: text.trim(),
      isVoice: wasVoiceRef.current,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    onUpdate({ notes: [note, ...book.notes] });
    setPage("");
    setText("");
    setIsQuote(false);
    setIsTime(isAudio);
    wasVoiceRef.current = false;
  };

  const deleteNote = (id) => onUpdate({ notes: book.notes.filter((n) => n.id !== id) });

  return (
    <div className="mt-4">
      <h3 className="ht-display text-lg text-purple-100 mb-2">Marginalia & Quotes</h3>

      <div className="ht-card rounded-md p-3 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          {isAudio && (
            <div className="flex rounded-sm overflow-hidden border border-purple-700/50">
              <button type="button" onClick={() => setIsTime(false)}
                className={`ht-display text-[9px] uppercase px-2 py-1.5 transition-colors ${!isTime ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}>
                Page
              </button>
              <button type="button" onClick={() => setIsTime(true)}
                className={`ht-display text-[9px] uppercase px-2 py-1.5 transition-colors ${isTime ? "bg-cyan-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}>
                🎧 Time
              </button>
            </div>
          )}
          <input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder={isAudio && isTime ? "3:45:12" : "Page"}
            className={`w-24 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2.5 py-1.5 text-[15px] placeholder-purple-400/50 focus:outline-none ${isAudio && isTime ? "focus:border-cyan-400" : "focus:border-pink-400"}`}
            aria-label={isAudio && isTime ? "Timestamp" : "Page"}
          />
          <label className="flex items-center gap-1.5 text-sm text-purple-300 cursor-pointer select-none italic">
            <input type="checkbox" checked={isQuote} onChange={(e) => setIsQuote(e.target.checked)} className="accent-pink-500" />
            This is a quote
          </label>
          <button
            onClick={toggleRecording}
            className={`ht-display ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-semibold uppercase transition-colors ${
              recording ? "ht-recording bg-pink-500 text-white" : "bg-purple-800/60 hover:bg-purple-700 text-purple-100"
            }`}
            aria-pressed={recording}
          >
            <MicIcon /> {recording ? "Listening… tap to stop" : "Speak a note"}
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); }}
          placeholder={isQuote ? "“Write or speak the quote…”" : "Write or speak your thoughts…"}
          rows={3}
          className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400 resize-y"
        />
        {voiceError && <p className="text-sm text-pink-300">{voiceError}</p>}
        {!speechSupported && !voiceError && (
          <p className="text-sm text-purple-400/60 italic">Voice transcription works best in Chrome with mic access allowed.</p>
        )}
        <button
          onClick={addNote}
          disabled={!text.trim()}
          className="ht-display px-4 py-1.5 rounded-sm bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-xs font-semibold uppercase"
        >
          Inscribe note
        </button>
      </div>

      <div className="mt-3 space-y-2.5">
        {book.notes.length === 0 && (
          <p className="text-[15px] text-purple-400/60 italic">The margins are blank — every great annotation begins with one stray thought.</p>
        )}
        {book.notes.map((n) => (
          <div key={n.id} className="bg-purple-950/40 border border-purple-800/40 rounded-sm p-3">
            <div className="flex items-center gap-2 text-sm text-purple-400/70 mb-1 flex-wrap">
              {n.page && (
                n.isTime
                  ? <span className="ht-display text-[10px] uppercase px-2 py-0.5 rounded-sm bg-cyan-500/20 text-cyan-200">🎧 {n.page}</span>
                  : <span className="ht-display text-[10px] uppercase px-2 py-0.5 rounded-sm bg-purple-800/50 text-purple-200">p. {n.page}</span>
              )}
              {n.isVoice && <span className="flex items-center gap-1 text-pink-300/80 text-xs"><MicIcon size={12} /> voice</span>}
              <span className="text-xs">{n.date}</span>
              <button onClick={() => deleteNote(n.id)} className="ml-auto text-xs hover:text-pink-300 underline underline-offset-2">
                strike out
              </button>
            </div>
            {n.isQuote ? (
              <p className="ht-quote pl-3 text-purple-100 text-base">“{n.text}”</p>
            ) : (
              <p className="text-[15px] text-purple-200">{n.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── overlay shell ─────────────────────────────────────────── */

function Overlay({ children, onClose, label, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-label={label}
      aria-modal="true"
    >
      <div className={`ht-bg !min-h-0 w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92dvh] overflow-y-auto overscroll-y-contain rounded-t-md sm:rounded-md border border-purple-700/40 p-5 ht-body text-purple-100`}>
        {children}
      </div>
    </div>
  );
}
