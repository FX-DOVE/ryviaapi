/**
 * lockCompleteness.js — Pure helpers for resume planning.
 * Empty stubs / partial / stale paths must NOT count as locking-complete.
 */
import fs from 'fs';

/** True only when a lock entry points at a real on-disk reference image. */
export function isRealImageLock(entry) {
  if (!entry || typeof entry === 'string') return false;
  const p = entry.referenceImagePath;
  return Boolean(p && typeof p === 'string' && fs.existsSync(p));
}

export function findCharLock(characterLocks, name) {
  if (!name) return null;
  const locks = characterLocks || {};
  if (locks[name]) return locks[name];
  const lower = String(name).toLowerCase();
  if (locks[lower]) return locks[lower];
  const hit = Object.keys(locks).find((k) => String(k).toLowerCase() === lower);
  return hit ? locks[hit] : null;
}

export function findEnvLock(environmentLocks, env) {
  const locks = environmentLocks || {};
  const keys = [env?.locationId, env?.name].filter(Boolean);
  for (const key of keys) {
    if (locks[key]) return locks[key];
    const lower = String(key).toLowerCase();
    if (locks[lower]) return locks[lower];
    const hit = Object.keys(locks).find((k) => String(k).toLowerCase() === lower);
    if (hit) return locks[hit];
  }
  return null;
}

/**
 * Require EVERY plan character/environment to have a real image lock before
 * skipping the locking step. Partial success must re-enter locking so failed
 * stubs can be retried (processLockStep reuses valid files).
 */
export function locksCompleteForPlan(job) {
  const plan = job?.directorPlan;
  if (!plan) return false;

  const characters = plan.characters || [];
  const environments = plan.environments || [];

  // No cast/locations in plan → locking is a no-op; treat as complete.
  if (characters.length === 0 && environments.length === 0) return true;

  for (const char of characters) {
    if (!isRealImageLock(findCharLock(job.characterLocks, char?.name))) {
      return false;
    }
  }
  for (const env of environments) {
    if (!isRealImageLock(findEnvLock(job.environmentLocks, env))) {
      return false;
    }
  }
  return true;
}
