const ipBuckets = new Map();
const postCooldown = new Map();

export function apiRateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const b = ipBuckets.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > b.resetAt) {
    b.count = 0;
    b.resetAt = now + 60_000;
  }
  b.count += 1;
  ipBuckets.set(ip, b);
  if (b.count > 100) return res.status(429).json({ error: 'API rate limit exceeded' });
  next();
}

export function postingCooldown(req, res, next) {
  const userId = req.user?.sub;
  if (!userId) return next();
  const now = Date.now();
  const last = postCooldown.get(userId) || 0;
  if (now - last < 30_000) {
    return res.status(429).json({ error: 'Please wait 30s between posts' });
  }
  postCooldown.set(userId, now);
  next();
}
