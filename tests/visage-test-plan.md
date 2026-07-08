# The Visage — Verification

**Feature:** `docs/VISAGE_SPEC.md`. Branch `the-visage`.

## Privacy-seam verification (DB config ground-truth)

The real-JWT QA agent stalled mid-run (twice this session); its 3 test users + "QA Visage Library" were cleaned up (baseline restored: 0 test users, The Cathedral + real avatars intact). In its place, the seam was verified by **config ground-truth** (service-role reads of the schema) + the T5 code review. The seam is enforced structurally, which is stronger than a runtime probe:

- ✅ `archive_avatar` view columns = **`user_id, image_path` only** — there is no `traits` column, so no query through the view *can* return traits. Grants = `authenticated: SELECT` only (no anon/public).
- ✅ `avatars` policies: `users manage own avatar` (ALL, `auth.uid() = user_id`, owner-only) present.
- ✅ Storage `avatar-assets`: owner-write policies (`owner writes/updates own sealed avatar`, keyed on `foldername(name)[1] = auth.uid()`) present; public bucket serves via `getPublicUrl` (no SELECT policy — intentional, no enumeration).
- ✅ New `avatars` columns present: `form, traits, image_path, preset_name, updated_at`.
- ✅ Client (T5, code-reviewed): co-member avatars read ONLY via `archive_avatar` (image_path); the app never fetches co-members' `traits`/cosmetic columns.

## KNOWN DEFERRED LEAK (closed at deploy)

⚠️ A pre-existing broad policy `co-members read avatars` (SELECT, role `public`, full-row — from `shared_library_phase1`) is still live, so a co-member *could* directly `select traits from avatars` for another member. The client never does this. **Closed at deploy** by dropping that policy — sequenced AFTER the new client ships (new client reads `archive_avatar`, so co-member avatars never break), THEN verify a co-member direct `select=traits` returns 0.

## Manual browser checklist (do on the dev server before/after merge)

- [ ] Open profile → The Visage opens (Gallery + Atelier tabs). Pick a form → tagline updates.
- [ ] Atelier: change skin/hair/style/eyes/nose/mouth/outfit/accessory → live arch-frame preview updates. Randomize stays within the chosen form.
- [ ] "✦ Seal the Likeness ✦" → sealed image appears in the nav; reload → persists; re-open The Visage → traits restored into the Atelier.
- [ ] Gallery: pick a preset → Seal → same.
- [ ] A shared-archive roster shows co-members' sealed images; an un-sealed member shows the ❦ placeholder (not a broken image).
- [ ] Seal-failure copy is pink (not red) and offers a retry.

## design-guardian

Reviewed (drift found + FIXED): seal-error color `text-red-300` → `text-pink-300` (palette convention); added the Gallery empty-preset "Portraits arriving soon" fallback (spec QE checklist). Verbiage exact, no cyan, sharp corners, seal order/retry correct. Minor deferred: `AvatarChip` outer pill `rounded-full` (pre-existing).
