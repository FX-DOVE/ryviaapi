import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { QUEUES } from '../config/constants.js';

let _cleanupQueue = null;

export function getCleanupQueue() {
  if (!_cleanupQueue) {
    _cleanupQueue = new Queue(QUEUES.CLEANUP, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff:  { type: 'fixed', delay: 10000 },
        removeOnComplete: { count: 50 },
        removeOnFail:     { count: 50 },
      },
    });
  }
  return _cleanupQueue;
}

/**
 * Schedule cleanup of a job's temp directory.
 * @param {string} jobId  MongoDB Job _id
 * @param {number} delayMs  Delay before cleanup (default: immediate)
 */
export async function enqueueCleanup(jobId, delayMs = 0) {
  const queue = getCleanupQueue();
  await queue.add('cleanup_job_temp', { jobId }, { delay: delayMs });
  console.log(`[CleanupQueue] Enqueued cleanup for job ${jobId}`);
}

export default getCleanupQueue;
