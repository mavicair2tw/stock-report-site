import express from 'express';
import { q } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { postingCooldown } from '../middleware/rateLimit.js';
import { countLinks, limitsByRole } from '../utils/permissions.js';
import { enqueueModeration } from '../services/modQueue.js';

const router = express.Router();

router.get('/categories', async (_req, res) => {
  const r = await q('select id,slug,title,description from categories order by id asc');
  res.json({ categories: r.rows });
});

router.post('/threads', requireAuth, postingCooldown, async (req, res) => {
  const { categoryId, title, body } = req.body || {};
  if (!categoryId || !title || !body) return res.status(400).json({ error: 'categoryId,title,body required' });

  const user = await q('select r.code as role_code from users u join roles r on r.id=u.role_id where u.id=$1', [req.user.sub]);
  const role = user.rows[0]?.role_code || 'NEW_USER';
  const limits = limitsByRole(role);
  const links = countLinks(`${title}\n${body}`);
  if (links > limits.linksPerPost) return res.status(403).json({ error: 'too many links for your trust level' });

  const today = await q(
    `select count(*)::int as c from threads where user_id=$1 and created_at::date=current_date`,
    [req.user.sub]
  );
  if (today.rows[0].c >= limits.postsPerDay) return res.status(429).json({ error: 'daily posting limit reached' });

  const r = await q(
    'insert into threads(category_id,user_id,title,body) values($1,$2,$3,$4) returning *',
    [categoryId, req.user.sub, title, body]
  );
  await enqueueModeration({ targetType: 'thread', targetId: r.rows[0].id, text: `${title}\n${body}` });
  res.status(201).json({ thread: r.rows[0] });
});

router.get('/threads/:id', async (req, res) => {
  const t = await q('select * from threads where id=$1', [req.params.id]);
  if (!t.rows[0]) return res.status(404).json({ error: 'not found' });
  const posts = await q('select * from posts where thread_id=$1 and is_hidden=false order by created_at asc', [req.params.id]);
  res.json({ thread: t.rows[0], posts: posts.rows });
});

router.post('/threads/:id/posts', requireAuth, postingCooldown, async (req, res) => {
  const { body, parentPostId = null } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });

  const user = await q('select r.code as role_code from users u join roles r on r.id=u.role_id where u.id=$1', [req.user.sub]);
  const role = user.rows[0]?.role_code || 'NEW_USER';
  const limits = limitsByRole(role);
  if (countLinks(body) > limits.linksPerPost) return res.status(403).json({ error: 'too many links for your trust level' });

  const today = await q(
    `select count(*)::int as c from posts where user_id=$1 and created_at::date=current_date`,
    [req.user.sub]
  );
  if (today.rows[0].c >= limits.postsPerDay) return res.status(429).json({ error: 'daily posting limit reached' });

  const p = await q(
    'insert into posts(thread_id,user_id,parent_post_id,body) values($1,$2,$3,$4) returning *',
    [req.params.id, req.user.sub, parentPostId, body]
  );
  await enqueueModeration({ targetType: 'post', targetId: p.rows[0].id, text: body });
  res.status(201).json({ post: p.rows[0] });
});

router.post('/posts/:id/report', requireAuth, async (req, res) => {
  const { reason = '' } = req.body || {};
  await q('insert into reports(target_type,target_id,reporter_user_id,reason) values($1,$2,$3,$4)', ['post', req.params.id, req.user.sub, reason]);

  const c = await q(`select count(distinct reporter_user_id)::int as c from reports where target_type='post' and target_id=$1`, [req.params.id]);
  if (c.rows[0].c >= 5) {
    await q('update posts set is_hidden=true where id=$1', [req.params.id]);
  }
  res.json({ ok: true });
});

export default router;
