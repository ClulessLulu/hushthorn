/* ── Auth error messages (forgot password / reset / emailed links) ──
   Pure, so tests/auth-errors-unit.mjs runs the real code. Every message tells
   the person what to do next (CLAUDE.md voice rule) and none of them ever shows
   raw server text or anything taken from the URL: a crafted link must not be
   able to put its own words on the sign-in page.
──────────────────────────────────────────────────────────────── */

// Prod enforces at least 8 characters with lower + upper + digit + symbol
// (Supabase auth password policy). Shown when the server rejects a password.
export const PASSWORD_RULE_MSG =
  'Password needs at least 8 characters, with a lowercase letter, an uppercase letter, a number and a symbol (like !@#$). Add what is missing and try again.';

// Checked in the browser before sign-up or reset is sent, so the message names
// exactly what is missing. Every rejection used to say "missing characters",
// even for a 6-character password that had all four kinds (the server said
// "at least 8 characters").
// ponytail: mirrors the Supabase policy by hand; if the dashboard setting
// changes, change PASSWORD_MIN too. The server still has the final say.
export const PASSWORD_MIN = 8;
export function passwordProblem(pw) {
  const s = typeof pw === 'string' ? pw : '';
  const missing = [];
  if (s.length < PASSWORD_MIN) missing.push(`at least ${PASSWORD_MIN} characters`);
  if (!/[a-z]/.test(s)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(s)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(s)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(s)) missing.push('a symbol (like !@#$)');
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`;
  return `Password needs ${list}. Add what is missing and try again.`;
}

const NETWORK_MSG = 'The archive could not be reached. Check your connection and try again.';

const text = (err) => (err && typeof err.message === 'string' ? err.message : '');

function isNetworkError(err) {
  return !!err && (err.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(text(err)));
}

function isRateLimit(err) {
  return !!err && (err.status === 429 || err.code === 'over_email_send_rate_limit' || /rate limit|too many/i.test(text(err)));
}

// Request-a-reset-link failures (resetPasswordForEmail).
export function mapForgotError(err) {
  if (isRateLimit(err)) return 'Too many attempts. Wait a few minutes, then try again.';
  if (isNetworkError(err)) return NETWORK_MSG;
  return 'The archive could not send that link. Check the email address and try again.';
}

// Choose-a-new-password failures (updateUser). Order matters: "New password
// should be different from the old password." contains "password", so the
// same-password case has to be checked before the generic password-rules one.
export function mapResetError(err) {
  const msg = text(err);
  if (err && err.code === 'same_password' || /different from the old|same as the old/i.test(msg)) {
    return 'Choose a password you have not used before, then try again.';
  }
  if ((err && err.code === 'weak_password') || /password/i.test(msg)) return PASSWORD_RULE_MSG;
  if (err && (err.status === 401 || err.code === 'session_not_found' || err.code === 'session_expired') ||
      /session|expired|jwt|not authenticated/i.test(msg)) {
    return 'That reset link has expired. Go back and request a new one.';
  }
  if (isNetworkError(err)) return NETWORK_MSG;
  return 'The archive refused that password. Try a different one.';
}

/* ── Errors Supabase puts in the URL when an emailed link fails ────
   An expired or already-used link redirects to the site with
   #error=access_denied&error_code=otp_expired&error_description=… . The
   Supabase client reads it, returns the error quietly and leaves the hash in
   place, so without this the person lands on a plain sign-in page with no
   explanation. (Link scanners that open the link first make this common.)
──────────────────────────────────────────────────────────────── */

const LINK_ERROR_KEYS = ['error', 'error_code', 'error_description'];

function paramsFrom(part) {
  if (typeof part !== 'string' || !part) return new URLSearchParams();
  return new URLSearchParams(part.replace(/^[#?]/, ''));
}

// Pass window.location.hash and window.location.search. Returns
// { kind: 'expired' | 'other', message } or null when the URL carries no error.
export function parseAuthLinkError(...parts) {
  const merged = new URLSearchParams();
  for (const part of parts) {
    for (const [k, v] of paramsFrom(part)) if (!merged.has(k)) merged.set(k, v);
  }
  if (!LINK_ERROR_KEYS.some((k) => merged.has(k))) return null;
  if (merged.get('error_code') === 'otp_expired') {
    return {
      kind: 'expired',
      message: 'That email link has expired or was already used. To reset your password, request a new link below. If you were confirming a new account, try signing in.',
    };
  }
  return {
    kind: 'other',
    message: "That link didn't work. Try signing in, or request a new reset link below.",
  };
}

// href with the error params removed from its hash and query, so a reload
// doesn't show the message again. Other params (e.g. a success token) stay.
export function cleanAuthLinkUrl(href) {
  let url;
  try { url = new URL(href); } catch { return href; }
  const strip = (raw, lead) => {
    const params = paramsFrom(raw);
    let changed = false;
    for (const k of LINK_ERROR_KEYS) if (params.has(k)) { params.delete(k); changed = true; }
    if (!changed) return raw;
    const rest = params.toString();
    return rest ? lead + rest : '';
  };
  url.hash = strip(url.hash, '#');
  url.search = strip(url.search, '?');
  return url.toString();
}
