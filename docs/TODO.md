# Hushthorn — TODO / Backlog

Features designed but parked, with links to their specs. Pick one up by reading
its spec, clearing the blocker, then running the listed agent chain.

## ⚔ Verdict half-step rating

Redesign the **Verdict** rating into a single **evolving dagger emblem** that
represents a **1–5 score in 0.5 steps** (dagger → rose → leaves → chain → vine →
crown at 5), using supplied artwork.

- **Status:** TODO — designed, not started.
- **Blocked on:** the developer to drop **9 emblem PNGs** (256×256, transparent,
  one uniform canvas/anchor, no labels) into `src/assets/verdict/` named
  `verdict-10.png … verdict-50.png` (score×10).
- **Spec:** [2026-06-16-verdict-half-step-rating-design.md](superpowers/specs/2026-06-16-verdict-half-step-rating-design.md)
- **Agent chain:** `supabase-migrator` (`books.overall` → `numeric(2,1)`) →
  `frontend-dev` (emblem UI, .5 input, wire assets, fix `'⚔'.repeat`/import) →
  `design-guardian` + `qa-tester`.

## 🔐 Richer account creation + 2-step verification

Expand sign-up to collect more identity up front and add phone-based 2-step
verification. **Deferred by the developer's call: do this during a dedicated
security + database-enhancements pass, once the core app is built out** — not now.

- **Status:** TODO — requested 2026-06-30, not yet designed.
- **Scope:**
  - Move **username** into the sign-up form itself (today it's claimed via the
    post-signup gate shipped in Shared Library Phase 1 — see that spec / the
    `profiles` table + `UsernameGate` in `src/App.jsx`).
  - Collect **first name** and **last name** (new `profiles` columns).
  - Collect a **phone number** and wire **2-step verification (2FA)** on it.
- **Dependencies / decisions to make at design time:**
  - Phone 2FA via Supabase Auth MFA needs an **SMS provider** (Twilio/MessageBird)
    configured in the Supabase dashboard — has cost + setup. **TOTP** (authenticator
    app) is a provider-free alternative worth weighing.
  - Decide where phone lives: Supabase auth (phone identity) vs a `profiles`
    column; and whether first/last name are required or optional.
  - Revisit the sign-up UX: it currently obfuscates duplicate emails
    (CWE-204 tradeoff the developer accepted) — keep that intact.
- **Blocked on:** the security/DB-enhancements pass starting, and an SMS-provider
  decision for phone 2FA.
- **Agent chain (when picked up):** `supabase-migrator` (profiles columns, any
  MFA-related schema) → `backend-dev` (Supabase MFA enrollment/challenge wiring) →
  `frontend-dev` (multi-field sign-up + enrollment/verify UI) →
  `design-guardian` + `qa-tester` (auth-flow + RLS regression).
