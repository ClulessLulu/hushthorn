import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { supabase } from './lib/supabase';

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
    coverUrl: "https://covers.openlibrary.org/b/id/14333139-M.jpg",
    genres: ["Romantasy", "Fae", "Epic fantasy"],
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
    coverUrl: "https://covers.openlibrary.org/b/id/13451855-M.jpg",
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
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

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

  useEffect(() => {
    if (!session) { setBooks([]); setDataLoading(false); return; }
    setDataLoading(true);
    const uid = session.user.id;
    Promise.all([
      supabase.from('books').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('notes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('avatars').select('*').eq('user_id', uid).maybeSingle(),
    ]).then(([{ data: booksData, error: bErr }, { data: notesData, error: nErr }, { data: avatarData }]) => {
      if (bErr) console.error('books fetch:', bErr.message);
      if (nErr) console.error('notes fetch:', nErr.message);
      const notesByBook = {};
      for (const n of (notesData || [])) {
        if (!notesByBook[n.book_id]) notesByBook[n.book_id] = [];
        notesByBook[n.book_id].push({
          id: n.id, page: n.page, isQuote: n.is_quote,
          text: n.text, isVoice: n.is_voice, date: n.date,
        });
      }
      setBooks((booksData || []).map(b => ({
        id: b.id, title: b.title, author: b.author, year: b.year,
        coverUrl: b.cover_url, genres: b.genres || [], shelf: b.shelf,
        read: b.read, overall: b.overall, smut: b.smut,
        notes: notesByBook[b.id] || [],
      })));
      if (avatarData) setAvatar(avatarData);
    }).catch(err => console.error('data load:', err))
      .finally(() => setDataLoading(false));
  }, [session]);

  const [shelfFilter, setShelfFilter] = useState("all");
  const [activeId, setActiveId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState("library"); // library | oracle | pair

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
        }))
      );
    }
  };

  const activeBook = books.find((b) => b.id === activeId) || null;

  const filtered = books.filter((b) => {
    if (shelfFilter === "all") return true;
    if (shelfFilter === "owned") return b.shelf === "owned";
    if (shelfFilter === "wishlist") return b.shelf === "wishlist";
    if (shelfFilter === "read") return b.read;
    if (shelfFilter === "unread") return !b.read;
    return true;
  });

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
          date: added.date,
        });
        if (error) { console.error('note insert:', error.message); return; }
      }
      if (removed) {
        const { error } = await supabase.from('notes').delete().eq('id', removed.id);
        if (error) { console.error('note delete:', error.message); return; }
      }
    }
    // Handle book field changes
    const FIELD_MAP = { coverUrl: 'cover_url', overall: 'overall', smut: 'smut', shelf: 'shelf', read: 'read', genres: 'genres' };
    const dbPatch = Object.fromEntries(
      Object.entries(FIELD_MAP).filter(([k]) => k in patch).map(([k, v]) => [v, patch[k]])
    );
    if (Object.keys(dbPatch).length) {
      const { error } = await supabase.from('books').update(dbPatch).eq('id', id);
      if (error) { console.error('updateBook:', error.message); return; }
    }
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  const removeBook = async (id) => {
    const { error } = await supabase.from('books').delete().eq('id', id);
    if (error) { console.error('removeBook:', error.message); return; }
    setBooks(prev => prev.filter(b => b.id !== id));
    setActiveId(null);
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
    });
    if (error) { console.error('addBook:', error.message); return; }
    setBooks(prev => [{ ...book, id, notes: [] }, ...prev]);
    setAddOpen(false);
    if (book.shelf === 'owned') setActiveId(id);
  };

  const shelfTabs = [
    { key: "all", label: "All" },
    { key: "owned", label: "Owned" },
    { key: "wishlist", label: "Wishlist" },
    { key: "read", label: "Read" },
    { key: "unread", label: "Unread" },
  ];

  if (!authReady) return (
    <div className="ht-bg ht-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <p className="ht-display text-purple-300/60 text-sm uppercase tracking-widest">Opening the archive…</p>
    </div>
  );
  if (!session) return <AuthPage />;

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
          + Inscribe
        </button>
      </nav>

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-purple-300/60">
            <p className="ht-display text-xl">This shelf lies bare.</p>
            <p className="mt-2 text-[15px] italic">Inscribe a tome to begin the collection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => setActiveId(b.id)}
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
      {avatarOpen && (
        <AvatarPage
          avatar={avatar}
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
          model: "claude-sonnet-4-20250514",
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

/* ── avatar chip + page ────────────────────────────────────── */

function AvatarChip({ avatar, ownedCount, readCount, onClick }) {
  const emoji = { female: '🧝‍♀️', male: '🧝‍♂️', nonbinary: '🧝' }[avatar.gender] || '🧝';
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

function AvatarPage({ avatar, books, session, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...avatar });
  const [saving, setSaving] = useState(false);

  const owned       = books.filter(b => b.shelf === 'owned');
  const readCount   = books.filter(b => b.read).length;
  const wishlistCount = books.filter(b => b.shelf === 'wishlist').length;
  const ratedBooks  = books.filter(b => b.overall > 0);
  const avgRating   = ratedBooks.length
    ? Math.round(ratedBooks.reduce((s, b) => s + b.overall, 0) / ratedBooks.length)
    : 0;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('avatars').upsert({
      user_id:    session.user.id,
      name:       draft.name,
      gender:     draft.gender,
      hair_color: draft.hair_color,
      skin_tone:  draft.skin_tone,
      robe_color: draft.robe_color,
      updated_at: new Date().toISOString(),
    });
    if (!error) onSave(draft);
    setSaving(false);
  };

  const SwatchRow = ({ label, field, options }) => (
    <div className="flex items-center gap-3">
      <span className="ht-display text-[9px] uppercase tracking-widest text-purple-400 w-12 shrink-0">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(color => (
          <button key={color} onClick={() => setDraft(d => ({ ...d, [field]: color }))}
            aria-label={color}
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
        <input
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          className="bg-transparent border-b border-pink-400/40 focus:border-pink-400 focus:outline-none text-pink-200 ht-display text-sm text-center px-2 py-1 w-52"
        />
        <p className="text-[11px] text-purple-400/60 italic mt-1">click name to edit</p>
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
      </div>

      {/* stats */}
      <h3 className="ht-display text-xs uppercase tracking-widest text-purple-300/70 mb-2">Reading Chronicle</h3>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {[
          { n: owned.length,    label: 'tomes owned',    color: 'text-pink-200' },
          { n: readCount,       label: 'scrolls read',   color: 'text-purple-300' },
          { n: wishlistCount,   label: 'on the wishlist',color: 'text-indigo-300' },
          { n: avgRating || 0,  label: avgRating ? `avg · ${'⚔'.repeat(avgRating)}` : 'avg verdict', color: 'text-pink-200' },
        ].map(({ n, label, color }) => (
          <div key={label} className="ht-card rounded-md p-3">
            <div className={`ht-display text-2xl ${color}`}>{n}</div>
            <div className="text-xs text-purple-400/70 italic">{label}</div>
          </div>
        ))}
      </div>

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
        if (!data.session) {
          setError('Check your inbox to confirm your email before signing in.');
          return;
        }
      }
    } catch (err) {
      setError(err.message);
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
    <div className="ht-bg ht-body min-h-screen flex items-center justify-center p-4">
      <style>{FONT_CSS}</style>
      <div className="ht-frame" aria-hidden="true" />
      <div className="ht-card rounded-xl p-8 w-full max-w-sm text-center">
        <Crown size={52} />
        <h1 className="ht-blackletter ht-glow text-5xl text-transparent bg-clip-text bg-gradient-to-b from-pink-200 via-fuchsia-300 to-fuchsia-500 mt-1 mb-1">
          Hushthorn
        </h1>
        <p className="text-[13px] text-pink-200/60 italic mb-6">
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

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;

    const OL_FIELDS = "key,title,author_name,first_publish_year,cover_i,subject";
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
        out.push(doc);
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

  const pick = (doc, shelf) => {
    onAdd({
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown author",
      year: doc.first_publish_year || null,
      coverUrl: doc._coverUrl || (doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : ""),
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
      const data = await callClaude({
          model: "claude-sonnet-4-20250514",
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
      // best-effort cover from Google Books if none yet
      setManual((m) => {
        if (m.coverUrl) return m;
        fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title.trim())}&maxResults=1&printType=books`)
          .then((r) => r.json())
          .then((d) => {
            const thumbnail = d.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
            if (thumbnail) setManual((m2) => (m2.coverUrl ? m2 : { ...m2, coverUrl: thumbnail.replace("http://", "https://") }));
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

  useEffect(() => {
    const title = manual.title.trim();
    if (title.length < 3) return;
    const timer = setTimeout(() => divineDetails(title, manual.author), 700);
    return () => clearTimeout(timer);
  }, [manual.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask Claude to read the cover photo and pull out title + author.
  const scanCover = async (dataUrl) => {
    setScanning(true);
    setScanNotice("");
    try {
      const [prefix, b64] = dataUrl.split(",");
      const mediaType = (prefix.match(/data:(.*?);/) || [])[1] || "image/jpeg";
      const data = await callClaude({
          model: "claude-sonnet-4-20250514",
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
    <Overlay onClose={onClose} label="Inscribe">
      <div className="flex items-center justify-between mb-4">
        <h2 className="ht-display text-xl text-pink-200">Inscribe</h2>
        <button onClick={onClose} className="text-purple-300 hover:text-pink-300 text-xl px-2" aria-label="Close">✕</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <ModeTab active={mode === "search"} onClick={() => setMode("search")}>Scour the grimoire</ModeTab>
        <ModeTab active={mode === "photo"} onClick={() => setMode("photo")}>Add with a photo</ModeTab>
        <ModeTab active={mode === "live"} onClick={() => setMode("live")}>Live scan</ModeTab>
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
      id: crypto.randomUUID(),
      page: page.trim(),
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
          <input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="Page"
            className="w-20 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2.5 py-1.5 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
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
              {n.page && <span className="ht-display text-[10px] uppercase px-2 py-0.5 rounded-sm bg-purple-800/50 text-purple-200">p. {n.page}</span>}
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
      <div className={`ht-bg w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-md sm:rounded-md border border-purple-700/40 p-5 ht-body text-purple-100`}>
        {children}
      </div>
    </div>
  );
}
