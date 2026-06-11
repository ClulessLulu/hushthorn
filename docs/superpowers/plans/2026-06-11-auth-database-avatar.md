# Hushthorn — Auth, Database & Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase authentication, cloud book/note/avatar persistence, and a customisable avatar profile system to Hushthorn.

**Architecture:** Supabase Auth handles login (email + Google OAuth); all data lives in three Supabase tables with row-level security. App.jsx gains an auth gate, loads real data on login, and optimistically writes every mutation back to Supabase. A new header chip opens an avatar profile page with a live SVG character, stats, and a mini shelf.

**Tech Stack:** React 18, Vite, Tailwind CSS, `@supabase/supabase-js` 2.x, Supabase project `ujxsrcxbhcbihhdluzyl`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/supabase.js` | Create | Supabase client singleton |
| `.env` | Create | Supabase URL + anon key |
| `.gitignore` | Modify | Ensure `.env` is listed |
| `src/App.jsx` | Modify | Auth gate, data layer, AuthPage, AvatarChip, AvatarPage |

---

## Task 1: DB Migration

**Files:** Supabase SQL editor at `https://supabase.com/dashboard/project/ujxsrcxbhcbihhdluzyl/sql/new` or via Supabase MCP `apply_migration`

- [ ] **Step 1: Apply migration SQL**

Run this entire block in the Supabase SQL editor (or pass it to `mcp__claude_ai_Supabase__apply_migration` with `name: "hushthorn_initial_schema"`):

```sql
-- Drop old tables (currently empty)
drop table if exists public.future_reads;
drop table if exists public.books;

-- ── books ───────────────────────────────────────────────────
create table public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null,
  author      text not null default 'Unknown author',
  year        int,
  cover_url   text not null default '',
  genres      text[] not null default '{}',
  shelf       text not null default 'owned',
  read        boolean not null default false,
  overall     int not null default 0,
  smut        int not null default 0,
  created_at  timestamptz default now()
);
alter table public.books enable row level security;
create policy "users manage own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── notes ───────────────────────────────────────────────────
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid references public.books on delete cascade not null,
  user_id     uuid references auth.users not null,
  page        text not null default '',
  is_quote    boolean not null default false,
  text        text not null,
  is_voice    boolean not null default false,
  date        text not null,
  created_at  timestamptz default now()
);
alter table public.notes enable row level security;
create policy "users manage own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── avatars ──────────────────────────────────────────────────
create table public.avatars (
  user_id     uuid primary key references auth.users,
  name        text not null default 'Keeper of the Archive',
  gender      text not null default 'nonbinary',
  hair_color  text not null default '#1e1b4b',
  skin_tone   text not null default '#c4956a',
  robe_color  text not null default '#5b21b6',
  updated_at  timestamptz default now()
);
alter table public.avatars enable row level security;
create policy "users manage own avatar" on public.avatars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Verify tables in Supabase dashboard**

In Table Editor, confirm `books`, `notes`, and `avatars` all appear with the columns listed above. Confirm `future_reads` is gone.

- [ ] **Step 3: Commit note**

No local code changed yet — schema lives in the cloud. Continue to Task 2.

---

## Task 2: Supabase Client + Environment

**Files:**
- Create: `src/lib/supabase.js`
- Create: `.env`
- Modify: `.gitignore`

- [ ] **Step 1: Install the Supabase client library**

In the `c:\Users\lucry\Desktop\hushthorn` directory:

```bash
npm install @supabase/supabase-js
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Create the Supabase client singleton**

Create `src/lib/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

- [ ] **Step 3: Create .env in the project root**

Create `.env` (this file must NOT be committed):

```
VITE_SUPABASE_URL=https://ujxsrcxbhcbihhdluzyl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqeHNyY3hiaGNiaWhoZGx1enlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjE2NzAsImV4cCI6MjA5NTkzNzY3MH0.Nv6rzluW6R-DE277qFFjzKvP2_B9XPSkU3hDkK8zxu4
VITE_ANTHROPIC_API_KEY=<keep your existing Claude API key here>
```

- [ ] **Step 4: Ensure .env is gitignored**

Open `.gitignore` (create it if it doesn't exist) and confirm or add:

```
.env
.env.local
node_modules/
dist/
```

- [ ] **Step 5: Add the import to App.jsx**

At the top of `src/App.jsx`, after the existing imports (line 2), add:

```javascript
import { supabase } from './lib/supabase';
```

- [ ] **Step 6: Verify**

Run `npm run dev`. App loads without console errors about undefined env vars or missing modules.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.js .gitignore
git commit -m "feat: add Supabase client"
```

Do NOT stage `.env`.

---

## Task 3: Auth Gate + AuthPage Component

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add auth state to the Hushthorn component**

In `src/App.jsx` inside the `Hushthorn` function, directly after the opening brace (before the existing `const [books, setBooks] = useState(seedBooks)` at line 294), add:

```javascript
const [session, setSession] = useState(null);
const [authReady, setAuthReady] = useState(false);

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setAuthReady(true);
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
    setSession(session);
  });
  return () => subscription.unsubscribe();
}, []);
```

- [ ] **Step 2: Add auth gate to Hushthorn's return**

In `src/App.jsx`, find the `return (` line in the `Hushthorn` function (currently around line 381). Directly above it, insert:

```javascript
if (!authReady) return (
  <div className="ht-bg ht-body" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <style>{FONT_CSS}</style>
    <div className="ht-frame" aria-hidden="true" />
    <p className="ht-display text-purple-300/60 text-sm uppercase tracking-widest">Opening the archive…</p>
  </div>
);
if (!session) return <AuthPage />;
```

- [ ] **Step 3: Add AuthPage component**

In `src/App.jsx`, add this component before the `AddBookModal` function (currently at line 914). Insert the entire block:

```jsx
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
      const { error: authError } = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
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

  const INPUT = "w-full bg-purple-950/60 border border-purple-700/50 rounded-sm px-3 py-2.5 text-[15px] placeholder-purple-400/50 focus:outline-none focus:border-pink-400 text-purple-100";
  const LBL = "block ht-display text-[9px] uppercase tracking-widest text-purple-400 mb-1.5";

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
            <label className={LBL}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="your@grimoire.com" className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••••••" className={INPUT} />
          </div>
          {mode === 'signup' && (
            <div>
              <label className={LBL}>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••••••" className={INPUT} />
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
```

- [ ] **Step 4: Verify**

Run `npm run dev`. The browser should show the Hushthorn gothic login page instead of the archive. Attempt to create an account — confirm a new user appears in the Supabase Dashboard → Authentication → Users. Log in with those credentials — the archive (empty) should appear.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add auth gate and gothic login page"
```

---

## Task 4: Load Data from Supabase

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace seedBooks initial state and add avatar state**

In `src/App.jsx`, find line 294:

```javascript
const [books, setBooks] = useState(seedBooks);
```

Replace it with:

```javascript
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
```

- [ ] **Step 2: Add data-loading effect**

Directly after the auth `useEffect` added in Task 3 Step 1, add:

```javascript
useEffect(() => {
  if (!session) { setBooks([]); return; }
  setDataLoading(true);
  Promise.all([
    supabase.from('books').select('*').order('created_at', { ascending: false }),
    supabase.from('notes').select('*').order('created_at', { ascending: false }),
    supabase.from('avatars').select('*').eq('user_id', session.user.id).maybeSingle(),
  ]).then(([{ data: booksData }, { data: notesData }, { data: avatarData }]) => {
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
    setDataLoading(false);
  });
}, [session]);
```

- [ ] **Step 3: Add loading state to the library view**

In `src/App.jsx`, find the ternary inside `<main>` that starts with `view === "oracle"`. Locate the branch that starts:

```jsx
} : filtered.length === 0 ? (
```

Add a `dataLoading` check before it:

```jsx
} : dataLoading ? (
  <div className="text-center py-20 text-purple-300/60">
    <p className="ht-display text-xl">The archive stirs…</p>
  </div>
) : filtered.length === 0 ? (
```

The surrounding structure in full (for orientation — this replaces the existing `view === "oracle"` block in `<main>`):

```jsx
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
    {/* ...existing book card map... */}
  </div>
)}
```

- [ ] **Step 4: Verify**

Log in. The archive shows "The archive stirs…" briefly then shows the empty-shelf message. In the Supabase Table Editor, manually insert a test row into `books` with the logged-in `user_id` — refresh the browser and confirm it appears in the archive.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: load books, notes, and avatar from Supabase on login"
```

---

## Task 5: Book and Note Mutations

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Switch to crypto.randomUUID() for all local IDs**

In `src/App.jsx`, replace the `addBook` function (currently at line 366):

```javascript
const addBook = (book) => {
  const id = `b-${Date.now()}`;
  setBooks((prev) => [{ ...book, id }, ...prev]);
  setAddOpen(false);
  if (book.shelf === "owned") setActiveId(id);
};
```

With the async Supabase version:

```javascript
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
```

- [ ] **Step 2: Replace updateBook with Supabase version**

Replace the `updateBook` function (currently at line 358):

```javascript
const updateBook = (id, patch) =>
  setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
```

With:

```javascript
const updateBook = async (id, patch) => {
  // Handle notes diff — detects one add or one delete per call
  if ('notes' in patch) {
    const current = books.find(b => b.id === id);
    const currentIds = new Set(current.notes.map(n => n.id));
    const patchIds = new Set(patch.notes.map(n => n.id));
    const added = patch.notes.find(n => !currentIds.has(n.id));
    const removed = current.notes.find(n => !patchIds.has(n.id));
    if (added) {
      await supabase.from('notes').insert({
        id: crypto.randomUUID(),
        book_id: id,
        user_id: session.user.id,
        page: added.page,
        is_quote: added.isQuote,
        text: added.text,
        is_voice: added.isVoice,
        date: added.date,
      });
    }
    if (removed) {
      await supabase.from('notes').delete().eq('id', removed.id);
    }
  }
  // Handle book field changes (skip 'notes' — handled above)
  const FIELD_MAP = { coverUrl: 'cover_url', overall: 'overall', smut: 'smut', shelf: 'shelf', read: 'read', genres: 'genres' };
  const dbPatch = Object.fromEntries(
    Object.entries(FIELD_MAP).filter(([k]) => k in patch).map(([k, v]) => [v, patch[k]])
  );
  if (Object.keys(dbPatch).length) {
    await supabase.from('books').update(dbPatch).eq('id', id);
  }
  setBooks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
};
```

- [ ] **Step 3: Replace removeBook with Supabase version**

Replace the `removeBook` function (currently at line 361):

```javascript
const removeBook = (id) => {
  setBooks((prev) => prev.filter((b) => b.id !== id));
  setActiveId(null);
};
```

With:

```javascript
const removeBook = async (id) => {
  await supabase.from('books').delete().eq('id', id);
  setBooks(prev => prev.filter(b => b.id !== id));
  setActiveId(null);
};
```

Notes cascade-delete via the `on delete cascade` constraint.

- [ ] **Step 4: Update importBooks to use UUIDs and write to Supabase**

In the `importBooks` function (currently at line 301), replace the two temporary ID strings:

Replace `id: \`imp-${Date.now()}-${c++}\`` (line ~311) with `id: crypto.randomUUID()`.

Replace `id: \`b-${Date.now()}-${c++}\`` (line ~328) with `id: crypto.randomUUID()`.

Then, at the end of `importBooks`, after `return [...additions, ...updated];` and the `});` that closes `setBooks`, add a Supabase batch insert for new books. Replace the entire `importBooks` function with:

```javascript
const importBooks = async (items) => {
  let nextBooks;
  setBooks((prev) => {
    const updated = prev.map((b) => ({ ...b, notes: [...b.notes] }));
    const byTitle = new Map(updated.map((b) => [b.title.toLowerCase(), b]));
    const additions = [];
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        additions.push({
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
    nextBooks = [...additions, ...updated];
    return nextBooks;
  });
  // Write new books to Supabase (updates to existing books are not persisted on import)
  if (session && nextBooks) {
    const toInsert = nextBooks
      .filter(b => !books.find(existing => existing.id === b.id))
      .map(b => ({
        id: b.id, user_id: session.user.id,
        title: b.title, author: b.author, year: b.year ?? null,
        cover_url: b.coverUrl, genres: b.genres, shelf: b.shelf,
        read: b.read, overall: b.overall, smut: b.smut,
      }));
    if (toInsert.length) {
      await supabase.from('books').insert(toInsert);
    }
  }
};
```

- [ ] **Step 5: Verify**

Add a book via "Scour the grimoire" search. Confirm it appears in the Supabase `books` table. Open the book, add a note — confirm a row appears in the `notes` table. Remove the book — confirm it disappears from both tables (notes cascade). Sign out and sign back in — the book should still be there.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire book and note mutations to Supabase"
```

---

## Task 6: AvatarChip + AvatarPage

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add AvatarChip component**

In `src/App.jsx`, add this before the `AddBookModal` function (currently at line 914):

```jsx
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
```

- [ ] **Step 2: Add AvatarPage component**

Add the following directly after `AvatarChip` (before `AddBookModal`):

```jsx
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
```

- [ ] **Step 3: Place AvatarChip in the header**

In the Hushthorn component's `<header>` block (around line 387), after the decorative rule `<div>`:

```jsx
<div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
  <span className="ht-rule w-24 inline-block" />
  <span className="text-pink-300/70 text-[10px]">◆</span>
  <span className="ht-rule w-24 inline-block" />
</div>
```

Add directly below it (still inside `<header>`):

```jsx
<div className="mt-4 flex justify-center">
  <AvatarChip
    avatar={avatar}
    ownedCount={books.filter(b => b.shelf === 'owned').length}
    readCount={books.filter(b => b.read).length}
    onClick={() => setAvatarOpen(true)}
  />
</div>
```

- [ ] **Step 4: Render AvatarPage**

In Hushthorn's return, alongside the existing `{addOpen && <AddBookModal .../>}` line (around line 498), add:

```jsx
{avatarOpen && (
  <AvatarPage
    avatar={avatar}
    books={books}
    session={session}
    onSave={(updated) => { setAvatar(updated); setAvatarOpen(false); }}
    onClose={() => setAvatarOpen(false)}
  />
)}
```

- [ ] **Step 5: Verify**

Click the avatar chip in the header — profile page opens. Change hair/skin/robe colors — the SVG updates live. Switch gender — hair paths and lashes change. Edit the name. Click Save — check the Supabase `avatars` table has a row. Close and reopen — all customisations persist. Sign out and back in — avatar reloads from Supabase.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add avatar chip, profile page with SVG customiser, Supabase persistence"
```

---

## Task 7: Sign-out + Cleanup

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add sign-out button to the header**

In the `<header>` block, after the `<AvatarChip>` div added in Task 6, add:

```jsx
<div className="mt-2 flex justify-center">
  <button
    onClick={() => supabase.auth.signOut()}
    className="ht-display text-[9px] uppercase tracking-widest text-purple-400/50 hover:text-pink-300/70 transition-colors"
  >
    leave the archive
  </button>
</div>
```

- [ ] **Step 2: Remove the seedBooks constant**

Delete the `seedBooks` array from `src/App.jsx` (lines 253–289). It is no longer used; `books` state initialises to `[]`.

- [ ] **Step 3: Update the footer text**

Find the footer at line 508:

```jsx
<footer className="text-center pb-8 text-sm text-purple-400/40 italic">
  Hushthorn · demo build · the archives are kept by Open Library
</footer>
```

Replace with:

```jsx
<footer className="text-center pb-8 text-sm text-purple-400/40 italic">
  Hushthorn · your archive, your secrets
</footer>
```

- [ ] **Step 4: Full end-to-end verify**

1. Load app → gothic login page appears
2. Create a new account → redirected to empty archive
3. Add a book via Scour the grimoire search → appears in archive and Supabase `books` table
4. Rate it with swords and chilis → rating saved
5. Open the book → add a note → note appears in Supabase `notes` table
6. Click avatar chip → profile page opens → customise → save → check `avatars` table
7. Sign out → login page
8. Sign back in → books, notes, and avatar all reload exactly as left

- [ ] **Step 5: Final commit**

```bash
git add src/App.jsx
git commit -m "feat: sign-out, footer update, remove seed data — Hushthorn fully on Supabase"
```

---

## Self-Review Notes

**Spec coverage:**
- DB schema (books, notes, avatars, RLS) → Task 1 ✓
- Supabase client + env → Task 2 ✓
- AuthPage with email + Google → Task 3 ✓
- Load books/notes/avatar on login → Task 4 ✓
- addBook, updateBook (notes diff), removeBook → Task 5 ✓
- importBooks UUID + Supabase write → Task 5 Step 4 ✓
- AvatarChip header widget → Task 6 Step 3 ✓
- AvatarPage (customiser, stats, shelf) → Task 6 Step 2 ✓
- Gender tabs (female/male/nonbinary) → Task 6 Step 2 ✓
- Avatar Supabase upsert on save → Task 6 Step 2 ✓
- Sign-out → Task 7 Step 1 ✓
- Phase 2 shelf banner noted in memory (not implemented) ✓

**Type consistency:**
- Avatar state shape `{ name, gender, hair_color, skin_tone, robe_color }` — used identically in Hushthorn state, AvatarPage draft, AvatarChip props, and Supabase insert/upsert throughout
- `updateBook` notes diff uses `n.id` as unique key; note IDs are now `crypto.randomUUID()` strings which are valid for Supabase UUID columns
- `session` is Hushthorn-scope state; passed as prop to `AvatarPage` which needs `session.user.id` for upsert
