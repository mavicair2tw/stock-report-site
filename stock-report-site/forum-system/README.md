# Forum System v2 (Production Blueprint)

A scalable, secure forum architecture inspired by Reddit/Discourse.

## 1) Backend Architecture

- **API Gateway / App**: Node.js + Express (REST + JWT auth)
- **Auth Service**: register/login/email verification/2FA/login-attempt lock
- **Forum Service**: categories/threads/posts/votes/replies
- **Moderation Service**: reports, queues, shadow-ban, auto-hide rules
- **Trust Engine**: computes trust level from account age + activity
- **Spam Engine**: keyword filter + duplicate detector + AI spam score
- **Rate Limit Layer**: Redis sliding window + cooldown checks
- **Async Workers** (BullMQ/Redis):
  - email delivery
  - moderation scoring
  - media scanning
- **Storage**:
  - PostgreSQL (core relational data)
  - Redis (cache, sessions, rate limits, cooldown)
  - Object storage + CDN for images

## 2) Auth & Roles

Roles:
- Guest
- New User
- Verified User
- Trusted User
- Moderator
- Admin

Security:
- bcrypt password hashing
- JWT (short-lived access + refresh token rotation)
- optional TOTP 2FA
- email verification required to move Guest -> Verified/New
- account lock after 5 failed logins (time-based unlock)

## 3) Trust Levels & Permissions

Trust score computed by:
- account_age_days
- approved_post_count
- engagement_score (upvotes received, useful flags)

Policy examples:
- Guest: read-only
- New User: 3 posts/day, 1 external link/post, no image upload
- Verified User: 10 posts/day, 3 links/post, image upload allowed
- Trusted User: no post limits, can flag
- Moderator: remove content, ban user, review queue
- Admin: full controls

## 4) Rate Limiting

- Post cooldown: 30s between posts
- API: 100 req/min/IP
- Login lockout: 5 failed attempts
- Redis keys (examples):
  - `rl:ip:{ip}`
  - `cooldown:user:{id}:post`
  - `loginfail:{email_or_ip}`

## 5) Anti-Spam Layers

- CAPTCHA on registration
- adaptive CAPTCHA for suspicious behavior
- duplicate post detection (fingerprint + edit distance)
- spam keyword/profanity filters
- AI spam score (0-1)
- shadow-ban when risk score exceeds threshold

## 6) Moderation Rules

- report/flag API
- auto-hide post after 5 unique reports
- moderation queue with reason + risk score
- suspicious link detector (domain reputation + shortening expansion)

## 7) Forum Objects

- Categories
- Threads
- Posts
- Users
- Reports
- Moderation logs

Features:
- upvote/downvote
- sort: new/top/trending
- nested replies (parent_post_id)

## 8) API (high-level)

- Auth:
  - `POST /api/auth/register`
  - `POST /api/auth/verify-email`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/enable-2fa`
- Forum:
  - `GET /api/categories`
  - `POST /api/threads`
  - `GET /api/threads/:id`
  - `POST /api/threads/:id/posts`
  - `POST /api/posts/:id/vote`
- Moderation:
  - `POST /api/posts/:id/report`
  - `GET /api/mod/queue`
  - `POST /api/mod/posts/:id/hide`
  - `POST /api/mod/users/:id/ban`
- Admin:
  - `GET /api/admin/users`
  - `PATCH /api/admin/rate-limits`
  - `GET /api/admin/spam-analytics`

## 9) Security Middleware Checklist

- helmet secure headers
- CORS allowlist
- CSRF token for cookie-based flows
- input validation (zod/joi)
- XSS sanitization for rich content
- parameterized SQL only
- HTTPS-only + HSTS
- request ID + audit logging

## 10) Frontend Pages (Next.js suggested)

- `/` Home categories
- `/c/[slug]` Category page
- `/t/[threadId]` Thread + nested replies
- `/submit` Create thread/post
- `/login` `/register` `/verify-email`
- `/settings/security` 2FA + sessions
- `/mod/queue` moderation dashboard
- `/admin` admin analytics/settings

## 11) Deployment

- Dockerized services: api, worker, postgres, redis, nginx
- CDN in front of media storage
- Horizontal API scaling behind load balancer
- queue workers autoscaling

## 12) Real Backend Skeleton Included

Path: `forum-system/api`

Implemented now:
- Express app + Helmet/CORS/Morgan
- Auth routes (register/verify/login) with bcrypt + JWT
- Posting cooldown + API rate limit middleware
- Trust-level permission gate (link/post limits)
- Report/auto-hide after 5 reports
- Moderation queue producer + BullMQ worker
- Admin/mod routes

Run locally:
```bash
cd forum-system
cp api/.env.example api/.env
docker compose up -d postgres redis
cd api
npm install
npm run dev
# optional worker
npm run worker
```

See `schema.sql` and `docker-compose.yml` in this folder.
