// Vercel serverless function — server-side Anthropic proxy.
//
// Holds the Anthropic key in a SERVER env var (ANTHROPIC_API_KEY, NOT VITE_*, so
// it is never bundled into the client) and forwards Messages API requests. The
// client (callClaude in src/App.jsx) hits /api/claude instead of api.anthropic.com,
// which keeps the key off the wire entirely.
//
// Not an open relay: every request must carry a valid Supabase session (the
// caller's access token), verified against Supabase Auth before we spend the key.
//
// Vercel env vars required (Project Settings → Environment Variables):
//   ANTHROPIC_API_KEY   — the (rotated) Anthropic key, server-side only
//   SUPABASE_URL        — your project URL (VITE_SUPABASE_URL also accepted)
//   SUPABASE_ANON_KEY   — the anon/publishable key (VITE_SUPABASE_ANON_KEY also accepted)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(503).json({ error: "AI is not configured." });
    return;
  }

  // Require a signed-in Hushthorn user so the key can't be spent anonymously.
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!supaUrl || !anon || !token) {
    res.status(401).json({ error: "Sign in to use AI features." });
    return;
  }
  try {
    const who = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) {
      res.status(401).json({ error: "Sign in to use AI features." });
      return;
    }
  } catch {
    res.status(502).json({ error: "Could not verify your session." });
    return;
  }

  // Forward the Messages request with the server-side key.
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch {
    res.status(502).json({ error: "Upstream AI request failed." });
  }
}
