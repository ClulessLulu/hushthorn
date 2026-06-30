import { useState, useMemo } from "react";

/* ═══════════════ Hushthorn · Shared Library — DESIGN PROTOTYPE ═══════════════

   STATUS: ✅ Approved design. This is the UI shape to build toward.
   PAIRS WITH: docs/SHARED_LIBRARY_SPEC.md (full schema, RLS policies, test cases)

   WHAT THIS IS
   One combined shelf that every member of a shared library sees. Each book
   carries an ownership badge — "You own," "[Partner] owns," "Both own," or
   "Neither" (a shared wishlist item nobody's bought yet). This is the model
   that was CHOSEN over an earlier alternative (a side-by-side diff of two
   separate private libraries) because it fits how couples/friends actually
   think of their collection: one shelf, tagged with whose copy is whose.

   WHAT'S MOCK vs. REAL HERE
   - `SHARED` is hardcoded mock data. In the real app this comes from:
       supabase.from('books').select('*, book_ownership(user_id, format)')
         .eq('library_id', currentLibraryId)
     (see the spec's "Client-side shape" section for the exact query + merge)
   - `YOU` / `PARTNER` are display names. Real app resolves these from
     `library_members` + a profiles/display-name lookup, not a hardcoded string.
   - `ownedBy: ["you","them"]` here is a flattened mock of what the real schema
     stores normalized: one row per (book_id, user_id, format) in
     `book_ownership`. The `ownerBadge()` logic in the spec shows the
     real merge from that table back into this same `{y, t}` shape.
   - Ratings/notes are intentionally NOT shown anywhere in this UI — that's
     not an oversight, it's the privacy boundary: Verdict/Smoulder/marginalia
     stay private per-person even on a shared book (see spec's "the seam").

   WHAT TO PORT AS-IS vs. REWIRE
   - Visual design (palette, fonts, badge styling, filter tabs): port as-is,
     it matches the rest of Hushthorn's theme.
   - `OwnerMark` component: port as-is, just feed it real {y, t} booleans
     derived from `book_ownership` instead of the mock `ownedBy` array.
   - Filter counts / `useMemo` diff logic: replace with the real merge from
     `books` + `book_ownership`, but the filter semantics (All/You own/They
     own/Both own/Neither) should stay identical — this is the agreed UX.
   - Add real entry points this prototype doesn't show: creating a library,
     generating/accepting an invite code, a member list, and a way to tag
     "I own this" / "I don't own this" on a book (the prototype only
     *displays* ownership, it doesn't yet show how a user sets their own tag).

═══════════════════════════════════════════════════════════════════════════ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rozha+One&family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');
.ht-display { font-family: 'Cinzel', serif; letter-spacing: 0.06em; }
.ht-body { font-family: 'EB Garamond', serif; }
.ht-bg {
  background-color: #0c0714;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.42), transparent 70%),
    radial-gradient(ellipse 35% 30% at 8% 96%, rgba(236,72,153,0.14), transparent 70%),
    radial-gradient(ellipse 35% 30% at 92% 96%, rgba(168,85,247,0.14), transparent 70%);
  min-height: 100vh;
}
.ht-card {
  background: linear-gradient(165deg, rgba(38,23,64,0.92), rgba(17,10,30,0.96));
  border: 1px solid rgba(217,131,222,0.20);
}
`;

const YOU = "You";
const PARTNER = "Maeve";

// Shared shelf. ownedBy is a set of member keys: "you", "them", both, or none.
const SHARED = [
  { title: "A Court of Mist and Fury", author: "Sarah J. Maas", ownedBy: ["you", "them"] },
  { title: "Fourth Wing", author: "Rebecca Yarros", ownedBy: ["you", "them"] },
  { title: "From Blood and Ash", author: "Jennifer L. Armentrout", ownedBy: ["you"] },
  { title: "House of Earth and Blood", author: "Sarah J. Maas", ownedBy: ["you"] },
  { title: "Haunting Adeline", author: "H. D. Carlton", ownedBy: ["you"] },
  { title: "Iron Flame", author: "Rebecca Yarros", ownedBy: ["them"] },
  { title: "The Coldest Touch", author: "Isabel Sterling", ownedBy: ["them"] },
  { title: "Quicksilver", author: "Callie Hart", ownedBy: ["them"] },
  { title: "The Serpent and the Wings of Night", author: "Carissa Broadbent", ownedBy: [] },
  { title: "A Dawn of Onyx", author: "Kate Golden", ownedBy: [] },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "you", label: `${YOU} own` },
  { key: "them", label: `${PARTNER} owns` },
  { key: "both", label: "Both own" },
  { key: "none", label: "Neither (wishlist)" },
];

export default function SharedLibrary() {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(() => {
    const c = { all: SHARED.length, you: 0, them: 0, both: 0, none: 0 };
    for (const b of SHARED) {
      const y = b.ownedBy.includes("you"), t = b.ownedBy.includes("them");
      if (y) c.you++;
      if (t) c.them++;
      if (y && t) c.both++;
      if (!y && !t) c.none++;
    }
    return c;
  }, []);

  const list = SHARED.filter((b) => {
    const y = b.ownedBy.includes("you"), t = b.ownedBy.includes("them");
    if (filter === "you") return y;
    if (filter === "them") return t;
    if (filter === "both") return y && t;
    if (filter === "none") return !y && !t;
    return true;
  });

  return (
    <div className="ht-bg ht-body text-purple-100">
      <style>{FONT_CSS}</style>

      <header className="max-w-3xl mx-auto px-5 pt-10 pb-5 text-center">
        <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">A shared archive</p>
        <h1 className="ht-display text-2xl text-pink-100 mt-2">{YOU} &amp; {PARTNER}'s Library</h1>
        <p className="mt-2 text-[15px] text-purple-300/75 italic">
          {SHARED.length} tomes · {counts.both} owned by both · {counts.none} on the shared wishlist
        </p>
      </header>

      <div className="max-w-3xl mx-auto px-5 flex gap-2 justify-center flex-wrap pb-6">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`ht-display px-3.5 py-1.5 rounded-sm text-[10px] uppercase font-semibold transition-colors ${
              filter === f.key ? "bg-gradient-to-b from-fuchsia-500/90 to-purple-700/90 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"
            }`}
          >
            {f.label} · {counts[f.key]}
          </button>
        ))}
      </div>

      <main className="max-w-3xl mx-auto px-5 pb-16">
        <div className="space-y-2.5">
          {list.map((b, i) => {
            const y = b.ownedBy.includes("you"), t = b.ownedBy.includes("them");
            return (
              <div key={i} className="ht-card rounded-md p-3.5 flex items-center gap-3">
                <div className="w-9 rounded-sm bg-purple-900/60 flex items-center justify-center text-purple-500 flex-shrink-0" style={{ height: 52 }}>♛</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold leading-tight truncate">{b.title}</p>
                  <p className="text-sm text-purple-300/70 italic truncate">{b.author}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <OwnerMark y={y} t={t} />
                  {!y && !t && (
                    <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm border border-pink-400/40 text-pink-200/80">wishlist</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-center text-sm text-purple-400/60 italic">
          Each tome shows whose copy sits on the shelf. Books neither of you own are the shared wishlist —
          the next ones to hunt for.
        </p>
      </main>

      <footer className="text-center pb-8 text-sm text-purple-400/40 italic">
        Shared library prototype · mock data · ownership is per-member, ratings stay private
      </footer>
    </div>
  );
}

function OwnerMark({ y, t }) {
  if (y && t) {
    return (
      <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-gradient-to-r from-indigo-500/40 to-pink-500/40 text-white border border-purple-400/40">
        Both own
      </span>
    );
  }
  if (y) return <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-indigo-500/35 text-indigo-100">You own</span>;
  if (t) return <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-pink-500/30 text-pink-100">Maeve owns</span>;
  return <span className="ht-display text-[9px] uppercase px-2 py-0.5 rounded-sm bg-purple-900/60 text-purple-400">Neither</span>;
}
