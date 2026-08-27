import Job from '../models/Job.js';
import queueManager from '../queues/queueManager.js';
import { FILM_PIPELINE_STEPS } from '../config/constants.js';

/**
 * Start a job's pipeline.
 *
 * The only supported way to kick a job off. `triggerNextStep()` advances by
 * looking the current step up in `job.workflow.steps`, so a job enqueued
 * without that list runs its first step and then silently stops — which is
 * exactly what used to happen, since nothing ever wrote the field.
 *
 * @param {string} jobId
 * @param {string[]} [steps]  defaults to the full film pipeline
 */
export async function startJobPipeline(jobId, steps = FILM_PIPELINE_STEPS) {
  const plan = Array.isArray(steps) && steps.length ? [...steps] : [...FILM_PIPELINE_STEPS];
  const firstId = typeof plan[0] === 'string' ? plan[0] : plan[0]?.id;
  if (!firstId) throw new Error(`[ExecutionEngine] Job ${jobId} given an unusable pipeline plan`);

  await Job.findByIdAndUpdate(jobId, {
    'workflow.steps': plan,
    'workflow.activeStep': firstId,
  });

  console.log(`[ExecutionEngine] Job ${jobId} pipeline: ${plan.map(s => s.id || s).join(' → ')}`);

  // Dispatch through triggerNextStep with no current step: it resolves steps[0]
  // and routes it through the same switch every later step uses. Enqueueing the
  // script step directly would break any plan that starts elsewhere — which is
  // exactly what a screenplay-backed job needs, since it has no raw script.
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
