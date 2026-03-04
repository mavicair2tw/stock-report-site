# Cloudflare Worker for openai-tw.com Chat (OpenAI + Gemini)

## 1) Install & login

```bash
npm i -g wrangler
wrangler login
```

## 2) Set secrets

```bash
cd cloudflare-chat-worker
wrangler secret put OPENAI_API_KEY
# 可選：若要保留 Gemini 備援
wrangler secret put GEMINI_API_KEY
```

## 3) Deploy

```bash
wrangler deploy
```

## 4) Add route in Cloudflare Dashboard

- Worker route: `openai-tw.com/api/*`
- Worker: `openai-tw-chat`

Then `https://openai-tw.com/chat/` will call `/api/chat`.

## Endpoints

- `POST /api/chat` → 先嘗試 ChatGPT（OpenAI），失敗時回退到 Gemini 或本地備援
- `GET /api/chat/health` → 回報 OpenAI/Gemini 狀態

## Notes

- Default model vars in `wrangler.toml`:
  - `OPENAI_MODEL` (default: `gpt-4o-mini`)
  - `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- Chat 會優先使用 OpenAI；若缺少 OpenAI key 或失敗，會嘗試 Gemini，再不行就回傳錯誤。
- After code changes, run `wrangler deploy` again.
