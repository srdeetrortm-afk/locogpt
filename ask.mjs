// Loco-GPT brain proxy — keeps the API keys on the server.
// Env vars (Netlify → Site configuration → Environment variables):
//   GROQ_API_KEY      (required)  free key from console.groq.com
//   GEMINI_API_KEY    (optional)  free key from aistudio.google.com — backup brain
//   GOOGLE_CLIENT_ID  (optional)  turns on "Sign in with Google"
//   ALLOWED_EMAILS    (optional)  comma list of Gmail IDs allowed (empty = any Gmail)
//   GROQ_MODELS       (optional)  comma list, tried in order
//   ANTHROPIC_API_KEY (optional)  if set, Claude answers first (paid per question); Groq stays as backup
//   ANTHROPIC_MODEL   (optional)  default claude-sonnet-5-5
const DEFAULT_MODELS = 'meta-llama/llama-4-scout-17b-16e-instruct,llama-3.3-70b-versatile,openai/gpt-oss-120b';
const VISION = /llama-4|scout|maverick|vision/i;
const tokCache = new Map();

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

async function verifyGoogle(token, clientId) {
  if (!token) return null;
  const c = tokCache.get(token); if (c && c.exp * 1000 > Date.now()) return c;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
  if (!r.ok) return null;
  const d = await r.json();
  if (d.aud !== clientId || d.email_verified === 'false') return null;
  const u = { email: (d.email || '').toLowerCase(), exp: Number(d.exp || 0) };
  tokCache.set(token, u); return u;
}

async function groq(model, messages, wantJson, image) {
  let msgs = messages;
  if (image) {
    const last = msgs[msgs.length - 1];
    msgs = [...msgs.slice(0, -1), { role: 'user', content: [{ type: 'text', text: String(last.content) }, { type: 'image_url', image_url: { url: image } }] }];
  }
  const body = { model, messages: msgs, temperature: 0.2, max_tokens: 1500 };
  if (wantJson) body.response_format = { type: 'json_object' };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) { const e = new Error('groq ' + r.status); e.status = r.status; e.detail = (await r.text()).slice(0, 300); throw e; }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function claude(messages, wantJson, image) {
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') + (wantJson ? '\n\nReply with JSON only.' : '');
  const msgs = messages.filter(m => m.role !== 'system').map((m, i, arr) => {
    if (image && i === arr.length - 1) { const [meta, b64] = image.split(','); return { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: meta.slice(5, meta.indexOf(';')), data: b64 } }, { type: 'text', text: String(m.content) }] }; }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) };
  });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1800, system: sys || undefined, messages: msgs })
  });
  if (!r.ok) { const e = new Error('claude ' + r.status); e.status = r.status; e.detail = (await r.text()).slice(0, 300); throw e; }
  const d = await r.json();
  return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function gemini(messages, wantJson, image) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages.filter(m => m.role !== 'system').map((m, i, arr) => {
    const parts = [{ text: String(m.content) }];
    if (image && i === arr.length - 1) { const [meta, b64] = image.split(','); parts.push({ inline_data: { mime_type: meta.slice(5, meta.indexOf(';')), data: b64 } }); }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const body = { contents, generationConfig: { temperature: 0.2, maxOutputTokens: 1500, ...(wantJson ? { responseMimeType: 'application/json' } : {}) } };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) { const e = new Error('gemini ' + r.status); e.status = r.status; throw e; }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (cid) {
    const u = await verifyGoogle((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), cid);
    if (!u) return json({ error: 'auth' }, 401);
    const allow = (process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(u.email)) return json({ error: 'forbidden' }, 403);
  }
  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-8).map(m => ({ role: ['system', 'assistant'].includes(m.role) ? m.role : 'user', content: String(m.content || '').slice(0, 60000) })) : [];
  if (!messages.length) return json({ error: 'empty' }, 400);
  const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;
  const wantJson = !!body.json;
  let models = (process.env.GROQ_MODELS || DEFAULT_MODELS).split(',').map(s => s.trim()).filter(Boolean);
  if (image) models = models.filter(m => VISION.test(m));
  let limited = false, lastErr = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try { const text = await claude(messages, wantJson, image); if (text) return json({ text, model: 'claude' }); }
    catch (e) { lastErr = e; if (e.status === 429) limited = true; }
  }
  if (process.env.GROQ_API_KEY) {
    for (const m of models) {
      try { const text = await groq(m, messages, wantJson, image); if (text) return json({ text, model: m }); }
      catch (e) { lastErr = e; if (e.status === 429) limited = true; }
    }
  }
  if (process.env.GEMINI_API_KEY) {
    try { const text = await gemini(messages, wantJson, image); if (text) return json({ text, model: 'gemini' }); }
    catch (e) { lastErr = e; if (e.status === 429) limited = true; }
  }
  return json({ error: limited ? 'busy' : 'upstream', detail: lastErr?.detail || String(lastErr?.message || '') }, limited ? 429 : 502);
};
export const config = { path: '/api/ask' };
