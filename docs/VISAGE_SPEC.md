# The Visage (Avatar Creation) — Implementation Spec

**Status:** Designed and approved. Reference prototype:
`prototype/hushthorn-visage.jsx` — the working architecture with placeholder
art. Asset production guides: `docs/VISAGE_PROMPT_TEMPLATES.md` (painterly
PNG path) and `docs/VISAGE_FIGMA_SETUP.md` (vector SVG path).

**Feature in one line:** Users create a reader avatar two ways — **Gallery**
(pick a finished preset portrait) or **Atelier** (layered mix-and-match
builder) — across three forms: **The Rose** (feminine), **The Thorn**
(masculine), **The Vine** (non-binary). Saving ("Seal the Likeness") flattens
the avatar to a single image displayed everywhere in the app.

---

## Structural rules — DO NOT deviate

These are the load-bearing decisions. Changing any of them requires a
deliberate conversation, not a refactor-in-passing.

1. **The layer stack order is fixed.** Bottom → top:
   `aura → body base → outfit → head/face base → eyes → nose → mouth → hair → accessory`.
   Every renderer (live preview, sealing canvas, future RN port) composes in
   this exact order. Hair is ABOVE facial features; outfit is BELOW the head.

2. **One trait state object drives everything.** The shape is:
   ```js
   { form, skin, hairStyle, hairColor, outfit, eyes, nose, mouth, accessory }
   ```
   The preview, the sealer, presets, randomize, and the DB `traits` column
   all use this one shape. Never fork a second representation.

3. **Form never restricts traits.** `form` shapes the base body silhouette
   and curates which presets the Gallery shows. It does NOT gate outfits,
   hair, or accessories in the Atelier — every combination stays open
   (deliberate, especially for The Vine). Do not add per-form trait gating.

4. **Seal = flatten + persist both representations.** Sealing produces a
   single flattened PNG (≥512px) uploaded to Storage AND writes the trait
   JSON to the `avatars` row. The app displays ONLY the flattened image
   (nav, marginalia bylines, shared libraries) — it never re-composites
   layers outside the Atelier. The trait JSON exists solely so the avatar
   is re-editable.

5. **Facial pickers ship dark.** Eyes/nose/mouth pickers are implemented
   and working in the prototype but launch HIDDEN behind a feature flag
   until Phase 3 art exists. Hidden means: silent defaults, zero UI trace.
   Do not delete them; do not show them early.

6. **Placeholder art is disposable; architecture is not.** The prototype's
   inline SVG traits get replaced by real assets (PNG layers or
   designer SVGs). When swapping art, the components' props, the layer
   order, and the trait keys stay identical.

## Phased rollout (build in this order)

- **Phase 1 — Gallery only.** Generated painterly preset portraits served
  from Storage (`avatar-assets/presets/{form}/preset-{form}-NN.webp`).
  Ships as soon as art exists. The Atelier tab is hidden.
- **Phase 2 — Atelier, core traits.** Form, skin tone, hair (style × color),
  outfit, accessory. Facial pickers flagged off.
- **Phase 3 — flip the facial-picker flag** when eye/nose/mouth art lands.
  Zero code changes by design.

## Verbiage — locked

| Element | Copy |
|---|---|
| Feature name | The Visage |
| Feature tagline | "Every reader has a face in the dark" |
| Form selector label | "Choose your form" |
| Feminine form | **The Rose** — subtitle "feminine" — "Your story, your aesthetic." |
| Masculine form | **The Thorn** — subtitle "masculine" — "Every character has a story. This one is yours." |
| Non-binary form | **The Vine** — subtitle "non-binary" — "Be soft. Be bold. Be entirely you." |
| Mode tabs | "Gallery — choose a likeness" / "Atelier — craft your own" |
| Save action | "✦ Seal the Likeness ✦" |
| Shuffle action | "⟳ Randomize" (stays within the selected form) |

Every form name displays with its clear subtitle — themed copy never at the
cost of clarity (per CLAUDE.md design system).

## Supabase schema

Extend the existing `avatars` table — do not replace it:

```sql
alter table avatars add column if not exists form text
  check (form in ('rose','thorn','vine'));
alter table avatars add column if not exists traits jsonb;
alter table avatars add column if not exists image_path text;
alter table avatars add column if not exists preset_name text; -- null = Atelier-made
alter table avatars add column if not exists updated_at timestamptz default now();
```

RLS: **owner-only** read/write (`user_id = auth.uid()`), matching the
table's existing policy.

**The one permitted widening (if/when shared libraries need it):** library
co-members may read a member's `image_path` (the picture, to display beside
shared books) via a narrow SELECT grant through library membership — **never
the `traits` column, never write access.** Same privacy-seam discipline as
`docs/SHARED_LIBRARY_SPEC.md`.

Storage layout, bucket `avatar-assets`:

```
/presets/rose/preset-rose-01.webp     (public read)
/presets/thorn/preset-thorn-01.webp
/presets/vine/preset-vine-01.webp
/layers/base-skin-03.png              (public read; Phase 2+)
/layers/hair-02-black.png
/sealed/{user_id}.png                 (public read, owner write)
```

Preset metadata (name, form, path, display order) lives in a small
`visage_presets` table or a static JSON — either is fine; pick one and note
it here when decided.

## Sealing implementation notes

- Prototype seals by serializing the composed SVG → canvas → `toDataURL`.
  With PNG layers this simplifies to `ctx.drawImage` per layer in stack
  order onto a 512×640 canvas over the `#0c0714` background.
- Upload order: **image to Storage first, then the `avatars` row update**
  (traits + image_path together). Never leave a row pointing at a missing
  image. On upload failure, keep the previous row untouched and surface a
  retry — never a dead end (per CLAUDE.md fallback convention).
- Cache-bust the displayed avatar after sealing (`?v=updated_at`) so the
  nav image refreshes without a reload.

## Asset conventions (summary — details in the paired docs)

- Painterly layers: transparent PNG on a shared 1024×1280 canvas; names
  `base-skin-NN.png`, `hair-NN-color.png`, `outfit-NN.png`, `eyes-NN.png`,
  `acc-name.png`.
- Vector layers: drawn on a 320×400 Figma frame matching the prototype's
  viewBox; recolorable fills use sentinel colors swapped to props on import
  (`#FF0000` → `fill={c1}`, `#00FF00` → `fill={c2}`).
- Presets: 1024×1280 masters, 512×640 WebP app copies, eyes at ~40% from
  top, head ~55% of frame height.

## Test cases (QE checklist)

- [ ] Seal from Gallery and from Atelier both produce a valid PNG ≥512px
- [ ] Storage upload precedes the row update; a forced upload failure leaves
      the previous avatar intact and shows a retry path
- [ ] Loading a saved avatar restores every trait from `traits` jsonb,
      including `form`
- [ ] Randomize never changes the selected form
- [ ] Switching form in the Atelier re-renders body/outfit without resetting
      other traits
- [ ] Facial-picker flag off: eyes/nose/mouth take silent defaults, no UI trace
- [ ] RLS probe: a second user's session token reads zero `avatars` rows
      belonging to the first user (silent filter, not an error)
- [ ] Sealed image cache-busts in the nav immediately after sealing
- [ ] Gallery with an empty preset set for a form shows a graceful
      "portraits arriving soon" state, not a broken grid

## Build decisions — inline-SVG-first (2026-07-07, approved)

The painterly-PNG and Figma asset guides referenced above are **not in the repo**,
but the prototype's inline SVG art **is** and is on-brand. Approved plan:

- **Art path = the prototype's inline SVG** (`prototype/hushthorn-visage.jsx`,
  `AvatarSVG` + layer components). No asset-generation pipeline needed to launch.
  Custom designer SVGs swap in later behind the **same trait keys + layer order**
  (structural rule #6) — zero rework. Target format for the swap: one SVG per
  option per layer, shared `viewBox="0 0 320 400"`, recolor sentinels
  (`#FF0000`→`c1`, `#00FF00`→`c2`, skin/outfit likewise).
- **Ship Gallery AND Atelier together now.** Gallery presets render from trait
  combos through the same `AvatarSVG` (no `.webp` dependency), exactly as the
  prototype does. This supersedes the "Phase-1 Gallery-only-first" ordering,
  which only existed because painterly presets had to be produced first.
- **Facial pickers ship ON.** Rule #5 flagged eyes/nose/mouth dark *until art
  exists* — the prototype art exists, so the flag flips on at launch.
- **Unchanged: every structural rule** (§"Structural rules — DO NOT deviate"):
  layer order, single `traits` object, form-never-gates-traits, seal =
  upload flattened PNG to Storage **before** the `avatars` row update, the app
  displays only `image_path` everywhere (privacy seam — co-members read the
  image, never `traits`), locked verbiage, the schema, owner-only RLS + the
  narrow `image_path` co-member widening.
- **Integration:** port into the single-file `src/App.jsx`, replacing the current
  `MiniAvatar`/`AvatarPage` (gender/hair/skin/robe). Existing `avatars` rows have
  no `traits`/`image_path`: on load, fall back to a default sealed-less visage and
  prompt the user to create theirs; roster reads (`:1622`, `:3195`) switch to
  `image_path`. The old `gender`/`hair_color`/`skin_tone`/`robe_color` columns stay
  (unused) for back-compat.

## Where this file lives

`docs/VISAGE_SPEC.md`, alongside `VISAGE_PROMPT_TEMPLATES.md` and
`VISAGE_FIGMA_SETUP.md`. The prototype at `prototype/hushthorn-visage.jsx`
carries a condensed copy of these rules in its header — if the two ever
disagree, this spec wins; update both in the same commit.
