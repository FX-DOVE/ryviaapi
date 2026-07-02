import si from 'systeminformation';
import { getVideoQueue } from '../queues/videoQueue.js';

/**
 * Collect system health metrics for the dashboard widget.
 * Uses systeminformation for CPU/RAM/Disk and BullMQ for queue size.
 *
 * @returns {Promise<object>} Health stats object
 */
export async function getSystemHealth() {
  const [cpu, mem, disk, queue] = await Promise.all([
    getCPU(),
    getMemory(),
    getDisk(),
    getQueueStats(),
  ]);

  return { cpu, mem, disk, queue, timestamp: new Date() };
}

async function getCPU() {
  const load = await si.currentLoad();
  return {
    usagePercent: Math.round(load.currentLoad),
    cores:        load.cpus?.length || 1,
  };
}

async function getMemory() {
  const mem = await si.mem();
  return {
    totalGb:    +(mem.total / 1e9).toFixed(2),
    usedGb:     +(mem.used  / 1e9).toFixed(2),
    freeGb:     +(mem.free  / 1e9).toFixed(2),
    usagePercent: Math.round((mem.used / mem.total) * 100),
  };
}

async function getDisk() {
  const disks = await si.fsSize();
  // Find the root or largest partition
  const main  = disks.find((d) => d.mount === '/' || d.mount === 'C:') || disks[0];
  if (!main) return {};
  return {
    totalGb:    +(main.size / 1e9).toFixed(2),
    usedGb:     +(main.used / 1e9).toFixed(2),
    freeGb:     +((main.size - main.used) / 1e9).toFixed(2),
    usagePercent: Math.round((main.used / main.size) * 100),
  };
}

async function getQueueStats() {
  try {
    const q       = getVideoQueue();
    const waiting = await q.getWaitingCount();
    const active  = await q.getActiveCount();
    const failed  = await q.getFailedCount();
    return { waiting, active, failed, total: waiting + active };
  } catch {
    return { waiting: 0, active: 0, failed: 0, total: 0 };
  }
}

export default { getSystemHealth };
