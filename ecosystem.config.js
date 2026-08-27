/**
 * PM2 topology.
 *
 * Exactly ONE process consumes the BullMQ queues. `ai-worker` used to exist here
 * too, running `aiWorker.js`, which was nothing but `import './schedulerWorker.js'`
 * — so every queue had two consumers and the `concurrency: 1` pinning on the GPU
 * and rendering lanes was silently doubled. Two Runpod segment jobs in flight for
 * one film is real money.
 *
 * To scale out later, split by lane rather than cloning the scheduler:
 * `renderWorker.js` already stands alone on renderingQueue, and `gpuWorker.js` on
 * imageQueue/videoQueue — but whichever queue you hand to a dedicated process must
 * be removed from schedulerWorker.js at the same time.
 */
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'backend/index.js',
      cwd: '.',
      interpreter: 'node',
      node_args: '--max-old-space-size=256',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // Runs the whole pipeline: script, directing, locking, segments, audio,
      // prompts, rendering, upload, notifications.
      name: 'scheduler',
      script: 'backend/src/workers/schedulerWorker.js',
      cwd: '.',
      interpreter: 'node',
      // Generous on purpose. This process holds BullMQ locks for hours while
      // Runpod works, and buffers base64 images and video clips on the way
      // through. A max_memory_restart trip mid-segment drops the lock, and the
      // scene is regenerated on the GPU from scratch — at full cost.
      node_args: '--max-old-space-size=512',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '700M',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
