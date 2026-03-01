# Cloudflare Worker for openai-tw.com Chat (Gemini-only mode)

## 1) Install & login

```bash
npm i -g wrangler
wrangler login
```

## 2) Set Gemini secret

```bash
cd cloudflare-chat-worker
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

- `POST /api/chat` → Gemini response only
- `GET /api/chat/health` → Gemini health only

## Notes

- Default model var in `wrangler.toml`:
  - `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- If Gemini key is expired/quota exceeded, chat will fail with a Gemini-specific error.
- After code changes, run `wrangler deploy` again.
