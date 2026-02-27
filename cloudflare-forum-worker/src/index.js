const KEY = 'forum_posts_v1';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(request) });
    }

    if (url.pathname !== '/api/forum') {
      return json({ error: 'Not found' }, 404, request);
    }

    if (!env.FORUM_KV) {
      return json({ error: 'FORUM_KV not configured' }, 500, request);
    }

    if (request.method === 'GET') {
      const raw = await env.FORUM_KV.get(KEY);
      const posts = safeParse(raw);
      return json({ posts }, 200, request);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const text = String(body?.text || '').trim();
      if (!text) return json({ error: 'text required' }, 400, request);

      const raw = await env.FORUM_KV.get(KEY);
      const posts = safeParse(raw);
      posts.push({ text: text.slice(0, 1000), time: new Date().toLocaleString('zh-Hant-TW', { hour12: false }) });
      const keep = posts.slice(-300);
      await env.FORUM_KV.put(KEY, JSON.stringify(keep));
      return json({ ok: true, count: keep.length }, 200, request);
    }

    return json({ error: 'Method not allowed' }, 405, request);
  },
};

function safeParse(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(request) },
  });
}

function cors(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allow = ['https://openai-tw.com', 'https://www.openai-tw.com'];
  return {
    'Access-Control-Allow-Origin': allow.includes(origin) ? origin : 'https://openai-tw.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
