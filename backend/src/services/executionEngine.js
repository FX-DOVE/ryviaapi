import Job from '../models/Job.js';
import queueManager from '../queues/queueManager.js';
import { FILM_PIPELINE_STEPS, SCREENPLAY_PIPELINE_STEPS } from '../config/constants.js';

/**
 * Start a job's pipeline.
 *
 * Automatically detects screenplay-backed jobs and existing progress
 * to resume from the correct step (e.g. segment_generation).
 *
 * @param {string} jobId
 * @param {string[]} [steps]  custom pipeline plan or auto-detected
 */
export async function startJobPipeline(jobId, steps = null) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  let plan = steps;
  if (!plan || !Array.isArray(plan) || plan.length === 0) {
    const { default: Scene } = await import('../models/Scene.js');
    const scenes = await Scene.find({ jobId });

    const allScenesDone = scenes.length > 0 && scenes.every(s => s.status === 'done' && Boolean(s.videoPath));
    const hasDirectorPlan = Boolean(job.directorPlan?.acts?.length);
    const hasLocks = Object.keys(job.characterLocks || {}).length > 0 || Object.keys(job.environmentLocks || {}).length > 0;

    if (job.finalVideoUrl || (job.finalVideoPath && typeof job.finalVideoPath === 'string')) {
      // Final video already rendered! Resume directly at upload/notification
      plan = ['upload', 'notify'];
    } else if (allScenesDone) {
      // All scenes generated and ready! Resume directly at rendering/assembly
      plan = ['rendering', 'upload', 'notify'];
    } else if (hasDirectorPlan && hasLocks) {
      // Plan and locks already completed! Resume at segment generation
      plan = ['segment_generation', 'rendering', 'upload', 'notify'];
    } else if (hasDirectorPlan) {
      // Director plan exists, resume at locking
      plan = ['locking', 'segment_generation', 'rendering', 'upload', 'notify'];
    } else if (job.screenplayId) {
      plan = [...SCREENPLAY_PIPELINE_STEPS];
    } else {
      plan = [...FILM_PIPELINE_STEPS];
    }
  }

  const firstId = typeof plan[0] === 'string' ? plan[0] : plan[0]?.id;
  if (!firstId) throw new Error(`[ExecutionEngine] Job ${jobId} given an unusable pipeline plan`);

  await Job.findByIdAndUpdate(jobId, {
    'workflow.steps': plan,
    'workflow.activeStep': firstId,
  });

  console.log(`[ExecutionEngine] 🚀 Job ${jobId} resuming from step "${firstId}": ${plan.map(s => s.id || s).join(' → ')}`);

  await triggerNextStep(jobId, null);
}

export async function triggerNextStep(jobId, currentStepId = null) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Repair rather than stall: a job created before the pipeline was recorded
  // (or by a path that forgot) would otherwise stop dead after step one.
  let steps = job.workflow?.steps || [];
  if (steps.length === 0) {
    steps = [...FILM_PIPELINE_STEPS];
    console.warn(
      `[ExecutionEngine] Job ${jobId} had no workflow steps — defaulting to `
      + `${steps.join(' → ')}`,
    );
  }

  let nextIndex = 0;
  if (currentStepId) {
    const currentIndex = steps.findIndex(s => s.id === currentStepId || s === currentStepId);
    if (currentIndex !== -1) {
      nextIndex = currentIndex + 1;
    }
  }

  if (nextIndex >= steps.length) {
    console.log(`[ExecutionEngine] Job ${jobId} completed all planned workflow steps.`);
    return;
  }

  // Handle both string fallback (from old jobs) and new object schema
  const nextStepRaw = steps[nextIndex];
  const nextStep = typeof nextStepRaw === 'string' ? { id: nextStepRaw, provider: 'auto' } : nextStepRaw;

  job.workflow = {
    steps,
    activeStep: nextStep.id
  };
  await job.save();

  console.log(`[ExecutionEngine] Job ${jobId}: Scheduling next step "${nextStep.id}" via provider "${nextStep.provider}"`);

  // Map step identifiers to BullMQ queue wrappers, injecting provider logic
  switch (nextStep.id) {
    case 'script':
      await queueManager.enqueueScriptJob(jobId, nextStep.provider);
      break;
    case 'directing':
      await queueManager.enqueueDirectingJob(jobId, nextStep.provider);
      break;
    case 'locking':
      await queueManager.enqueueLockingJob(jobId, nextStep.provider);
      break;
    case 'segment_generation':
      await queueManager.enqueueSegmentJob(jobId, nextStep.provider);
      break;
    case 'audio':
      await queueManager.enqueueAudioJob(jobId, nextStep.provider);
      break;
    case 'prompt':
      await queueManager.enqueuePromptJob(jobId, nextStep.provider);
      break;
    case 'image_generation':
    case 'video_generation':
    case 'lipsync': {
      // Fan-out to scene level
      const { default: Scene } = await import('../models/Scene.js');
      const scenes = await Scene.find({ jobId });
      for (const scene of scenes) {
        if (scene.status === 'done' || scene.planningDecision?.action === 'reuse' || scene.planningDecision?.action === 'skip') {
          continue; // skip completed or reused scenes
        }
        
        if (nextStep.id === 'image_generation') {
          await queueManager.enqueueImageJob(jobId, String(scene._id), scene.sceneNumber, scene.enrichedPrompt || scene.imagePrompt, nextStep.provider);
        } else if (nextStep.id === 'video_generation' && scene.planningDecision?.action !== 'image_only') {
          // ensure image exists before spawning video
          if (scene.imagePath) {
            await queueManager.enqueueVideoJob(jobId, String(scene._id), scene.sceneNumber, scene.imagePath, scene.videoPrompt || scene.imagePrompt, nextStep.provider);
          } else {
             console.warn(`[ExecutionEngine] Cannot start video for scene ${scene.sceneNumber} without imagePath`);
          }
        }
      }
      break;
    }
    case 'rendering':
      await queueManager.enqueueRenderingJob(jobId, nextStep.provider);
      break;
    case 'upload':
      await queueManager.enqueueUploadJob(jobId, nextStep.provider);
      break;
    case 'notify':
      // The notification job parameters are enqueued directly at upload complete
      break;
    default:
      console.warn(`[ExecutionEngine] Unmapped dynamic step triggered: "${nextStep.id}"`);
  }
}

export default { triggerNextStep, startJobPipeline };
