import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import Job from '../models/Job.js';
import Workspace from '../models/Workspace.js';

const connection = createRedisConnection();

// Define custom exponential backoff delay mapping
const BACKOFF_DELAYS = [5000, 30000, 120000, 600000]; // 5s, 30s, 2m, 10m

const DEFAULT_OPTIONS = {
  settings: {
    backoffStrategies: {
      custom_exponential: (attemptsMade) => {
        return BACKOFF_DELAYS[attemptsMade - 1] || 600000; // default 10 mins
      }
    }
  },
  defaultJobOptions: {
    attempts:  5, // retry 5 times before moving to DLQ
    backoff:   { type: 'custom_exponential' },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
  }
};

export const queues = {
  script:       new Queue('scriptQueue',       { connection, ...DEFAULT_OPTIONS }),
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
  enqueuePromptJob,
  enqueueAudioJob,
  enqueueImageJob,
  enqueueVideoJob,
  enqueueRenderingJob,
  enqueueUploadJob,
  enqueueNotificationJob,
};
