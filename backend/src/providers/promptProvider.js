/**
 * promptProvider.js
 *
 * Builds visual scene prompts for image generation.
 * The actual AI generation is now delegated to reasoningProvider.generateWithFallback()
 * which handles the full 6-tier provider chain (Grok CLI → custom → Gemini → Groq →
 * OpenRouter → GitHub Models).
 *
 * This module is responsible for:
 *  - Owning the CINEMATIC_DIRECTOR_PROMPT template
 *  - Filling the template with per-scene context (narration, script, style guide)
 *  - Wrapping generateWithFallback for scene-prompt-building use case
 */

import { generateWithFallback } from './reasoningProvider.js';

/**
 * System role for the scene-prompt-building task.
 * Passed as the systemPrompt to providers that support system messages.
 */
const SCENE_PROMPT_SYSTEM = `You are a master cinematic director of photography and visual storyteller working on a professional feature film. You design single powerful keyframe images that serve as perfect starting points for smooth 10-second image-to-video animation. Your prompts are highly specific, technically precise, and cinematically excellent.`;

/**
 * Film-Mode Prompt Template — used when filmMode is true.
 * Injects character consistency data, action type, story position, and animation style.
 */
const FILM_SCENE_PROMPT_TEMPLATE = `
You are the Director of Photography for a {ANIMATION_STYLE} feature film titled "{FILM_TITLE}".
This is Scene {SCENE_NUMBER} of {TOTAL_SCENES} — Act {ACT_NUMBER}: "{ACT_TITLE}".

{CHARACTER_CONSISTENCY_BLOCK}

SCENE ACTION: {ACTION_TYPE} — {ACTION_DESCRIPTION}
SCENE LOCATION: {LOCATION}
SCENE EMOTION: {EMOTION} (intensity: {INTENSITY}/10)
CAMERA: {CAMERA_TYPE}
SPOKEN NARRATION: "{NARRATION}"

ANIMATION STYLE REQUIREMENTS:
{STYLE_MODIFIERS}

CREATIVE TASK:
Write a single 4-6 sentence cinematic image prompt for this exact scene moment.

Requirements:
- Shot size, camera angle, and focal length (e.g. "low-angle medium-wide on 35mm lens")
- Subject details: exact posture, micro-expression, precise action matching the SCENE ACTION type
- {CHARACTER_CONSISTENCY_BLOCK_SHORT} — CRITICAL: maintain identical character appearance from previous scenes
- Environment, location accuracy, props, weather, time-of-day
- Lighting design: key light direction, quality, color temperature, practicals
- Color palette matching the ANIMATION STYLE
- Include 1-3 subtle motion cues that will animate naturally for 10 seconds
- Match the {EMOTION} emotional tone throughout every visual choice

Output ONLY the visual description paragraph. No titles, bullets, or explanation.
`.trim();

/**
 * Standard (non-film) prompt template — used for short videos.
 */
const SCENE_PROMPT_TEMPLATE = `
Your sole responsibility: convert the given spoken narration into one exceptionally detailed, production-ready visual prompt for a cinematic still image.

CONTEXT:
- Full script context: "{SCRIPT_CONTEXT}"
- Visual style guide (follow strictly for consistency): "{STYLE_GUIDE}"

CURRENT SCENE NARRATION (exact spoken moment):
"{NARRATION}"

CREATIVE PROCESS:
1. Identify the single most emotionally or narratively significant moment.
2. Design the image as if you are the DP on set — every choice must serve the story and look beautiful when animated.

PROMPT REQUIREMENTS:
Write 4 to 6 flowing, richly detailed sentences only.

Use precise cinematic terminology:
- Shot size, camera height, angle, and focal length (e.g. "low-angle medium-wide shot on a 35mm lens")
- Subject details: posture, micro-expression, clothing, precise action or gesture
- Environment, architecture, props, weather, time-of-day with authentic details
- Lighting design: motivated practicals, key light direction and quality, color temperature, contrast, shadows
- Atmosphere, depth, and texture: haze, dust, reflections, bokeh, lens characteristics
- Color palette and overall grade (e.g. "cool desaturated teal with warm practical accents and subtle filmic contrast")

CRITICAL FOR IMAGE-TO-VIDEO SUCCESS:
- Strong clear subject with breathing room for motion
- Distinct visual layers (foreground, midground, background) to support parallax and camera drift
- Include 1-3 subtle, believable motion cues that will translate naturally into 10 seconds of animation
- Avoid cluttered frames or ambiguous forms

Constraints:
- Never quote or closely paraphrase the narration.
- Never mention "narration", "video", "prompt", "AI", "image generator", or these instructions.
- Perfectly obey the style guide for character, environment, and color consistency.

Output ONLY the continuous visual description paragraph. No titles, no bullets, no explanations.
`.trim();

const SCENE_BATCH_PROMPT_SYSTEM = `You are a master cinematic director of photography and visual storyteller. You excel at designing single powerful keyframes that serve as perfect starting points for smooth image-to-video animation. You will receive a batch of scenes and MUST output ONLY a valid JSON array of objects.`;

const SCENE_BATCH_PROMPT_TEMPLATE = `
Your sole responsibility: convert the given batch of spoken narrations into highly detailed, production-ready visual prompts.

CONTEXT:
- Full script context: "{SCRIPT_CONTEXT}"
- Visual style guide (follow strictly for consistency): "{STYLE_GUIDE}"

BATCH OF SCENES:
{SCENES_JSON}

PROMPT REQUIREMENTS FOR EACH SCENE:
Write 4 to 6 flowing, richly detailed sentences.
Use precise cinematic terminology (shot size, camera angle, focal length, lighting, colors, atmosphere).
Include 1-3 subtle motion cues (e.g. slow wind on fabric, drifting embers).
Maintain visual and stylistic continuity across all scenes in this batch.

OUTPUT FORMAT:
You MUST return ONLY a JSON array containing exactly one object per scene in the exact order provided.
Each object must have exactly these keys:
- "scene_id": the integer scene_id from the input
- "visual_prompt": the detailed 4-6 sentence visual description paragraph

Example Output:
[
  {
    "scene_id": 1,
    "visual_prompt": "Low-angle medium-wide shot..."
  }
]

Do not include any markdown formatting, code blocks, or explanatory text. ONLY the raw JSON array.
`.trim();

/**
 * Returns the raw prompt template (for reference/testing).
 */
export function getCinematicDirectorPromptTemplate() {
  return `${SCENE_PROMPT_SYSTEM}\n\n${SCENE_PROMPT_TEMPLATE}`;
}

/**
 * Builds a visual image prompt for a single scene using the multi-provider fallback chain.
 *
 * @param {string} transcriptChunk - The text being spoken in this specific scene window
 * @param {string} scriptContext   - The broader script for context
 * @param {string} styleGuide      - Rules and settings for video generation
 * @param {string} [jobId]         - Optional: for log context
 * @returns {Promise<{ prompt: string, providerUsed: string }>}
 */
export async function buildScenePrompt(transcriptChunk, scriptContext, styleGuide, jobId = '', preferredProviderId = null) {
  const userPrompt = SCENE_PROMPT_TEMPLATE
    .replace('{SCRIPT_CONTEXT}', (scriptContext || '').slice(0, 700))
    .replace('{STYLE_GUIDE}',   styleGuide || 'No additional style constraints.')
    .replace('{NARRATION}',     transcriptChunk || '');

  const { text, providerUsed } = await generateWithFallback({
    systemPrompt: SCENE_PROMPT_SYSTEM,
    userPrompt,
    jobId,
    purpose: 'scene-prompt-building',
    preferredProviderId,
  });

  return { prompt: text, providerUsed };
}

/**
 * Builds visual image prompts for a batch of scenes using the multi-provider fallback chain.
 *
 * @param {Array} scenesBatch - Array of scene objects from DB
 * @param {string} scriptContext - The broader script for context
 * @param {string} styleGuide - Rules and settings for video generation
 * @param {string} [jobId] - Optional: for log context
 * @returns {Promise<{ prompts: Array, providerUsed: string }>}
 */
export async function buildScenePromptBatch(scenesBatch, scriptContext, styleGuide, jobId = '', preferredProviderId = null) {
  const scenesJson = JSON.stringify(scenesBatch.map(s => ({ scene_id: s.sceneNumber, narration: s.narration })), null, 2);

  const userPrompt = SCENE_BATCH_PROMPT_TEMPLATE
    .replace('{SCRIPT_CONTEXT}', (scriptContext || '').slice(0, 1500))
    .replace('{STYLE_GUIDE}',   styleGuide || 'No additional style constraints.')
    .replace('{SCENES_JSON}',   scenesJson);

  const { text, providerUsed } = await generateWithFallback({
    systemPrompt: SCENE_BATCH_PROMPT_SYSTEM,
    userPrompt,
    jobId,
    purpose: 'scene-prompt-building',
    preferredProviderId,
  });

  // Extract JSON array from text
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let prompts = [];
  try {
    prompts = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse batched JSON output: ${e.message}\nOutput: ${cleaned.slice(0, 200)}...`);
  }

  // Verify we got the right number of prompts back
  if (!Array.isArray(prompts) || prompts.length !== scenesBatch.length) {
    throw new Error(`LLM returned ${prompts?.length} prompts, expected ${scenesBatch.length}`);
  }

  return { prompts, providerUsed };
}

export default { buildScenePrompt, buildScenePromptBatch, buildFilmScenePrompt, getCinematicDirectorPromptTemplate };

/**
 * Builds a visual image prompt for a FILM MODE scene.
 * Uses the full cinematic director template with character consistency,
 * action type, story position, and animation style injected.
 *
 * @param {Object} scene - Scene document (with actionType, emotion, location, etc.)
 * @param {Object} filmContext - { filmTitle, totalScenes, actNumber, actTitle, animationStyle, styleModifiers }
 * @param {string} characterConsistencyBlock - Pre-built consistency text for characters in this scene
 * @param {string} [jobId]
 * @returns {Promise<{ prompt: string, providerUsed: string }>}
 */
export async function buildFilmScenePrompt(scene, filmContext, characterConsistencyBlock = '', jobId = '') {
  const {
    filmTitle = 'Untitled Film',
    totalScenes = 540,
    actNumber = 1,
    actTitle = '',
    animationStyle = 'cinematic',
    styleModifiers = '',
  } = filmContext;

  const characterBlockShort = scene.characterNames?.length > 0
    ? `Characters: ${scene.characterNames.join(', ')}`
    : '';

  const userPrompt = FILM_SCENE_PROMPT_TEMPLATE
    .replace('{ANIMATION_STYLE}', animationStyle)
    .replace('{FILM_TITLE}', filmTitle)
    .replace('{SCENE_NUMBER}', scene.sceneNumber)
    .replace('{TOTAL_SCENES}', totalScenes)
    .replace('{ACT_NUMBER}', actNumber)
    .replace('{ACT_TITLE}', actTitle)
    .replace('{CHARACTER_CONSISTENCY_BLOCK}', characterConsistencyBlock || '(No named characters in this scene)')
    .replace('{CHARACTER_CONSISTENCY_BLOCK_SHORT}', characterBlockShort)
    .replace('{ACTION_TYPE}', scene.actionType || 'establishing')
    .replace('{ACTION_DESCRIPTION}', scene.actionDescription || '')
    .replace('{LOCATION}', scene.location || 'unspecified location')
    .replace('{EMOTION}', scene.emotion || 'neutral')
    .replace('{INTENSITY}', scene.intensity || 5)
    .replace('{CAMERA_TYPE}', scene.cameraType || 'medium_wide')
    .replace('{NARRATION}', (scene.narration || '').slice(0, 400))
    .replace('{STYLE_MODIFIERS}', styleModifiers);

  const { text, providerUsed } = await generateWithFallback({
    systemPrompt: SCENE_PROMPT_SYSTEM,
    userPrompt,
    jobId,
    purpose: 'film-scene-prompt',
  });

  return { prompt: text, providerUsed };
}
