const KEY = 'forum_posts_v2';

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
      const posts = normalizePosts(safeParse(raw));
      const totals = calcTotals(posts);

      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      if (q) {
        const matched = posts.filter((p) => String(p.text || '').toLowerCase().includes(q)).slice(-100);
        return json({ posts: matched, q, count: matched.length, ...totals }, 200, request);
      }

      return json({ posts, ...totals }, 200, request);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = String(body?.action || '').trim();

      const raw = await env.FORUM_KV.get(KEY);
      const posts = normalizePosts(safeParse(raw));

      // Create post
      if (!action) {
        const text = String(body?.text || '').trim();
        if (!text) return json({ error: 'text required' }, 400, request);

        posts.push({
          id: crypto.randomUUID(),
          text: text.slice(0, 1000),
          time: new Date().toLocaleString('zh-Hant-TW', { hour12: false }),
          ip: maskIp(getClientIp(request)),
          region: getRegion(request),
          likeCount: 0,
          shareCount: 0,
        });

        const keep = posts.slice(-300);
        await env.FORUM_KV.put(KEY, JSON.stringify(keep));
        const totals = calcTotals(keep);
        return json({ ok: true, count: keep.length, ...totals }, 200, request);
      }

      // React to post: like / share / delete / comment
      if (!['like', 'share', 'delete', 'comment'].includes(action)) {
        return json({ error: 'invalid action' }, 400, request);
      }

      const id = String(body?.id || '').trim();
      if (!id) return json({ error: 'id required' }, 400, request);

      const i = posts.findIndex(p => p.id === id);
      if (i < 0) return json({ error: 'post not found' }, 404, request);

      if (action === 'delete') {
        const [removed] = posts.splice(i, 1);
        await env.FORUM_KV.put(KEY, JSON.stringify(posts));
        const totals = calcTotals(posts);
        return json({ ok: true, deleted: removed?.id || id, ...totals }, 200, request);
      }

      if (action === 'comment') {
        const text = String(body?.text || '').trim();
        if (!text) return json({ error: 'text required' }, 400, request);
        const comments = Array.isArray(posts[i].comments) ? posts[i].comments : [];
        comments.push({
          id: crypto.randomUUID(),
          text: text.slice(0, 500),
          time: new Date().toLocaleString('zh-Hant-TW', { hour12: false }),
          ip: maskIp(getClientIp(request)),
          region: getRegion(request),
        });
        posts[i].comments = comments.slice(-50);
      }

      if (action === 'like') posts[i].likeCount = Number(posts[i].likeCount || 0) + 1;
      if (action === 'share') posts[i].shareCount = Number(posts[i].shareCount || 0) + 1;

      await env.FORUM_KV.put(KEY, JSON.stringify(posts));
      const totals = calcTotals(posts);
      return json({ ok: true, post: posts[i], ...totals }, 200, request);
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

function normalizePosts(posts) {
  return posts.map((p) => ({
    id: String(p?.id || crypto.randomUUID()),
    text: String(p?.text || ''),
    time: String(p?.time || ''),
    likeCount: Number(p?.likeCount || 0),
    shareCount: Number(p?.shareCount || 0),
    ip: String(p?.ip || ''),
    region: String(p?.region || ''),
    comments: Array.isArray(p?.comments)
      ? p.comments.map((c) => ({
          id: String(c?.id || crypto.randomUUID()),
          text: String(c?.text || ''),
          time: String(c?.time || ''),
          ip: String(c?.ip || ''),
          region: String(c?.region || ''),
        }))
      : [],
  }));
}

function calcTotals(posts) {
  const totalLike = posts.reduce((s, p) => s + Number(p.likeCount || 0), 0);
  const totalShare = posts.reduce((s, p) => s + Number(p.shareCount || 0), 0);
  return { totalLike, totalShare };
}

function getClientIp(request) {
  return String(request?.headers?.get('CF-Connecting-IP') || '').trim();
}

function maskIp(ip = '') {
  if (!ip) return '';
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}:****`;
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip;
}

function getRegion(request) {
  const cf = request?.cf || {};
  const city = String(cf.city || '').trim();
  const region = String(cf.region || '').trim();
  const country = String(cf.country || '').trim();
  const out = [country, region, city].filter(Boolean).join('/');
  return out;
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
