import { Redis } from 'ioredis';

// Shared connection for BullMQ
export function createRedisConnection(options = {}) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    ...options,
  });

  client.on('connect',    () => {
    console.log('[Redis] Connected');
    // Suppress BullMQ warning by configuring the correct eviction policy dynamically
    client.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {});
  });
  client.on('error',      (err) => console.error('[Redis] Error:', err.message));
  client.on('close',      () => console.warn('[Redis] Connection closed'));

  return client;
}

// Singleton for general use (health checks, pub/sub)
let _client = null;
export function getRedisClient() {
  if (!_client) {
    _client = createRedisConnection();
    _client.connect().catch((err) => console.error('[Redis] Failed to connect:', err.message));
  }
  return _client;
}
/**
 * Startup check: verify and enforce that Redis maxmemory-policy is set to noeviction automatically
 */
export async function checkRedisConfig() {
  const client = getRedisClient();
  try {
    // Attempt to set it to noeviction automatically
    try {
      await client.config('SET', 'maxmemory-policy', 'noeviction');
    } catch (setErr) {
      console.warn(`[Redis] Failed to dynamically set maxmemory-policy: ${setErr.message}`);
    }

    const policy = await client.config('GET', 'maxmemory-policy');
    const policyValue = policy && policy[1];
    if (policyValue && policyValue !== 'noeviction') {
      console.error(`\nCRITICAL WARNING: Redis maxmemory-policy is currently "${policyValue}".`);
      console.error(`BullMQ requires "noeviction" to prevent silent lock/job key evictions under memory pressure.`);
      console.error(`Please update your Redis configuration (redis.conf: maxmemory-policy noeviction) or run:`);
      console.error(`redis-cli CONFIG SET maxmemory-policy noeviction\n`);
    } else {
      console.log(`[Redis] maxmemory-policy confirmed as "${policyValue || 'noeviction'}"`);
    }
  } catch (err) {
    console.warn(`[Redis] Could not verify maxmemory-policy (CONFIG command might be disabled/restricted): ${err.message}`);
  }
}

export default getRedisClient;
