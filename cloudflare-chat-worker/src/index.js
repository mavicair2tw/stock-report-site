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

    if (url.pathname === '/api/chat/health' && request.method === 'GET') {
      const probeMessages = [
        { role: 'system', content: 'Health check. Keep it very short.' },
        { role: 'user', content: 'reply ok' },
      ];

      const [openai, openrouter, gemini] = await Promise.all([
        callOpenAI(env, probeMessages),
        callOpenRouter(env, probeMessages),
        callGemini(env, probeMessages),
      ]);

      const providers = {
        openai: providerHealth(openai),
        openrouter: providerHealth(openrouter),
        gemini: providerHealth(gemini),
      };
      const anyOk = providers.openai.ok || providers.openrouter.ok || providers.gemini.ok;

      return json({
        ok: anyOk,
        providers,
        checkedAt: new Date().toISOString(),
      }, anyOk ? 200 : 503, request);
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

    try {
      const body = await request.json();
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const sanitized = messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system') && typeof m.content === 'string')
        .slice(-20);

      if (!sanitized.length) {
        return json({ error: 'messages required' }, 400, request);
      }

      const systemPrompt = '你是 openai-tw.com 的網站聊天助理。預設使用繁體中文；若使用者使用英文或要求英文，改用英文回覆。保持簡潔、友善。';
      const normalized = [
        { role: 'system', content: systemPrompt },
        ...sanitized,
      ];

      const attempts = [];

      const gemini = await callGemini(env, normalized);
      if (gemini.ok) return json({ reply: gemini.reply, provider: 'gemini' }, 200, request);
      attempts.push(`gemini: ${gemini.error}`);

      const openai = await callOpenAI(env, normalized);
      if (openai.ok) return json({ reply: openai.reply, provider: 'openai' }, 200, request);
      attempts.push(`openai: ${openai.error}`);

      const openrouter = await callOpenRouter(env, normalized);
      if (openrouter.ok) return json({ reply: openrouter.reply, provider: 'openrouter' }, 200, request);
      attempts.push(`openrouter: ${openrouter.error}`);

      return json({ error: `All providers failed. ${attempts.join(' | ')}` }, 502, request);
    } catch {
      return json({ error: 'Internal error' }, 500, request);
    }
  },
};

async function callOpenAI(env, messages) {
  if (!env.OPENAI_API_KEY) return { ok: false, error: 'Missing OPENAI_API_KEY' };
  try {
    const payload = {
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
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
    if (!r.ok) return { ok: false, error: data?.error?.message || `HTTP ${r.status}` };
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'Empty response' };
    return { ok: true, reply };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

async function callOpenRouter(env, messages) {
  if (!env.OPENROUTER_API_KEY) return { ok: false, error: 'Missing OPENROUTER_API_KEY' };
  try {
    const payload = {
      model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages,
      temperature: 0.6,
    };
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openai-tw.com',
        'X-Title': 'openai-tw-chat',
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data?.error?.message || `HTTP ${r.status}` };
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { ok: false, error: 'Empty response' };
    return { ok: true, reply };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

function toGeminiText(messages = []) {
  return messages
    .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'))
    .map(m => {
      const who = m.role === 'assistant' ? 'Assistant' : (m.role === 'system' ? 'System' : 'User');
      return `${who}: ${m.content}`;
    })
    .join('\n\n');
}

async function callGemini(env, messages) {
  if (!env.GEMINI_API_KEY) return { ok: false, error: 'Missing GEMINI_API_KEY' };
  try {
    const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const payload = {
      contents: [{ parts: [{ text: toGeminiText(messages) }] }],
      generationConfig: { temperature: 0.6 },
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || data?.error?.status || `HTTP ${r.status}`;
      return { ok: false, error: msg };
    }
    const reply = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('').trim();
    if (!reply) return { ok: false, error: 'Empty response' };
    return { ok: true, reply };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

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
        const d = trimSnippet(stripTags(dRaw), 300);
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
  const snippet = trimSnippet(item.snippet || '', 300);
  if (!title) return '';
  const head = url ? `[${title}](${url})` : title;
  return snippet ? `${head}：${snippet}` : head;
}

function trimSnippet(s = '', max = 300) {
  const blocked = [
    'We would like to show you a description here but the site won’t allow us.',
    "We would like to show you a description here but the site won't allow us.",
    '目前網頁可能出了系統端的問題，或是連結發生錯誤，您可以嘗試重新輸入網址，或回到 星巴克網站首頁。'
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

function providerHealth(result) {
  if (result?.ok) return { ok: true, error: null };
  return { ok: false, error: String(result?.error || 'unknown error').slice(0, 240) };
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
