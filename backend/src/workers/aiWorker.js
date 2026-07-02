/**
 * AI Worker Entry Point
 *
 * This process is separate from the scheduler.
 * The scheduler (schedulerWorker.js) consumes the BullMQ queue.
 * This file exists as a standalone entry for PM2 to manage the
 * heavy AI processing process independently.
 *
 * In the current design, the scheduler worker directly calls
 * runAIPipeline() from workerSteps.js. This file is reserved for
 * Phase 3 when the AI Worker will be an independent subprocess
 * communicating via Redis pub/sub for GPU isolation.
 *
 * For Phase 1, PM2 runs schedulerWorker.js as 'scheduler' which
 * handles both scheduling and AI execution in a single, memory-
 * bounded process.
 */
import './schedulerWorker.js';
