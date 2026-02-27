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
