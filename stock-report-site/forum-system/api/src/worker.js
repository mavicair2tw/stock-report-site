import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config.js';
import { q } from './db.js';

const conn = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

function spamScore(text = '') {
  const t = text.toLowerCase();
  let score = 0;
  const bad = ['free money', 'casino', 'xxx', 'crypto guaranteed', 'loan fast'];
  bad.forEach(k => { if (t.includes(k)) score += 0.25; });
  if ((text.match(/https?:\/\//g) || []).length > 5) score += 0.35;
  return Math.min(score, 1);
}

new Worker('moderation', async job => {
  const { targetType, targetId, text } = job.data;
  const s = spamScore(text || '');

  if (s >= 0.8) {
    if (targetType === 'post') await q('update posts set is_hidden=true where id=$1', [targetId]);
    if (targetType === 'thread') await q("update threads set status='hidden' where id=$1", [targetId]);
  }

  await q(
    'insert into moderation_logs(action,target_type,target_id,details) values($1,$2,$3,$4)',
    ['ai_spam_score', targetType, targetId, JSON.stringify({ spamScore: s })]
  );
}, { connection: conn });

console.log('moderation worker started');
