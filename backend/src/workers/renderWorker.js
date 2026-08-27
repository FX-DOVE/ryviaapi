import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import { processRenderingStep } from './workerSteps.js';
import eventBus from '../services/eventBus.js';
import { WORKER_SETTINGS } from '../queues/queueManager.js';

const connection = createRedisConnection();

async function start() {
  await connectDB();
  await eventBus.init();
  console.log('[RenderWorker] Starting standalone rendering node. Listening to renderingQueue...');

  const worker = new Worker(
    'renderingQueue',
    async (job) => {
      const { jobId } = job.data;
      console.log(`[RenderWorker] Compiling rendering pipeline for Job: ${jobId}`);
      await processRenderingStep(jobId);
    },
    {
      connection,
      concurrency: 1, // CPU/IO intensive, restrict to 1 parallel render per node process instance
      lockDuration: 30 * 60 * 1000, // 30 mins lock
      settings: WORKER_SETTINGS,
    }
  );

  worker.on('completed', (job) => console.log(`[RenderWorker] Render compiled successfully for Job: ${job.data.jobId}`));
  worker.on('failed', (job, err) => console.error(`[RenderWorker] Render compilation failed for Job: ${job?.data?.jobId}, Error: ${err.message}`));
  worker.on('error', (err) => console.error('[RenderWorker] Global worker error:', err));

  process.on('SIGTERM', async () => {
    console.log('[RenderWorker] SIGTERM received — closing worker...');
    await worker.close();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[RenderWorker] Fatal startup error:', err);
  process.exit(1);
});
