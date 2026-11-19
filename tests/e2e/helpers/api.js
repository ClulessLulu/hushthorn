// Direct REST calls to staging Supabase, used to set up data, check what was
// really saved, and clean up. Same endpoints the app itself uses.
import { loadConfig } from './env.js';

export const E2E_PREFIX = 'E2E ';
export const uniqueTitle = (label = 'Tome') =>
  `${E2E_PREFIX}${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function signIn(request, creds = loadConfig().alpha) {
  const { url, anonKey } = loadConfig();
  const res = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) throw new Error(`Staging sign-in failed for ${creds.email}: HTTP ${res.status()}`);
  const body = await res.json();
  return { token: body.access_token, userId: body.user.id };
}

export function rest(request, session) {
  const { url, anonKey } = loadConfig();
  const headers = { apikey: anonKey, Authorization: `Bearer ${session.token}`, Prefer: 'return=representation' };
  const books = `${url}/rest/v1/books`;
  const mine = `user_id=eq.${session.userId}`;
  const json = async (res) => {
    if (!res.ok()) throw new Error(`REST ${res.url()} -> HTTP ${res.status()}: ${await res.text()}`);
    return res.json();
  };
  return {
    // Minimal row, same columns the app's own insert sends.
    insertBook: async (fields) => (await json(await request.post(books, {
      headers,
      data: { id: crypto.randomUUID(), user_id: session.userId, author: 'E2E Bot', shelf: 'owned', formats: ['print'], ...fields },
    })))[0],
    booksByTitle: async (title) =>
      json(await request.get(`${books}?${mine}&title=eq.${encodeURIComponent(title)}&select=*`, { headers })),
    // Removes every book these tests created (titles start with "E2E ").
    deleteE2EBooks: async () =>
      json(await request.delete(`${books}?${mine}&title=like.${encodeURIComponent(E2E_PREFIX)}*`, { headers })),
    notesForBook: async (bookId) =>
      json(await request.get(`${url}/rest/v1/notes?book_id=eq.${bookId}&select=*`, { headers })),
    getPrefs: async () =>
      (await json(await request.get(`${url}/rest/v1/avatars?${mine}&select=pref_layout,pref_sort`, { headers })))[0],
    setPrefs: async (patch) =>
      json(await request.patch(`${url}/rest/v1/avatars?${mine}`, { headers, data: patch })),
    // Shared archives, through the same functions and tables the app uses.
    createArchive: async (name) =>
      json(await request.post(`${url}/rest/v1/rpc/create_library`, { headers, data: { p_name: name } })),
    makeInvite: async (libraryId) =>
      (await json(await request.post(`${url}/rest/v1/library_invites?select=code`, {
        headers, data: { library_id: libraryId, created_by: session.userId },
      })))[0].code,
    acceptInvite: async (code) =>
      json(await request.post(`${url}/rest/v1/rpc/accept_library_invite`, { headers, data: { p_code: code } })),
    // Deletes every archive this reader keeps whose name starts with "E2E ".
    deleteE2EArchives: async () =>
      json(await request.delete(`${url}/rest/v1/libraries?created_by=eq.${session.userId}&name=like.${encodeURIComponent(E2E_PREFIX)}*`, { headers })),
  };
}
