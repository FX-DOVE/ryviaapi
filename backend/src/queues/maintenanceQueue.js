import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { QUEUES } from '../config/constants.js';

let _maintenanceQueue = null;

export function getMaintenanceQueue() {
  if (!_maintenanceQueue) {
    _maintenanceQueue = new Queue(QUEUES.MAINTENANCE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 10 },
        removeOnFail:     { count: 10 },
      },
    });
  }
  return _maintenanceQueue;
}

/**
 * Register the nightly maintenance cron (02:00 AM daily).
 * Safe to call on every startup — BullMQ deduplicates by repeatJobKey.
 */
export async function registerMaintenanceCron() {
  const queue = getMaintenanceQueue();
  await queue.add(
    'nightly_maintenance',
    { task: 'cleanup_old_jobs' },
    {
      repeat:       { pattern: '0 2 * * *' },   // 02:00 AM every day
      repeatJobKey: 'nightly_maintenance',       // ensures only one cron exists
    },
  );
  console.log('[MaintenanceQueue] Nightly maintenance cron registered (02:00 AM)');
}

export default getMaintenanceQueue;
