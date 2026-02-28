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
          items: [],
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
  // Prefer Bing RSS first for cleaner title+link extraction.
  try {
    const rssUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&setlang=zh-Hant`;
    const r = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await r.text();
    if (r.ok && xml) {
      const title = (xml.match(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
      const desc = (xml.match(/<item>[\s\S]*?<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || '';
      const link = (xml.match(/<item>[\s\S]*?<link>([\s\S]*?)<\/link>/i) || [])[1] || '';

      const summary = `${stripTags(title)} ${stripTags(desc)}`.replace(/\s+/g, ' ').trim().slice(0, 260);
      const media = link && (youtubeEmbed(link) || isImageUrl(link)) ? link : null;
      const items = [];
      const blocks = xml.match(/<item>[\s\S]*?<\/item>/ig) || [];
      for (const b of blocks) {
        if (items.length >= 10) break;
        const tRaw = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
        const uRaw = (b.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
        const dRaw = (b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || '';
        const t = stripSearchLine(stripTags(tRaw));
        const u = String(uRaw).trim();
        const d = trimSnippet(stripTags(dRaw), 100);
        if (t && t !== '*') items.push(formatSearchItem({ title: t, url: /^https?:\/\//i.test(u) ? u : '', snippet: d }));
      }
      if (summary || items.length) return { summary: summary || null, media, items };
    }
  } catch {}

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
      const useful = lines.filter(l =>
        !/^title:\s*/i.test(l) &&
        !/^url source:\s*/i.test(l) &&
        !/^markdown content:?\s*$/i.test(l)
      );

      const items = useful
        .filter(l => /^\d+\.\s+/.test(l))
        .map(l => parseSearchItem(l))
        .filter(x => x && x.title)
        .slice(0, 10)
        .map(formatSearchItem);

      const picked = (items.length ? items.map(x => stripSearchLine(x)) : useful).slice(0, 3);
      const summary = picked.join(' / ').replace(/\s*\/\s*markdown content:?\s*$/i, '').slice(0, 260);
      if (!summary && !items.length) continue;

      const urls = allUrls(cleaned);
      const media = urls.find(u => youtubeEmbed(u) || isImageUrl(u)) || null;
      return { summary: summary || null, media, items };
    } catch {}
  }

  return null;
}

function stripTags(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripSearchLine(s = '') {
  return String(s)
    .replace(/^\d+\.\s+/, '')
    .replace(/\[\*\*([^\]]+)\*\*\]\([^\)]+\)/g, '$1')
    .replace(/\[[^\]]+\]\([^\)]+\)/g, (m) => m.replace(/^\[|\]\([^\)]*\)$/g, ''))
    .replace(/\*\*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function parseSearchItem(line = '') {
  const raw = String(line).replace(/^\d+\.\s+/, '').trim();
  const m = raw.match(/\[\*\*?([^\]]+?)\*\*?\]\((https?:\/\/[^\s\)]+)\)/i) ||
            raw.match(/\[([^\]]+?)\]\((https?:\/\/[^\s\)]+)\)/i);
  if (m) return { title: stripSearchLine(m[1]), url: m[2] };
  return { title: stripSearchLine(raw), url: '' };
}

function formatSearchItem(item = {}) {
  const title = stripSearchLine(item.title || '');
  const url = String(item.url || '').trim();
  const snippet = trimSnippet(item.snippet || '', 100);
  if (!title) return '';
  const head = url ? `[${title}](${url})` : title;
  return snippet ? `${head}：${snippet}` : head;
}

function trimSnippet(s = '', max = 100) {
  const blocked = [
    'We would like to show you a description here but the site won’t allow us.',
    "We would like to show you a description here but the site won't allow us."
  ];
  let t = String(s).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (blocked.some(x => t.includes(x))) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
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
