# The Visage (Avatar Creation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current simple avatar (gender + hair/skin/robe color) with **The Visage** — a Gallery (preset portraits) + Atelier (layered builder) across three forms, whose selection is flattened ("sealed") to a single PNG in Supabase Storage and displayed everywhere.

**Architecture:** Port the approved prototype (`prototype/hushthorn-visage.jsx`) into the single-file `src/App.jsx`, wiring the mock seal to real Supabase Storage + the `avatars` row. Art is the prototype's inline SVG (custom SVGs swap in later behind identical trait keys). One migration extends `avatars` + adds the `avatar-assets` bucket.

**Tech Stack:** React 18 (single file), Tailwind utility classes + `FONT_CSS`, Supabase JS (Postgres + Storage), canvas 2D for sealing.

## Global Constraints

Copied from `docs/VISAGE_SPEC.md` (§"Structural rules — DO NOT deviate") + its Build-Decisions addendum. Every task implicitly includes these:

- **Layer stack order is fixed**, bottom→top: `aura → body base → outfit → head/face base → eyes → nose → mouth → hair → accessory`. Hair is ABOVE facial features; outfit BELOW head. Every renderer composes in this exact order.
- **One trait object drives everything:** `{ form, skin, hairStyle, hairColor, outfit, eyes, nose, mouth, accessory }`. Preview, seal, presets, randomize, and the DB `traits` column all use this shape. Never fork a second representation.
- **Form never restricts traits** — it shapes the body silhouette + curates Gallery presets; the Atelier keeps every combination open. No per-form trait gating.
- **Seal = flatten + persist both:** produce a flattened PNG (canvas 512×640 over `#0c0714`), **upload the image to Storage FIRST, then update the `avatars` row** (traits + image_path + form + preset_name + updated_at). Never leave a row pointing at a missing image. On upload failure keep the previous row and surface a retry — never a dead end.
- **The app displays ONLY `image_path`** (the sealed PNG) everywhere (nav, profile, shared-archive rosters, marginalia). It never re-composites layers outside the Atelier. Privacy seam: co-members read a member's **`image_path` only, never `traits`**, never write.
- **Facial pickers ship ON** (art exists in the prototype).
- **Verbiage locked:** feature "The Visage"; tagline "Every reader has a face in the dark"; forms **The Rose** (feminine) / **The Thorn** (masculine) / **The Vine** (non-binary), each shown with its subtitle; "Choose your form"; modes "Gallery — choose a likeness" / "Atelier — craft your own"; "✦ Seal the Likeness ✦"; "⟳ Randomize".
- **Schema (extend `avatars`, don't replace):** `form text check (form in ('rose','thorn','vine'))`, `traits jsonb`, `image_path text`, `preset_name text` (null = Atelier-made), `updated_at timestamptz default now()`. Keep existing `gender`/`hair_color`/`skin_tone`/`robe_color`/`name` for back-compat.
- **RLS owner-only** read/write on `avatars` (`user_id = auth.uid()`); the ONLY widening is a narrow SELECT of `image_path` for library co-members.
- **Design system:** sharp corners `rounded-sm`/`rounded-md`, Cinzel via `ht-display`, **cyan reserved for audio only** (avatars use violet/pink/skin tones, never cyan), the arch-frame preview (`.ht-arch`). Themed-but-clear copy.
- **No UI unit-test runner:** verification = `npm run build` passes (only the pre-existing 500 kB chunk advisory) + the manual checklist per task; storage/RLS assertions use the repo's real-JWT method. No `.test` files.
- All UI lives in `src/App.jsx` (single file). Locate integration points by symbol name (line numbers drift).

---

### Task 1: DB migration — extend `avatars` + `avatar-assets` Storage bucket

**Files:** Supabase migration via MCP (`apply_migration`). No repo file.

**Interfaces:**
- Produces: `avatars.form`, `.traits`, `.image_path`, `.preset_name`, `.updated_at`; bucket `avatar-assets`; sealed-object policies; a co-member `image_path` read path (see below).

- [ ] **Step 1: Apply the schema migration** `visage_avatar_columns`:

```sql
alter table public.avatars add column if not exists form text
  check (form in ('rose','thorn','vine'));
alter table public.avatars add column if not exists traits jsonb;
alter table public.avatars add column if not exists image_path text;
alter table public.avatars add column if not exists preset_name text;
alter table public.avatars add column if not exists updated_at timestamptz default now();
```

- [ ] **Step 2: Create the Storage bucket + policies** (`visage_storage`). Public read (covers/avatars are public URLs), owner-only write under `{auth.uid()}/…`:

```sql
insert into storage.buckets (id, name, public) values ('avatar-assets','avatar-assets', true)
  on conflict (id) do nothing;
-- public read of objects (public bucket serves object URLs; keep listing narrow later)
create policy "avatar-assets public read" on storage.objects
  for select using (bucket_id = 'avatar-assets');
create policy "owner writes own sealed avatar" on storage.objects
  for insert with check (bucket_id = 'avatar-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own sealed avatar" on storage.objects
  for update using (bucket_id = 'avatar-assets' and (storage.foldername(name))[1] = auth.uid()::text);
```
(Sealed path is `sealed/{user_id}.png` — see Task 4. The owner-write check keys on the first folder segment = the uid; adjust the sealed path to `{user_id}/sealed.png` so `foldername[1]` is the uid. **Use path `{user_id}/sealed.png`.**)

- [ ] **Step 3: Co-member `image_path` read (privacy seam).** `avatars` stays owner-only for `traits`. To let archive co-members see each other's avatar image, add a SELECT policy that exposes rows to co-members but the CLIENT must select only `image_path` (RLS is row-level, so document that co-member queries select `image_path` — traits are never sent). Add:

```sql
create policy "co-members read avatars" on public.avatars
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.library_members m_me
      join public.library_members m_them on m_them.library_id = m_me.library_id
      where m_me.user_id = auth.uid() and m_them.user_id = avatars.user_id
    )
  );
```
NOTE: this widens row visibility to co-members for ALL columns at the RLS layer. Because that would expose `traits`, **the roster query MUST select only `user_id, image_path`** (Task 5). If strict column-hiding is required, replace this with a SECURITY DEFINER view `archive_avatar (user_id, image_path)` gated on co-membership (mirror `archive_shelf`) and grant SELECT to authenticated — **prefer the view** for the same no-leak discipline as the shared-library spec. Implement the view:

```sql
create or replace view public.archive_avatar with (security_invoker = false) as
  select a.user_id, a.image_path
  from public.avatars a
  join public.library_members m_them on m_them.user_id = a.user_id
  join public.library_members m_me on m_me.library_id = m_them.library_id and m_me.user_id = auth.uid();
revoke all on public.archive_avatar from public, anon;
grant select on public.archive_avatar to authenticated;
```
Use the **view** (`archive_avatar`) and do NOT add the broad co-members `avatars` policy. Keep `avatars` owner-only.

- [ ] **Step 4: Verify.** `get_advisors(security)` — expect a new intentional `security_definer_view` finding for `archive_avatar` (same rationale as `archive_shelf`/`archive_reveal`), no other new errors. Confirm columns exist via `list_tables`.

**Verification:** advisors clean except the one intended definer-view finding; `avatars` has the 5 new columns; bucket exists.

---

### Task 2: Port trait model + `AvatarSVG` art into `src/App.jsx`

**Files:** Modify `src/App.jsx` (add near the other module-level helpers/components; do NOT remove `MiniAvatar` yet — Task 5 swaps it).

**Interfaces:**
- Produces: `SKIN_TONES`, `HAIR_COLORS`, `HAIR_STYLES`, `OUTFITS`, `EYES`, `NOSES`, `MOUTHS`, `ACCESSORIES`, `FORMS`, `DEFAULT`, `randomTraits(form)`, `shade(hex,amt)`, and `AvatarSVG({ t, size })` with layer components `Eyes/Nose/Mouth/Hair/Outfit/Accessory` — copied verbatim from `prototype/hushthorn-visage.jsx:112-368` (the trait constants + `AvatarSVG` + `shade` + layer components).

- [ ] **Step 1: Copy the trait constants + `shade` + `randomTraits`** (`prototype:112-157`) to module scope in `src/App.jsx`. Names/values verbatim.
- [ ] **Step 2: Copy `AvatarSVG` + `Eyes`/`Nose`/`Mouth`/`Hair`/`Outfit`/`Accessory`** (`prototype:164-368`) verbatim. These are pure SVG from a `t` (traits) object on `viewBox 0 0 320 400`.
- [ ] **Step 3: Confirm no name clashes** with existing symbols (the app already has an `Outfit`? grep; if any collide, prefix the new ones `Visage`—e.g. `VisageAvatar`, `VisageHair`—consistently, but keep `AvatarSVG` as the public name).
- [ ] **Step 4: Build.** `npm run build` passes. (No UI yet; this is the render engine.)
- [ ] **Step 5: Commit.** `git add src/App.jsx && git commit -m "feat(visage): port trait model + AvatarSVG layer art"`

**Verification:** build passes; `AvatarSVG` is defined and self-contained (renders from a traits object).

---

### Task 3: The Visage screen (Gallery + Atelier), replacing `AvatarPage`

**Files:** Modify `src/App.jsx` — replace `AvatarPage` (~`:3362`) with the Visage screen; add `PRESETS`, `ModeTab`, `Picker`, `Tile` (from `prototype:370-631`). Keep the same `AvatarPage` component NAME + call site props (`{ avatar, username, books, session, onSave, onClose }`) so the profile entry point is unchanged.

**Interfaces:**
- Consumes: `AvatarSVG`, trait constants, `randomTraits` (Task 2). The existing `onSave` prop + `onClose`.
- Produces: a `traits` state (seeded from the loaded avatar — see back-compat), `mode` (gallery|atelier), `form`, `chosenPreset`. Task 4 adds the real seal.

- [ ] **Step 1: Copy `PRESETS`, `ModeTab`, `Picker`, `Tile`** (`prototype:370-389, 600-631`) into `src/App.jsx`.
- [ ] **Step 2: Rebuild `AvatarPage`** from the prototype's `TheVisage` component (`prototype:393-598`): header/tagline, mode tabs, Gallery (form select + preset grid + "awaiting art" is DROPPED — render only real presets), Atelier (pickers incl. facial ON, sticky arch-frame preview, Seal + Randomize). Keep the shared `Overlay` wrapper (this is a modal in-app) — wrap the screen in `<Overlay onClose={onClose} label="The Visage" wide>`.
- [ ] **Step 3: Seed traits from the saved avatar (back-compat).** On mount: if `avatar.traits` exists → `useState(avatar.traits)` and `mode='atelier'`; else map the legacy row → an initial traits object: `form` from legacy `gender` (`masc/male→thorn`, `fem/female→rose`, else `vine`), everything else from `DEFAULT`. New users → `DEFAULT`, `mode='gallery'`.
- [ ] **Step 4: Wire Randomize** (`randomTraits(traits.form)`), form select, and all pickers to `set(k,v)` exactly as the prototype. Facial pickers (Eyes/Nose/Mouth) shown.
- [ ] **Step 5: Build + manual.** `npm run build`; open the profile → The Visage opens; switch Gallery/Atelier; pick a preset; edit every picker → live preview updates; Randomize stays within form. (Seal is wired in Task 4 — a temporary `onClose` stub is fine here.)
- [ ] **Step 6: Commit.** `git commit -m "feat(visage): Gallery + Atelier editor screen"`

**Verification:** build passes; both modes render; pickers drive the preview; copy matches the locked verbiage.

---

### Task 4: Seal → Storage + persist the `avatars` row

**Files:** Modify `src/App.jsx` — the `seal()` in `AvatarPage` + the parent `onSave` path (grep the current avatar-save: `AvatarPage`'s `onSave` prop is wired near the profile render; the save mapping is around `:1536`).

**Interfaces:**
- Consumes: `AvatarSVG` (hidden render target), `session.user.id`, `supabase`.
- Produces: on Seal → `avatar-assets/{uid}/sealed.png` uploaded, then `avatars` row upserted with `{ form, traits, image_path, preset_name, updated_at }`; parent avatar state updated + cache-bust value.

- [ ] **Step 1: Real `seal()`.** Flatten the composed `AvatarSVG` (hidden ref target) to PNG via canvas 512×640 over `#0c0714` (prototype `seal():407-421`), producing a `Blob` (`canvas.toBlob`). Then:
  1. `await supabase.storage.from('avatar-assets').upload('${uid}/sealed.png', blob, { upsert: true, contentType: 'image/png' })`. On error → surface a themed retry ("The likeness wouldn't hold — try sealing again."), do NOT touch the row. **Image first.**
  2. `const image_path = supabase.storage.from('avatar-assets').getPublicUrl('${uid}/sealed.png').data.publicUrl`.
  3. `await supabase.from('avatars').update({ form: traits.form, traits, image_path, preset_name: chosenPreset ?? null, updated_at: new Date().toISOString() }).eq('user_id', uid)` (the row already exists from signup). On error → themed retry.
- [ ] **Step 2: Cache-bust.** Return/lift `image_path + '?v=' + updated_at` so displays refresh without reload; call `onSave({ form, traits, image_path, preset_name })` and `onClose()` on success.
- [ ] **Step 3: Parent `onSave`.** Update the app's avatar state with the new `form/traits/image_path` (extend the existing avatar state object + its save mapping ~`:1536`; keep writing legacy columns untouched).
- [ ] **Step 4: Build + real-JWT storage check.** `npm run build`; with a real user JWT: seal → confirm `avatar-assets/{uid}/sealed.png` exists (200) and the `avatars` row has `image_path`+`traits`; force an upload failure (e.g. bad path) → row unchanged + retry shown.
- [ ] **Step 5: Commit.** `git commit -m "feat(visage): seal to Storage then persist avatars row"`

**Verification:** seal produces a ≥512px PNG in Storage; row updates AFTER upload; re-opening restores every trait from `traits`; upload failure leaves the previous avatar intact.

---

### Task 5: Display the sealed image everywhere (swap `MiniAvatar`)

**Files:** Modify `src/App.jsx` — `MiniAvatar` (~`:3034`) and every avatar render site (nav/profile thumbnail; shared-archive rosters; marginalia bylines if present). Roster reads at `:1622` and `:3195`.

**Interfaces:**
- Consumes: `image_path` (own avatar) + the `archive_avatar` view (co-members).
- Produces: `MiniAvatar` renders `<img src={image_path?v=…}>`; fallback for un-sealed.

- [ ] **Step 1: Rework `MiniAvatar`** to take an `imagePath` (+ `size`) and render `<img src={imagePath} …>` (rounded per current, object-cover). Fallback when no `imagePath`: a neutral placeholder (the arch/mask glyph or a muted circle) — do NOT re-composite `AvatarSVG` for co-members (privacy: you don't have their traits). For the SELF nav thumbnail only, an un-sealed user may show a small "create your visage" prompt.
- [ ] **Step 2: Update own-avatar displays** (nav/profile) to pass `avatar.image_path` (with `?v=updated_at`). Un-sealed self → prompt to open The Visage.
- [ ] **Step 3: Update roster reads for co-members.** Replace the `avatars` selects at `:1622` and `:3195` (which fetch `gender/hair_color/…`) with a read from **`archive_avatar`** (`user_id, image_path`) for co-members; map into `MiniAvatar imagePath`. Co-members' `traits` are never fetched.
- [ ] **Step 4: Build + manual.** `npm run build`; sealed avatar shows in nav + a shared-archive roster; a co-member's sealed avatar shows beside shared books; an un-sealed user shows the placeholder, not a broken image.
- [ ] **Step 5: Commit.** `git commit -m "feat(visage): display sealed image everywhere; co-members read image_path only"`

**Verification:** every avatar surface shows the sealed PNG; co-member path reads image only; un-sealed → graceful placeholder.

---

### Task 6: QA + design-guardian

**Files:** Create `tests/visage-test-plan.md`; append `tests/report.md`.

- [ ] **Step 1: Real-JWT QA** (users A owner, B co-member, C outsider): seal produces ≥512px PNG; upload precedes row update (forced-failure leaves prior avatar intact); re-edit restores all traits incl `form`; Randomize keeps form; **RLS/privacy:** B reads A's avatar image via `archive_avatar` but B directly querying `avatars` for A's `traits` → 0 rows; C (non-member) gets 0 from `archive_avatar`; owner-only write holds.
- [ ] **Step 2: design-guardian** review of The Visage screen (arch-frame, Cinzel labels, sharp corners, **no cyan** on avatars, locked verbiage, themed-but-clear copy).
- [ ] **Step 3: Report** PASS/FAIL + evidence; clean up test users/rows; commit artifacts. `git commit -m "test(visage): real-JWT QA + design review"`

**Verification:** all spec §"Test cases" pass; no privacy leak of `traits`; design-guardian clean.

## Self-review

- **Spec coverage:** schema+storage+privacy-seam (T1) · trait model + art (T2) · Gallery+Atelier + back-compat seeding (T3) · seal→Storage→row image-first + retry (T4) · display image_path everywhere + co-member image-only (T5) · QA incl. RLS/privacy + design (T6). All structural rules + locked verbiage mapped. Facial pickers ON per addendum.
- **Type consistency:** the single `traits` shape `{form,skin,hairStyle,hairColor,outfit,eyes,nose,mouth,accessory}` is produced in T2 and consumed unchanged by T3/T4; `AvatarSVG({t,size})`, `MiniAvatar({imagePath,size})`, `archive_avatar(user_id,image_path)` names are consistent across tasks.
- **No placeholders:** SQL, seal wiring, and port sources (exact prototype line ranges) are concrete; verification is build + manual + real-JWT (no invented test runner).
- **Privacy seam:** co-member reads go through the `archive_avatar` definer view (image_path only); `avatars` stays owner-only for `traits` — mirrors the shared-library discipline.
