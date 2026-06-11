# Hushthorn — Auth, Database & Avatar Design
**Date:** 2026-06-10
**Status:** Approved

---

## Overview

Add Supabase authentication, cloud persistence, and an avatar system to Hushthorn. Users sign in with email or Google, their books and avatar live in Supabase, and a header chip opens a profile page where they customise their character.

---

## 1. Database Schema

Supabase project: `ujxsrcxbhcbihhdluzyl` (already exists, currently empty).

Drop `future_reads` (absorbed into `books.shelf`). Reshape `books`. Add `notes` and `avatars`.

### `books`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | — | FK → `auth.users`, not null |
| `title` | `text` | — | not null |
| `author` | `text` | `'Unknown author'` | |
| `year` | `int` | null | |
| `cover_url` | `text` | `''` | Original source URL only (never a data URL — those are browser-only cache) |
| `genres` | `text[]` | `'{}'` | |
| `shelf` | `text` | `'owned'` | `'owned'` or `'wishlist'` |
| `read` | `bool` | `false` | |
| `overall` | `int` | `0` | Sword rating 0–5 |
| `smut` | `int` | `0` | Chili rating 0–5 |
| `created_at` | `timestamptz` | `now()` | |

RLS: users can only select/insert/update/delete their own rows (`user_id = auth.uid()`).

### `notes`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `book_id` | `uuid` | — | FK → `books.id` on delete cascade |
| `user_id` | `uuid` | — | FK → `auth.users` |
| `page` | `text` | `''` | |
| `is_quote` | `bool` | `false` | |
| `text` | `text` | — | not null |
| `is_voice` | `bool` | `false` | |
| `date` | `text` | — | Display string e.g. "Jun 10" |
| `created_at` | `timestamptz` | `now()` | |

RLS: same — own rows only.

### `avatars`
| Column | Type | Default | Notes |
|---|---|---|---|
| `user_id` | `uuid` | — | PK, FK → `auth.users` |
| `name` | `text` | `'Keeper of the Archive'` | |
| `gender` | `text` | `'nonbinary'` | `'female'`, `'male'`, `'nonbinary'` |
| `hair_color` | `text` | `'#1e1b4b'` | Hex string |
| `skin_tone` | `text` | `'#c4956a'` | Hex string |
| `robe_color` | `text` | `'#5b21b6'` | Hex string |
| `updated_at` | `timestamptz` | `now()` | |

RLS: users can only read/write their own row. Insert on first save, upsert on subsequent saves.

---

## 2. Authentication

- Provider: Supabase Auth
- Methods: **email + password** and **Google OAuth**
- Session: Supabase handles JWT refresh automatically via `@supabase/supabase-js`
- On app boot: check `supabase.auth.getSession()` — redirect to `AuthPage` if no session
- On sign-out: clear session, return to `AuthPage`

### Client setup
`src/lib/supabase.js` — single exported `supabase` client initialised with project URL and anon key from `.env`:

```
VITE_SUPABASE_URL=https://ujxsrcxbhcbihhdluzyl.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

---

## 3. Components

### New: `AuthPage`
- Full-screen gothic login page (matching mockup in `.superpowers/brainstorm/`)
- Sign in / Create account tabs
- Email + password fields; Google OAuth button
- On success: Supabase session established, app renders `Hushthorn` main component

### New: `AvatarChip` (header)
- Compact pill in the header: avatar emoji + reader name + "X owned · Y read"
- Clicking opens `AvatarPage` as an overlay (same `Overlay` shell used elsewhere)
- Shows immediately on load; counts derive from `books` state

### New: `AvatarPage`
Three zones rendered inside the `Overlay`:
1. **Avatar + customiser** — SVG character, name input, gender tabs (Female / Male / Non-binary), hair/skin/robe swatch pickers, Save button
2. **Reading Chronicle** — 4 stat cards: owned, read, wishlist, avg sword rating
3. **Your Shelf** — mini horizontal shelf strip; filled spines = read books, dashed = unread owned. Caption "X of Y read · Z slots waiting"

Save writes to `avatars` table via upsert. Avatar state lives in `Hushthorn` component alongside books.

### Modified: `Hushthorn` (main component)
- Boot sequence: load session → load books + notes + avatar in parallel
- `books` state sourced from Supabase instead of `seedBooks`
- All mutations (`addBook`, `updateBook`, `removeBook`, `addNote`, `deleteNote`) write to Supabase and update local state optimistically
- Sign-out button in header (small, unobtrusive)

---

## 4. Data Flow

```
App boots
  └─ supabase.auth.getSession()
       ├─ no session → render AuthPage
       └─ session exists
            ├─ fetch books (with nested notes) for user
            ├─ fetch avatar for user
            └─ render Hushthorn with real data

User adds book
  └─ insert into books → get back id
       └─ update local state with server-returned id

User adds note
  └─ insert into notes with book_id
       └─ update local notes array for that book

User saves avatar
  └─ upsert into avatars
       └─ update local avatar state
```

Notes are fetched in a single query: `select * from notes where user_id = uid` then grouped by `book_id` client-side and merged into each book's `notes` array before setting state.

---

## 5. File Structure

```
src/
  lib/
    supabase.js          ← Supabase client singleton
  App.jsx                ← Modified: auth gate, real data, AvatarChip, AvatarPage, AuthPage
```

Everything stays in `App.jsx` for now (consistent with current single-file structure). `src/lib/supabase.js` is the only new file.

---

## 6. Error Handling

- Auth errors (wrong password, email taken): shown inline below the form field
- Network errors on book mutations: show toast-style error using existing gothic error pattern; local state not updated on failure
- Avatar save failure: silent retry once, then show "The scribe's quill faltered" message
- Session expiry: Supabase auto-refreshes; on unrecoverable expiry, redirect to `AuthPage`

---

## 7. Out of Scope (Phase 1)

- Real-time sync across tabs (Supabase subscriptions) — add later
- Password reset flow — Supabase handles via email, wire up later
- Profile picture upload — Phase 2 with artist assets
- Option C shelf banner — Phase 2 with artist

---

## 8. Avatar Roadmap (for reference)

- **Phase 1 (this build):** Header chip + profile page with SVG placeholder avatar
- **Phase 2 (with artist):** Replace chip + profile with illustrated Option C shelf banner; artist provides custom avatar art assets
