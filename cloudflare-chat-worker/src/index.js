const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT_PER_MIN = 1000000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (url.pathname === '/api/stock/quote' && request.method === 'GET') {
      const symbol = (url.searchParams.get('symbols') || 'AAPL').toUpperCase();
      const tickers = symbol.includes(':')
        ? [symbol]
        : symbol.endsWith('.TW')
          ? [`TWSE:${symbol.replace('.TW', '')}`, `TPEX:${symbol.replace('.TW', '')}`]
          : /^\d{4}$/.test(symbol)
            ? [`TWSE:${symbol}`, `TPEX:${symbol}`]
            : [`NASDAQ:${symbol}`, `NYSE:${symbol}`, `AMEX:${symbol}`];

      const body = {
        symbols: { tickers, query: { types: [] } },
        columns: ['name', 'description', 'close', 'change', 'volume', 'market_cap_basic'],
      };
      return proxyPostJson('https://scanner.tradingview.com/global/scan', body, request);
    }

    if (url.pathname === '/api/stock/chart' && request.method === 'GET') {
      const symbol = url.searchParams.get('symbol') || 'AAPL';
      const range = url.searchParams.get('range') || '1mo';
      const interval = url.searchParams.get('interval') || '1d';
      const y = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
      return proxyJson(y, request);
    }

    if (url.pathname === '/api/stock/search' && request.method === 'GET') {
      const q = url.searchParams.get('q') || 'AAPL';
      const y = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=8&newsCount=0`;
      return proxyJson(y, request);
    }

    if (url.pathname === '/api/search/summary' && request.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ error: 'q required' }, 400, request);

      const result = await fetchSearchSummary(q);
      const googleLink = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      if (!result) {
        return json({
          query: q,
          link: googleLink,
          summary: null,
          media: null,
          note: 'summary temporarily unavailable',
        }, 200, request);
      }
      return json({ query: q, link: googleLink, ...result }, 200, request);
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

async function proxyJson(url, request) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const txt = await r.text();
    if (!r.ok) return json({ error: 'upstream failed', status: r.status }, 502, request);
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
    });
  } catch {
    return json({ error: 'proxy fetch error' }, 502, request);
  }
}

async function proxyPostJson(url, body, request) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) return json({ error: 'upstream failed', status: r.status }, 502, request);
    return new Response(txt, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
    });
  } catch {
    return json({ error: 'proxy fetch error' }, 502, request);
  }
}

function isBlockedOrAbuseText(text = '') {
  const t = String(text).toLowerCase();
  return t.includes('securitycompromiseerror') ||
    t.includes('anonymous access to domain') ||
    t.includes('previous abuse found') ||
    t.includes('"code":451') ||
    t.includes('status":45102');
}

function allUrls(s = '') {
  return String(s).match(/https?:\/\/[^\s]+/ig) || [];
}

function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${u.pathname.replace('/', '')}`;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
  } catch {}
  return '';
}

function isImageUrl(url) {
  return /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url);
}

async function fetchSearchSummary(q) {
  const providers = [
    `https://r.jina.ai/http://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    `https://r.jina.ai/http://www.bing.com/search?q=${encodeURIComponent(q)}`,
    `https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent(q)}`,
  ];

  for (const api of providers) {
    try {
      const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const t = await r.text();
      if (!r.ok || !t || isBlockedOrAbuseText(t)) continue;

      const cleaned = t
        .replace(/SECURITY NOTICE:[\s\S]*?---\n/, '')
        .replace(/\{\s*"data"\s*:\s*null[\s\S]*?\}/g, '')
        .trim();

      if (!cleaned || isBlockedOrAbuseText(cleaned)) continue;

      const lines = cleaned.split('\n').map(x => x.trim()).filter(Boolean);
      const summary = lines.slice(0, 3).join(' / ').slice(0, 260);
      if (!summary) continue;

      const urls = allUrls(cleaned);
      const media = urls.find(u => youtubeEmbed(u) || isImageUrl(u)) || null;
      return { summary, media };
    } catch {}
  }

  return null;
}

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
