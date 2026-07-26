import { useState, useRef } from "react";

/* ═══════════════ Hushthorn · The Visage — DESIGN PROTOTYPE ═══════════════
   STATUS: ✅ Approved design. This is the UI and architecture to build toward.
   REPO PATH: prototype/hushthorn-visage.jsx
   PAIRS WITH:
     docs/VISAGE_PROMPT_TEMPLATES.md  (asset generation: prompts, pipeline, go/no-go test)
     docs/VISAGE_FIGMA_SETUP.md       (vector asset path: Figma canvas, export, recolor trick)

   FEATURE IN ONE LINE
   "The Visage" — avatar creation. Two modes: GALLERY (pick a finished preset
   portrait) and ATELIER (layered mix-and-match builder). Three forms with
   themed verbiage: The Rose (feminine) · The Thorn (masculine) · The Vine
   (non-binary). Sealing flattens the avatar to one image used app-wide.

   PHASED ROLLOUT (build in this order)
   Phase 1 — GALLERY ONLY, with generated painterly portraits from
     Supabase Storage (preset-{form}-NN.webp). Ships as soon as art exists.
   Phase 2 — ATELIER with core traits: form, skin, hair (style × color),
     outfit, accessory. Facial pickers (eyes/nose/mouth) HIDDEN behind a
     flag — the code below already has them working; only art is pending.
   Phase 3 — flip the flag when facial-feature art lands. Zero code changes.

   THE LAYER STACK (z-order, bottom → top) — do not reorder:
     1 aura/backdrop · 2 body base (per form + skin) · 3 outfit ·
     4 head/face base (skin) · 5 eyes · 6 nose · 7 mouth ·
     8 hair (style × color) · 9 accessory

   WHAT'S MOCK vs. REAL HERE
   - All art is placeholder inline SVG. In production each layer becomes a
     transparent PNG <img> (painterly path) or a designer-drawn SVG with
     prop-swapped fills (vector path) — see the two paired docs. The
     composition model, trait state, forms, randomize, and sealing are
     production logic: port them as-is.
   - PRESETS array = mock. Real gallery reads Storage listing or a
     `visage_presets` table (path, name, form).
   - "Seal the Likeness" is the real flattening step: currently serializes
     SVG → canvas → PNG dataURL. With PNG layers it simplifies to
     ctx.drawImage per layer in z-order. The output uploads to Storage.

   SUPABASE WIRING (existing `avatars` table — extend, don't replace)
     avatars:
       user_id uuid PK → auth.users
       form text check (form in ('rose','thorn','vine'))
       traits jsonb                -- the full trait selection (re-editable)
       image_path text             -- flattened PNG in Storage (displayed everywhere)
       preset_name text null       -- set if chosen from gallery, null if Atelier
       updated_at timestamptz default now()
     RLS: owner-only read/write (user_id = auth.uid()) — avatars are personal.
     EXCEPTION for shared libraries: members may read co-members' image_path
     (the picture only, to show beside shared books) — if implemented, grant
     via a narrow SELECT policy on image_path through library membership,
     NEVER the traits column.
     Storage: bucket `avatar-assets` — /presets/{form}/*.webp (public read),
     /sealed/{user_id}.png (public read, owner write).

   VERBIAGE (locked — matches app voice)
     Feature: "The Visage" · tagline "Every reader has a face in the dark"
     Forms: The Rose (feminine) "Your story, your aesthetic." ·
       The Thorn (masculine) "Every character has a story. This one is yours." ·
       The Vine (non-binary) "Be soft. Be bold. Be entirely you."
     Actions: "Seal the Likeness" (save) · "Randomize" · "Choose your form"
     Modes: "Gallery — choose a likeness" · "Atelier — craft your own"

   DESIGN RULES IN PLAY
   - Form never RESTRICTS traits — it shapes the base silhouette and curates
     gallery presets; the Atelier keeps every combination open (intentional,
     especially for The Vine). Do not add per-form outfit gating.
   - Arch-frame preview (.ht-arch) echoes the brand art — keep it.
   - Sharp corners, Cinzel labels, themed-but-clear copy per CLAUDE.md.

   QE TEST CASES
   - [ ] Seal from Gallery and from Atelier both produce a valid PNG ≥512px
   - [ ] Sealed image uploads to /sealed/{user_id}.png and the avatars row
         updates traits + image_path atomically (or image first, row second —
         never a row pointing at a missing image)
   - [ ] Re-editing: loading a saved avatar restores every trait from
         traits jsonb, including form
   - [ ] Randomize respects the currently selected form
   - [ ] Form switch in Atelier re-renders body/outfit without losing other traits
   - [ ] Facial-picker flag off: eyes/nose/mouth default silently, no UI trace
   - [ ] A user can never read another user's traits jsonb (RLS probe with a
         second session token → zero rows)
═══════════════════════════════════════════════════════════════════════ */

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rozha+One&family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap');
.ht-display { font-family: 'Cinzel', serif; letter-spacing: 0.06em; }
.ht-body { font-family: 'EB Garamond', serif; }
.ht-bg {
  background-color: #0c0714;
  background-image:
    radial-gradient(ellipse 70% 55% at 50% -5%, rgba(76,29,149,0.42), transparent 70%),
    radial-gradient(ellipse 35% 30% at 8% 96%, rgba(236,72,153,0.14), transparent 70%),
    radial-gradient(ellipse 35% 30% at 92% 96%, rgba(168,85,247,0.14), transparent 70%);
  min-height: 100vh;
}
.ht-card {
  background: linear-gradient(165deg, rgba(38,23,64,0.92), rgba(17,10,30,0.96));
  border: 1px solid rgba(217,131,222,0.20);
}
.ht-tile { transition: outline .15s ease, transform .15s ease; outline: 2px solid transparent; }
.ht-tile:hover { transform: translateY(-1px); }
.ht-tile.sel { outline: 2px solid #f0a6e0; box-shadow: 0 0 12px rgba(240,166,224,0.4); }
.ht-arch {
  border: 1px solid rgba(240,166,224,0.35);
  border-radius: 130px 130px 6px 6px;
  box-shadow: inset 0 0 0 3px rgba(12,7,20,0.9), inset 0 0 0 4px rgba(168,85,247,0.3), inset 0 0 50px rgba(124,58,237,0.15);
}
`;

/* ── trait data ────────────────────────────────────────────── */

const SKIN_TONES = ["#f3d9c4", "#eec39a", "#d8a377", "#b97f56", "#96613d", "#6f452b", "#4a2d1c"];
const HAIR_COLORS = [
  { key: "black", c1: "#17121c", c2: "#2a2135" },
  { key: "espresso", c1: "#2e1d12", c2: "#4a301d" },
  { key: "chestnut", c1: "#5b3a21", c2: "#7a5230" },
  { key: "blonde", c1: "#c9a56a", c2: "#e2c58f" },
  { key: "silver", c1: "#b9b4c4", c2: "#dcd7e6" },
  { key: "wine", c1: "#4a1526", c2: "#6d2038" },
  { key: "violet", c1: "#3a2158", c2: "#5b3690" },
];
const HAIR_STYLES = ["updo", "long", "curly", "short"];
const OUTFITS = ["offshoulder", "turtleneck", "hoodie", "shirt"];
const EYES = ["soft", "sharp", "round"];
const NOSES = ["a", "b"];
const MOUTHS = ["full", "smile", "neutral"];
const ACCESSORIES = ["none", "choker", "pendant", "glasses"];

/* ── forms (gender presentation) ───────────────────────────────
   Themed after the app's own iconography — clear label + subtitle
   per the design rule: themed copy, never at the cost of clarity. */
const FORMS = [
  { key: "rose", name: "The Rose", subtitle: "feminine", tagline: "Your story, your aesthetic." },
  { key: "thorn", name: "The Thorn", subtitle: "masculine", tagline: "Every character has a story. This one is yours." },
  { key: "vine", name: "The Vine", subtitle: "non-binary", tagline: "Be soft. Be bold. Be entirely you." },
];

const DEFAULT = {
  form: "rose",
  skin: 1, hairStyle: "updo", hairColor: "black", outfit: "offshoulder",
  eyes: "soft", nose: "a", mouth: "full", accessory: "choker",
};

const rand = (a) => a[Math.floor(Math.random() * a.length)];
const randomTraits = (form) => ({
  form: form || rand(FORMS).key,
  skin: Math.floor(Math.random() * SKIN_TONES.length),
  hairStyle: rand(HAIR_STYLES),
  hairColor: rand(HAIR_COLORS).key,
  outfit: rand(OUTFITS),
  eyes: rand(EYES),
  nose: rand(NOSES),
  mouth: rand(MOUTHS),
  accessory: rand(ACCESSORIES),
});

/* ── the layered avatar (placeholder vector art) ───────────────
   Each layer function returns SVG elements on a shared 320×400
   viewBox. In production each becomes a transparent PNG <img>
   at the same z-index position — the composition model is identical. */

function AvatarSVG({ t, size = 260 }) {
  const skin = SKIN_TONES[t.skin];
  const skinShade = shade(skin, -18);
  const hc = HAIR_COLORS.find((h) => h.key === t.hairColor) || HAIR_COLORS[0];

  return (
    <svg viewBox="0 0 320 400" width={size} style={{ display: "block" }} role="img" aria-label="Your visage">
      {/* 1 · aura */}
      <radialGradient id="aura" cx="50%" cy="28%" r="55%">
        <stop offset="0%" stopColor="rgba(168,85,247,0.35)" />
        <stop offset="100%" stopColor="transparent" />
      </radialGradient>
      <rect width="320" height="400" fill="url(#aura)" />

      {/* 2 · body base — shoulders vary by form */}
      {t.form === "thorn" ? (
        <path d="M76 258 C72 318 58 360 48 398 L272 398 C262 360 248 318 244 258 Z" fill={skinShade} />
      ) : (
        <path d="M92 262 C86 320 70 360 58 398 L262 398 C250 360 234 320 228 262 Z" fill={skinShade} />
      )}
      <path d="M128 250 L192 250 L204 330 Q160 358 116 330 Z" fill={skin} />

      {/* 3 · outfit */}
      <Outfit kind={t.outfit} skin={skin} form={t.form} />

      {/* 4 · head base */}
      <path d="M104 106 C108 58 212 55 216 108 C219 168 194 210 160 212 C126 210 101 168 104 106 Z" fill={skin} />
      {/* neck shadow */}
      <path d="M132 208 Q160 224 188 208 L188 226 Q160 240 132 226 Z" fill={skinShade} opacity="0.5" />

      {/* 5 · eyes */}
      <Eyes kind={t.eyes} />

      {/* 6 · nose */}
      <Nose kind={t.nose} skin={skin} />

      {/* 7 · mouth */}
      <Mouth kind={t.mouth} />

      {/* 8 · hair */}
      <Hair kind={t.hairStyle} c1={hc.c1} c2={hc.c2} />

      {/* 9 · accessory */}
      <Accessory kind={t.accessory} />
    </svg>
  );
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function Eyes({ kind }) {
  if (kind === "sharp")
    return (
      <g>
        <path d="M118 138 Q136 128 154 140 Q136 148 118 138Z" fill="#fdf5ef" /><circle cx="137" cy="139" r="6" fill="#3c2417" />
        <path d="M166 140 Q184 128 202 138 Q184 148 166 140Z" fill="#fdf5ef" /><circle cx="183" cy="139" r="6" fill="#3c2417" />
        <path d="M116 130 Q136 120 156 131 M164 131 Q184 120 204 130" stroke="#1e1420" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    );
  if (kind === "round")
    return (
      <g>
        <ellipse cx="137" cy="141" rx="15" ry="11" fill="#fdf5ef" /><circle cx="137" cy="141" r="7" fill="#3c2417" /><circle cx="139" cy="139" r="2" fill="#fff" />
        <ellipse cx="183" cy="141" rx="15" ry="11" fill="#fdf5ef" /><circle cx="183" cy="141" r="7" fill="#3c2417" /><circle cx="185" cy="139" r="2" fill="#fff" />
        <path d="M120 127 Q137 121 154 127 M166 127 Q183 121 200 127" stroke="#1e1420" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    );
  return (
    <g>
      <path d="M120 140 Q137 130 154 140 Q137 150 120 140Z" fill="#fdf5ef" /><circle cx="137" cy="140" r="6.5" fill="#3c2417" />
      <path d="M166 140 Q183 130 200 140 Q183 150 166 140Z" fill="#fdf5ef" /><circle cx="183" cy="140" r="6.5" fill="#3c2417" />
      <path d="M118 129 Q137 122 156 130 M164 130 Q183 122 202 129" stroke="#1e1420" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Nose({ kind, skin }) {
  const stroke = shade(skin, -55);
  if (kind === "b")
    return <path d="M160 148 C158 164 152 174 158 182 Q164 187 171 181" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />;
  return <path d="M160 148 C159 162 154 172 159 180 Q163 184 168 180" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />;
}

function Mouth({ kind }) {
  if (kind === "smile")
    return (
      <g>
        <path d="M138 196 Q160 210 182 196 Q160 216 138 196Z" fill="#a35a54" />
        <path d="M138 196 Q160 204 182 196" stroke="#6b3336" strokeWidth="1.5" fill="none" />
      </g>
    );
  if (kind === "neutral")
    return <path d="M142 198 Q160 202 178 198 Q160 208 142 198Z" fill="#9c5a52" />;
  return (
    <g>
      <path d="M138 194 Q160 184 182 194 Q160 212 138 194Z" fill="#a35a54" />
      <path d="M138 194 Q160 199 182 194" stroke="#6b3336" strokeWidth="1.5" fill="none" />
    </g>
  );
}

function Hair({ kind, c1, c2 }) {
  if (kind === "long")
    return (
      <g>
        <path d="M96 120 C86 40 234 40 224 120 C232 200 224 280 210 330 L196 330 C206 250 206 180 200 130 C170 96 150 96 120 130 C114 180 114 250 124 330 L110 330 C96 280 88 200 96 120Z" fill={c1} />
        <path d="M100 112 C100 52 220 52 220 112 C196 82 130 80 100 112Z" fill={c2} opacity="0.5" />
      </g>
    );
  if (kind === "curly")
    return (
      <g>
        <path d="M95 130 C70 60 130 22 165 30 C215 22 255 70 222 132 C232 160 214 186 202 172 C216 150 208 124 196 118 C206 92 176 66 160 78 C142 62 112 84 122 112 C104 116 100 148 116 170 C102 186 86 158 95 130Z" fill={c1} />
        <circle cx="112" cy="88" r="14" fill={c1} /><circle cx="208" cy="88" r="14" fill={c1} />
        <circle cx="134" cy="62" r="13" fill={c2} opacity="0.55" /><circle cx="186" cy="62" r="13" fill={c2} opacity="0.55" />
      </g>
    );
  if (kind === "short")
    return (
      <g>
        <path d="M100 118 C96 52 224 50 220 118 C210 84 190 74 160 92 C130 74 110 86 100 118Z" fill={c1} />
        <path d="M104 108 C110 66 210 64 216 106 C196 82 126 80 104 108Z" fill={c2} opacity="0.45" />
      </g>
    );
  // updo (default)
  return (
    <g>
      <ellipse cx="160" cy="42" rx="34" ry="26" fill={c1} />
      <path d="M100 122 C94 60 226 58 220 122 C204 86 180 76 160 92 C140 76 116 88 100 122Z" fill={c1} />
      <path d="M106 112 C112 70 208 68 214 110 C192 84 128 82 106 112Z" fill={c2} opacity="0.5" />
      <path d="M104 122 C100 150 104 168 112 182 M216 122 C220 150 216 168 208 182" stroke={c1} strokeWidth="7" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Outfit({ kind, skin, form }) {
  const wide = form === "thorn";
  if (kind === "shirt")
    return (
      <g>
        <path d={wide ? "M70 318 C96 268 224 268 250 318 L262 398 L58 398Z" : "M82 322 C106 274 214 274 238 322 L250 398 L70 398Z"} fill="#0c0a11" />
        {/* open collar V */}
        <path d="M136 286 L160 330 L184 286 L176 280 L160 308 L144 280 Z" fill="#171320" />
        <path d="M136 286 L148 278 M184 286 L172 278" stroke="#2c2440" strokeWidth="2" />
        {/* placket + buttons */}
        <path d="M160 330 L160 380" stroke="#221c30" strokeWidth="3" />
        <circle cx="160" cy="344" r="1.8" fill="#4a3d66" /><circle cx="160" cy="360" r="1.8" fill="#4a3d66" />
      </g>
    );
  if (kind === "turtleneck")
    return (
      <g>
        <path d={wide ? "M72 316 C96 268 224 268 248 316 L262 398 L58 398Z" : "M84 320 C104 274 216 274 236 320 L252 398 L68 398Z"} fill="#0a080d" />
        <path d="M128 258 Q160 244 192 258 L194 288 Q160 302 126 288Z" fill="#12101a" />
        <path d="M128 268 Q160 256 192 268 M128 278 Q160 267 192 278" stroke="#241f30" strokeWidth="2" fill="none" />
      </g>
    );
  if (kind === "hoodie")
    return (
      <g>
        <path d={wide ? "M66 318 C92 266 228 266 254 318 L266 398 L54 398Z" : "M78 322 C100 272 220 272 242 322 L256 398 L64 398Z"} fill="#100d16" />
        <path d="M106 300 C110 268 210 268 214 300 L206 312 C186 288 134 288 114 312Z" fill="#181322" />
        <path d="M150 316 L150 352 M170 316 L170 352" stroke="#3b2d52" strokeWidth="4" strokeLinecap="round" />
      </g>
    );
  // off-shoulder (default)
  return (
    <g>
      <path d={wide ? "M74 326 C104 280 216 280 246 326 L258 398 L62 398Z" : "M86 330 C112 284 208 284 234 330 L248 398 L72 398Z"} fill="#0a080d" />
      <path d={wide ? "M80 326 C112 292 208 292 240 326" : "M92 330 C120 296 200 296 228 330"} stroke="#6e46a2" strokeWidth="3.5" fill="none" />
    </g>
  );
}

function Accessory({ kind }) {
  if (kind === "choker")
    return (
      <g>
        <path d="M134 230 Q160 240 186 230" stroke="#181120" strokeWidth="7" fill="none" strokeLinecap="round" />
        <circle cx="160" cy="238" r="4" fill="#b98cff" />
      </g>
    );
  if (kind === "pendant")
    return (
      <g>
        <path d="M138 232 Q160 258 182 232" stroke="#8a7a9c" strokeWidth="2" fill="none" />
        <path d="M160 256 L167 268 L160 282 L153 268 Z" fill="#b98cff" stroke="#e88adf" strokeWidth="1" />
      </g>
    );
  if (kind === "glasses")
    return (
      <g>
        <rect x="118" y="128" width="38" height="26" rx="8" fill="none" stroke="#c9b8dd" strokeWidth="2.5" />
        <rect x="164" y="128" width="38" height="26" rx="8" fill="none" stroke="#c9b8dd" strokeWidth="2.5" />
        <path d="M156 138 L164 138" stroke="#c9b8dd" strokeWidth="2.5" />
      </g>
    );
  return null;
}

/* ── preset gallery data ───────────────────────────────────── */

const PRESETS = [
  // The Rose
  { name: "The Archivist", form: "rose", t: { ...DEFAULT } },
  { name: "The Wanderer", form: "rose", t: { form: "rose", skin: 2, hairStyle: "long", hairColor: "chestnut", outfit: "turtleneck", eyes: "round", nose: "a", mouth: "smile", accessory: "pendant" } },
  { name: "The Night Owl", form: "rose", t: { form: "rose", skin: 4, hairStyle: "curly", hairColor: "black", outfit: "hoodie", eyes: "sharp", nose: "b", mouth: "neutral", accessory: "none" } },
  { name: "The Duelist", form: "rose", t: { form: "rose", skin: 0, hairStyle: "short", hairColor: "silver", outfit: "offshoulder", eyes: "sharp", nose: "a", mouth: "full", accessory: "choker" } },
  { name: "The Romantic", form: "rose", t: { form: "rose", skin: 3, hairStyle: "long", hairColor: "wine", outfit: "offshoulder", eyes: "soft", nose: "b", mouth: "smile", accessory: "pendant" } },
  { name: "The Scholar", form: "rose", t: { form: "rose", skin: 5, hairStyle: "updo", hairColor: "espresso", outfit: "turtleneck", eyes: "round", nose: "a", mouth: "neutral", accessory: "glasses" } },
  // The Thorn
  { name: "The Warden", form: "thorn", t: { form: "thorn", skin: 2, hairStyle: "short", hairColor: "black", outfit: "shirt", eyes: "sharp", nose: "b", mouth: "neutral", accessory: "none" } },
  { name: "The Poet", form: "thorn", t: { form: "thorn", skin: 0, hairStyle: "curly", hairColor: "chestnut", outfit: "turtleneck", eyes: "soft", nose: "a", mouth: "smile", accessory: "glasses" } },
  { name: "The Rake", form: "thorn", t: { form: "thorn", skin: 4, hairStyle: "short", hairColor: "espresso", outfit: "shirt", eyes: "sharp", nose: "b", mouth: "full", accessory: "pendant" } },
  { name: "The Brooding", form: "thorn", t: { form: "thorn", skin: 1, hairStyle: "curly", hairColor: "black", outfit: "hoodie", eyes: "soft", nose: "a", mouth: "neutral", accessory: "none" } },
  // The Vine
  { name: "The Enigma", form: "vine", t: { form: "vine", skin: 1, hairStyle: "short", hairColor: "violet", outfit: "hoodie", eyes: "round", nose: "a", mouth: "neutral", accessory: "choker" } },
  { name: "The Moth", form: "vine", t: { form: "vine", skin: 3, hairStyle: "curly", hairColor: "silver", outfit: "turtleneck", eyes: "soft", nose: "b", mouth: "smile", accessory: "glasses" } },
  { name: "The Twilight", form: "vine", t: { form: "vine", skin: 5, hairStyle: "updo", hairColor: "wine", outfit: "shirt", eyes: "sharp", nose: "a", mouth: "full", accessory: "pendant" } },
];

/* ── main app ──────────────────────────────────────────────── */

export default function TheVisage() {
  const [mode, setMode] = useState("gallery"); // gallery | atelier
  const [form, setForm] = useState("rose");
  const [traits, setTraits] = useState(DEFAULT);
  const [chosenPreset, setChosenPreset] = useState(null);
  const [sealed, setSealed] = useState(null); // data URL of flattened image
  const svgWrapRef = useRef(null);

  const set = (k, v) => { setTraits((t) => ({ ...t, [k]: v })); setChosenPreset(null); };
  const activeForm = FORMS.find((f) => f.key === form);
  const galleryPresets = PRESETS.filter((p) => p.form === form);

  // Seal the Likeness: flatten the composed SVG to a PNG via canvas —
  // the exact step that, in production, uploads to Supabase Storage.
  const seal = async () => {
    const svgEl = svgWrapRef.current?.querySelector("svg");
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svgUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 640;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0c0714";
    ctx.fillRect(0, 0, 512, 640);
    ctx.drawImage(img, 0, 0, 512, 640);
    setSealed(canvas.toDataURL("image/png"));
  };

  return (
    <div className="ht-bg ht-body text-purple-100">
      <style>{FONT_CSS}</style>

      <header className="max-w-5xl mx-auto px-5 pt-10 pb-4 text-center">
        <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60">Every reader has a face in the dark</p>
        <h1 className="ht-display text-3xl text-pink-100 mt-2">The Visage</h1>
        <div className="mt-4 flex justify-center gap-2">
          <ModeTab on={mode === "gallery"} onClick={() => setMode("gallery")}>Gallery — choose a likeness</ModeTab>
          <ModeTab on={mode === "atelier"} onClick={() => setMode("atelier")}>Atelier — craft your own</ModeTab>
        </div>
      </header>

      {mode === "gallery" ? (
        <main className="max-w-4xl mx-auto px-5 pb-16">
          {/* form selection */}
          <div className="text-center mb-2">
            <p className="ht-display text-[10px] uppercase tracking-widest text-purple-300/60 mb-3">Choose your form</p>
            <div className="flex justify-center gap-2 flex-wrap">
              {FORMS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setForm(f.key); setChosenPreset(null); }}
                  className={`ht-tile rounded-sm px-4 py-2.5 text-center ${form === f.key ? "sel bg-purple-900/60" : "bg-purple-950/50 hover:bg-purple-900/50"}`}
                >
                  <span className="ht-display block text-[11px] uppercase font-semibold text-pink-100">{f.name}</span>
                  <span className="block text-[10px] text-purple-400/70 italic mt-0.5">{f.subtitle}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[15px] text-purple-300/75 italic">"{activeForm.tagline}"</p>
          </div>

          <p className="text-center text-sm text-purple-400/60 italic mb-6 mt-2">
            In production, each card is a generated painterly portrait served from Supabase Storage —{" "}
            <span className="text-purple-300/80">preset-{form}-01.webp</span> and onward, one set per form.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {galleryPresets.map((p) => (
              <button
                key={p.name}
                onClick={() => { setChosenPreset(p.name); setTraits(p.t); }}
                className={`ht-card ht-tile rounded-md p-3 text-center ${chosenPreset === p.name ? "sel" : ""}`}
              >
                <div className="ht-arch mx-auto overflow-hidden bg-[#120b1e]" style={{ width: 150, height: 190 }}>
                  <AvatarSVG t={p.t} size={150} />
                </div>
                <p className="ht-display text-[11px] uppercase text-pink-200 mt-2">{p.name}</p>
              </button>
            ))}
            {/* empty slots showing where generated art lands */}
            {[1, 2, 3].map((n) => (
              <div key={n} className="ht-card rounded-md p-3 text-center opacity-50 border-dashed">
                <div className="ht-arch mx-auto flex items-center justify-center bg-[#0e0917]" style={{ width: 150, height: 190 }}>
                  <span className="text-purple-500/60 text-xs italic px-4">your generated portrait<br />preset-{form}-0{galleryPresets.length + n}.webp</span>
                </div>
                <p className="ht-display text-[11px] uppercase text-purple-400/50 mt-2">awaiting art</p>
              </div>
            ))}
          </div>
          {chosenPreset && (
            <div className="text-center mt-6">
              <button onClick={seal} className="ht-display px-6 py-2.5 rounded-sm bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white text-xs font-semibold uppercase">
                ✦ Seal the Likeness ✦
              </button>
            </div>
          )}
          {/* hidden render target for sealing from gallery */}
          <div ref={mode === "gallery" ? svgWrapRef : null} className="hidden" aria-hidden="true">
            <AvatarSVG t={traits} size={320} />
          </div>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-5 pb-16 grid md:grid-cols-[1fr_300px] gap-5">
          {/* trait pickers */}
          <div className="space-y-4">
            <Picker label="Form">
              {FORMS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setForm(f.key); set("form", f.key); }}
                  className={`ht-tile rounded-sm px-3 py-1.5 text-center ${traits.form === f.key ? "sel bg-purple-800/60" : "bg-purple-950/50 hover:bg-purple-900/60"}`}
                >
                  <span className="ht-display block text-[10px] uppercase text-pink-100">{f.name}</span>
                  <span className="block text-[9px] text-purple-400/70 italic">{f.subtitle}</span>
                </button>
              ))}
            </Picker>

            <Picker label="Skin tone">
              {SKIN_TONES.map((c, i) => (
                <button key={c} onClick={() => set("skin", i)}
                  className={`ht-tile rounded-full ${traits.skin === i ? "sel" : ""}`}
                  style={{ width: 34, height: 34, background: c, border: "1px solid rgba(255,255,255,0.25)" }}
                  aria-label={`Skin tone ${i + 1}`} />
              ))}
            </Picker>

            <Picker label="Hair">
              {HAIR_STYLES.map((h) => (
                <Tile key={h} on={traits.hairStyle === h} onClick={() => set("hairStyle", h)} label={h} />
              ))}
            </Picker>
            <Picker label="Hair colour">
              {HAIR_COLORS.map((h) => (
                <button key={h.key} onClick={() => set("hairColor", h.key)}
                  className={`ht-tile rounded-full ${traits.hairColor === h.key ? "sel" : ""}`}
                  style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${h.c2}, ${h.c1})`, border: "1px solid rgba(255,255,255,0.2)" }}
                  aria-label={`Hair colour ${h.key}`} />
              ))}
            </Picker>

            <Picker label="Eyes">
              {EYES.map((e) => <Tile key={e} on={traits.eyes === e} onClick={() => set("eyes", e)} label={e} />)}
            </Picker>
            <Picker label="Nose">
              {NOSES.map((n) => <Tile key={n} on={traits.nose === n} onClick={() => set("nose", n)} label={n === "a" ? "gentle" : "defined"} />)}
            </Picker>
            <Picker label="Mouth">
              {MOUTHS.map((m) => <Tile key={m} on={traits.mouth === m} onClick={() => set("mouth", m)} label={m} />)}
            </Picker>

            <Picker label="Attire">
              {OUTFITS.map((o) => (
                <Tile key={o} on={traits.outfit === o} onClick={() => set("outfit", o)}
                  label={o === "offshoulder" ? "off-shoulder" : o} />
              ))}
            </Picker>
            <Picker label="Adornments">
              {ACCESSORIES.map((a) => <Tile key={a} on={traits.accessory === a} onClick={() => set("accessory", a)} label={a} />)}
            </Picker>
          </div>

          {/* preview */}
          <div className="ht-card rounded-md p-4 h-fit md:sticky md:top-4">
            <div ref={mode === "atelier" ? svgWrapRef : null} className="ht-arch mx-auto overflow-hidden bg-[#120b1e]" style={{ width: 240, height: 300 }}>
              <AvatarSVG t={traits} size={240} />
            </div>
            <div className="mt-4 space-y-2">
              <button onClick={seal} className="ht-display w-full py-2.5 rounded-sm bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white text-xs font-semibold uppercase">
                ✦ Seal the Likeness ✦
              </button>
              <button onClick={() => { setTraits(randomTraits(traits.form)); setChosenPreset(null); }} className="ht-display w-full py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase">
                ⟳ Randomize
              </button>
            </div>
            <p className="text-xs text-purple-400/60 italic mt-3 text-center">
              Sealing flattens the layers to one image — the file that lives in Supabase Storage and appears beside your marginalia.
            </p>
          </div>
        </main>
      )}

      {/* sealed result modal */}
      {sealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && setSealed(null)}>
          <div className="ht-card rounded-md p-5 max-w-sm text-center">
            <h2 className="ht-display text-lg text-pink-100 mb-3">The Likeness is Sealed</h2>
            <img src={sealed} alt="Your sealed avatar" className="rounded-sm mx-auto" style={{ width: 220 }} />
            <p className="text-sm text-purple-300/75 italic mt-3">
              This flattened PNG is what uploads to the <span className="text-purple-200">avatar-assets</span> bucket.
              The trait JSON saves alongside it in the <span className="text-purple-200">avatars</span> table so it stays re-editable.
            </p>
            <button onClick={() => setSealed(null)} className="ht-display mt-4 px-5 py-2 rounded-sm bg-purple-800/60 hover:bg-purple-700 text-purple-100 text-xs font-semibold uppercase">
              Close
            </button>
          </div>
        </div>
      )}

      <footer className="text-center pb-8 text-sm text-purple-400/40 italic">
        The Visage · prototype · placeholder art — the architecture awaits your portraits ❦
      </footer>
    </div>
  );
}

/* ── small UI pieces ───────────────────────────────────────── */

function ModeTab({ on, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`ht-display px-4 py-2 rounded-sm text-[11px] uppercase font-semibold transition-colors ${
        on ? "bg-gradient-to-b from-fuchsia-500/90 to-purple-700/90 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"
      }`}>
      {children}
    </button>
  );
}

function Picker({ label, children }) {
  return (
    <div className="ht-card rounded-md p-3.5">
      <p className="ht-display text-[10px] uppercase text-purple-300 font-semibold mb-2">{label}</p>
      <div className="flex gap-2 flex-wrap items-center">{children}</div>
    </div>
  );
}

function Tile({ on, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`ht-tile ht-display rounded-sm px-3 py-1.5 text-[10px] uppercase ${
        on ? "sel bg-purple-800/60 text-white" : "bg-purple-950/50 text-purple-300 hover:bg-purple-900/60"
      }`}>
      {label}
    </button>
  );
}
