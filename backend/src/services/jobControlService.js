import { getRedisClient } from '../config/redis.js';

export class AbortJobError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AbortJobError';
  }
}

/**
 * Sets a signal for a job (e.g. 'stop', 'delete').
 * The worker process periodically checks this signal and aborts if set.
 */
export async function setJobSignal(jobId, signal, ttlSeconds = 86400) {
  const redis = getRedisClient();
  const key = `job:${jobId}:signal`;
  await redis.set(key, signal, 'EX', ttlSeconds);
}

/**
 * Gets the current signal for a job.
 */
export async function getJobSignal(jobId) {
  const redis = getRedisClient();
  const key = `job:${jobId}:signal`;
  return await redis.get(key);
}

/**
 * Clears the signal for a job (e.g. on resume).
 */
export async function clearJobSignal(jobId) {
  const redis = getRedisClient();
  const key = `job:${jobId}:signal`;
  await redis.del(key);
}

/**
 * Helper to check the signal and throw if the job is supposed to stop.
 * Called continuously throughout the worker pipeline.
 */
export async function checkAbortSignal(jobId) {
  const signal = await getJobSignal(jobId);
  if (signal === 'stop' || signal === 'delete') {
    throw new AbortJobError(`Job halted by user signal: ${signal}`);
  }
}

export default {
  AbortJobError,
  setJobSignal,
  getJobSignal,
  clearJobSignal,
  checkAbortSignal,
};
