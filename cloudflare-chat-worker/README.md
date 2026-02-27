# Cloudflare Worker for openai-tw.com Chat

## 1) Install & login

```bash
npm i -g wrangler
wrangler login
```

## 2) Set API key secret

```bash
cd cloudflare-chat-worker
wrangler secret put OPENAI_API_KEY
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
- Built-in per-IP rate limit: 20 requests/minute.
- Frontend now shows clearer errors for 404/401/403/429.
- After code changes, run `wrangler deploy` again.
