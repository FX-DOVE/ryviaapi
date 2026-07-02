import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import GpuWorker from '../models/GpuWorker.js';
import { processImageStep, processVideoStep } from './workerSteps.js';
import eventBus from '../services/eventBus.js';

const WORKER_ID = process.env.GPU_WORKER_ID || `gpu-worker-${uuidv4().substring(0, 8)}`;
const IDLE_TIMEOUT_MS = parseInt(process.env.GPU_WORKER_IDLE_TIMEOUT || '300000', 10);
const HEARTBEAT_INTERVAL_MS = 15000;

const connection = createRedisConnection();
let idleTimer = null;
let activeJobCount = 0;

// Telemetry counters
let jobsCompleted = 0;
let totalJobTimeMs = 0;
let averageJobTime = 0;

async function start() {
  await connectDB();
  await eventBus.init();
  console.log(`[GPUWorker] Starting telemetry active worker node: ${WORKER_ID}`);

  // Register in DB
  await GpuWorker.findOneAndUpdate(
    { workerId: WORKER_ID },
    {
      workerId: WORKER_ID,
      gpuModel: process.env.GPU_MODEL || 'NVIDIA RTX 4090',
      vramTotal: parseInt(process.env.GPU_VRAM || '24576', 10),
      cudaVersion: '12.2',
      powerUsage: 35, // Idle Watts
      runningModel: 'none',
      jobsCompleted: 0,
      averageJobTime: 0,
      status: 'idle',
      heartbeat: new Date(),
      supportedQueues: ['imageQueue', 'videoQueue'],
      version: '2.0.0',
      metrics: {
        temperature: 42,
        gpuUtilization: 0,
        memoryUsed: 1250,
        freeSystemMemory: Math.round(os.freemem() / (1024 * 1024))
      }
    },
    { upsert: true, new: true }
  );

  // Periodically send heartbeat
  const heartbeatTimer = setInterval(async () => {
    try {
      await GpuWorker.updateOne(
        { workerId: WORKER_ID },
        { 
          heartbeat: new Date(),
          'metrics.freeSystemMemory': Math.round(os.freemem() / (1024 * 1024)),
          'metrics.gpuUtilization': activeJobCount > 0 ? 85 : 0,
          'metrics.temperature': activeJobCount > 0 ? 68 : 42,
          powerUsage: activeJobCount > 0 ? 250 : 35, // 250W load, 35W idle
          runningModel: activeJobCount > 0 ? 'flux-v1-dev' : 'none',
          jobsCompleted,
          averageJobTime
        }
      );
    } catch (err) {
      console.warn(`[GPUWorker] Heartbeat update failed: ${err.message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  resetIdleTimeout();

  // 1. Image Queue Worker
  const imageWorker = new Worker(
    'imageQueue',
    async (job) => {
      const startTime = Date.now();
      resetIdleTimeout(true);
      activeJobCount++;
      await updateWorkerStatus('busy', job.data.jobId);
      
      try {
        const { jobId, sceneId, sceneNumber, prompt } = job.data;
        console.log(`[GPUWorker] Generating image for Scene ${sceneNumber} (Job: ${jobId})`);
        await processImageStep(jobId, sceneId, sceneNumber, prompt);
      } finally {
        trackCompletedJob(startTime);
        activeJobCount--;
        await updateWorkerStatus(activeJobCount > 0 ? 'busy' : 'idle', null);
        resetIdleTimeout();
      }
    },
    { connection, concurrency: 1 }
  );

  // 2. Video Queue Worker
  const videoWorker = new Worker(
    'videoQueue',
    async (job) => {
      const startTime = Date.now();
      resetIdleTimeout(true);
      activeJobCount++;
      await updateWorkerStatus('busy', job.data.jobId);

      try {
        const { jobId, sceneId, sceneNumber, imagePath, prompt } = job.data;
        console.log(`[GPUWorker] Animating video for Scene ${sceneNumber} (Job: ${jobId})`);
        await processVideoStep(jobId, sceneId, sceneNumber, imagePath, prompt);
      } finally {
        trackCompletedJob(startTime);
        activeJobCount--;
        await updateWorkerStatus(activeJobCount > 0 ? 'busy' : 'idle', null);
        resetIdleTimeout();
      }
    },
    { connection, concurrency: 1 }
  );

  const workers = [imageWorker, videoWorker];

  workers.forEach(w => {
    w.on('completed', (job) => console.log(`[GPUWorker - ${w.name}] Completed job: ${job.id}`));
    w.on('failed', (job, err) => console.error(`[GPUWorker - ${w.name}] Failed job: ${job?.id}, Error: ${err.message}`));
    w.on('error', (err) => console.error(`[GPUWorker - ${w.name}] Global error:`, err));
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[GPUWorker] Telemetry shutdown sequence...');
    clearInterval(heartbeatTimer);
    clearTimeout(idleTimer);
    await Promise.all(workers.map(w => w.close()));
    try {
      await GpuWorker.deleteOne({ workerId: WORKER_ID });
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function trackCompletedJob(startTime) {
  const duration = Date.now() - startTime;
  jobsCompleted++;
  totalJobTimeMs += duration;
  averageJobTime = Math.round(totalJobTimeMs / jobsCompleted / 1000);
}

async function updateWorkerStatus(status, currentJobId) {
  try {
    await GpuWorker.updateOne(
      { workerId: WORKER_ID },
      { 
        status, 
        currentJobId,
        runningModel: status === 'busy' ? 'flux-v1-dev' : 'none'
      }
    );
  } catch (e) {
    console.warn(`[GPUWorker] Status update failed: ${e.message}`);
  }
}

function resetIdleTimeout(stopOnly = false) {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (stopOnly) return;

  idleTimer = setTimeout(async () => {
    console.log(`[GPUWorker] Idle timeout reached (${IDLE_TIMEOUT_MS / 1000}s). Exiting node.`);
    try {
      await GpuWorker.deleteOne({ workerId: WORKER_ID });
    } catch (e) {}
    process.exit(0);
  }, IDLE_TIMEOUT_MS);
}

start().catch((err) => {
  console.error('[GPUWorker] Fatal startup error:', err);
  process.exit(1);
});
