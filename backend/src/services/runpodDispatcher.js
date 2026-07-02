import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import { Worker } from 'bullmq';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { createRedisConnection } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import eventBus from '../services/eventBus.js';

const connection = createRedisConnection();

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  console.error('[RunPodDispatcher] Missing RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID in .env');
}

/**
 * Dispatches a job to RunPod Serverless and polls for completion.
 */
async function dispatchToRunPod(inputData) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    throw new Error('RunPod credentials missing.');
  }

  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;
  
  // 1. Submit the job
  const response = await axios.post(
    url,
    { input: inputData },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      }
    }
  );

  const requestId = response.data.id;
  console.log(`[RunPodDispatcher] Submitted request ${requestId} to RunPod.`);

  // 2. Poll for completion
  const statusUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${requestId}`;
  
  while (true) {
    // Wait 10 seconds between polls
    await new Promise(resolve => setTimeout(resolve, 10000));

    const statusRes = await axios.get(statusUrl, {
      headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` }
    });

    const status = statusRes.data.status;
    
    if (status === 'COMPLETED') {
      console.log(`[RunPodDispatcher] Request ${requestId} COMPLETED.`);
      return statusRes.data.output;
    }
    
    if (status === 'FAILED') {
      console.error(`[RunPodDispatcher] Request ${requestId} FAILED:`, statusRes.data.error);
      throw new Error(`RunPod generation failed: ${statusRes.data.error}`);
    }
    
    // Status is IN_PROGRESS or IN_QUEUE, keep polling
    console.log(`[RunPodDispatcher] Request ${requestId} status: ${status}...`);
  }
}

async function start() {
  await connectDB();
  await eventBus.init();
  console.log('[RunPodDispatcher] Starting Serverless Dispatcher Node...');

  // 1. Image Queue Dispatcher
  const imageDispatcher = new Worker(
    'imageQueue',
    async (job) => {
      console.log(`[RunPodDispatcher] Dispatching Image Job ${job.data.jobId} / Scene ${job.data.sceneNumber}`);
      
      const result = await dispatchToRunPod({
        type: 'image',
        jobId: job.data.jobId,
        sceneId: job.data.sceneId,
        sceneNumber: job.data.sceneNumber,
        prompt: job.data.prompt
      });
      
      return result;
    },
    { connection, concurrency: 5 } // Can handle multiple concurrently since Serverless auto-scales!
  );

  // 2. Video Queue Dispatcher
  const videoDispatcher = new Worker(
    'videoQueue',
    async (job) => {
      console.log(`[RunPodDispatcher] Dispatching Video Job ${job.data.jobId} / Scene ${job.data.sceneNumber}`);
      
      const result = await dispatchToRunPod({
        type: 'video',
        jobId: job.data.jobId,
        sceneId: job.data.sceneId,
        sceneNumber: job.data.sceneNumber,
        imagePath: job.data.imagePath,
        prompt: job.data.prompt
      });
      
      return result;
    },
    { connection, concurrency: 5 } // Scalable
  );

  const workers = [imageDispatcher, videoDispatcher];

  workers.forEach(w => {
    w.on('completed', (job) => console.log(`[RunPodDispatcher - ${w.name}] Completed job: ${job.id}`));
    w.on('failed', (job, err) => console.error(`[RunPodDispatcher - ${w.name}] Failed job: ${job?.id}, Error: ${err.message}`));
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[RunPodDispatcher] Shutting down...');
    await Promise.all(workers.map(w => w.close()));
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[RunPodDispatcher] Fatal startup error:', err);
  process.exit(1);
});
