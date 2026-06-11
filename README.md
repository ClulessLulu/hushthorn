# Hushthorn 🌹

A gothic book-cataloging app — shelves, dual ratings (Verdict ⚔ / Spicy 🌶), marginalia with page refs, voice notes, AI cover scanning, the Oracle's recommendations, and Kindle pairing.

## Quick start

```bash
npm install
npm run dev
```

Open the printed localhost URL in **Chrome** (best feature support — see Feature Notes).

## Wiring up Claude (required for AI features)

The AI features (Oracle recommendations, cover scanning, Divine details) call the
Claude API through one helper: `callClaude()` at the top of `src/App.jsx`.
In the Claude.ai artifact environment this worked keylessly; locally you must
pick one of two options.

### Option A — your proxy server (recommended)

Same pattern as Kindled's Express proxy. Add a route like this to your proxy
(port 3001), keeping the API key server-side in its `.env`:

```js
// e.g. routes in your Express proxy
app.post("/api/hushthorn/claude", async (req, res) => {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(500).json({ error: "proxy error" });
  }
});
```

Then in `src/App.jsx` change one line:

```js
const CLAUDE_API_URL = "http://localhost:3001/api/hushthorn/claude";
```

(If the browser complains about CORS, add `app.use(cors())` to the proxy or an
explicit allowed origin for the Vite dev URL.)

### Option B — direct browser access (local dev ONLY)

```bash
cp .env.example .env
# put your key in VITE_ANTHROPIC_API_KEY=...
npm run dev
```

`callClaude()` will then send the key with the
`anthropic-dangerous-direct-browser-access` header. The header name is the
warning: anything in client code is visible to anyone with devtools. Fine on
your own machine, never in anything deployed.

## Feature notes (local vs the artifact demo)

| Feature | Locally in VS Code |
| --- | --- |
| Open Library search + genres | Works as-is |
| Book covers | Works — localhost has no sandbox CSP. The `CoverImage` fetch-to-data-URL component still works, but you can simplify it to a plain `<img>` if you prefer |
| Voice notes (Web Speech API) | Chrome/Edge, needs mic permission |
| Live scan camera | **Works better than in the artifact** — `getUserMedia` is allowed on localhost (it's a secure context) |
| Barcode detection | `BarcodeDetector` is Chrome/Edge only; the Capture-cover fallback covers other browsers |
| AI features | Need Option A or B above |
| Persistence | None yet — state is in memory and resets on refresh. Supabase is the planned next step |

## Project structure

```
hushthorn/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example          # Option B template (copy to .env)
└── src/
    ├── main.jsx           # entry point
    ├── index.css          # Tailwind directives
    └── App.jsx            # the entire app (split into components when it grows)
```

## Known TODOs

- Persistence (Supabase: books, notes, genres tables + auth)
- Split `App.jsx` into modules (`components/`, `lib/claude.js`, `lib/openLibrary.js`)
- Genre quality: Open Library subjects are noisy — `cleanGenres()` filters junk,
  but a Claude-assigned-genres fallback at add time would be more consistent
- Error boundaries + retry affordances around the AI calls
- The Oracle and scribe prompts live inline — extract to a prompts module for testing
