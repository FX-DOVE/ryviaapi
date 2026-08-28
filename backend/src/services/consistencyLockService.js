/**
 * consistencyLockService.js — Visual Consistency Lock System
 *
 * Manages face lock, cloth lock, and environment lock for visual consistency.
 * Every character and environment gets a master reference image generated with
 * Qwen-Image. Those images are then passed back into Qwen-Image-Edit as actual
 * reference inputs (up to 3 per call) for every subsequent keyframe, and their
 * text descriptions are injected into the prompt — so consistency is enforced
 * by pixels as well as by words.
 *
 * Lock Types:
 *   - Character Lock: Master face/body image + detailed text description
 *   - Environment Lock: Master location image + detailed text description
 *   - Wardrobe Lock: Per-act clothing descriptions
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { charLockDir, envLockDir } from '../config/constants.js';
import { ImageProvider } from '../providers/image/ImageProvider.js';
import { LTX_RESOLUTIONS } from '../providers/video/LtxVideoProvider.js';

const execAsync = promisify(exec);
const images = ImageProvider.getAdapter();

// Environment plates double as LTX conditioning frames, so they are generated at
// the exact LTX 720p grid (1280x704) — LTX needs %64, and a mismatch here costs
// a resample right where continuity matters most.
const [ENV_LOCK_WIDTH, ENV_LOCK_HEIGHT] = LTX_RESOLUTIONS['720p'];

// ─── Character Lock ───────────────────────────────────────────────────────────

/**
 * Generate a master reference image for a character and build the lock prompt.
 *
 * @param {object} character - Character data from the director plan
 * @param {string} character.name
 * @param {string} character.physicalDescription
 * @param {string} character.clothingDefault
 * @param {string} animationStyle - Film's animation style
 * @param {string} jobId
 * @returns {Promise<{ lockPrompt: string, referenceImagePath: string }>}
 */
// Strong universal negative prompt that blocks cartoon / illustration aesthetics,
// unrealistic body proportions, and over-processed skin.
const REALISM_NEGATIVE_PROMPT = [
  'cartoon, anime, animation, illustrated, comic, drawing, sketch, painting, watercolor,',
  'digital art, concept art, 3D render, CGI, cel shading, smooth skin, plastic skin,',
  'airbrushed, over-smoothed, unrealistic, exaggerated features, stylized, fantasy,',
  'neon colors, flat lighting, overexposed, blurry, lowres, bad anatomy, deformed,',
  'monochrome, grayscale, render, toy, doll, manga, vector art, clipart,',
  'thin waist, emaciated, stick figure, anorexic, skinny legs, unrealistic body proportions,',
  'mannequin body, fashion doll proportions, elongated limbs, disproportionate figure,',
  'porcelain skin, plastic complexion, wax skin, perfect unblemished skin, over-retouched,',
  'beauty filter, face-tuned, smoothed face, blurred pores, flawless synthetic skin',
].join(' ');

/**
 * Photorealism anchor prepended to every character portrait prompt.
 * Placed first so it anchors the model's priors before style descriptors.
 */
const PHOTOREALISM_PREFIX =
  'RAW photograph of a real human being. Natural skin texture, visible pores, realistic complexion. '
  + 'Authentic body proportions — natural weight and build, not emaciated or artificially thin. '
  + 'Shot on a professional DSLR camera, 85mm portrait lens, natural studio lighting. '
  + 'Photojournalism quality, unretouched skin, film grain, 4K resolution. ';

export async function createCharacterLock(character, animationStyle = 'cinematic', jobId = '') {
  const lockDir = charLockDir(jobId);
  await fs.promises.mkdir(lockDir, { recursive: true });

  const safeName = character.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const refImagePath = path.join(lockDir, `${safeName}_reference.jpg`);

  // ── Photorealistic identity portrait prompt ──────────────────────────────
  // PHOTOREALISM_PREFIX is prepended first so the model's prior is photographic
  // before any descriptive content. Do NOT use "reference sheet", "concept art",
  // or similar — those phrases trigger illustration rendering in diffusion models.
  const refPrompt = [
    PHOTOREALISM_PREFIX,
    `${character.name}:`,
    character.physicalDescription || '',
    character.clothingDefault ? `Wearing: ${character.clothingDefault}` : '',
    'Full body, neutral relaxed pose, facing camera directly',
    'DSLR photography, 85mm portrait lens, shallow depth of field, soft natural studio lighting',
    'Natural skin tones, realistic hair strands, true-to-life eyes, unretouched skin',
    'Shot on Arri Alexa, cinematic grade, film grain, high detail, 4K',
  ].filter(Boolean).join('. ');

  // ── If the character has a user-uploaded photo, edit it forward ──────────
  // This is the most reliable way to preserve identity. The uploaded reference
  // image MUST drive generation — if it fails, we surface an explicit error
  // rather than silently falling back to text-to-image (which produces an
  // unrelated character and is the primary source of this bug).
  const uploadedRef = character.referenceImagePath   // from Film Characters UI
    || character.referenceImageUrl
    || character.avatar
    || null;

  let referenceUsed = false;

  if (uploadedRef) {
    const isHttp = /^https?:\/\//i.test(uploadedRef);
    const isLocalFile = !isHttp && typeof uploadedRef === 'string' && fs.existsSync(uploadedRef);

    if (isHttp || isLocalFile) {
      console.log(
        `[ConsistencyLock] 📸 Phase 1/4: Reference image received for "${character.name}" `
        + `(${isHttp ? 'URL' : 'local file'}: ${uploadedRef.slice(0, 80)})`,
      );

      const editInstruction = [
        'Keep this exact person — same face, same skin tone, same hair, same eyes, same body.',
        'Natural body proportions — do not make them thinner or alter their build.',
        'Enhance to high-quality DSLR cinematic portrait: natural skin texture, visible pores,',
        'film grain, realistic lighting. Do NOT change any facial features, skin color, or identity.',
        character.clothingDefault ? `Ensure they are wearing: ${character.clothingDefault}.` : '',
        'Remove cartoon or illustration artifacts. Make it look like a real photograph.',
      ].filter(Boolean).join(' ');

      try {
        console.log(`[ConsistencyLock] 📸 Phase 2/4: Encoding reference image for "${character.name}" → base64...`);
        // toImagePayload downloads remote URLs and re-encodes them as base64 data URIs
        // so Runpod workers (which cannot reach private R2/S3 buckets) can consume them.
        // This step is logged by toImagePayload itself — see runpodClient.js.

        console.log(`[ConsistencyLock] 📸 Phase 3/4: Sending reference to Qwen-Image-Edit for "${character.name}"...`);
        await images.edit([uploadedRef], editInstruction, refImagePath, {
          negative_prompt: REALISM_NEGATIVE_PROMPT,
          num_inference_steps: 50,
        });
        referenceUsed = true;
        console.log(`[ConsistencyLock] 📸 Phase 4/4: ✅ img2img complete for "${character.name}": ${refImagePath}`);
      } catch (err) {
        // ── IMPORTANT: Do NOT silently fall back to text-to-image. ──────────
        // A silent fallback is what causes the "random unrelated character" bug.
        // Surface the error explicitly so the user knows to re-upload the photo.
        console.error(
          `[ConsistencyLock] ❌ Reference image FAILED for "${character.name}": ${err.message}\n`
          + '  → This means the character will be generated from text only, which may not match the reference.\n'
          + '  → Cause: the uploaded image could not be downloaded or encoded (expired URL, size limit, or network error).\n'
          + '  → Fix: re-upload the reference image in the Film Characters panel and retry production.',
        );
        // Re-throw so the orchestrator can surface this as a job-level warning
        // rather than silently continuing with an unrelated face.
        throw new Error(
          `Reference image for character "${character.name}" failed to process: ${err.message}. `
          + 'Please re-upload the reference photo in the Film Characters panel and retry.',
        );
      }
    } else {
      console.warn(
        `[ConsistencyLock] ⚠ Reference image path for "${character.name}" is neither a valid URL `
        + `nor an existing local file — falling back to text-to-image. `
        + `(value: ${String(uploadedRef).slice(0, 100)})`,
      );
    }
  }

  // ── Fallback: generate from text prompt (only when NO reference was uploaded) ──
  if (!referenceUsed && !fs.existsSync(refImagePath)) {
    console.log(`[ConsistencyLock] 🖼️  No reference uploaded for "${character.name}" — generating from text prompt...`);
    try {
      await images.generate(refPrompt, refImagePath, {
        width: 1024,
        height: 1024,
        negative_prompt: REALISM_NEGATIVE_PROMPT,
        num_inference_steps: 50,
      });
      console.log(`[ConsistencyLock] ✅ Text-to-image lock created for "${character.name}": ${refImagePath}`);
    } catch (err) {
      // Text-to-image failure is non-fatal — text lock still provides partial consistency.
      console.error(`[ConsistencyLock] ⚠ Text-to-image failed for "${character.name}": ${err.message}`);
    }
  }

  // Build the text-based lock prompt (injected into every generation)
  const lockPrompt = buildCharacterLockPrompt(character, animationStyle);

  return {
    lockPrompt,
    referenceImagePath: fs.existsSync(refImagePath) ? refImagePath : null,
    referenceUsed,
  };
}

/** Export for use in other generators (segmentGenerator, featureFilmOrchestrator). */
export { REALISM_NEGATIVE_PROMPT };

/**
 * Build a text-based character lock prompt from character data.
 */
export function buildCharacterLockPrompt(character, animationStyle = 'cinematic') {
  const parts = [];

  parts.push(`[CHARACTER LOCK: ${character.name}]`);

  if (character.physicalDescription) {
    parts.push(character.physicalDescription);
  }

  if (character.clothingDefault) {
    parts.push(`Default outfit: ${character.clothingDefault}`);
  }

  if (character.personality) {
    parts.push(`Personality expressed through body language: ${character.personality}`);
  }

  // Photorealism is the baseline for ALL styles except explicit cartoon styles.
  // Never output "smooth skin", "clean", or "polished" — these trigger over-processing.
  const styleHints = {
    '2d_anime':           'anime art style, cel-shaded',
    'pixar':              'Pixar 3D animation style, rounded features',
    '3d_cgi_hollywood':   'photorealistic 3D, high-fidelity skin detail, subsurface scattering',
    'nollywood_drama':    'RAW photographic, authentic West African skin tones, natural complexion, real human pores and texture',
    'realistic':          'RAW photographic, natural human skin with visible pores, realistic complexion, unretouched',
    'cinematic':          'RAW photographic, DSLR 4K, natural skin tones, film grain, realistic human features, unretouched',
  };

  parts.push(styleHints[animationStyle] || 'RAW photographic, realistic human skin, natural complexion');
  parts.push('IDENTICAL appearance in every single frame — same face, same skin tone, same body, same features, same ethnicity');

  return parts.join(', ') + '.';
}

// ─── Environment Lock ─────────────────────────────────────────────────────────

/**
 * Generate a master reference image for an environment/location.
 *
 * @param {object} environment - Environment data from the director plan
 * @param {string} environment.locationId
 * @param {string} environment.name
 * @param {string} environment.description
 * @param {string} animationStyle
 * @param {string} jobId
 * @returns {Promise<{ lockPrompt: string, referenceImagePath: string }>}
 */
export async function createEnvironmentLock(environment, animationStyle = 'cinematic', jobId = '') {
  const lockDir = envLockDir(jobId);
  await fs.promises.mkdir(lockDir, { recursive: true });

  const safeId = (environment.locationId || environment.name || 'location')
    .replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const refImagePath = path.join(lockDir, `${safeId}_reference.jpg`);

  // Photorealistic environment plate — avoid "concept art" / "production design" language
  const refPrompt = [
    'RAW photograph, real location, on-location film production still',
    environment.name ? `Setting: ${environment.name}` : '',
    environment.description || '',
    'Wide establishing shot showing the full physical space',
    'Realistic architecture, authentic textures, natural practical lighting',
    'No people, empty location, high dynamic range',
    'Shot on Arri Alexa, 24mm anamorphic lens, cinematic grade, film grain',
  ].filter(Boolean).join('. ');

  try {
    await images.generate(refPrompt, refImagePath, {
      width: ENV_LOCK_WIDTH,
      height: ENV_LOCK_HEIGHT,
      negative_prompt: REALISM_NEGATIVE_PROMPT,
      num_inference_steps: 40,
    });
    console.log(`[ConsistencyLock] ✅ Environment lock created for "${environment.name}": ${refImagePath}`);
  } catch (err) {
    console.error(`[ConsistencyLock] ⚠ Failed to generate environment ref for "${environment.name}": ${err.message}`);
  }

  const lockPrompt = buildEnvironmentLockPrompt(environment, animationStyle);

  return {
    lockPrompt,
    referenceImagePath: fs.existsSync(refImagePath) ? refImagePath : null,
  };
}

/**
 * Build a text-based environment lock prompt.
 */
export function buildEnvironmentLockPrompt(environment, animationStyle = 'cinematic') {
  const parts = [];

  parts.push(`[ENVIRONMENT LOCK: ${environment.name || 'Location'}]`);

  if (environment.description) {
    parts.push(environment.description);
  }

  parts.push('IDENTICAL environment in every frame — same architecture, same props, same lighting');
  parts.push(`${animationStyle} film quality`);

  return parts.join(', ') + '.';
}

// ─── Wardrobe Lock ────────────────────────────────────────────────────────────

/**
 * Get the character's clothing for a specific act.
 *
 * @param {object} character - Character data with clothingByAct
 * @param {number} actNumber
 * @returns {string} Clothing description
 */
export function getActWardrobe(character, actNumber) {
  if (character.clothingByAct && character.clothingByAct[String(actNumber)]) {
    return character.clothingByAct[String(actNumber)];
  }
  return character.clothingDefault || '';
}

// ─── Frame Extraction ─────────────────────────────────────────────────────────

/**
 * Extract the last frame from a video file.
 * Used for continuation strategy — the last frame becomes the input for the next segment.
 *
 * @param {string} videoPath - Path to the video file
 * @param {string} outputPath - Path to save the extracted frame
 * @returns {Promise<string>} outputPath
 */
export async function extractLastFrame(videoPath, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // Get video duration first
  const { stdout: durStr } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
    { timeout: 30000 },
  );

  const duration = parseFloat(durStr.trim()) || 8;
  // Extract frame at 0.1 seconds before end
  const seekTime = Math.max(0, duration - 0.1);

  await execAsync(
    `ffmpeg -y -ss ${seekTime} -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}"`,
    { timeout: 30000 },
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error(`[ConsistencyLock] Failed to extract last frame from ${videoPath}`);
  }

  console.log(`[ConsistencyLock] Extracted last frame: ${outputPath}`);
  return outputPath;
}

/**
 * Extract the first frame from a video file.
 * Used for verifying visual consistency.
 *
 * @param {string} videoPath
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
export async function extractFirstFrame(videoPath, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  await execAsync(
    `ffmpeg -y -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}"`,
    { timeout: 30000 },
  );

  return outputPath;
}

export default {
  createCharacterLock,
  createEnvironmentLock,
  buildCharacterLockPrompt,
  buildEnvironmentLockPrompt,
  getActWardrobe,
  extractLastFrame,
  extractFirstFrame,
};
