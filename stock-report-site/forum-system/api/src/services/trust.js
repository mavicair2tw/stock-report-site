import { q } from '../db.js';

export async function refreshTrustLevel(userId) {
  const [{ rows: postsRows }, { rows: userRows }] = await Promise.all([
    q('select count(*)::int as c from posts where user_id=$1', [userId]),
    q('select created_at from users where id=$1', [userId]),
  ]);

  const postCount = postsRows[0]?.c || 0;
  const ageDays = Math.floor((Date.now() - new Date(userRows[0].created_at).getTime()) / 86400000);
  const score = ageDays + postCount * 2;

  let role = 'NEW_USER';
  if (score >= 120) role = 'TRUSTED_USER';
  else if (score >= 30) role = 'VERIFIED_USER';

  const roleRes = await q('select id from roles where code=$1', [role]);
  if (roleRes.rows[0]) {
    await q('update users set role_id=$1, trust_score=$2 where id=$3', [roleRes.rows[0].id, score, userId]);
  }
}
