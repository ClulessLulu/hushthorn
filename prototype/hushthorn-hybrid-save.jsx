import { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════ Hushthorn · Hybrid Save Model — DESIGN PROTOTYPE ═══════════
   STATUS: ✅ Approved design. This is the UX to build toward.
   PAIRS WITH: docs/HYBRID_SAVE_SPEC.md (full rules, edge cases, test cases)
   REPO PATH: prototype/hushthorn-hybrid-save.jsx

   TWO SAVE BEHAVIORS IN ONE PANEL:
   
   INSTANT (tap and done):
     • Verdict (swords)          • Smoulder (candles)
     • Read / Unread toggle      • Shelf (Owned ↔ Wishlist)
     • Format toggles (Print / Kindle / Audio)
   
   BUFFERED (edit freely → Save or Discard):
     • Title, Author, Genres     • Progress (page / % / hours)
     • Notes / Marginalia

   APPLIES TO: Detail panel (editing) AND Inscribe modal (adding).
   In the Inscribe modal, the "Inscribe to Owned/Wishlist" buttons ARE
   the save action — no separate save bar needed.

   WHAT'S MOCK vs. REAL HERE:
   - `saved` / `setSaved` simulate Supabase persistence. In the real app,
     instant saves call updateBook() → Supabase immediately; buffered saves
     collect dirty fields into one updateBook() call on "Save & Close."
   - The "saved" flash and save bar animations are production-ready CSS —
     port the @keyframes blocks directly into the FONT_CSS block.
═══════════════════════════════════════════════════════════════════ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rozha+One&family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');
.ht-display { font-family: 'Cinzel', serif; letter-spacing: 0.06em; }
.ht-body { font-family: 'EB Garamond', serif; }
.ht-bg {
  background-color: #0c0714;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.42), transparent 70%),
    radial-gradient(ellipse 35% 30% at 8% 96%, rgba(236,72,153,0.14), transparent 70%);
  min-height: 100vh;
}
.ht-card {
  background: linear-gradient(165deg, rgba(38,23,64,0.92), rgba(17,10,30,0.96));
  border: 1px solid rgba(217,131,222,0.20);
}
@keyframes ht-flash {
  0% { background: rgba(168,139,250,0.35); }
  100% { background: transparent; }
}
.ht-saved-flash { animation: ht-flash 0.6s ease-out; }
@keyframes ht-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.ht-save-bar { animation: ht-slide-up 0.25s ease-out; }
`;

/* ── icons (simplified) ────────────────────────────────────── */

function Sword({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5 L14 5 L13.2 13.8 L10.8 13.8 L10 5 Z"
        fill={filled ? "#a5b4fc" : "transparent"}
        stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="1.3" strokeLinejoin="round" />
      {filled && <path d="M12 4 L12 13" stroke="#6d7ae8" strokeWidth="0.9" strokeLinecap="round" />}
      <path d="M7.6 14.6 H16.4" stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 15.6 V19.2" stroke={filled ? "#a5b4fc" : "#5b4a78"} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="21" r="1.5" fill={filled ? "#c7d2fe" : "transparent"} stroke={filled ? "#c7d2fe" : "#5b4a78"} strokeWidth="1.2" />
    </svg>
  );
}

function Chili({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.5 6 C 12.2 4.6, 13 3.2, 15 2.8" stroke={filled ? "#86efac" : "#4b3a63"} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M12.5 6 C 8 6.5, 5.8 10, 6.8 14 C 7.8 18, 11.5 21.3, 16.8 19.6 C 17.9 19.2, 18 18, 17 17.6 C 13.2 16.2, 11 13.2, 10.8 9.6 C 10.7 8.1, 11.3 6.8, 12.5 6 Z"
        fill={filled ? "#fb7185" : "transparent"} stroke={filled ? "#fda4af" : "#5b4a78"} strokeWidth="1.4" strokeLinejoin="round" />
      {filled && <path d="M9 9.5 C 8.6 11.5, 9.2 13.6, 10.5 15.4" stroke="#fecdd3" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />}
    </svg>
  );
}

/* ── rating meter ──────────────────────────────────────────── */

function Meter({ value, onChange, Icon, label, size = 20 }) {
  const [flashKey, setFlashKey] = useState(0);
  const handleClick = (n) => {
    onChange(n === value ? 0 : n);
    setFlashKey((k) => k + 1);
  };
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => handleClick(n)}
          className="p-0.5 rounded cursor-pointer hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
          aria-label={`${label}: ${n} of 5`}
        >
          <Icon filled={n <= value} size={size} />
        </button>
      ))}
      {flashKey > 0 && (
        <span key={flashKey} className="ht-saved-flash text-[10px] text-indigo-300 px-1.5 py-0.5 rounded-sm ml-1">saved</span>
      )}
    </div>
  );
}

/* ── toast ──────────────────────────────────────────────────── */

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 ht-display text-[11px] uppercase px-4 py-2 rounded-sm bg-indigo-500/90 text-white shadow-lg" style={{ animation: "ht-slide-up 0.2s ease-out" }}>
      {message}
    </div>
  );
}

/* ── main demo ─────────────────────────────────────────────── */

const INITIAL = {
  title: "A Court of Mist and Fury",
  author: "Sarah J. Maas",
  genres: ["Romantasy", "Fae", "Epic fantasy"],
  shelf: "owned",
  read: true,
  formats: ["print", "audio"],
  overall: 5,
  smut: 4,
  progress: { print: { page: 420, pages: 624 }, audio: { listened: 7.2, hours: 16 } },
};

export default function HybridSaveDemo() {
  // "Server" state — what's persisted
  const [saved, setSaved] = useState(INITIAL);

  // Instant-save fields (always in sync with saved)
  const [overall, setOverall] = useState(saved.overall);
  const [smut, setSmut] = useState(saved.smut);
  const [read, setRead] = useState(saved.read);
  const [shelf, setShelf] = useState(saved.shelf);
  const [formats, setFormats] = useState(saved.formats);

  // Buffered fields (can diverge from saved)
  const [title, setTitle] = useState(saved.title);
  const [author, setAuthor] = useState(saved.author);
  const [genres, setGenres] = useState(saved.genres);
  const [genreInput, setGenreInput] = useState("");
  const [progress, setProgress] = useState(saved.progress);

  // Toast
  const [toast, setToast] = useState({ message: "", visible: false });
  const toastTimer = useRef(null);
  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast({ message: msg, visible: true });
    toastTimer.current = setTimeout(() => setToast({ message: "", visible: false }), 1800);
  };

  // Dirty detection for buffered fields
  const isDirty =
    title !== saved.title ||
    author !== saved.author ||
    JSON.stringify(genres) !== JSON.stringify(saved.genres) ||
    JSON.stringify(progress) !== JSON.stringify(saved.progress);

  // Instant save handler
  const instantSave = (field, value) => {
    setSaved((s) => ({ ...s, [field]: value }));
    showToast(`${field} updated`);
  };

  // Buffered save
  const saveBuffered = () => {
    setSaved((s) => ({ ...s, title, author, genres, progress }));
    showToast("Changes saved");
  };

  // Discard buffered
  const discardBuffered = () => {
    setTitle(saved.title);
    setAuthor(saved.author);
    setGenres(saved.genres);
    setProgress(saved.progress);
    setGenreInput("");
  };

  // Wrap instant saves
  const handleOverall = (v) => { setOverall(v); instantSave("overall", v); };
  const handleSmut = (v) => { setSmut(v); instantSave("smut", v); };
  const handleRead = () => { const v = !read; setRead(v); instantSave("read", v); };
  const handleShelf = () => { const v = shelf === "owned" ? "wishlist" : "owned"; setShelf(v); instantSave("shelf", v); };
  const handleFormat = (fmt) => {
    const v = formats.includes(fmt) ? formats.filter((f) => f !== fmt) : [...formats, fmt];
    setFormats(v);
    instantSave("formats", v);
  };

  const addGenre = () => {
    const g = genreInput.trim();
    if (!g || genres.some((x) => x.toLowerCase() === g.toLowerCase())) return;
    setGenres([...genres, g].slice(0, 6));
    setGenreInput("");
  };

  return (
    <div className="ht-bg ht-body text-purple-100">
      <style>{FONT_CSS}</style>
      <Toast {...toast} />

      <div className="max-w-2xl mx-auto px-5 pt-10 pb-32">
        <header className="text-center mb-6">
          <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">Hybrid save model</p>
          <h1 className="ht-display text-2xl text-pink-100 mt-2">Book Detail Panel</h1>
          <p className="mt-2 text-[15px] text-purple-300/75 italic">
            Tap a sword or toggle — it saves instantly. Edit text or progress — a save bar appears when you're ready.
          </p>
        </header>

        {/* ──── INSTANT SAVE SECTION ──── */}
        <div className="ht-card rounded-md p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="ht-display text-xs uppercase text-indigo-200 font-semibold">Instant save</h2>
            <span className="text-[10px] text-purple-400/60 italic">— tap and done, no save button needed</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-indigo-200">Verdict ⚔</span>
              <Meter value={overall} onChange={handleOverall} Icon={Sword} label="Verdict" />
            </div>

            <div className="h-px bg-purple-700/30" />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-pink-200">Smoulder 🕯</span>
              <Meter value={smut} onChange={handleSmut} Icon={Chili} label="Smoulder" />
            </div>

            <div className="h-px bg-purple-700/30" />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-purple-200">Status</span>
              <div className="flex gap-2">
                <ToggleChip on={read} onClick={handleRead} onLabel="Read ✓" offLabel="Unread" />
                <ToggleChip on={shelf === "owned"} onClick={handleShelf} onLabel="Owned" offLabel="Wishlist" />
              </div>
            </div>

            <div className="h-px bg-purple-700/30" />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="ht-display text-xs uppercase text-purple-200">Formats</span>
              <div className="flex gap-1.5">
                {["print", "ebook", "audio"].map((fmt) => (
                  <ToggleChip
                    key={fmt}
                    on={formats.includes(fmt)}
                    onClick={() => handleFormat(fmt)}
                    onLabel={fmt === "print" ? "📖 Print" : fmt === "ebook" ? "📱 Kindle" : "🎧 Audio"}
                    offLabel={fmt === "print" ? "📖 Print" : fmt === "ebook" ? "📱 Kindle" : "🎧 Audio"}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ──── BUFFERED SAVE SECTION ──── */}
        <div className={`ht-card rounded-md p-4 mb-4 transition-all ${isDirty ? "border-pink-400/50" : ""}`}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="ht-display text-xs uppercase text-pink-200 font-semibold">Editable details</h2>
            {isDirty && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/30 text-pink-200">unsaved changes</span>
            )}
            {!isDirty && (
              <span className="text-[10px] text-purple-400/60 italic">— edit freely, save when ready</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="ht-display text-[10px] uppercase text-purple-300 mb-1 block">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <label className="ht-display text-[10px] uppercase text-purple-300 mb-1 block">Author</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <label className="ht-display text-[10px] uppercase text-purple-300 mb-1 block">Genres</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {genres.map((g) => (
                  <span key={g} className="ht-display text-[9px] uppercase pl-1.5 pr-1 py-0.5 rounded-sm border border-purple-500/40 bg-purple-900/40 text-purple-200/90 flex items-center gap-1">
                    {g}
                    <button onClick={() => setGenres(genres.filter((x) => x !== g))} className="text-purple-400 hover:text-pink-300 px-0.5">✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGenre(); } }}
                  placeholder="Add a genre…"
                  className="flex-1 bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-1.5 text-sm placeholder-purple-400/50 focus:outline-none focus:border-pink-400"
                />
                <button onClick={addGenre} disabled={!genreInput.trim()} className="ht-display text-[10px] uppercase px-3 rounded-sm bg-purple-800/60 hover:bg-purple-700 disabled:opacity-40 text-purple-100">Add</button>
              </div>
            </div>

            <div>
              <label className="ht-display text-[10px] uppercase text-purple-300 mb-1 block">Progress — Physical</label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-purple-300/70">p.</span>
                <input type="number" min="0" value={progress.print?.page ?? ""}
                  onChange={(e) => setProgress({ ...progress, print: { ...progress.print, page: Math.max(0, parseInt(e.target.value) || 0) } })}
                  className="w-16 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-pink-400" />
                <span className="text-purple-300/70">of</span>
                <input type="number" min="0" value={progress.print?.pages ?? ""}
                  onChange={(e) => setProgress({ ...progress, print: { ...progress.print, pages: Math.max(0, parseInt(e.target.value) || 0) } })}
                  className="w-16 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-pink-400" />
              </div>
            </div>

            <div>
              <label className="ht-display text-[10px] uppercase text-purple-300 mb-1 block">Progress — Audio</label>
              <div className="flex items-center gap-2 text-sm">
                <input type="number" min="0" step="0.1" value={progress.audio?.listened ?? ""}
                  onChange={(e) => setProgress({ ...progress, audio: { ...progress.audio, listened: Math.max(0, parseFloat(e.target.value) || 0) } })}
                  className="w-16 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-pink-400" />
                <span className="text-purple-300/70">of</span>
                <input type="number" min="0" step="0.1" value={progress.audio?.hours ?? ""}
                  onChange={(e) => setProgress({ ...progress, audio: { ...progress.audio, hours: Math.max(0, parseFloat(e.target.value) || 0) } })}
                  className="w-16 bg-purple-950/60 border border-purple-700/50 rounded-sm px-2 py-1 text-sm focus:outline-none focus:border-pink-400" />
                <span className="text-purple-300/70">h</span>
              </div>
            </div>
          </div>
        </div>

        {/* ──── LEGEND ──── */}
        <div className="ht-card rounded-md p-4">
          <h2 className="ht-display text-xs uppercase text-purple-200 font-semibold mb-2">How it works</h2>
          <div className="space-y-2 text-sm text-purple-300/80">
            <p><span className="text-indigo-300">⚡ Instant save</span> — ratings, read/unread, shelf, and formats. Tap once and it's persisted. A quiet "saved" flash confirms it without interrupting your flow.</p>
            <p><span className="text-pink-300">✏️ Buffered save</span> — title, author, genres, and progress. Edit freely — the card's border and an "unsaved changes" badge light up. When you're done, the save bar slides up. Hit Discard to revert everything to where it was.</p>
            <p><span className="text-purple-400">🔒 Why this split?</span> — A sword tap is a decision; changing a title is an edit session. The instant stuff should feel effortless; the edit stuff should feel safe to experiment with.</p>
          </div>
        </div>
      </div>

      {/* ──── SAVE BAR (appears only when dirty) ──── */}
      {isDirty && (
        <div className="ht-save-bar fixed bottom-0 left-0 right-0 z-40 p-3 flex justify-center gap-3"
          style={{ background: "linear-gradient(180deg, transparent, rgba(12,7,20,0.95) 30%)" }}>
          <button
            onClick={discardBuffered}
            className="ht-display px-5 py-2.5 rounded-sm bg-purple-800/70 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase"
          >
            Discard changes
          </button>
          <button
            onClick={saveBuffered}
            className="ht-display px-6 py-2.5 rounded-sm bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white text-xs font-semibold uppercase shadow-lg"
          >
            Save & Close
          </button>
        </div>
      )}
    </div>
  );
}

/* ── toggle chip ───────────────────────────────────────────── */

function ToggleChip({ on, onClick, onLabel, offLabel }) {
  const [flash, setFlash] = useState(0);
  const handleClick = () => { onClick(); setFlash((f) => f + 1); };
  return (
    <button
      onClick={handleClick}
      className={`ht-display text-[10px] uppercase px-2.5 py-1 rounded-sm transition-colors ${
        on
          ? "bg-indigo-500/40 text-indigo-100 hover:bg-indigo-500/60"
          : "bg-purple-900/50 text-purple-400 hover:bg-purple-800/60"
      }`}
    >
      {on ? onLabel : offLabel}
      {flash > 0 && <span key={flash} className="ht-saved-flash ml-1.5 text-[9px] text-indigo-300">✓</span>}
    </button>
  );
}
