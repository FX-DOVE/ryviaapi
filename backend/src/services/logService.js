import fs from 'fs';
import path from 'path';
import JobLog from '../models/JobLog.js';
import { emitJobEvent } from '../config/socket.js';

/**
 * Write a log entry to MongoDB and emit it via Socket.io.
 *
 * @param {string} jobId
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 */
export async function log(jobId, level, message) {
  const timestamp = new Date();
  const entry = { jobId, level, message, timestamp };

  try {
    await JobLog.create(entry);
  } catch (err) {
    console.error('[LogService] Failed to write to DB:', err.message);
  }

  // Emit to subscribed frontend clients immediately
  emitJobEvent(jobId, 'job_log', { level, message, timestamp });

  // Also print to process stdout for PM2 logs
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`[Job:${jobId}] ${prefix} ${message}`);
}

export const logInfo  = (jobId, msg) => log(jobId, 'info',  msg);
export const logWarn  = (jobId, msg) => log(jobId, 'warn',  msg);
export const logError = (jobId, msg) => log(jobId, 'error', msg);

export default { log, logInfo, logWarn, logError };
