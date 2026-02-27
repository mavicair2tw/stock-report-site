# Cloudflare Forum Worker

## 1) Create KV namespace

```bash
cd cloudflare-forum-worker
wrangler kv namespace create FORUM_KV
```

Copy the returned `id` into `wrangler.toml` (`REPLACE_WITH_KV_NAMESPACE_ID`).

## 2) Deploy

```bash
wrangler login
wrangler deploy
```

## 3) Add route (optional)

In Cloudflare add route:
- `openai-tw.com/api/forum*` -> `openai-tw-forum`

Current frontend uses workers.dev endpoint:
- `https://openai-tw-forum.googselect.workers.dev/api/forum`
