# Cloudflare Worker for openai-tw.com Chat

## 1) Install & login

```bash
npm i -g wrangler
wrangler login
```

## 2) Set provider secrets (OpenAI + fallback)

```bash
cd cloudflare-chat-worker

# Primary provider
wrangler secret put OPENAI_API_KEY

# Optional fallback provider 1 (recommended)
wrangler secret put OPENROUTER_API_KEY

# Optional fallback provider 2
wrangler secret put GEMINI_API_KEY
```

## 3) Deploy

```bash
wrangler deploy
```

## 4) Add route in Cloudflare Dashboard

- Worker route: `openai-tw.com/api/*`
- Worker: `openai-tw-chat`

Then `https://openai-tw.com/guestbook/` will call `/api/chat` directly.

## Notes
- Provider order for `/api/chat`: **OpenAI → OpenRouter → Gemini**.
- If one provider fails (quota/billing/down), it auto-tries the next.
- Health check endpoint: `GET /api/chat/health`
  - Returns each provider status/error in one response.
- Default models can be set in `wrangler.toml` vars:
  - `OPENAI_MODEL` (default: `gpt-4o-mini`)
  - `OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`)
  - `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- After code changes, run `wrangler deploy` again.
