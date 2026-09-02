import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import './env.js';

import { connectDB } from './src/config/db.js';
import { registerMaintenanceCron } from './src/queues/maintenanceQueue.js';
import { checkRedisConfig } from './src/config/redis.js';
import eventBus from './src/services/eventBus.js';
import { recoverStuckScreenplays } from './src/services/screenplayService.js';
import server from './src/app.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
  try {
    await connectDB();
    console.log('[API] MongoDB connected');

    await checkRedisConfig();
    
    // Initialize Event Bus cluster sync
    await eventBus.init();

    // Resume any screenplays stranded mid-generation by a previous restart. The
    // eventBus is up, so progress emits reach connected clients. Best-effort — a
    // recovery failure must not stop the server from starting.
    try {
      await recoverStuckScreenplays();
    } catch (err) {
      console.error('[API] Screenplay recovery failed:', err.message);
    }

    // Register nightly maintenance cron (idempotent)
    await registerMaintenanceCron();

    // Start Core Pipeline Workers in unified mode
    if (process.env.DISABLE_EMBEDDED_WORKERS !== 'true') {
      try {
        const { startWorkerCluster } = await import('./src/workers/schedulerWorker.js');
        await startWorkerCluster();
        console.log('[API] Embedded worker cluster initialized');
      } catch (err) {
        console.error('[API] Warning: Failed to start embedded worker cluster:', err.message);
      }
    }

    // Auto-resume stranded queued jobs
    try {
      const { default: Job } = await import('./src/models/Job.js');
      const { startJobPipeline } = await import('./src/services/executionEngine.js');
      const queuedJobs = await Job.find({
        status: 'queued',
        title: { $exists: true, $ne: '' },
        workspaceId: { $exists: true, $ne: null }
      });
      for (const qj of queuedJobs) {
        console.log(`[API] Resuming stranded queued job "${qj.title}" (${qj._id})...`);
        startJobPipeline(String(qj._id)).catch(err =>
          console.error(`[API] Failed to resume job ${qj._id}:`, err.message)
        );
      }
    } catch (err) {
      console.error('[API] Job recovery check error:', err.message);
    }

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[API] Server listening on http://0.0.0.0:${PORT}`);
      console.log(`[API] LAN access: http://192.168.1.125:${PORT}`);
      console.log(`[API] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[API] Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[API] SIGTERM — shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

start();
