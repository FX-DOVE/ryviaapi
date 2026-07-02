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
  processAudioStep,
  processPromptStep,
  processRenderingStep,
  processUploadStep,
  processNotificationStep,
} from './workerSteps.js';

const connection = createRedisConnection();

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
    { connection, concurrency: 5 }
  );

  // 2. Audio Queue Worker
  const audioWorker = new Worker(
    'audioQueue',
    async (job) => {
      console.log(`[AudioWorker] Processing job ${job.data.jobId}`);
      await processAudioStep(job.data.jobId);
    },
    { connection, concurrency: 3 }
  );

  // 3. Prompt Queue Worker
  const promptWorker = new Worker(
    'promptQueue',
    async (job) => {
      console.log(`[PromptWorker] Processing job ${job.data.jobId}`);
      await processPromptStep(job.data.jobId);
    },
    { connection, concurrency: 5 }
  );

  // 4. Rendering Queue Worker
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
    }
  );

  // 5. Upload Queue Worker
  const uploadWorker = new Worker(
    'uploadQueue',
    async (job) => {
      console.log(`[UploadWorker] Uploading assets for job ${job.data.jobId}`);
      await processUploadStep(job.data.jobId);
    },
    { connection, concurrency: 3 }
  );

  // 6. Notification Queue Worker
  const notificationWorker = new Worker(
    'notificationQueue',
    async (job) => {
      const { jobId, type, message, recipient } = job.data;
      console.log(`[NotificationWorker] Dispatching alert to ${recipient}`);
      await processNotificationStep(jobId, type, message, recipient);
    },
    { connection, concurrency: 10 }
  );

  const workers = [scriptWorker, audioWorker, promptWorker, renderingWorker, uploadWorker, notificationWorker];

  workers.forEach(w => {
    w.on('completed', (job) => console.log(`[${w.name}] Job completed: ${job.id}`));
    w.on('failed', async (job, err) => {
      console.error(`[${w.name}] Job failed: ${job?.id}, Error: ${err.message}`);
      if (job?.data?.jobId) {
        await Job.findByIdAndUpdate(job.data.jobId, { status: JOB_STATUS.FAILED, error: err.message });
        await logError(job.data.jobId, `Pipeline failed at ${w.name}: ${err.message}`);
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
