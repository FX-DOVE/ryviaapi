import Scene from '../models/Scene.js';
import Job from '../models/Job.js';
import Project from '../models/Project.js';
import Character from '../models/Character.js';
import Environment from '../models/Environment.js';
import { findReusableAsset } from './assetReuseService.js';

/**
 * Plans the execution strategy for all scenes in a job.
 * Determines if we should Reuse, Generate, Animate, create Image Only, use Stock, or Skip.
 * Enforces Character seed, Environment seed, and Lipsync requirement flags.
 * 
 * @param {string} jobId   The MongoDB Job ID
 * @returns {Promise<Object>} Object containing planning summary
 */
export async function planJobScenes(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  console.log(`[AIPlanner] Starting scene planning for job ${jobId}...`);

  const project = job.projectId ? await Project.findById(job.projectId) : null;
  const scenes = await Scene.find({ jobId }).sort({ sceneNumber: 1 });
  let estimatedCost = 5; // Base cost

  let reusedCount = 0;
  let generatedCount = 0;
  let imageOnlyCount = 0;
  let skippedCount = 0;

  for (const scene of scenes) {
    // 1. Check for Intelligent Multi-Modal Asset Reuse
    const match = await findReusableAsset({
      prompt:          scene.imagePrompt || scene.narration,
      emotion:         'neutral',
      characters:      [], 
      visualTags:      [],
      cameraMovement:  null,
      dominantColors:  [],
      lighting:        'daylight'
    });

    // Check if character/env is requested
    const hasChar = !!scene.characterId;
    const hasEnv = !!scene.environmentId;

    if (match && !hasChar && !hasEnv) {
      // Plan: REUSE
      scene.planningDecision = {
        action: 'reuse',
        details: {
          assetId:        String(match.asset._id),
          path:           match.asset.path,
          confidence:     match.confidence,
          explanation:    match.explanation,
          transformation: 'zoom_in'
        }
      };
      scene.plannerStatus = 'planned';
      reusedCount++;
      estimatedCost += 1;
    } else {
      // 2. Classify if still image is sufficient (infographics, diagrams, maps, texts)
      const promptText = (scene.imagePrompt || '').toLowerCase();
      const isStaticPrompt = promptText.includes('diagram') || 
                             promptText.includes('chart') || 
                             promptText.includes('map of') || 
                             promptText.includes('infographic') || 
                             promptText.includes('still logo') || 
                             promptText.includes('text overlay');

      if (isStaticPrompt) {
        // Plan: IMAGE ONLY
        scene.planningDecision = {
          action: 'image_only',
          details: { explanation: 'Identified static prompt contents' }
        };
        scene.plannerStatus = 'planned';
        imageOnlyCount++;
        estimatedCost += 2;
      } else if (scene.duration < 1.0 && !scene.narration?.trim()) {
        // Plan: SKIP (too short, no content)
        scene.planningDecision = {
          action: 'skip',
          details: { explanation: 'Scene duration too short, empty narration' }
        };
        scene.plannerStatus = 'skipped';
        scene.status = 'done'; // mark done directly
        skippedCount++;
      } else {
        // Plan: GENERATE (full image + video)
        let action = 'generate';
        const details = { explanation: 'Requires new visual generation' };

        if (scene.characterId && project) {
          const char = await Character.findOne({ _id: scene.characterId, workspaceId: project.workspaceId });
          if (char?.referenceImageUrl) {
            action = 'generate_with_character';
            details.characterSeedUrl = char.referenceImageUrl;
            details.characterSeedPrompt = char.seedPrompt;
          }
        }

        if (scene.environmentId && project) {
          const env = await Environment.findOne({ _id: scene.environmentId, workspaceId: project.workspaceId });
          if (env?.referenceImageUrls?.length > 0) {
            action = action === 'generate_with_character' ? 'generate_with_both' : 'generate_with_environment';
            details.environmentSeedUrl = env.referenceImageUrls[0];
          }
        }

        // Determine if talking lipsync is required
        const talkingKeywords = ['says', 'speaks', 'tells', 'announces', 'looks at camera'];
        const isTalking = talkingKeywords.some(k => scene.narration?.toLowerCase().includes(k));
        
        if (isTalking && process.env.LIP_SYNC_ENABLED === 'true') {
          scene.lipSync = {
            required: true,
            audioUrl: null,
            syncedVideoUrl: null,
            syncedVideoKey: null,
            status: 'pending'
          };
        }

        scene.planningDecision = {
          action,
          details
        };
        scene.plannerStatus = 'planned';
        generatedCount++;
        estimatedCost += 22; // 2 credits image + 20 credits video
      }
    }

    await scene.save();
  }

  // Add TTS cost (3 credits) + Rendering cost (5 credits)
  estimatedCost += 3 + 5;

  // Save the calculated cost estimate back to the job
  job.estimatedCost = estimatedCost;
  job.creditCost = estimatedCost;
  await job.save();

  console.log(`[AIPlanner] Job ${jobId} planned: ${scenes.length} scenes. (Reused: ${reusedCount}, Generated: ${generatedCount}, ImageOnly: ${imageOnlyCount}, Skipped: ${skippedCount}). Estimated cost: ${estimatedCost} credits.`);

  return {
    jobId,
    totalScenes: scenes.length,
    reusedCount,
    generatedCount,
    imageOnlyCount,
    skippedCount,
    estimatedCost
  };
}

export default { planJobScenes };
