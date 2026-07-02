import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { QUEUES } from '../config/constants.js';

let _videoQueue = null;

export function getVideoQueue() {
  if (!_videoQueue) {
    _videoQueue = new Queue(QUEUES.VIDEO, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts:  3,
        backoff:   { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },   // keep last 100 completed
        removeOnFail:     { count: 200 },   // keep last 200 failed
      },
    });
  }
  return _videoQueue;
}

/**
 * Add a new video generation job to the queue.
 * @param {string} jobId  MongoDB Job _id
 * @param {string} provider  'grok' | 'local-gpu'
 */
export async function enqueueVideoJob(jobId, provider = 'grok') {
  const queue = getVideoQueue();
  await queue.add(
    'process_video',
    { jobId, provider },
    // NOTE: do NOT set `jobId` here — that would make BullMQ reuse stale Redis
    // entries when the MongoDB document no longer exists (causes "not found" loops).
  );
  console.log(`[VideoQueue] Enqueued job ${jobId} (provider: ${provider})`);
}

export default getVideoQueue;
