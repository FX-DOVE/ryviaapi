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
// wax figures, plastic/porcelain skin, airbrushing, and studio gloss.
const REALISM_NEGATIVE_PROMPT = [
  'plastic skin, airbrushed, porcelain skin, CGI, 3D render, digital painting, smooth skin, wax figure,',
  'beauty filter, facetune, synthetic sheen, doll, mannequin, videogame, Unreal Engine, octane render, over-processed,',
  'cartoon, anime, drawing, sketch, illustration, oversaturated skin, glamor shot, flat studio backdrop,',
  'thin waist, emaciated, stick figure, unrealistic body proportions, blur, low quality, artifacts, retouched,',
  'flawless synthetic skin, blurred pores, over-smoothed face, glossy plastic, glossy highlights, 3d model'
].join(' ');

/**
 * Photorealism anchor prepended to every character portrait prompt.
 * Focuses on authentic 35mm film texture, real human skin imperfections, and natural lighting.
 */
const PHOTOREALISM_PREFIX =
  '35mm film photograph, Kodak Portra 400. Authentic real human being with natural skin texture, visible pores, '
  + 'fine lines, subtle facial wrinkles, natural uneven skin tone, real peach fuzz, authentic human complexion. '
  + 'Authentic natural body proportions. Natural ambient daylight, unpolished, organic, candid cinema documentary still, '
  + 'film grain, sharp focus on real skin details, unretouched. ';

export async function createCharacterLock(character, animationStyle = 'cinematic', jobId = '') {
  const lockDir = charLockDir(jobId);
  await fs.promises.mkdir(lockDir, { recursive: true });

  const safeName = character.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const refImagePath = path.join(lockDir, `${safeName}_reference.jpg`);

  // ── Photorealistic identity portrait prompt ──────────────────────────────
  const refPrompt = [
    PHOTOREALISM_PREFIX,
    `${character.name}:`,
    character.physicalDescription || '',
    character.clothingDefault ? `Wearing: ${character.clothingDefault}` : '',
    'Natural relaxed posture, looking directly at camera',
    '35mm film still, natural ambient room lighting, realistic depth of field',
    'Natural human hair texture, authentic human eyes, unretouched skin with pores and fine lines',
    'Shot on Kodak 35mm motion picture film, subtle grain, true-to-life colors',
  ].filter(Boolean).join('. ');

  // ── If the character has a user-uploaded photo, edit it forward ──────────
  // This is the most reliable way to preserve identity. The uploaded reference
  // image MUST drive generation — if it fails, we surface an explicit error
  // rather than silently falling back to text-to-image.
  let uploadedRef = character.referenceImagePath   // from Film Characters UI
    || character.referenceImageUrl
    || character.avatar
    || null;

  // If we have a cloud key, get a fresh presigned URL so it never fails on expired links
  if (character.referenceImageKey) {
    try {
      const { getSignedUrl } = await import('./storageService.js');
      const freshUrl = await getSignedUrl(character.referenceImageKey, 7200);
      if (freshUrl) {
        uploadedRef = freshUrl;
      }
    } catch (e) {
      console.warn(`[ConsistencyLock] Could not refresh signed URL for key ${character.referenceImageKey}:`, e.message);
    }
  }

  // If uploadedRef is a local mock-storage path, resolve it to the full absolute path
  if (typeof uploadedRef === 'string' && uploadedRef.startsWith('/mock-storage')) {
    const localMock = path.join(process.cwd(), 'storage', 'public', uploadedRef.replace(/^\//, ''));
    if (fs.existsSync(localMock)) {
      uploadedRef = localMock;
    }
  }

  let referenceUsed = false;

  if (uploadedRef) {
    const isHttp = typeof uploadedRef === 'string' && /^https?:\/\//i.test(uploadedRef);
    const isLocalFile = typeof uploadedRef === 'string' && !isHttp && fs.existsSync(uploadedRef);

    if (isHttp || isLocalFile) {
      console.log(
        `[ConsistencyLock] 📸 Phase 1/4: Reference image received for "${character.name}" `
        + `(${isHttp ? 'URL' : 'local file'}: ${uploadedRef.slice(0, 80)})`,
      );

      const editInstruction = [
        'Keep this exact person from the reference photo — identical face, facial structure, skin tone, hair, eyes, and body build.',
        'Preserve natural human skin texture with real skin pores, fine lines, subtle blemishes, and authentic human complexion.',
        'Do NOT airbrush, do NOT smooth skin, do NOT make skin look like plastic, porcelain, wax, or CGI.',
        'Render as an authentic 35mm film photograph with natural ambient lighting and subtle film grain.',
        character.clothingDefault ? `Ensure they are wearing: ${character.clothingDefault}.` : '',
        'Remove any cartoonish, AI-smoothed, or synthetic sheen.',
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
    'nollywood_drama':    '35mm film photograph, authentic West African skin tones, natural complexion, visible real human pores and fine lines, unretouched',
    'realistic':          '35mm candid film photograph, natural human skin with visible pores, subtle imperfections, authentic complexion, unpolished, unretouched',
    'cinematic':          '35mm motion picture film still, natural ambient lighting, subtle film grain, authentic human skin texture with pores and fine lines, unretouched',
  };

  parts.push(styleHints[animationStyle] || '35mm film photograph, natural human skin with visible pores, realistic authentic complexion, unretouched');
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

  // Check if environment has an uploaded reference image or cloud key
  let uploadedRef = environment.referenceImagePath
    || environment.referenceImageUrl
    || environment.referenceImageUrls?.[0]
    || null;

  if (environment.referenceImageKey || environment.referenceImageKeys?.[0]) {
    try {
      const { getSignedUrl } = await import('./storageService.js');
      const key = environment.referenceImageKey || environment.referenceImageKeys[0];
      const freshUrl = await getSignedUrl(key, 7200);
      if (freshUrl) uploadedRef = freshUrl;
    } catch (e) {
      console.warn(`[ConsistencyLock] Could not refresh signed URL for env key:`, e.message);
    }
  }

  if (typeof uploadedRef === 'string' && uploadedRef.startsWith('/mock-storage')) {
    const localMock = path.join(process.cwd(), 'storage', 'public', uploadedRef.replace(/^\//, ''));
    if (fs.existsSync(localMock)) uploadedRef = localMock;
  }

  // Also check if there is an existing character reference plate or master world plate in the job
  // to condition lighting and cinema grading
  let worldPlate = null;
  if (!uploadedRef && jobId) {
    const charDir = charLockDir(jobId);
    if (fs.existsSync(charDir)) {
      const charFiles = fs.readdirSync(charDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
      if (charFiles.length > 0) {
        worldPlate = path.join(charDir, charFiles[0]);
      }
    }
  }

  const isHttp = typeof uploadedRef === 'string' && /^https?:\/\//i.test(uploadedRef);
  const isLocalFile = typeof uploadedRef === 'string' && !isHttp && fs.existsSync(uploadedRef);

  const envEditInstruction = [
    '35mm film photograph, Kodak Portra 400. Cinematic film still of this exact location.',
    environment.name ? `Location setting: ${environment.name}.` : '',
    environment.description || '',
    'Wide establishing view, realistic architectural details, authentic natural practical textures, natural ambient lighting, subtle film grain.',
    'No cartoon, no 3D CGI render, no plastic texture, no synthetic sheen, empty scene without people.',
  ].filter(Boolean).join(' ');

  const refPrompt = [
    '35mm film photograph, Kodak Portra 400, on-location cinematic film production still',
    environment.name ? `Setting: ${environment.name}` : '',
    environment.description || '',
    'Wide establishing shot showing the full physical space',
    'Realistic architecture, authentic textures, natural practical lighting, subtle film grain',
    'No people, empty location, natural dynamic range, unretouched',
    'Shot on 35mm motion picture film, true-to-life colors',
  ].filter(Boolean).join('. ');

  if (uploadedRef && (isHttp || isLocalFile)) {
    try {
      console.log(`[ConsistencyLock] 🏛️ Generating environment lock for "${environment.name}" using uploaded reference image via Qwen-Image-Edit...`);
      await images.edit([uploadedRef], envEditInstruction, refImagePath, {
        negative_prompt: REALISM_NEGATIVE_PROMPT,
        num_inference_steps: 50,
        true_cfg_scale: 3.0,
      });
      console.log(`[ConsistencyLock] ✅ Environment lock created via Qwen-Image-Edit for "${environment.name}": ${refImagePath}`);
    } catch (err) {
      console.error(`[ConsistencyLock] ❌ Environment edit failed for "${environment.name}": ${err.message}`);
      throw new Error(`Location reference for "${environment.name}" failed: ${err.message}`);
    }
  } else if (worldPlate && fs.existsSync(worldPlate)) {
    try {
      console.log(`[ConsistencyLock] 🏛️ Generating environment lock for "${environment.name}" anchored to film world plate via Qwen-Image-Edit...`);
      await images.edit([worldPlate], `Generate the background environment location plate for this film world: ${environment.name}. ${environment.description || ''}. Empty location, no people, wide establishing shot, matching the same 35mm film grade, color palette, and lighting style.`, refImagePath, {
        negative_prompt: REALISM_NEGATIVE_PROMPT,
        num_inference_steps: 50,
        true_cfg_scale: 3.0,
      });
      console.log(`[ConsistencyLock] ✅ Environment lock created via world-plate edit for "${environment.name}": ${refImagePath}`);
    } catch (err) {
      console.warn(`[ConsistencyLock] World-plate edit fallback to generate for "${environment.name}": ${err.message}`);
      await images.generate(refPrompt, refImagePath, {
        width: ENV_LOCK_WIDTH,
        height: ENV_LOCK_HEIGHT,
        negative_prompt: REALISM_NEGATIVE_PROMPT,
        num_inference_steps: 50,
        true_cfg_scale: 3.0,
      });
    }
  } else {
    try {
      console.log(`[ConsistencyLock] 🏛️ Generating environment lock for "${environment.name}" via text...`);
      await images.generate(refPrompt, refImagePath, {
        width: ENV_LOCK_WIDTH,
        height: ENV_LOCK_HEIGHT,
        negative_prompt: REALISM_NEGATIVE_PROMPT,
        num_inference_steps: 50,
        true_cfg_scale: 3.0,
      });
      console.log(`[ConsistencyLock] ✅ Environment lock generated for "${environment.name}": ${refImagePath}`);
    } catch (err) {
      console.error(`[ConsistencyLock] ⚠ Failed to generate environment ref for "${environment.name}": ${err.message}`);
    }
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
