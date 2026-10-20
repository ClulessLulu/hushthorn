// Forgot-password / reset / emailed-link error handling. Imports the REAL module.
// Run: npm test   (or: node --test tests/auth-errors-unit.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RULE_MSG, mapForgotError, mapResetError, parseAuthLinkError, cleanAuthLinkUrl,
} from "../src/lib/authErrors.js";

const RATE = "Too many attempts. Wait a few minutes, then try again.";
const NET = "The archive could not be reached. Check your connection and try again.";
const FORGOT_GENERIC = "The archive could not send that link. Check the email address and try again.";
const SAME = "Choose a password you have not used before, then try again.";
const EXPIRED = "That reset link has expired. Go back and request a new one.";
const RESET_GENERIC = "The archive refused that password. Try a different one.";

test("sign-up and reset share one password-rules message (text unchanged)", () => {
  assert.equal(PASSWORD_RULE_MSG,
    "Password needs a lowercase letter, an uppercase letter, a number and a symbol (like !@#$). Add what is missing and try again.");
});

// ── request a reset link ──
test("forgot: rate limit by status, code or message", () => {
  assert.equal(mapForgotError({ status: 429, message: "For security purposes, you can only request this after 60 seconds." }), RATE);
  assert.equal(mapForgotError({ code: "over_email_send_rate_limit", message: "x" }), RATE);
  assert.equal(mapForgotError({ message: "email rate limit exceeded" }), RATE);
  assert.equal(mapForgotError({ message: "Too many requests" }), RATE);
});
test("forgot: network failures", () => {
  assert.equal(mapForgotError({ name: "AuthRetryableFetchError", message: "x" }), NET);
  assert.equal(mapForgotError({ message: "Failed to fetch" }), NET);
  assert.equal(mapForgotError({ message: "Load failed" }), NET);
  assert.equal(mapForgotError({ message: "NetworkError when attempting to fetch resource." }), NET);
});
test("forgot: rate limit wins when an error is both 429 and retryable", () =>
  assert.equal(mapForgotError({ status: 429, name: "AuthRetryableFetchError", message: "x" }), RATE));
test("forgot: anything else is the generic message and never shows raw server text", () => {
  assert.equal(mapForgotError({ status: 500, message: "internal boom: db password=hunter2" }), FORGOT_GENERIC);
  for (const e of [{}, null, undefined, "string", 42, { message: 5 }]) assert.equal(mapForgotError(e), FORGOT_GENERIC);
});

// ── choose a new password ──
test("reset: same password beats the generic password-rules message", () => {
  assert.equal(mapResetError({ message: "New password should be different from the old password." }), SAME);
  assert.equal(mapResetError({ code: "same_password", message: "anything" }), SAME);
});
test("reset: weak password shows the rules", () => {
  assert.equal(mapResetError({ code: "weak_password", message: "x" }), PASSWORD_RULE_MSG);
  assert.equal(mapResetError({ message: "Password should contain at least one character of each: abc" }), PASSWORD_RULE_MSG);
});
test("reset: expired or missing session means the link expired", () => {
  assert.equal(mapResetError({ message: "Auth session missing!" }), EXPIRED);
  assert.equal(mapResetError({ status: 401, message: "x" }), EXPIRED);
  assert.equal(mapResetError({ code: "session_not_found", message: "x" }), EXPIRED);
  assert.equal(mapResetError({ message: "invalid JWT: token is expired" }), EXPIRED);
});
test("reset: network failure", () => {
  assert.equal(mapResetError({ name: "AuthRetryableFetchError", message: "x" }), NET);
  assert.equal(mapResetError({ message: "Failed to fetch" }), NET);
});
test("reset: unknown or malformed errors → generic, never throws, never raw text", () => {
  assert.equal(mapResetError({ status: 500, message: "boom" }), RESET_GENERIC);
  for (const e of [{}, null, undefined, "string", { message: 5 }]) assert.equal(mapResetError(e), RESET_GENERIC);
});

// ── emailed link that failed (G-1) ──
const REAL_HASH = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

test("link error: expired link from the real Supabase redirect", () => {
  const r = parseAuthLinkError(REAL_HASH, "");
  assert.equal(r.kind, "expired");
  assert.match(r.message, /expired or was already used/);
  assert.match(r.message, /request a new link/);
});
test("link error: a successful recovery link is not an error", () => {
  assert.equal(parseAuthLinkError("#access_token=abc&refresh_token=x&expires_in=3600&token_type=bearer&type=recovery", ""), null);
});
test("link error: nothing in the URL, or junk input → null", () => {
  assert.equal(parseAuthLinkError("", ""), null);
  assert.equal(parseAuthLinkError(), null);
  assert.equal(parseAuthLinkError(undefined, null, 5, {}), null);
  assert.equal(parseAuthLinkError("#section-2", "?page=3"), null);
});
test("link error: other error codes get the generic link message", () => {
  const r = parseAuthLinkError("#error=access_denied&error_code=bad_oauth_callback", "");
  assert.equal(r.kind, "other");
  assert.match(r.message, /didn't work/);
});
test("link error: also read from the query string; the hash wins if both are present", () => {
  assert.equal(parseAuthLinkError("", "?error=access_denied&error_code=otp_expired").kind, "expired");
  assert.equal(parseAuthLinkError("#error=x&error_code=bad_oauth_callback", "?error_code=otp_expired").kind, "other");
});
test("link error: never echoes anything from the URL (no content injection)", () => {
  const evil = "#error=access_denied&error_code=otp_expired&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E+Call+555-0100";
  const r = parseAuthLinkError(evil, "");
  assert.ok(!/script|555|alert/i.test(r.message));
  const other = parseAuthLinkError("#error=%3Cb%3Ex%3C%2Fb%3E&error_description=Visit+evil.example", "");
  assert.ok(!/evil|<b>/i.test(other.message));
});

test("clean url: removes the error params and the leftover '#'", () => {
  assert.equal(cleanAuthLinkUrl("http://localhost:5199/" + REAL_HASH), "http://localhost:5199/");
});
test("clean url: keeps unrelated hash and query params and the path", () => {
  assert.equal(cleanAuthLinkUrl("https://hushthorn.vercel.app/#error=x&type=recovery"), "https://hushthorn.vercel.app/#type=recovery");
  assert.equal(cleanAuthLinkUrl("https://hushthorn.vercel.app/some/path?foo=1&error_code=otp_expired#error=y"), "https://hushthorn.vercel.app/some/path?foo=1");
});
test("clean url: a URL with no error is returned untouched; a bad URL doesn't throw", () => {
  assert.equal(cleanAuthLinkUrl("https://hushthorn.vercel.app/?a=1#b=2"), "https://hushthorn.vercel.app/?a=1#b=2");
  assert.equal(cleanAuthLinkUrl("not a url"), "not a url");
});
test("clean url then parse: the message is shown once, not again after a reload", () => {
  const href = "https://hushthorn.vercel.app/" + REAL_HASH;
  assert.ok(parseAuthLinkError(new URL(href).hash, new URL(href).search));
  const after = new URL(cleanAuthLinkUrl(href));
  assert.equal(parseAuthLinkError(after.hash, after.search), null);
});
