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
