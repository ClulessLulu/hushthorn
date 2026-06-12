import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";

/* ───────────────────────── Hushthorn ─────────────────────────
   Gothic century book archive · demo build
   Shelves: Owned / Wishlist · Read / Unread
   Dual ratings: Verdict (swords) + Spicy (chili peppers)
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
`;

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

function Chili({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {/* stem */}
      <path d="M12.5 6 C 12.2 4.6, 13 3.2, 15 2.8"
        stroke={filled ? "#86efac" : "#4b3a63"} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* pepper body, curved crescent */}
      <path d="M12.5 6 C 8 6.5, 5.8 10, 6.8 14 C 7.8 18, 11.5 21.3, 16.8 19.6 C 17.9 19.2, 18 18, 17 17.6 C 13.2 16.2, 11 13.2, 10.8 9.6 C 10.7 8.1, 11.3 6.8, 12.5 6 Z"
        fill={filled ? "#fb7185" : "transparent"}
        stroke={filled ? "#fda4af" : "#5b4a78"} strokeWidth="1.4" strokeLinejoin="round" />
      {/* sheen */}
      {filled && <path d="M9 9.5 C 8.6 11.5, 9.2 13.6, 10.5 15.4" stroke="#fecdd3" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />}
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

/* ── spines ────────────────────────────────────────────────── */

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
  return `hsl(${hashStr(book.title) % 360} 35% 24%)`;
}

// Average the cover's pixels, darkened to library light.
const spineColorCache = new Map();
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

function useSpineColor(book) {
  const key = book.coverUrl || "";
  const [color, setColor] = useState(() => spineColorCache.get(key) || genreFallbackColor(book));
  useEffect(() => {
    let cancelled = false;
    if (!key) { setColor(genreFallbackColor(book)); return; }
    if (spineColorCache.has(key)) { setColor(spineColorCache.get(key)); return; }
    (async () => {
      try {
        let dataUrl = key.startsWith("data:") ? key : coverCache.get(key);
        if (!dataUrl) {
          const r = await fetch(key);
          if (!r.ok) throw new Error("cover fetch failed");
          const blob = await r.blob();
          dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          coverCache.set(key, dataUrl);
        }
        const c = await sampleCoverColor(dataUrl);
        spineColorCache.set(key, c);
        if (!cancelled) setColor(c);
      } catch { /* keep the genre fallback */ }
    })();
    return () => { cancelled = true; };
  }, [key]);
  return color;
}

function matchesQuery(b, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    b.title.toLowerCase().includes(s) ||
    b.author.toLowerCase().includes(s) ||
    (b.genres || []).some((g) => g.toLowerCase().includes(s))
  );
}

function Spine({ book, onOpen, dimmed }) {
  const color = useSpineColor(book);
  const h = 122 + (hashStr(book.title) % 48);
  const w = 17 + (hashStr(book.author + book.title) % 12);
  const wish = book.shelf === "wishlist";
  const unread = !book.read && !wish;
  return (
    <button
      onClick={onOpen}
      title={`${book.title} — ${book.author}${(book.formats || []).includes("audio") ? ` · 🎧 ${book.audioListened || 0}h / ${book.audioHours || "?"}h` : ""}`}
      className={`relative flex flex-col items-center justify-between rounded-t-[3px] rounded-b-[2px] transition-all duration-200 hover:-translate-y-2 hover:-rotate-3 hover:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${
        dimmed ? "opacity-20" : wish ? "opacity-60" : ""
      } ${unread ? "-translate-y-1.5" : ""}`}
      style={{
        width: w,
        height: h,
        background: `linear-gradient(90deg, rgba(0,0,0,0.35), transparent 30%, transparent 70%, rgba(0,0,0,0.45)), ${color}`,
        boxShadow: "1px 0 2px rgba(0,0,0,0.6)",
        border: wish ? "1px dashed rgba(240,166,224,0.45)" : "none",
      }}
    >
      {/* verdict gem */}
      <span
        className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: book.overall >= 5 ? "#fbbf24" : book.overall > 0 ? "#a5b4fc" : "rgba(255,255,255,0.15)" }}
      />
      {/* audio ring */}
      {(book.formats || []).includes("audio") && (
        <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 border border-cyan-300/90 bg-transparent" />
      )}
      <span
        className="ht-display text-[8px] leading-none text-pink-50/85 overflow-hidden"
        style={{ writingMode: "vertical-rl", maxHeight: h - 44, letterSpacing: "0.06em" }}
      >
        {book.title.length > 24 ? book.title.slice(0, 23) + "…" : book.title}
      </span>
      {/* spice band */}
      <span
        className="w-full flex-shrink-0"
        style={{ height: 5, background: book.smut > 0 ? `rgba(244,114,182,${0.2 + book.smut * 0.16})` : "rgba(255,255,255,0.08)" }}
      />
    </button>
  );
}

function SpineShelf({ books, onOpen, query }) {
  const PER_SHELF = 14;
  if (books.length === 0) {
    return (
      <div className="text-center py-20 text-purple-300/60">
        <p className="ht-display text-xl">This bookcase stands empty.</p>
        <p className="mt-2 text-[15px] italic">Inscribe a tome to begin the collection.</p>
      </div>
    );
  }
  const readCount = books.filter((b) => b.read).length;
  const rows = [];
  for (let i = 0; i < books.length; i += PER_SHELF) rows.push(books.slice(i, i + PER_SHELF));
  return (
    <div className="max-w-3xl mx-auto">
      <p className="ht-display text-center text-[10px] uppercase tracking-widest text-purple-300/60 mb-4">
        {books.length} tome{books.length > 1 ? "s" : ""} · {readCount} read
      </p>
      {rows.map((row, ri) => (
        <div key={ri}>
          <div className="flex items-end gap-[5px] px-3 min-h-[178px] flex-wrap">
            {row.map((b) => (
              <Spine key={b.id} book={b} onOpen={() => onOpen(b.id)} dimmed={!!query && !matchesQuery(b, query)} />
            ))}
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
        Hover a spine to ease it from the shelf — tap to pull it out. Unread tomes sit proud of the row; wishlist spines are ghosts in dashed glass.
      </p>
    </div>
  );
}

/* demo-only: conjure a large sample library to test shelf density */
function makeConjuredBooks(count = 60) {
  const ADJ = ["Ash", "Velvet", "Thorn", "Ember", "Moon", "Shadow", "Crimson", "Silver", "Wicked", "Hollow", "Gilded", "Obsidian"];
  const NOUN = ["Crown", "Court", "Kiss", "Curse", "Blade", "Rose", "Throne", "Pact", "Vow", "Veil", "Heart", "Storm"];
  const FIRST = ["Lyra", "Maeve", "Selene", "Rowan", "Isolde", "Thea", "Bram", "Cassian", "Vesper", "Nyx"];
  const LAST = ["Blackwood", "Duskmoor", "Vale", "Ashcroft", "Nightingale", "Mor", "Hallow", "Wren", "Thorne", "Greymark"];
  const GENRES = ["Dark romantasy", "Vampires", "Fae", "Witches", "Gothic horror", "Dragons", "Dark academia", "Enemies to lovers"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const books = [];
  const seen = new Set();
  while (books.length < count) {
    const pattern = Math.floor(Math.random() * 3);
    const title =
      pattern === 0 ? `A ${pick(NOUN)} of ${pick(ADJ)} and ${pick(ADJ)}` :
      pattern === 1 ? `The ${pick(ADJ)} ${pick(NOUN)}` :
      `${pick(NOUN)} & ${pick(NOUN)}`;
    if (seen.has(title)) continue;
    seen.add(title);
    const read = Math.random() < 0.7;
    const hasAudio = Math.random() < 0.3;
    const audioHours = hasAudio ? Math.round((8 + Math.random() * 12) * 10) / 10 : undefined;
    books.push({
      id: `conj-${books.length}-${Date.now()}`,
      title,
      author: `${pick(FIRST)} ${pick(LAST)}`,
      year: null,
      coverUrl: "",
      genres: [pick(GENRES)],
      formats: hasAudio ? ["print", "audio"] : ["print"],
      audioHours,
      audioListened: hasAudio ? Math.round(Math.random() * audioHours * 10) / 10 : undefined,
      shelf: Math.random() < 0.85 ? "owned" : "wishlist",
      read,
      overall: read ? 1 + Math.floor(Math.random() * 5) : 0,
      smut: Math.floor(Math.random() * 6),
      notes: [],
    });
  }
  return books;
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

/* ── seed data ─────────────────────────────────────────────── */

const seedBooks = [
  {
    id: "seed-1",
    title: "A Court of Mist and Fury",
    author: "Sarah J. Maas",
    year: 2016,
    coverUrl: "https://covers.openlibrary.org/b/id/10110415-M.jpg",
    genres: ["Romantasy", "Fae", "Epic fantasy"],
    formats: ["print", "audio"],
    audioHours: 16,
    audioListened: 7.2,
    shelf: "owned",
    read: true,
    overall: 5,
    smut: 4,
    notes: [
      {
        id: "n1",
        page: "112",
        isQuote: true,
        text: "To the stars who listen — and the dreams that are answered.",
        isVoice: false,
        date: "Jun 2",
      },
    ],
  },
  {
    id: "seed-2",
    title: "The Serpent and the Wings of Night",
    author: "Carissa Broadbent",
    year: 2022,
    coverUrl: "https://covers.openlibrary.org/b/id/12907196-M.jpg",
    genres: ["Vampires", "Dark romantasy"],
    shelf: "wishlist",
    read: false,
    overall: 0,
    smut: 0,
    notes: [],
  },
];

/* ── main app ──────────────────────────────────────────────── */

export default function Hushthorn() {
  const [books, setBooks] = useState(seedBooks);
  const [shelfFilter, setShelfFilter] = useState("all");
  const [activeId, setActiveId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState("library"); // library | oracle | pair
  const [layout, setLayout] = useState("grid"); // grid | spines
  const [sortKey, setSortKey] = useState("recent");
  const [searchQuery, setSearchQuery] = useState("");

  const sortBooks = (list, key) => {
    const l = [...list];
    switch (key) {
      case "title": return l.sort((a, b) => a.title.localeCompare(b.title));
      case "author": return l.sort((a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title));
      case "verdict": return l.sort((a, b) => b.overall - a.overall);
      case "spicy": return l.sort((a, b) => b.smut - a.smut);
      default: return l; // recent: insertion order, newest first
    }
  };

  const hasConjured = books.some((b) => b.id.startsWith("conj-"));
  const conjureLibrary = () => setBooks((prev) => [...prev, ...makeConjuredBooks(60)]);
  const banishConjured = () => setBooks((prev) => prev.filter((b) => !b.id.startsWith("conj-")));

  // Smart-merge imported books with fingerprint dedupe; returns an import report.
  const importBooks = (items) => {
    const report = { booksAdded: 0, booksUpdated: 0, notesAdded: 0, notesMirrored: 0 };
    const updated = books.map((b) => ({ ...b, notes: [...b.notes] }));
    const byTitle = new Map(updated.map((b) => [b.title.toLowerCase(), b]));
    const additions = [];
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    let c = 0;
    for (const item of items) {
      const key = item.title.toLowerCase();
      const newNotes = (item.notes || []).map((n) => ({
        id: `imp-${Date.now()}-${c++}`,
        page: n.page || "",
        isQuote: !!n.isQuote,
        text: n.text,
        isVoice: false,
        source: "kindle",
        date: today,
      }));
      const existing = byTitle.get(key);
      if (existing) {
        const have = new Set(existing.notes.map((n) => noteFingerprint(n.text)));
        const fresh = newNotes.filter((n) => !have.has(noteFingerprint(n.text)));
        report.notesAdded += fresh.length;
        report.notesMirrored += newNotes.length - fresh.length;
        const willChange =
          fresh.length > 0 ||
          (!existing.read && !!item.read) ||
          (item.shelf === "owned" && existing.shelf !== "owned") ||
          (!existing.overall && item.overall);
        if (willChange) report.booksUpdated++;
        existing.notes = [...fresh, ...existing.notes];
        existing.read = existing.read || !!item.read;
        if (item.shelf === "owned") existing.shelf = "owned";
        if (!existing.overall && item.overall) existing.overall = item.overall;
        if ((!existing.genres || existing.genres.length === 0) && item.genres?.length) existing.genres = item.genres;
        if (!existing.coverUrl && item.coverUrl) existing.coverUrl = item.coverUrl;
      } else {
        report.booksAdded++;
        report.notesAdded += newNotes.length;
        additions.push({
          id: `b-${Date.now()}-${c++}`,
          title: item.title,
          author: item.author || "Unknown author",
          year: null,
          coverUrl: item.coverUrl || "",
          genres: item.genres || [],
          shelf: item.shelf || "owned",
          read: !!item.read,
          overall: item.overall || 0,
          smut: 0,
          notes: newNotes,
        });
      }
    }
    setBooks([...additions, ...updated]);
    return report;
  };

  const activeBook = books.find((b) => b.id === activeId) || null;

  const filtered = books.filter((b) => {
    if (shelfFilter === "all") return true;
    if (shelfFilter === "owned") return b.shelf === "owned";
    if (shelfFilter === "wishlist") return b.shelf === "wishlist";
    if (shelfFilter === "read") return b.read;
    if (shelfFilter === "unread") return !b.read;
    if (shelfFilter === "audio") return (b.formats || []).includes("audio");
    return true;
  });

  const updateBook = (id, patch) =>
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeBook = (id) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setActiveId(null);
  };

  const addBook = (book) => {
    setBooks((prev) => [{ ...book, id: `b-${Date.now()}` }, ...prev]);
    setAddOpen(false);
  };

  const shelfTabs = [
    { key: "all", label: "All" },
    { key: "owned", label: "Owned" },
    { key: "wishlist", label: "Wishlist" },
    { key: "read", label: "Read" },
    { key: "unread", label: "Unread" },
    { key: "audio", label: "🎧 Audio" },
  ];

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
      </header>

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
          + Inscribe a Tome
        </button>
      </nav>

      {/* library controls */}
      {view === "library" && (
        <div className="max-w-5xl mx-auto px-5 pb-5 flex flex-wrap items-center justify-center gap-2">
          <div className="flex rounded-sm overflow-hidden border border-purple-700/50">
            <button
              onClick={() => setLayout("grid")}
              className={`ht-display px-3 py-1.5 text-[10px] uppercase font-semibold transition-colors ${layout === "grid" ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
            >
              ▦ Covers
            </button>
            <button
              onClick={() => setLayout("spines")}
              className={`ht-display px-3 py-1.5 text-[10px] uppercase font-semibold transition-colors ${layout === "spines" ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
            >
              ▤ Spines
            </button>
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="ht-display bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1.5 text-[10px] uppercase text-purple-200 focus:outline-none focus:border-pink-400"
            aria-label="Sort the shelves"
          >
            <option value="recent">Recently inscribed</option>
            <option value="author">By author</option>
            <option value="title">By title</option>
            <option value="verdict">By verdict</option>
            <option value="spicy">By spice</option>
          </select>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search the shelves…"
            className="bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400 w-44"
          />
          {layout === "spines" && (
            <button
              onClick={hasConjured ? banishConjured : conjureLibrary}
              className="ht-display px-3 py-1.5 rounded-sm text-[10px] uppercase font-semibold bg-indigo-500/40 hover:bg-indigo-500/70 text-indigo-100 transition-colors"
            >
              {hasConjured ? "Banish the conjured" : "✨ Conjure 60 sample tomes"}
            </button>
          )}
        </div>
      )}

      {/* library grid / oracle */}
      <main className="max-w-5xl mx-auto px-5 pb-16">
        {view === "oracle" ? (
          <OracleSection books={books} onAddToWishlist={addBook} />
        ) : view === "pair" ? (
          <PairSection books={books} onImport={importBooks} />
        ) : layout === "spines" ? (
          <SpineShelf books={sortBooks(filtered, sortKey)} onOpen={setActiveId} query={searchQuery} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-purple-300/60">
            <p className="ht-display text-xl">This shelf lies bare.</p>
            <p className="mt-2 text-[15px] italic">Inscribe a tome to begin the collection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {sortBooks(filtered, sortKey).map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveId(b.id)}
                className={`ht-card rounded-md p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${searchQuery && !matchesQuery(b, searchQuery) ? "opacity-25" : ""}`}
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
                <div className="mt-1.5 flex flex-col gap-0.5">
                  <Meter value={b.overall} Icon={Sword} label="Verdict" readOnly size={13} />
                  <Meter value={b.smut} Icon={Chili} label="Spicy" readOnly size={13} />
                </div>
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${b.shelf === "owned" ? "bg-indigo-500/30 text-indigo-200" : "bg-pink-500/20 text-pink-200"}`}>
                    {b.shelf === "owned" ? "Owned" : "Wishlist"}
                  </span>
                  <span className={`ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm ${b.read ? "bg-purple-500/30 text-purple-200" : "bg-purple-900/60 text-purple-400"}`}>
                    {b.read ? "Read" : "Unread"}
                  </span>
                  {(b.formats || []).includes("audio") && (
                    <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-cyan-500/20 text-cyan-200">
                      🎧 {b.audioHours ? `${b.audioListened || 0}h / ${b.audioHours}h` : "Audio"}
                    </span>
                  )}
                  {b.notes.length > 0 && (
                    <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-purple-800/50 text-purple-300">
                      {b.notes.length} note{b.notes.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {addOpen && <AddBookModal onAdd={addBook} onClose={() => setAddOpen(false)} />}
      {activeBook && (
        <DetailPanel
          book={activeBook}
          onClose={() => setActiveId(null)}
          onUpdate={(patch) => updateBook(activeBook.id, patch)}
          onRemove={() => removeBook(activeBook.id)}
        />
      )}

      <footer className="text-center pb-8 text-sm text-purple-400/40 italic">
        Hushthorn · demo build · the archives are kept by Open Library
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

// Fingerprint a highlight for dedupe: normalize whitespace, case, and punctuation
// so the same passage from different sources (clippings, notebook export, re-import)
// converges to one note.
function noteFingerprint(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[“”"'‘’.,!?;:—–\-…()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse a Kindle Notebook export (HTML variant, from the Kindle app's share/export).
function parseNotebookHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = (doc.querySelector(".bookTitle")?.textContent || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  const author = (doc.querySelector(".authors")?.textContent || "").trim();
  const notes = [];
  for (const h of doc.querySelectorAll(".noteHeading")) {
    const meta = h.textContent.trim();
    const isHighlight = /^highlight/i.test(meta);
    const isNote = /^note/i.test(meta);
    if (!isHighlight && !isNote) continue;
    let textEl = h.nextElementSibling;
    while (textEl && !textEl.classList?.contains("noteText")) textEl = textEl.nextElementSibling;
    const text = (textEl?.textContent || "").trim();
    if (!text) continue;
    const pageM = meta.match(/page (\d+)/i);
    const locM = meta.match(/location ([\d,]+)/i);
    const page = pageM ? pageM[1] : locM ? `loc ${locM[1].replace(/,/g, "")}` : "";
    notes.push({ page, isQuote: isHighlight, text });
  }
  if (!title || notes.length === 0) return [];
  return [{ title, author: author || "Unknown author", read: true, shelf: "owned", overall: 0, notes }];
}

// Parse a Kindle Notebook export (CSV variant).
function parseNotebookCsv(csvText) {
  const { data } = Papa.parse(csvText.trim(), { skipEmptyLines: true });
  const headerIdx = data.findIndex((r) => /annotation type/i.test(r?.[0] || ""));
  if (headerIdx === -1) return [];
  const preamble = data.slice(0, headerIdx).map((r) => (r?.[0] || "").trim());
  const title = (preamble.find((s) => s && !/your kindle notes/i.test(s) && !/^by /i.test(s) && !/preview/i.test(s)) || "")
    .replace(/\s*\(.*?\)\s*$/, "").trim();
  const authorRow = preamble.find((s) => /^by /i.test(s));
  const author = authorRow ? authorRow.replace(/^by /i, "").trim() : "Unknown author";
  const notes = [];
  for (const r of data.slice(headerIdx + 1)) {
    const [type, loc, , text] = r;
    if (!type || !text) continue;
    const isHighlight = /highlight/i.test(type);
    const isNote = /note/i.test(type);
    if (!isHighlight && !isNote) continue;
    const pageM = (loc || "").match(/page (\d+)/i);
    const locM = (loc || "").match(/(\d+)/);
    notes.push({
      page: pageM ? pageM[1] : locM ? `loc ${locM[1]}` : "",
      isQuote: isHighlight,
      text: String(text).trim(),
    });
  }
  if (!title || notes.length === 0) return [];
  return [{ title, author, read: true, shelf: "owned", overall: 0, notes }];
}

// Dispatch on content: HTML vs CSV notebook export.
function parseNotebook(text) {
  return /<\s*(html|div|body)/i.test(text) ? parseNotebookHtml(text) : parseNotebookCsv(text);
}

function PairSection({ books, onImport }) {
  const [preview, setPreview] = useState(null); // { source, items: [{...book, include, existing}] }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const clipRef = useRef(null);
  const csvRef = useRef(null);
  const nbRef = useRef(null);

  const existingTitles = new Set(books.map((b) => b.title.toLowerCase()));

  const SOURCE_NAMES = {
    clippings: "My Clippings.txt",
    goodreads: "Goodreads export CSV",
    notebook: "Kindle notebook export (HTML or CSV)",
  };

  const readFile = (file, parser, source) => {
    setError("");
    setMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const items = parser(reader.result);
        if (items.length === 0) {
          setError(`No books could be read from that file. Make sure it's a ${SOURCE_NAMES[source]}.`);
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
    const report = onImport(enriched);
    const parts = [];
    if (report.booksAdded) parts.push(`${report.booksAdded} new tome${report.booksAdded > 1 ? "s" : ""} bound`);
    if (report.booksUpdated) parts.push(`${report.booksUpdated} updated`);
    if (report.notesAdded) parts.push(`${report.notesAdded} new highlight${report.notesAdded > 1 ? "s" : ""} inscribed`);
    if (report.notesMirrored) parts.push(`${report.notesMirrored} already mirrored`);
    setMessage(parts.length ? parts.join(" · ") : "Everything in that file was already mirrored — the archive is current.");
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

          <div className="ht-card rounded-md p-4 sm:col-span-2">
            <h3 className="ht-display text-sm uppercase text-purple-200 font-semibold">Notebook export — one book at a time</h3>
            <p className="mt-2 text-sm text-purple-300/80">
              From the Kindle app, open a book's notebook and choose <span className="text-purple-100">Export</span> — it produces an HTML or CSV file of that book's highlights and notes. Re-importing is safe: highlights already in the archive are recognized and skipped.
            </p>
            <button
              onClick={() => nbRef.current?.click()}
              className="ht-display mt-3 w-full py-2 rounded-sm bg-purple-600/70 hover:bg-purple-500 text-white text-xs font-semibold uppercase"
            >
              Upload Notebook export (.html / .csv)
            </button>
            <input ref={nbRef} type="file" accept=".html,.htm,.csv,text/html,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, parseNotebook, "notebook"); e.target.value = ""; }} />
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

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
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
          The Oracle reads your shelves — what you own, what you covet, what you rated worthy of swords and peppers — and divines what you should read next.
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
                    <span className="ht-display text-[9px] uppercase text-pink-300/80">Spicy</span>
                    <Meter value={Math.max(0, Math.min(5, r.spice || 0))} Icon={Chili} label="Predicted spice" readOnly size={13} />
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
          The Oracle estimates each pepper rating — your own judgment, as always, is final.
        </p>
      )}
    </div>
  );
}

/* ── add book modal ────────────────────────────────────────── */

function AddBookModal({ onAdd, onClose }) {
  const [mode, setMode] = useState("search"); // search | photo
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState({ title: "", author: "", coverUrl: "", genres: [] });
  const [genreInput, setGenreInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [genreLoading, setGenreLoading] = useState(false);
  const fileRef = useRef(null);
  // live scan
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,subject`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.docs || []);
      if (!data.docs || data.docs.length === 0) setError("No tomes found. Try a different title or author.");
    } catch {
      setError("The archives are unreachable. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pick = (doc, shelf) => {
    onAdd({
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown author",
      year: doc.first_publish_year || null,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : "",
      genres: cleanGenres(doc.subject),
      shelf,
      read: false,
      overall: 0,
      smut: 0,
      notes: [],
    });
  };

  // Ask Claude for the book's author + genres from the title; also fetch a cover if missing.
  const divineDetails = async (title, author) => {
    if (!title.trim()) return;
    setGenreLoading(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `For the book titled "${title.trim()}"${author?.trim() ? ` by ${author.trim()}` : ""}: identify the author (if you recognize the book) and its genres. If you don't recognize it, set author to null and infer plausible genres from the title. Respond with ONLY a valid JSON object, nothing else: {"author": string or null, "genres": array of 2 to 4 short genre strings}.`,
          }],
        }),
      });
      const data = await response.json();
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
      // best-effort cover from Open Library if none yet
      setManual((m) => {
        if (m.coverUrl) return m;
        fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title.trim())}&limit=1&fields=cover_i`)
          .then((r) => r.json())
          .then((d) => {
            const cover_i = d.docs?.[0]?.cover_i;
            if (cover_i) setManual((m2) => (m2.coverUrl ? m2 : { ...m2, coverUrl: `https://covers.openlibrary.org/b/id/${cover_i}-M.jpg` }));
          })
          .catch(() => {});
        return m;
      });
    } catch {
      /* quiet failure — the user can fill details by hand */
    } finally {
      setGenreLoading(false);
    }
  };

  // Ask Claude to read the cover photo and pull out title + author.
  const scanCover = async (dataUrl) => {
    setScanning(true);
    setScanNotice("");
    try {
      const [prefix, b64] = dataUrl.split(",");
      const mediaType = (prefix.match(/data:(.*?);/) || [])[1] || "image/jpeg";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: 'This is a photo of a book cover. Read the text on it and respond with ONLY a valid JSON object, nothing else: {"title": string or null, "author": string or null}. Use null for anything you cannot read confidently.' },
            ],
          }],
        }),
      });
      const data = await response.json();
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
    const reader = new FileReader();
    reader.onload = () => {
      setManual((m) => ({ ...m, coverUrl: reader.result }));
      scanCover(reader.result);
    };
    reader.readAsDataURL(file);
  };

  /* ── live scanning ── */

  const stopCamera = () => {
    clearInterval(scanLoopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveActive(false);
  };

  useEffect(() => () => stopCamera(), []); // cleanup on close
  useEffect(() => { if (mode !== "live") stopCamera(); }, [mode]);

  const startCamera = async () => {
    setLiveStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLiveActive(true);
      startBarcodeLoop();
    } catch {
      setLiveStatus("The camera couldn't be opened — embedded demos often block camera access, and it needs permission. Use \"Add with a photo\" instead; in the mobile app this is the native camera.");
    }
  };

  const startBarcodeLoop = () => {
    if (!("BarcodeDetector" in window)) {
      setLiveStatus("Live barcode reading isn't supported in this browser — point at the cover and tap Capture instead.");
      return;
    }
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ["ean_13"] });
    } catch {
      setLiveStatus("Live barcode reading isn't supported here — point at the cover and tap Capture instead.");
      return;
    }
    setLiveStatus("Watching for a barcode… or point at the cover and tap Capture.");
    scanLoopRef.current = setInterval(async () => {
      try {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const codes = await detector.detect(videoRef.current);
        const isbn = codes.map((c) => c.rawValue).find((v) => /^97[89]\d{10}$/.test(v));
        if (isbn) {
          clearInterval(scanLoopRef.current);
          lookupIsbn(isbn);
        }
      } catch { /* keep watching */ }
    }, 600);
  };

  const lookupIsbn = async (isbn) => {
    setLiveStatus(`Found ISBN ${isbn} — consulting the archives…`);
    stopCamera();
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=isbn:${isbn}&limit=1&fields=title,author_name,cover_i,subject`
      );
      const d = await res.json();
      const doc = d.docs?.[0];
      if (doc?.title) {
        const genres = cleanGenres(doc.subject);
        setManual((m) => ({
          ...m,
          title: doc.title,
          author: doc.author_name?.[0] || m.author,
          coverUrl: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
          genres: genres.length ? genres : m.genres,
        }));
        setMode("photo");
        setScanNotice("Matched from the barcode — confirm the details, then inscribe.");
        if (genres.length === 0) divineDetails(doc.title, doc.author_name?.[0] || "");
      } else {
        setLiveStatus("That barcode wasn't in the archives. Try capturing the cover instead.");
        startCamera();
      }
    } catch {
      setLiveStatus("The archives are unreachable. Check your connection and try again.");
    }
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
    setManual((m) => ({ ...m, coverUrl: dataUrl }));
    setMode("photo");
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

  const addManual = (shelf) => {
    if (!manual.title.trim()) return;
    onAdd({
      title: manual.title.trim(),
      author: manual.author.trim() || "Unknown author",
      year: null,
      coverUrl: manual.coverUrl,
      genres: manual.genres.slice(0, 6),
      shelf,
      read: false,
      overall: 0,
      smut: 0,
      notes: [],
    });
  };

  return (
    <Overlay onClose={onClose} label="Inscribe a tome">
      <div className="flex items-center justify-between mb-4">
        <h2 className="ht-display text-xl text-pink-200">Inscribe a Tome</h2>
        <button onClick={onClose} className="text-purple-300 hover:text-pink-300 text-xl px-2" aria-label="Close">✕</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <ModeTab active={mode === "search"} onClick={() => setMode("search")}>Search the archives</ModeTab>
        <ModeTab active={mode === "photo"} onClick={() => setMode("photo")}>Add with a photo</ModeTab>
        <ModeTab active={mode === "live"} onClick={() => setMode("live")}>Live scan</ModeTab>
      </div>

      {mode === "search" ? (
        <>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Title or author…"
              className="flex-1 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
            />
            <button onClick={search} className="ht-display px-4 py-2 rounded-sm bg-pink-500 hover:bg-pink-400 text-white text-xs font-semibold uppercase">
              Search
            </button>
          </div>

          {loading && <p className="mt-4 text-[15px] text-purple-300/70 italic">Consulting the archives…</p>}
          {error && <p className="mt-4 text-[15px] text-pink-300">{error}</p>}

          <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-1">
            {results.map((doc) => (
              <div key={doc.key} className="flex gap-3 items-center bg-purple-950/40 rounded-sm p-2.5 border border-purple-800/40">
                <div className="w-10 h-14 rounded-sm overflow-hidden bg-purple-900/60 flex-shrink-0 flex items-center justify-center">
                  <CoverImage
                    src={doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : ""}
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
      ) : mode === "photo" ? (
        <div className="space-y-3">
          <p className="text-sm text-purple-300/70 italic">
            Upload a likeness of the cover and the scribe will read the title and author for you. Anything it can't make out, you can inscribe by hand.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-[3/2] rounded-sm border-2 border-dashed border-purple-600/50 hover:border-pink-400/70 flex items-center justify-center overflow-hidden bg-purple-950/40"
          >
            <CoverImage
              src={manual.coverUrl}
              alt="Uploaded cover"
              className="h-full object-contain"
              fallback={<span className="text-[15px] text-purple-300/70">📷 Tap to upload a cover photo</span>}
            />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          {scanning && <p className="text-sm text-purple-300/70 italic">The scribe is reading the cover…</p>}
          {scanNotice && !scanning && <p className="text-sm text-pink-200/90 italic">{scanNotice}</p>}
          <input
            value={manual.title}
            onChange={(e) => setManual({ ...manual, title: e.target.value })}
            placeholder="Title"
            className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
          />
          <input
            value={manual.author}
            onChange={(e) => setManual({ ...manual, author: e.target.value })}
            placeholder="Author"
            className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
          />

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
          <p className="text-sm text-purple-300/70 italic">
            Point the camera at the barcode for an instant match from the archives — or at the cover, then Capture, and the scribe will read it.
          </p>
          <div className="relative w-full aspect-[3/2] rounded-sm overflow-hidden bg-purple-950/60 border border-purple-700/40 flex items-center justify-center">
            <video ref={videoRef} playsInline muted className={`w-full h-full object-cover ${liveActive ? "" : "hidden"}`} />
            {!liveActive && <span className="text-[15px] text-purple-300/70">📷 Camera preview</span>}
            {liveActive && (
              <div className="absolute inset-x-8 top-1/2 h-px bg-pink-400/80 shadow-[0_0_8px_rgba(244,114,182,0.8)]" aria-hidden="true" />
            )}
          </div>
          {liveStatus && <p className="text-sm text-pink-200/90 italic">{liveStatus}</p>}
          <div className="flex gap-2">
            {!liveActive ? (
              <button onClick={startCamera} className="ht-display flex-1 py-2 rounded-sm bg-indigo-500/70 hover:bg-indigo-500 text-white text-xs font-semibold uppercase">
                Open the camera
              </button>
            ) : (
              <>
                <button onClick={captureCover} className="ht-display flex-1 py-2 rounded-sm bg-pink-500/80 hover:bg-pink-400 text-white text-xs font-semibold uppercase">
                  📸 Capture cover
                </button>
                <button onClick={stopCamera} className="ht-display px-4 py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase">
                  Stop
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-purple-400/60 italic">
            Barcode matches use the book's ISBN against Open Library. In the mobile app this is the native camera with instant scanning.
          </p>
        </div>
      )}
    </Overlay>
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

/* ── detail panel ──────────────────────────────────────────── */

function DetailPanel({ book, onClose, onUpdate, onRemove }) {
  return (
    <Overlay onClose={onClose} label={book.title} wide>
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

      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:w-36 flex-shrink-0">
          <div className="aspect-[2/3] rounded-sm overflow-hidden bg-purple-950/60 flex items-center justify-center">
            <CoverImage
              src={book.coverUrl}
              alt={`Cover of ${book.title}`}
              className="w-full h-full object-cover"
              fallback={<span className="ht-display text-purple-400/60 text-xs px-2 text-center">{book.title}</span>}
            />
          </div>
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
            <ToggleRow
              label={(book.formats || []).includes("audio") ? "Audiobook 🎧" : "No audio copy"}
              action={(book.formats || []).includes("audio") ? "Remove audio" : "I have the audio"}
              onClick={() => {
                const fmts = book.formats || ["print"];
                onUpdate({
                  formats: fmts.includes("audio") ? fmts.filter((f) => f !== "audio") : [...fmts, "audio"],
                });
              }}
            />
            <button onClick={onRemove} className="mt-1 text-sm text-purple-400/60 hover:text-pink-300 underline underline-offset-2 italic">
              Banish from the archive
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="ht-card rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-indigo-200 font-semibold">Verdict ⚔</span>
              <Meter value={book.overall} onChange={(v) => onUpdate({ overall: v })} Icon={Sword} label="Verdict" />
            </div>
            <div className="ht-rule" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-pink-200 font-semibold">Spicy 🌶</span>
              <Meter value={book.smut} onChange={(v) => onUpdate({ smut: v })} Icon={Chili} label="Spicy" />
            </div>
            <p className="text-sm text-purple-400/60 italic">
              One sword: barely worth its steel. Five: a masterwork. One pepper: a longing glance. Five: do not read in the chapel.
            </p>
          </div>

          {(book.formats || []).includes("audio") && (
            <div className="ht-card rounded-md p-4 mt-4 space-y-2">
              <span className="ht-display text-xs uppercase text-cyan-200 font-semibold">Listening 🎧</span>
              <div className="flex items-center gap-2 flex-wrap text-sm text-purple-200">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={book.audioListened ?? ""}
                  onChange={(e) => onUpdate({ audioListened: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="0"
                  className="w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
                  aria-label="Hours listened"
                />
                <span className="text-purple-300/70">of</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={book.audioHours ?? ""}
                  onChange={(e) => onUpdate({ audioHours: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="?"
                  className="w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-cyan-400"
                  aria-label="Total hours"
                />
                <span className="text-purple-300/70">hours</span>
              </div>
              {book.audioHours > 0 && (
                <>
                  <div className="h-2 rounded-sm bg-purple-950/70 overflow-hidden border border-purple-800/40">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400/80 to-pink-400/80 transition-all"
                      style={{ width: `${Math.min(100, ((book.audioListened || 0) / book.audioHours) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-purple-400/70 italic">
                    {Math.round(Math.min(100, ((book.audioListened || 0) / book.audioHours) * 100))}% through the telling
                  </p>
                </>
              )}
            </div>
          )}

          <NotesSection book={book} onUpdate={onUpdate} />
        </div>
      </div>
    </Overlay>
  );
}

function ToggleRow({ label, action, onClick }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-purple-300/80 italic">{label}</span>
      <button onClick={onClick} className="ht-display text-[10px] uppercase px-2 py-1 rounded-sm bg-purple-800/50 hover:bg-purple-700/70 text-purple-100 whitespace-nowrap">
        {action}
      </button>
    </div>
  );
}

/* ── marginalia & voice ────────────────────────────────────── */

function NotesSection({ book, onUpdate }) {
  const [page, setPage] = useState("");
  const [refType, setRefType] = useState((book.formats || []).includes("audio") ? "time" : "page");
  const [isQuote, setIsQuote] = useState(false);
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
      id: `n-${Date.now()}`,
      page: page.trim(),
      isTime: refType === "time",
      isQuote,
      text: text.trim(),
      isVoice: wasVoiceRef.current,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    onUpdate({ notes: [note, ...book.notes] });
    setPage("");
    setText("");
    setIsQuote(false);
    wasVoiceRef.current = false;
  };

  const deleteNote = (id) => onUpdate({ notes: book.notes.filter((n) => n.id !== id) });

  return (
    <div className="mt-4">
      <h3 className="ht-display text-lg text-purple-100 mb-2">Marginalia & Quotes</h3>

      <div className="ht-card rounded-md p-3 space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-sm overflow-hidden border border-purple-700/50">
            <button
              type="button"
              onClick={() => setRefType("page")}
              className={`px-2 py-1.5 text-xs transition-colors ${refType === "page" ? "bg-purple-600/70 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
              aria-pressed={refType === "page"}
            >
              p.
            </button>
            <button
              type="button"
              onClick={() => setRefType("time")}
              className={`px-2 py-1.5 text-xs transition-colors ${refType === "time" ? "bg-cyan-600/60 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"}`}
              aria-pressed={refType === "time"}
            >
              🎧
            </button>
          </div>
          <input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder={refType === "time" ? "h:mm:ss" : "Page"}
            className="w-24 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2.5 py-1.5 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
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
                <span className={`ht-display text-[10px] uppercase px-2 py-0.5 rounded-sm ${n.isTime ? "bg-cyan-500/20 text-cyan-200" : "bg-purple-800/50 text-purple-200"}`}>
                  {n.isTime ? `🎧 ${n.page}` : `p. ${n.page}`}
                </span>
              )}
              {n.isVoice && <span className="flex items-center gap-1 text-pink-300/80 text-xs"><MicIcon size={12} /> voice</span>}
              {n.source === "kindle" && (
                <span className="ht-display text-[9px] uppercase px-1.5 py-0.5 rounded-sm bg-indigo-500/25 text-indigo-200">kindle</span>
              )}
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
      <div className={`ht-bg w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-md sm:rounded-md border border-purple-700/40 p-5 ht-body text-purple-100`}>
        {children}
      </div>
    </div>
  );
}
