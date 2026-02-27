import express from 'express';
import { q } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/queue', requireAuth, requireRole('MODERATOR', 'ADMIN'), async (_req, res) => {
  const r = await q(`select * from reports where status='open' order by created_at asc limit 200`);
  res.json({ queue: r.rows });
});

router.post('/posts/:id/hide', requireAuth, requireRole('MODERATOR', 'ADMIN'), async (req, res) => {
  await q('update posts set is_hidden=true where id=$1', [req.params.id]);
  await q('insert into moderation_logs(moderator_user_id,action,target_type,target_id) values($1,$2,$3,$4)', [req.user.sub, 'hide_post', 'post', req.params.id]);
  res.json({ ok: true });
});

router.post('/users/:id/ban', requireAuth, requireRole('MODERATOR', 'ADMIN'), async (req, res) => {
  const { hours = 24 } = req.body || {};
  await q(`update users set banned_until=now() + ($1 || ' hours')::interval where id=$2`, [String(hours), req.params.id]);
  await q('insert into moderation_logs(moderator_user_id,action,target_type,target_id,details) values($1,$2,$3,$4,$5)', [req.user.sub, 'ban_user', 'user', req.params.id, JSON.stringify({ hours })]);
  res.json({ ok: true });
});

export default router;
