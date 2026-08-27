import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import Job from '../models/Job.js';
import Workspace from '../models/Workspace.js';

const connection = createRedisConnection();

// Define custom exponential backoff delay mapping
const BACKOFF_DELAYS = [5000, 30000, 120000, 600000]; // 5s, 30s, 2m, 10m

export const WORKER_SETTINGS = {
  backoffStrategies: {
    custom_exponential: (attemptsMade) => {
      return BACKOFF_DELAYS[attemptsMade - 1] || 600000; // default 10 mins
    }
  }
};

const DEFAULT_OPTIONS = {
  settings: WORKER_SETTINGS,
  defaultJobOptions: {
    attempts:  5, // retry 5 times before moving to DLQ
    backoff:   { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
  }
};

/**
 * GPU steps get their own retry budget. A locking or segment-generation attempt
 * can run for the better part of an hour on Runpod (7-11 min cold start alone),
 * so the default five attempts would bill four more full runs of a step that is
 * usually failing for a reason retrying cannot fix.
 */
const GPU_OPTIONS = {
  ...DEFAULT_OPTIONS,
  defaultJobOptions: {
    ...DEFAULT_OPTIONS.defaultJobOptions,
    attempts: 2,
  },
};

export const queues = {
  script:       new Queue('scriptQueue',       { connection, ...DEFAULT_OPTIONS }),
  directing:    new Queue('directingQueue',    { connection, ...DEFAULT_OPTIONS }),
  locking:      new Queue('lockingQueue',      { connection, ...GPU_OPTIONS }),
  segment:      new Queue('segmentQueue',      { connection, ...GPU_OPTIONS }),
  prompt:       new Queue('promptQueue',       { connection, ...DEFAULT_OPTIONS }),
  audio:        new Queue('audioQueue',        { connection, ...DEFAULT_OPTIONS }),
  image:        new Queue('imageQueue',        { connection, ...DEFAULT_OPTIONS }),
  video:        new Queue('videoQueue',        { connection, ...DEFAULT_OPTIONS }),
  rendering:    new Queue('renderingQueue',    { connection, ...DEFAULT_OPTIONS }),
  upload:       new Queue('uploadQueue',       { connection, ...DEFAULT_OPTIONS }),
  notification: new Queue('notificationQueue', { connection, ...DEFAULT_OPTIONS }),
  retry:        new Queue('retryQueue',        { connection, ...DEFAULT_OPTIONS }),
  dlq:          new Queue('deadLetterQueue',   { connection, ...DEFAULT_OPTIONS }),
};

/**
 * Determine dynamic job scheduling priority based on the associated Workspace tier.
 */
async function getJobPriority(jobId) {
  try {
    const job = await Job.findById(jobId);
    if (!job || !job.workspaceId) return 5; // standard priority
    
    const ws = await Workspace.findById(job.workspaceId);
    if (!ws) return 5;

    const plan = (ws.billingPlan || 'free').toLowerCase();
    const mapping = {
      'enterprise': 1,
      'premium':    2,
      'pro':        3,
      'standard':   4,
      'free':       5
    };
    return mapping[plan] || 5;
  } catch (err) {
    return 5; // fallback
  }
}

export async function enqueueScriptJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.script.add('process_script', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Script Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueDirectingJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.directing.add('process_directing', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Directing Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueLockingJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.locking.add('process_locking', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Locking Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueSegmentJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.segment.add('process_segments', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Segment Generation Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueuePromptJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.prompt.add('process_prompts', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Prompt Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueAudioJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.audio.add('process_audio', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Audio Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueImageJob(jobId, sceneId, sceneNumber, prompt, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.image.add('generate_image', { jobId, sceneId, sceneNumber, prompt, provider }, { priority });
  console.log(`[QueueManager] Enqueued Image Job for Scene ${sceneNumber} (Job: ${jobId}, Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueVideoJob(jobId, sceneId, sceneNumber, imagePath, prompt, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.video.add('generate_video', { jobId, sceneId, sceneNumber, imagePath, prompt, provider }, { priority });
  console.log(`[QueueManager] Enqueued Video Job for Scene ${sceneNumber} (Job: ${jobId}, Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueRenderingJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.rendering.add('render_video', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Rendering Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueUploadJob(jobId, provider = 'auto') {
  const priority = await getJobPriority(jobId);
  await queues.upload.add('upload_assets', { jobId, provider }, { priority });
  console.log(`[QueueManager] Enqueued Upload Job: ${jobId} (Provider: ${provider}, Priority: ${priority})`);
}

export async function enqueueNotificationJob(jobId, type, message, recipient) {
  const priority = await getJobPriority(jobId);
  await queues.notification.add('send_notification', { jobId, type, message, recipient }, { priority });
  console.log(`[QueueManager] Enqueued Notification Job for ${recipient} (Priority: ${priority})`);
}

export default {
  queues,
  enqueueScriptJob,
  enqueueDirectingJob,
  enqueueLockingJob,
  enqueueSegmentJob,
  enqueuePromptJob,
  enqueueAudioJob,
  enqueueImageJob,
  enqueueVideoJob,
  enqueueRenderingJob,
  enqueueUploadJob,
  enqueueNotificationJob,
};
