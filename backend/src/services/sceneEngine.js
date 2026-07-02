import Scene from '../models/Scene.js';
import { SCENE_STATUS } from '../config/constants.js';

/**
 * Normalize and validate raw scenes from scriptAnalyzer.
 * Saves them to the Scene collection.
 *
 * @param {string} jobId
 * @param {object[]} rawScenes  Output from scriptAnalyzer.analyzeScript()
 * @returns {Promise<object[]>} Saved Scene documents
 */
export async function buildAndSaveScenes(jobId, rawScenes) {
  // Delete any previous scenes for this job (recovery scenario)
  await Scene.deleteMany({ jobId });

  const scenes = rawScenes.map((raw, idx) => ({
    jobId,
    sceneNumber:  idx + 1,
    narration:    sanitize(raw.narration  || raw.narration  || ''),
    imagePrompt:  sanitize(raw.imagePrompt || raw.visual_prompt || ''),
    videoPrompt:  sanitize(raw.videoPrompt || raw.visual_prompt || raw.imagePrompt || ''),
    duration:     clamp(raw.duration ?? 8, 0.5, 60),
    status:       SCENE_STATUS.PENDING,
  }));

  const saved = await Scene.insertMany(scenes);
  console.log(`[SceneEngine] Created ${saved.length} scenes for job ${jobId}`);
  return saved;
}

/**
 * Initialize scenes in pending state based on transcript chunks if not already created.
 * Used for resuming mid-job.
 *
 * @param {string} jobId
 * @param {object[]} transcriptChunks
 * @returns {Promise<object[]>} Saved or existing Scene documents
 */
export async function initializeScenes(jobId, transcriptChunks) {
  const existingCount = await Scene.countDocuments({ jobId });
  if (existingCount === transcriptChunks.length) {
    console.log(`[SceneEngine] Scenes already initialized (${existingCount} scenes) for job ${jobId}`);
    return await Scene.find({ jobId }).sort({ sceneNumber: 1 });
  }

  // If there's a mismatch or no scenes, recreate them
  await Scene.deleteMany({ jobId });

  const scenes = transcriptChunks.map((chunk) => ({
    jobId,
    sceneNumber:  chunk.id,
    narration:    sanitize(chunk.text || ''),
    imagePrompt:  '', // empty prompt
    videoPrompt:  '', // empty prompt
    duration:     clamp(chunk.endTime - chunk.startTime, 0.5, 60),
    status:       SCENE_STATUS.PENDING,
  }));

  const saved = await Scene.insertMany(scenes);
  console.log(`[SceneEngine] Initialized ${saved.length} scenes for job ${jobId}`);
  return saved;
}


/**
 * Get all pending scenes for a job (used by the AI worker to resume).
 */
export async function getPendingScenes(jobId) {
  return Scene.find({ jobId, status: SCENE_STATUS.PENDING }).sort({ sceneNumber: 1 });
}

/**
 * Get all scenes for a job (for the Job Detail page).
 */
export async function getAllScenes(jobId) {
  return Scene.find({ jobId }).sort({ sceneNumber: 1 });
}

/**
 * Mark a scene as generating.
 */
export async function markGenerating(sceneId) {
  return Scene.findByIdAndUpdate(sceneId, { status: SCENE_STATUS.GENERATING });
}

/**
 * Mark a scene as done with its output paths.
 */
export async function markDone(sceneId, { imagePath, videoPath, audioPath }) {
  return Scene.findByIdAndUpdate(sceneId, {
    status: SCENE_STATUS.DONE,
    imagePath,
    videoPath,
    audioPath: audioPath || null,
  });
}

/**
 * Mark a scene as failed and increment retry count.
 */
export async function markFailed(sceneId, errorMessage) {
  return Scene.findByIdAndUpdate(sceneId, {
    status:  SCENE_STATUS.FAILED,
    error:   errorMessage,
    $inc:    { retryCount: 1 },
  });
}

// --- Helpers ---

function sanitize(str) {
  return String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Number(val) || min));
}

export default { buildAndSaveScenes, initializeScenes, getPendingScenes, getAllScenes, markGenerating, markDone, markFailed };
