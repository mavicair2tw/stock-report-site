import express from 'express';
import { q } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/users', async (_req, res) => {
  const r = await q('select u.id,u.email,u.is_email_verified,u.trust_score,u.shadow_banned,u.banned_until,r.code as role from users u join roles r on r.id=u.role_id order by u.id desc limit 500');
  res.json({ users: r.rows });
});

router.get('/spam-analytics', async (_req, res) => {
  const reports = await q(`select status,count(*)::int as count from reports group by status`);
  const hiddenPosts = await q(`select count(*)::int as c from posts where is_hidden=true`);
  res.json({ reports: reports.rows, hiddenPosts: hiddenPosts.rows[0].c });
});

router.patch('/rate-limits', async (req, res) => {
  // Placeholder for dynamic config store
  res.json({ ok: true, config: req.body || {} });
});

export default router;
