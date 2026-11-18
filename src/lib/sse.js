/* ── Reading a streamed Claude reply (server-sent events) ──
   Pure, so tests/sse-unit.mjs runs the real code. Used by callClaude() when a
   caller wants text as it is written (The Oracle shows each pick as it lands).
   Pass the buffer so far; get back the text pieces in it, whether the stream
   reported an error, and the unfinished tail to keep for the next chunk.
──────────────────────────────────────────────────────────────── */

export function readSse(buffer) {
  const parts = String(buffer ?? '').replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop(); // the last part may be cut mid-event
  const texts = [];
  let error = false;
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev?.type === 'error') error = true;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
        texts.push(ev.delta.text);
      }
    }
  }
  return { texts, error, rest };
}
