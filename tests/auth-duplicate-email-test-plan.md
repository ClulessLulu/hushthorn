# Test Plan — Duplicate-Email Signup Error Handling

**Feature:** Friendly "email already registered" handling in `AuthPage.submit`
**Commit under test:** `de93eb4` (`fix(auth): surface 'email already registered' on duplicate signup`)
**App under test:** single-file `src/App.jsx` (Vite + React + Supabase) — function `AuthPage.submit`, lines ~1720–1759
**Author:** QA / bookbee team
**Status:** drafted from the current committed code (read before judging)

## How to read this plan

- Each row carries a concrete **PASS** criterion; the test FAILS if the criterion is not met.
- IDs: `B-` backend/data layer, `F-` frontend behavior, `U-` pure-function unit, `E-` edge/fallback.
- This is **client-side React auth logic** — no DB migration, no new schema/RLS. So the `B-` section is intentionally thin (only the Supabase contract this code relies on) and the weight is on **`Code` inspection + `U-` units**, which are deterministic from the source.
- Verification methods: `Code` (read-only inspection of branch order / guards / scoping), `Unit` (extract the decision as a pure predicate and exercise it under Node — repo is ESM, no test runner added), `Manual`/Playwright (Chrome — OPTIONAL; needs a real Supabase project + dev server + known confirm setting; documented, not faked), `Build` (`npm run build`).

### Code baseline (current committed `src/App.jsx`)

```
1733  const { data, error: authError } = await supabase.auth.signUp({ email, password });
1734  if (authError) throw authError;
1738  const identities = data?.user?.identities;
1739  if (Array.isArray(identities) && identities.length === 0) {
1740    setError('That email is already registered. Sign in instead, or use a different one.');
1741    return;
1742  }
1743  if (!data.session) {
1744    setError('Check your inbox to confirm your email before signing in.');
1745    return;
1746  }
1748  } catch (err) {
1751    if (mode === 'signup' && /already\s*(registered|exists)/i.test(err.message || '')) {
1752      setError('That email is already registered. Sign in instead, or use a different one.');
1753    } else {
1754      setError(err.message);
1755    }
1756  } finally { setLoading(false); }
```

The author's 8 named cases map to IDs below (case # in the Check text).

---

## 1. Backend / Data Layer (Supabase contract this code relies on)

No migration, no schema change. We only assert that the code's *assumptions about the `signUp` response shape* are the documented Supabase enumeration-protection behavior — this is a contract check, not a DB query.

| ID | Check | Method | PASS criterion |
|---|---|---|---|
| B-01 | No schema/migration introduced by this change | Code (`git show de93eb4 --stat`) | Diff touches only `src/App.jsx`; no migration file, no new column referenced. |
| B-02 | Relies on documented enumeration-protection shape | Code + Supabase docs | When confirmations ON and email is taken, `signUp` returns `{ data: { user: { identities: [] }, session: null }, error: null }`; a genuinely new user returns a non-empty `identities`. Code keys exactly on `identities.length === 0`. |
| B-03 | No client-side secret / API key added | Code | No key, no service-role usage; uses the existing `supabase.auth` client only. |

---

## 2. Frontend Behavior (branch order & message routing — by inspection)

These are deterministic from the source; method `Code` reads the exact lines, `Manual` is the optional live confirmation.

| ID | Check (author case #) | Method | PASS criterion |
|---|---|---|---|
| F-01 | Passwords-mismatch short-circuits FIRST (#6) | Code (`:1723-1726`) | `mode==='signup' && password!==confirm` sets `'Passwords do not match.'` and `return`s **before** `setLoading(true)` and before any `signUp` call. |
| F-02 | New email + confirmations ON → inbox copy, unchanged (#1) | Code (`:1738-1745`) + Manual | Non-empty `identities` skips the duplicate branch; `!data.session` true → `'Check your inbox to confirm your email before signing in.'`. The fix does NOT alter this path. |
| F-03 | Duplicate email + confirmations ON → THE FIX (#2) | Code (`:1738-1742`) + Manual | Empty `identities` array → `'That email is already registered. Sign in instead, or use a different one.'` and `return`; never reaches the inbox branch. |
| F-04 | Duplicate-check runs BEFORE inbox branch (ordering) | Code (`:1739` precedes `:1743`) | The `identities.length===0` block is physically above the `!data.session` block, so a duplicate (which also has `session:null`) is caught as duplicate, not mislabeled "check your inbox". |
| F-05 | New email + confirmations OFF → logs in, unchanged (#3) | Code (`:1743`) + Manual | Non-empty `identities` + truthy `data.session` → neither branch fires; function returns, auth state listener signs the user in. No error shown. |
| F-06 | Duplicate email + confirmations OFF → friendly via catch (#4) | Code (`:1751-1752`) + Manual | `signUp` throws "User already registered"; regex matches; in signup mode → friendly message (same string as F-03). |
| F-07 | Google-OAuth email, then email signup, confirmations ON (#5) | Code (`:1738-1742`) + Manual | Account exists via Google → email `signUp` returns empty `identities` → same friendly duplicate message (same path as F-03). |
| F-08 | Wrong creds on LOGIN tab NOT re-themed (#7) | Code (`:1751` `mode==='signup'` gate) | In login mode, even if a thrown message contained "already…", the gate is false → `setError(err.message)` verbatim. Real login errors ("Invalid login credentials") always pass through unmodified. |
| F-09 | `error` reset on each submit and on tab switch | Code (`:1722`, `:1782`) | `submit` does `setError('')` first; switching tab does `setError('')`. A stale duplicate message cannot persist into the next attempt/tab. |
| F-10 | `loading`/button state restored after each path | Code (`:1756-1758` `finally`) | `setLoading(false)` runs in `finally` for every branch incl. early `return`s inside `try` and thrown errors, so the submit button never stays disabled ("Opening the archive…"). |

---

## 3. Pure-Function Unit Cases — extracted decision predicate

The decision is not currently a standalone function, so for unit testing we extract its exact logic into a pure predicate `classifySignup({ data, error }, mode)` that returns one of `'duplicate' | 'confirm-email' | 'ok' | 'verbatim:<msg>'`, mirroring lines 1738–1755 **byte-for-byte in behavior** (same guards, same order, same regex, same mode gate). Each row is one assertion. Repo is ESM; run with a Node snippet, no deps, no runner added.

| ID | Input (mocked `signUp` result) → mode | PASS criterion |
|---|---|---|
| U-01 | `{ user: { identities: [{provider:'email'}] }, session: null }` → signup | → `confirm-email` (new user, confirmations ON). Mirrors #1 / F-02. |
| U-02 | `{ user: { identities: [] }, session: null }` → signup | → `duplicate` (empty identities). Mirrors #2 / F-03 — THE FIX. |
| U-03 | `{ user: { identities: [{provider:'email'}] }, session: { access_token:'x' } }` → signup | → `ok` (new user, confirmations OFF, logged in). Mirrors #3 / F-05. |
| U-04 | thrown `{ message: 'User already registered' }` → signup | → `duplicate` via catch regex. Mirrors #4 / F-06. |
| U-05 | thrown `{ message: 'User already registered' }` → **login** | → `verbatim:User already registered` (mode gate blocks re-theme). Mirrors #7 / F-08. |
| U-06 | thrown `{ message: 'Invalid login credentials' }` → login | → `verbatim:Invalid login credentials` (unchanged). |
| U-07 | `{ user: { identities: [] }, session: { access_token:'x' } }` → signup | Guard: even with empty identities the duplicate branch is evaluated **before** session — must classify `duplicate` (the real-world enumeration response always has `session:null`, but order must hold). Mirrors F-04. |

---

## 4. Edge Cases & Fallbacks

| ID | Scenario | Method | PASS criterion |
|---|---|---|---|
| E-01 | Malformed: `data.user` is null/undefined (#8) | Unit + Code | `data?.user?.identities` is `undefined`; `Array.isArray(undefined)===false` → duplicate branch **skipped**; falls through to `!data.session` → inbox copy. Must NOT show a false "already registered". |
| E-02 | Malformed: `identities` undefined (key absent) (#8) | Unit + Code | Same as E-01 — `Array.isArray(undefined)===false`; no false duplicate; reaches inbox/ok path. This is exactly why the guard is `Array.isArray`, not `identities.length===0` alone. |
| E-03 | `identities` present but non-array (e.g. `null`) | Unit | `Array.isArray(null)===false` → not treated as duplicate; no throw on `.length`. |
| E-04 | Thrown error with **no** `message` property | Unit + Code | `/.../.test(err.message \|\| '')` → tests `''` → no match → falls to `else setError(err.message)` (which would be `undefined`); does NOT crash. (Note: verbatim message may be `undefined`/blank — acceptable, not a regression; flag if it surfaces a literal "undefined".) |
| E-05 | Regex breadth — "already exists" wording | Unit | Message "Email already exists" matches `already\s*(registered\|exists)` → friendly. Confirms both vocab variants covered. |
| E-06 | Regex false-positive guard | Unit | A benign signup error like "Password is too weak" does NOT match the regex → shown verbatim (no mislabel as duplicate). |
| E-07 | `data.session` access when `data` is `{}` (no user, no session) | Code | `data?.user?.identities` → undefined (safe via `?.`); then `if (!data.session)` reads `data.session` **without** optional chaining (`:1743`). If `data` itself were null this line throws — but `signUp` resolving with `error:null` always returns a `data` object, so acceptable. Flag as a latent fragility, not a fail, unless `data` can be null on a non-error resolve. |
| E-08 | Live Chrome confirmation (OPTIONAL) | Manual/Playwright | Documented manual steps below; not auto-runnable without a real Supabase project + dev server + known confirm setting. Record as "manual step", do not fake. |

### Manual (Chrome) steps for E-08 / F-02,03,05,06,08 (optional, requires live env)
1. `npm run dev`, open in Chrome. Confirm the project's email-confirmation setting in the Supabase dashboard (Auth → Providers → Email).
2. Confirmations ON: sign up a brand-new email → expect "Check your inbox…". Sign up the **same** email again → expect "That email is already registered…".
3. Confirmations OFF: new email → lands in app; same email again → expect the friendly "already registered" (catch path).
4. Login tab, wrong password → expect "Invalid login credentials" verbatim (not re-themed).

---

## Out of scope (do NOT test here)

- The OAuth flow itself (`signInWithGoogle`) beyond the empty-identities consequence (F-07).
- Supabase rate-limiting / network-failure messaging (generic, pre-existing).
- Visual/design-system review of the auth page (owned by design-guardian).
