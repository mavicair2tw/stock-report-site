const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT_PER_MIN = 1000000; // temporary: effectively disable rate limiting

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (url.pathname !== '/api/chat') {
      return json({ error: 'Not found' }, 404, request);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, request);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rate = hitRateLimit(ip);
    if (!rate.ok) {
      return json({ error: `Rate limit exceeded. Retry in ${rate.retryAfterSec}s.` }, 429, request, {
        'Retry-After': String(rate.retryAfterSec),
      });
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: 'Missing OPENAI_API_KEY' }, 500, request);
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const sanitized = messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && typeof m.content === 'string')
        .slice(-20);

      if (!sanitized.length) {
        return json({ error: 'messages required' }, 400, request);
      }

      const payload = {
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是 openai-tw.com 的網站聊天助理。回覆繁體中文、簡潔、友善。' },
          ...sanitized,
        ],
        temperature: 0.6,
      };

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const status = [400, 401, 403, 404, 409, 422, 429].includes(r.status) ? r.status : 502;
        return json({ error: data?.error?.message || 'OpenAI API error' }, status, request);
      }

      const reply = data?.choices?.[0]?.message?.content?.trim() || '（沒有回覆內容）';
      return json({ reply }, 200, request);
    } catch {
      return json({ error: 'Internal error' }, 500, request);
    }
  },
};

function hitRateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= LIMIT_PER_MIN) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true };
}

function json(obj, status = 200, request, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = ['https://openai-tw.com', 'https://www.openai-tw.com'];
  const allowOrigin = allowed.includes(origin) ? origin : 'https://openai-tw.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
