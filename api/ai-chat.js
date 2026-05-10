// =====================================================================
// OmnixOS · /api/ai-chat — серверный прокси к Groq (бесплатный AI).
// Деплоится Vercel'ом автоматически вместе с репозиторием.
//
// Нужно один раз в Vercel → Project → Settings → Environment Variables:
//   GROQ_API_KEY   = gsk_...           (бесплатный ключ с https://console.groq.com/keys)
//   (необязательно) GROQ_MODEL = llama-3.3-70b-versatile
//
// Ключ НЕ попадает в браузер — запросы идут сюда, отсюда в Groq.
// Доступ только для залогиненных пользователей (проверяем Supabase-токен).
// =====================================================================

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uuzohiwsdztnavtezgbj.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_C4zM2nU67UYOPquv07yaMg_b_c-njJC';

const ALLOWED_ROLES = ['system', 'user', 'assistant'];
const MAX_MESSAGES = 24;
const MAX_CONTENT = 6000;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!process.env.GROQ_API_KEY) { res.status(503).json({ error: 'not_configured' }); return; }

  // ---- авторизация: Supabase JWT из заголовка ----
  const authHeader = String(req.headers.authorization || req.headers.Authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + token },
    });
    if (!who.ok) { res.status(401).json({ error: 'unauthorized' }); return; }
  } catch (e) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }

  // ---- тело ----
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) {
    res.status(400).json({ error: 'bad_request' }); return;
  }
  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: ALLOWED_ROLES.includes(m && m.role) ? m.role : 'user',
      content: String((m && m.content) || '').slice(0, MAX_CONTENT),
    }))
    .filter((m) => m.content);
  if (!messages.length) { res.status(400).json({ error: 'bad_request' }); return; }

  // ---- запрос в Groq ----
  let r, data;
  try {
    r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 1024,
        stream: false,
      }),
    });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    res.status(502).json({ error: 'upstream_unreachable' }); return;
  }

  if (!r.ok) {
    const code = r.status === 429 ? 'rate_limited' : (r.status === 401 ? 'bad_key' : 'upstream_error');
    res.status(r.status === 429 ? 429 : 502).json({ error: code, detail: (data && data.error && data.error.message) || null });
    return;
  }

  const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  res.status(200).json({ reply: reply || '', model: MODEL });
};
