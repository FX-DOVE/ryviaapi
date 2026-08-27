import '../../env.js';

import { Worker } from 'bullmq';
import { createRedisConnection, checkRedisConfig } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import { JOB_STATUS } from '../config/constants.js';
import eventBus from '../services/eventBus.js';
import Job from '../models/Job.js';
import { logError } from '../services/logService.js';
import {
  processScriptStep,
  processDirectingStep,
  processLockStep,
  processSegmentStep,
  processAudioStep,
  processPromptStep,
  processRenderingStep,
  processUploadStep,
  processNotificationStep,
} from './workerSteps.js';

import { WORKER_SETTINGS } from '../queues/queueManager.js';

const connection = createRedisConnection();

// A GPU step holds its lock for as long as Runpod takes: a 7-11 min cold start
// plus one image and one video call per beat. With the default 30 s lock BullMQ
// would declare the job stalled and hand the same scene to a second worker,
// paying twice for duplicate footage.
const LOCKING_LOCK_MS   = 6 * 60 * 60 * 1000; // 6 hours
const SEGMENT_LOCK_MS   = 12 * 60 * 60 * 1000; // 12 hours
const DIRECTING_LOCK_MS = 4 * 60 * 60 * 1000; // 4 hours

const GPU_WORKER_OPTS = {
  connection,
  concurrency: 1,
  lockDuration: LOCKING_LOCK_MS,
  lockRenewTime: 30000,
  stalledInterval: 60000,
  maxStalledCount: 10,
  settings: WORKER_SETTINGS,
};

async function start() {
  await connectDB();
  await checkRedisConfig();
  await eventBus.init();

  console.log('[SchedulerWorker] Starting Core Worker Cluster...');

  // 1. Script Queue Worker
  const scriptWorker = new Worker(
    'scriptQueue',
    async (job) => {
      console.log(`[ScriptWorker] Processing job ${job.data.jobId}`);
      await processScriptStep(job.data.jobId);
    },
    { connection, concurrency: 5, settings: WORKER_SETTINGS }
  );

  // 2. Directing Queue Worker — decompose the script into acts / scenes / beats
  const directingWorker = new Worker(
    'directingQueue',
    async (job) => {
      console.log(`[DirectingWorker] Processing job ${job.data.jobId}`);
      await processDirectingStep(job.data.jobId);
    },
    { connection, concurrency: 2, lockDuration: DIRECTING_LOCK_MS, lockRenewTime: 30000, settings: WORKER_SETTINGS }
  );

  // 3. Locking Queue Worker — character + environment reference images (GPU)
  const lockingWorker = new Worker(
    'lockingQueue',
    async (job) => {
      console.log(`[LockingWorker] Processing job ${job.data.jobId}`);
      await processLockStep(job.data.jobId);
    },
    { ...GPU_WORKER_OPTS, lockDuration: LOCKING_LOCK_MS }
  );

  // 4. Segment Queue Worker — keyframe → LTX clip → last frame → next clip (GPU)
  const segmentWorker = new Worker(
    'segmentQueue',
    async (job) => {
      console.log(`[SegmentWorker] Processing job ${job.data.jobId}`);
      await processSegmentStep(job.data.jobId);
    },
    { ...GPU_WORKER_OPTS, lockDuration: SEGMENT_LOCK_MS }
  );

  // 5. Audio Queue Worker
  const audioWorker = new Worker(
    'audioQueue',
    async (job) => {
      console.log(`[AudioWorker] Processing job ${job.data.jobId}`);
      await processAudioStep(job.data.jobId);
    },
    { connection, concurrency: 3, settings: WORKER_SETTINGS }
  );

  // 6. Prompt Queue Worker
  const promptWorker = new Worker(
    'promptQueue',
    async (job) => {
      console.log(`[PromptWorker] Processing job ${job.data.jobId}`);
      await processPromptStep(job.data.jobId);
    },
    { connection, concurrency: 5, settings: WORKER_SETTINGS }
  );

  // 7. Rendering Queue Worker
  const renderingWorker = new Worker(
    'renderingQueue',
    async (job) => {
      console.log(`[RenderingWorker] Processing job ${job.data.jobId}`);
      await processRenderingStep(job.data.jobId);
    },
    { 
      connection, 
      concurrency: 1, // FFmpeg rendering is CPU intensive, pin to 1 concurrent render
      lockDuration: 30 * 60 * 1000,
      settings: WORKER_SETTINGS,
    }
  );

  // 8. Upload Queue Worker
  const uploadWorker = new Worker(
    'uploadQueue',
    async (job) => {
      console.log(`[UploadWorker] Uploading assets for job ${job.data.jobId}`);
      await processUploadStep(job.data.jobId);
    },
    { connection, concurrency: 3, settings: WORKER_SETTINGS }
  );

  // 9. Notification Queue Worker
  const notificationWorker = new Worker(
    'notificationQueue',
    async (job) => {
      const { jobId, type, message, recipient } = job.data;
      console.log(`[NotificationWorker] Dispatching alert to ${recipient}`);
      await processNotificationStep(jobId, type, message, recipient);
    },
    { connection, concurrency: 10, settings: WORKER_SETTINGS }
  );

  const workers = [
    scriptWorker, directingWorker, lockingWorker, segmentWorker,
    audioWorker, promptWorker, renderingWorker, uploadWorker, notificationWorker,
  ];

  workers.forEach(w => {
    w.on('completed', (job) => console.log(`[${w.name}] Job completed: ${job.id}`));
    w.on('failed', async (job, err) => {
      console.error(`[${w.name}] Job failed: ${job?.id}, Error: ${err.message}`);
      if (!job?.data?.jobId) return;

      // BullMQ emits 'failed' on every attempt, not just the last one. Marking the
      // job FAILED here unconditionally buries a job that is about to be retried —
      // and the GPU queues retry after a backoff measured in minutes.
      const maxAttempts = job.opts?.attempts ?? 1;
      const exhausted = (job.attemptsMade ?? 1) >= maxAttempts;

      await logError(job.data.jobId, `Pipeline ${exhausted ? 'failed' : 'attempt failed'} at ${w.name}: ${err.message}`);
      if (exhausted) {
        await Job.findByIdAndUpdate(job.data.jobId, { status: JOB_STATUS.FAILED, error: err.message });
      } else {
        console.warn(`[${w.name}] Job ${job.data.jobId} will retry (${job.attemptsMade}/${maxAttempts})`);
      }
    });
    w.on('error', (err) => console.error(`[${w.name}] Worker global error:`, err));
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[SchedulerWorker] SIGTERM received — closing workers...');
    await Promise.all(workers.map(w => w.close()));
    process.exit(0);
  });

  console.log('[SchedulerWorker] Core Workers successfully loaded — waiting for jobs');
}

start().catch((err) => {
  console.error('[SchedulerWorker] Fatal startup error:', err);
  process.exit(1);
});
