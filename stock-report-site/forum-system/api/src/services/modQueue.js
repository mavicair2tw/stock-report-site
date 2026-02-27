import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';

let queue = null;
try {
  const conn = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  queue = new Queue('moderation', { connection: conn });
} catch {
  queue = null;
}

export async function enqueueModeration(payload) {
  if (!queue) return;
  await queue.add('score-post', payload, { removeOnComplete: 1000, removeOnFail: 1000 });
}
