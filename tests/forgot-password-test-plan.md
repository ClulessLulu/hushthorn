# Test Plan — Forgot Password and Set-New-Password

**Feature:** "Forgot your password?" request screen + "Choose a new password" screen after following the emailed link
**Code under test:** branch `feat/forgot-password`: your commit `1c5ddcd` (Oct 5), merged with current `master` (one conflict, resolved: `{mode !== 'forgot' && GOOGLE_AUTH_ENABLED && (<>`), plus: shared error logic in `src/lib/authErrors.js`, the expired-link message (G-1), and CI. Line numbers omitted on purpose: they drift.
**Files:** `src/App.jsx` (`AuthPage` request mode, `ResetPasswordPage`, the `PASSWORD_RECOVERY` gate, link-error notice), `src/lib/authErrors.js` (new), `tests/auth-errors-unit.mjs` (new), `.env.example`, CI files
**Drafted and run:** 2026-10-19. **Run so far:** 20 unit tests (`npm test`), and 31 browser checks in headless Chromium against the real app with **every Supabase response mocked**. Mocked rows prove how the app *handles* an answer; they say nothing about what real Supabase answers, or whether email arrives. Those rows are not yet run.

## How to read this plan

- Every row has a **PASS** criterion. If it isn't met, the row fails.
- IDs: `P-` environment prerequisites, `B-` Supabase contract, `F-` request screen, `R-` recovery screen, `S-` security, `U-` unit, `X-` release.
- Methods: `Code` (read the source), `Unit` (Node, `npm test`), `Manual` (browser, a real mailbox), `Logs` (Supabase `auth_logs` / `edge_logs`), `Build`.
- **Rows marked `KNOWN GAP` are expected to FAIL today.** They are in the plan so the failure is a decision, not a surprise. Each has a gap ID in section 7.
- Test accounts: a mailbox you control. Never reset a real user's password to test.
- Legend: ✅ run and passed · 🔎 run, observed behaviour needs a decision · no mark = **not yet run**.
- Run on **staging first** (`hushthorn-staging`). It is a separate Supabase project, so every `P-` row must be set up there too.

---

## 1. Environment prerequisites (most likely thing to break in production)

Code can be perfect and this feature still fail, because the email and redirect settings live in the Supabase dashboard.

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| P-01 | Site URL is the real site | Dashboard → Auth → URL Configuration | Site URL is `https://hushthorn.vercel.app` on prod. **DONE for prod, verified in logs:** the signup confirmation link of 2026-10-19 19:34 UTC carries `redirect_to=https://hushthorn.vercel.app` (on 2026-10-07 it carried `http://localhost:3000`). **Staging is a separate project and is not checked.** |
| P-02 | Redirect URLs allow the origin the app sends | Same page | Prod list contains `https://hushthorn.vercel.app`. **DONE for prod** (same log evidence; your screenshot showed only that one entry, which is correct). Confirm no wildcard like `https://*` is ever added. Staging not checked. |
| P-03 | Reset email template links to the app | Dashboard → Auth → Email Templates → Reset Password | Template contains `{{ .ConfirmationURL }}`. (New Free-plan projects on the built-in email service cannot edit templates, per Supabase's changelog, so the default template must already work.) |
| P-04 | Emails actually reach non-team addresses | Dashboard → Auth → SMTP Settings, then Manual | **Custom SMTP is configured**, or a reset sent to an address that is not an org member is delivered. Supabase's built-in sender only delivers to organization members and is limited to 2 emails/hour ([rate limits](https://supabase.com/docs/guides/auth/rate-limits), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). I could not see your SMTP setting from here. |
| P-05 | Recovery link lifetime is known | Dashboard → Auth → email OTP expiry | Value is written down in the results. Used by R-08. |

## 2. Supabase contract the code relies on

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 ✅ | No schema or RLS change | Code (`git diff master...`) | Diff touches `src/App.jsx` and `.env.example` only. No migration. |
| B-02 | Unknown email gets the same API answer | Manual + Logs | `POST /auth/v1/recover` returns the same status (200) for a registered and an unregistered address. |
| B-03 | Repeat requests are throttled | Logs | A second request inside the cooldown returns `429`; app shows F-06 message. |
| B-04 | Whole flow is visible in logs | Logs (`auth_logs`) | One reset shows `/recover` 200 → `/verify` (type recovery) 303 → `PUT /user` 200, in order. |
| B-05 | Existing data untouched by a reset | MCP `execute_sql` | Book count for the test user is identical before and after R-05. |

## 3. Request screen (`AuthPage`, `mode === 'forgot'`)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| F-01 ✅ | Link placement | Manual | "Forgot your password?" appears on **Sign in** only, not on Create account. |
| F-02 ✅ | Forgot mode layout | Manual | Sign in/Create account tabs, password field and Google button are all hidden. Heading "Forgotten password" shown. |
| F-03 ✅ | Success message | Manual | Valid registered email → exact text "If that email has an account, a reset link is on its way…" with `role="status"`. Submit button disabled afterwards. |
| F-04 ✅ | Unknown email looks identical | Manual | Same text, same layout as F-03. No "not found" wording anywhere, including the network response body. |
| F-05 ✅ | Empty or malformed email | Manual | Browser validation blocks submit; no request fires (Network tab empty). |
| F-06 ✅ | Rate limited | Manual | Second send inside the cooldown → "Too many attempts. Wait a few minutes, then try again." |
| F-07 ✅ | Offline | Manual (DevTools offline) | "The archive could not be reached…" and **not** the rate-limit or generic text. |
| F-08 ✅ | Other server error | Manual (block request → 500) | "The archive could not send that link…". Never raw `err.message`. |
| F-09 ✅ | Back to sign in | Manual | Returns to Sign in; error and notice cleared; email field keeps what was typed. |
| F-10 ✅ | Resend path | Manual | After F-03, Back → Forgot → submit works again (subject to B-03). The button is disabled while a notice is showing, so there is **no in-place resend**: note whether that is acceptable. |
| F-11 ✅ | Double submit | Manual | Double-clicking Send produces exactly **one** `/recover` request. |
| F-12 ✅ | Mobile | Manual (360 px and 390 px) | No horizontal scroll; Send, Back and Forgot controls are ≥ 44 px tall. |
| F-13 ✅ | Google flag interplay | Build | `VITE_ENABLE_GOOGLE_AUTH` unset → no Google button in Sign in, Create account or Forgot. Set to `true` → button on the first two, never on Forgot. (Bundle check passed in the merge dry-run.) |

## 4. Recovery screen (`ResetPasswordPage`)

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| R-01 ✅ | Valid link lands on the reset card | Manual | Following the email link shows "Choose a new password", **not** the library. The token is gone from the address bar. |
| R-02 ✅ | Mismatch | Manual | "Passwords do not match." and no `PUT /user` request is made. |
| R-03 ✅ | Weak password | Manual | Server 422 `weak_password` → the shared rules message. |
| R-04 ✅ | Same as old password | Manual | "Choose a password you have not used before, then try again." (must win over the generic password message). |
| R-05 ✅ | Success | Manual | Saves, enters the app, **old password is rejected at sign-in, new one works**. |
| R-06 ✅ | Cancel | Manual | Signs out and shows Sign in. Reopening the same link afterwards does not log the user in. |
| R-07 🔎 | Reload on the reset card | Browser (mocked) | **Observed:** after landing on the reset card and reloading, the card does **not** come back; the app carries on with the recovery session (it asked for a handle in the mocked run), so a person can end up signed in **without having chosen a new password**, and their old password still works. They did prove mailbox access, so this is not a break-in path, but it surprises people. Decision needed (G-3). |
| R-08 ✅ | **Expired or already-used link** | Browser (mocked) | **G-1 FIXED.** Before: a plain Sign in page with no explanation and the error left in the address bar (the same check failed on the pre-fix code). Now: "That email link has expired or was already used…" with a "Send a new reset link" button that opens the request screen; the error is removed from the URL and does not repeat on reload. Crafted `error_description` text is never shown or run. A signed-in person who opens an old link and signs out later does not see a stale message (R-08f: found in my own review, reproduced, fixed). |
| R-09 | Opened on another device | Manual | Request on desktop, open the email on a phone: reset card appears (app uses `flowType: 'implicit'`, `src/lib/supabase.js:24`). |
| R-10 | Link opened twice | Manual | Second open behaves as R-08; the first tab's reset still works. |
| R-11 | Email scanner opens the link first | Manual (curl the link once, then click it) | Expect the R-08 message. The message itself is verified (R-08); **not yet run with a real link consumed by a real scanner or curl.** This is the most likely real-world cause of "expired" reports. |
| R-12 | Sign-in tab already open | Manual | Open the link in a second tab while the first shows Sign in. Record what the first tab does (it may sign in without the reset card). |
| R-13 | Other devices after reset | Manual | Record whether a device signed in before the reset stays signed in. Decide if that is acceptable. |

## 5. Security

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| S-01 | Enumeration by timing | Manual (10 requests each, registered vs unregistered) | Median response times differ by less than normal noise. If they clearly differ, record it. |
| S-02 | Redirect tampering | Manual | Edit `redirect_to` in an emailed link to another domain → lands on the Site URL, never the other domain. |
| S-03 | Tokens in the URL | Code + Manual | Tokens are only in the `#fragment` and are cleared after landing (R-01). Note that implicit flow keeps them in browser history until cleared. |
| S-04 | Server-side password policy | Manual | R-03 holds when the browser is bypassed (call `PUT /user` directly with a weak password → 422). |
| S-05 ✅ | No secrets in the diff | Code | No keys or tokens added; only `supabase.auth` calls. |

## 6. Unit tests (Node, run by `npm test` and CI): `tests/auth-errors-unit.mjs`, 20 tests ✅

The error mapping used to live inline in the two `submit` handlers, so it could not be imported. It now lives in `src/lib/authErrors.js` (`mapForgotError`, `mapResetError`, `parseAuthLinkError`, `cleanAuthLinkUrl`), with the messages unchanged. Also covered: a crafted link can't put its own text on the page; the error is stripped from the URL after it is read. Mutation-checked: three deliberate breakages (wrong rule order, echoing URL text, not cleaning the URL) were each caught.

| ID | Input | PASS criterion |
|---|---|---|
| U-01 ✅ | `{status: 429}`; `{message: 'email rate limit exceeded'}` | → rate-limit message |
| U-02 ✅ | `{name: 'AuthRetryableFetchError'}`; `{message: 'Failed to fetch'}` | → "could not be reached" |
| U-03 ✅ | `{message: 'New password should be different from the old password.'}` | → same-as-old message (**not** the generic password rules message) |
| U-04 ✅ | `{code: 'weak_password'}`; `{message: 'Password should contain…'}` | → rules message |
| U-05 ✅ | `{message: 'Auth session missing!'}`; `{status: 401}` | → expired-link message |
| U-06 ✅ | `{}`, `null`-ish, unknown `message` | → generic message, never throws, never shows raw `message` |

## 7. Known gaps (decisions needed)

| Gap | What happens | Why it matters | Suggested fix |
|---|---|---|---|
| G-1 | **FIXED.** Expired/used link: `auth-js` puts `error_code=otp_expired` in the URL hash, returns the error quietly and leaves the hash; `App.jsx` never read it, so the user saw a normal Sign in page. | Link scanners and double-clicks make this common; people assume the app is broken. | Done: parsed once, shown on Sign in with a way to request a new link, and stripped from the URL. |
| G-2 | No in-place resend (F-10). | Minor friction. | Optional "Send again" after a cooldown. |
| G-3 | R-07 (signed in without choosing a password after a reload), R-12 (sign-in tab already open) and R-13 (other devices stay signed in) are undecided. | Not break-ins (each needs the mailbox), but they surprise users. | Decide, then write the chosen behaviour into the expected results. For R-07 one option is to remember "reset pending" in `sessionStorage` until a password is saved. |

## 8. Release gate

1. P-01 to P-05 confirmed on staging **and** prod.
2. `npm test` and CI green on the PR. F-13 build check passes.
3. Every row without a ✅ is run on staging, with real email, before release; G-3 gets a decision.
4. **Prod smoke test (once):** reset the password of an account you own on `https://hushthorn.vercel.app` with a real email, sign in with the new one, then change it back.
