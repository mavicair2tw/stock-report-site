import express from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { q } from '../db.js';
import { signAccessToken } from '../middleware/auth.js';

const router = express.Router();
const verifyTokens = new Map();

router.post('/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });

  const role = await q('select id from roles where code=$1', ['NEW_USER']);
  const hash = await bcrypt.hash(password, 12);
  const r = await q(
    'insert into users(email,password_hash,role_id,is_email_verified) values($1,$2,$3,false) returning id,email',
    [email.toLowerCase(), hash, role.rows[0]?.id]
  ).catch(() => null);

  if (!r) return res.status(409).json({ error: 'email exists' });
  const token = uuid();
  verifyTokens.set(token, r.rows[0].id);
  res.json({ ok: true, verificationToken: token }); // dev mode
});

router.post('/verify-email', async (req, res) => {
  const { token } = req.body || {};
  const userId = verifyTokens.get(token);
  if (!userId) return res.status(400).json({ error: 'invalid token' });
  await q('update users set is_email_verified=true where id=$1', [userId]);
  verifyTokens.delete(token);
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });

  const failWindow = await q(
    `select count(*)::int as c from login_attempts
     where email=$1 and success=false and created_at > now() - interval '15 minutes'`,
    [email.toLowerCase()]
  );
  if ((failWindow.rows[0]?.c || 0) >= 5) return res.status(423).json({ error: 'account temporarily locked' });

  const u = await q(
    `select u.id,u.email,u.password_hash,u.is_email_verified,r.code as role_code
     from users u join roles r on r.id=u.role_id where u.email=$1`,
    [email.toLowerCase()]
  );
  const user = u.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await q('insert into login_attempts(email,success) values($1,false)', [email.toLowerCase()]);
    return res.status(401).json({ error: 'invalid credentials' });
  }

  await q('insert into login_attempts(email,success) values($1,true)', [email.toLowerCase()]);
  const token = signAccessToken(user);
  res.json({ accessToken: token, user: { id: user.id, email: user.email, role: user.role_code, verified: user.is_email_verified } });
});

export default router;
