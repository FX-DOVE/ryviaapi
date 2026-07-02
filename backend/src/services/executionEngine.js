import Job from '../models/Job.js';
import queueManager from '../queues/queueManager.js';

export async function triggerNextStep(jobId, currentStepId = null) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const steps = job.workflow?.steps || [];
  if (steps.length === 0) {
    console.log(`[ExecutionEngine] Job ${jobId} has no workflow steps configured.`);
    return;
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

export default { triggerNextStep };
