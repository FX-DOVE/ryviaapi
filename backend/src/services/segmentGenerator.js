/**
 * segmentGenerator.js — video segment generator
 *
 * Generation loop for one scene:
 *   1. Build the anchor keyframe. If a previous frame exists it is *edited*
 *      forward with Qwen-Image-Edit rather than generated from scratch, with the
 *      character and environment lock sheets passed in as real reference images.
 *   2. Animate the keyframe with LTX-2.5 image2video.
 *   3. Extract the segment's last frame.
 *   4. Feed that frame into the next segment — across scene boundaries too, so
 *      each clip starts on the frame the previous one ended on.
 *   5. Stitch the segments with FFmpeg.
 *
 * Strategy → transport:
 *   ANCHOR / ANGLE_CHANGE / REACTION  re-anchored keyframe (edit) → LTX I2V
 *   CONTINUATION                      previous last frame        → LTX I2V
 *   FRAME_BRIDGE                      last frame + target frame  → LTX FLF2V
 *
 * Qwen-Image-Edit takes at most 3 reference images and inherits the FIRST one's
 * dimensions, so the wide plate (previous frame or environment lock) always goes
 * first and character sheets follow.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  GENERATION_STRATEGY, SEGMENT_DURATION_SEC, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS,
  segmentDir, sceneImgDir, sceneVidDir,
} from '../config/constants.js';
import { ImageProvider } from '../providers/image/ImageProvider.js';
import { LtxVideoProvider, LTX_RESOLUTIONS, resolutionToken } from '../providers/video/LtxVideoProvider.js';
import { extractLastFrame, REALISM_NEGATIVE_PROMPT } from './consistencyLockService.js';
import { buildBeatPrompts } from './cinematicDirectorEngine.js';

const execAsync = promisify(exec);
const images = ImageProvider.getAdapter();
const ltx = new LtxVideoProvider();

// Keyframes are generated at exactly the LTX grid so nothing is resampled
// between the image model and the video model.
const VIDEO_RESOLUTION = process.env.LTX_RESOLUTION && LTX_RESOLUTIONS[process.env.LTX_RESOLUTION]
  ? process.env.LTX_RESOLUTION
  : resolutionToken(VIDEO_WIDTH);
const [KEYFRAME_WIDTH, KEYFRAME_HEIGHT] = LTX_RESOLUTIONS[VIDEO_RESOLUTION];

const MAX_EDIT_REFERENCES = 3;

/**
 * Locks arrive either as a bare prompt string (older callers) or as
 * { lockPrompt, referenceImagePath } from consistencyLockService. Accept both so
 * the reference image is used when it is there and nothing breaks when it isn't.
 */
function normalizeLock(value) {
  if (!value) return { lockPrompt: '', referenceImagePath: null };
  if (typeof value === 'string') return { lockPrompt: value, referenceImagePath: null };
  return {
    lockPrompt: value.lockPrompt || '',
    referenceImagePath: value.referenceImagePath || null,
  };
}

/** Map of name -> lock object, plus the plain name -> prompt map buildBeatPrompts wants. */
function normalizeCharacterLocks(characterLocks = {}) {
  const locks = {};
  const prompts = {};
  for (const [name, value] of Object.entries(characterLocks)) {
    locks[name] = normalizeLock(value);
    prompts[name] = locks[name].lockPrompt;
  }
  return { locks, prompts };
}

/**
 * Reference sheets for the characters actually in this beat, speaker first —
 * the reference budget is 3 and identity matters most for whoever is talking.
 */
function characterReferencesFor(beat, scene, locks) {
  const names = [];
  if (beat?.speaker) names.push(beat.speaker);
  for (const name of scene?.characterNames || []) names.push(name);

  const seen = new Set();
  const refs = [];
  for (const name of names) {
    const key = String(name || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ref = locks[key]?.referenceImagePath;
    if (ref && fs.existsSync(ref)) refs.push(ref);
  }
  return refs;
}

function existingPath(candidate) {
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

/**
 * Build one keyframe.
 *
 * With a wide plate available (the previous segment's last frame, or the
 * environment lock) the frame is produced by *editing* that plate, which is what
 * keeps the shot continuous. Without one — only the very first shot of a film,
 * or when the environment lock failed — it falls back to text-to-image, followed
 * by an identity pass against the character sheets so faces still match.
 *
 * @returns {Promise<string>} keyframePath
 */
async function makeKeyframe({ imagePrompt, keyframePath, plate, characterRefs = [], label }) {
  const refs = [];
  if (plate) refs.push(plate);
  for (const ref of characterRefs) {
    if (refs.length >= MAX_EDIT_REFERENCES) break;
    if (!refs.includes(ref)) refs.push(ref);
  }

  const editOptions = {
    negative_prompt: REALISM_NEGATIVE_PROMPT,
    num_inference_steps: 45,
  };

  if (plate) {
    const instruction = [
      'Continue this exact scene as the next shot of the same film.',
      'Keep the same characters — identical faces, skin tones, hair, wardrobe — and the same location.',
      'Do NOT change skin color, do NOT smooth or airbrush skin, do NOT alter facial features.',
      'Maintain natural human skin texture, realistic lighting, film grain.',
      imagePrompt,
    ].join(' ');
    await images.edit(refs, instruction, keyframePath, editOptions);
    console.log(`[SegmentGenerator] ${label}: keyframe re-anchored from ${refs.length} reference(s)`);
    return keyframePath;
  }

  await images.generate(imagePrompt, keyframePath, {
    width: KEYFRAME_WIDTH,
    height: KEYFRAME_HEIGHT,
    negative_prompt: REALISM_NEGATIVE_PROMPT,
    num_inference_steps: 40,
  });

  if (characterRefs.length) {
    // Identity pass: match exact faces from the character lock sheets.
    const identityRefs = [keyframePath, ...characterRefs].slice(0, MAX_EDIT_REFERENCES);
    const identityPath = keyframePath.replace(/(\.[a-z0-9]+)$/i, '_locked$1');
    try {
      await images.edit(
        identityRefs,
        'The first image is a scene frame. The other images are character reference portraits. '
        + 'Replace the people in the first image with those exact characters: same faces, same skin tones, '
        + 'same hair, same ethnicity. Keep the BACKGROUND, COMPOSITION, FRAMING, and LIGHTING completely identical. '
        + 'Do NOT smooth skin, do NOT cartoon-ize. Realistic natural skin texture only.',
        identityPath,
        editOptions,
      );
      await fs.promises.copyFile(identityPath, keyframePath);
      console.log(`[SegmentGenerator] ${label}: identity pass applied (${characterRefs.length} sheet(s))`);
    } catch (err) {
      console.warn(`[SegmentGenerator] ${label}: identity pass failed, keeping t2i frame — ${err.message}`);
    }
  }

  return keyframePath;
}

/**
 * PHASE 1: Pre-generate all scene anchor keyframes in one uninterrupted batch.
 *
 * This keeps the Qwen Image GPU worker warm across all scenes, avoiding
 * cold-start timeouts between video rendering steps.
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {Array}  params.scenes             Mongoose scene documents
 * @param {object} params.directorPlan
 * @param {object} params.characterLocks
 * @param {object} params.environmentLocks
 * @param {string} params.animationStyle
 * @param {Function} [params.onKeyframeReady] callback(sceneDoc, keyframePath)
 */
export async function pregenerateAllSceneKeyframes({
  jobId, scenes, directorPlan, characterLocks = {},
  environmentLocks = {}, animationStyle = 'cinematic',
  onKeyframeReady = null,
}) {
  const imgDir = sceneImgDir(jobId);
  await fs.promises.mkdir(imgDir, { recursive: true });

  const { locks: charLocks, prompts: charLockPrompts } = normalizeCharacterLocks(characterLocks);

  console.log(`[SegmentGenerator] 🎨 Phase 1: Pre-generating keyframes for ${scenes.length} scene(s)...`);

  for (let s = 0; s < scenes.length; s++) {
    const sceneDoc = scenes[s];
    const sceneNum = String(sceneDoc.sceneNumber).padStart(4, '0');
    const segmentId = `scene_${sceneNum}_seg_01`;
    const keyframePath = path.join(imgDir, `${segmentId}_keyframe.jpg`);

    // If keyframe already exists on disk, skip to save time
    if (fs.existsSync(keyframePath)) {
      console.log(`[SegmentGenerator] Scene ${sceneNum} keyframe already exists: ${keyframePath}`);
      if (onKeyframeReady) await onKeyframeReady(sceneDoc, keyframePath);
      continue;
    }

    // Match plan scene & act
    let planScene = null;
    for (const act of directorPlan.acts || []) {
      planScene = (act.scenes || []).find(sc => sc.globalSceneNumber === sceneDoc.sceneNumber);
      if (planScene) {
        planScene._act = act;
        break;
      }
    }

    const envLockRaw = environmentLocks[sceneDoc.locationId] || environmentLocks[planScene?.locationId] || '';
    const envLock = normalizeLock(envLockRaw);
    const envPlate = existingPath(envLock.referenceImagePath);

    const firstBeat = sceneDoc.beats?.[0] || planScene?.beats?.[0] || {
      beatNumber: 1,
      strategy: 'anchor',
      action: sceneDoc.description || planScene?.summary || 'Scene establishing shot',
      cameraAngle: 'wide',
    };

    const sceneData = {
      ...sceneDoc.toObject(),
      characterNames: sceneDoc.characters || planScene?.characters || [],
    };

    const { imagePrompt } = buildBeatPrompts(
      firstBeat, sceneData, planScene?._act || { actNumber: 1 },
      charLockPrompts, envLock.lockPrompt, animationStyle,
    );

    const characterRefs = characterReferencesFor(firstBeat, sceneData, charLocks);

    try {
      console.log(`[SegmentGenerator] Generating anchor keyframe for Scene ${sceneNum}...`);
      await makeKeyframe({
        imagePrompt,
        keyframePath,
        plate: envPlate,
        characterRefs,
        label: segmentId,
      });

      if (onKeyframeReady) await onKeyframeReady(sceneDoc, keyframePath);
    } catch (err) {
      console.error(`[SegmentGenerator] ⚠ Failed keyframe for Scene ${sceneNum}: ${err.message}`);
    }
  }

  console.log(`[SegmentGenerator] ✅ Phase 1 complete: all anchor keyframes pre-generated.`);
}

/**
 * Generate all video segments for a single scene (Phase 2: LTX Video Animation).
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {object} params.scene              scene object from the director plan
 * @param {object} params.act                parent act
 * @param {object} params.characterLocks     name -> lock prompt, or name -> { lockPrompt, referenceImagePath }
 * @param {string|object} params.environmentLock  lock prompt, or { lockPrompt, referenceImagePath }
 * @param {string} params.animationStyle
 * @param {string} [params.carryInFrame]     last frame of the PREVIOUS scene
 * @param {Function} [params.onSegmentComplete] callback(segmentNumber, videoPath)
 * @returns {Promise<{ segments: Array, sceneVideoPath: string, lastFramePath: string|null }>}
 */
export async function generateSceneSegments({
  jobId, scene, act, characterLocks = {}, environmentLock = '',
  animationStyle = 'cinematic', carryInFrame = null, onSegmentComplete = null,
}) {
  const sceneNum = String(scene.globalSceneNumber || scene.sceneNumber).padStart(4, '0');
  const segDir = segmentDir(jobId);
  const imgDir = sceneImgDir(jobId);
  const vidDir = sceneVidDir(jobId);

  await fs.promises.mkdir(segDir, { recursive: true });
  await fs.promises.mkdir(imgDir, { recursive: true });
  await fs.promises.mkdir(vidDir, { recursive: true });

  const beats = scene.beats || [];
  if (beats.length === 0) {
    console.warn(`[SegmentGenerator] Scene ${sceneNum} has no beats — skipping`);
    return { segments: [], sceneVideoPath: null, lastFramePath: carryInFrame };
  }

  const { locks: charLocks, prompts: charLockPrompts } = normalizeCharacterLocks(characterLocks);
  const envLock = normalizeLock(environmentLock);
  const envPlate = existingPath(envLock.referenceImagePath);

  const segments = [];
  let lastFramePath = existingPath(carryInFrame);
  if (lastFramePath) {
    console.log(`[SegmentGenerator] Scene ${sceneNum} continues from ${path.basename(lastFramePath)}`);
  }

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const beatNum = String(i + 1).padStart(2, '0');
    const segmentId = `scene_${sceneNum}_seg_${beatNum}`;

    console.log(`[SegmentGenerator] ${segmentId} — strategy: ${beat.strategy}`);

    const { imagePrompt, videoPrompt } = buildBeatPrompts(
      beat, scene, act, charLockPrompts, envLock.lockPrompt, animationStyle,
    );

    const keyframePath = path.join(imgDir, `${segmentId}_keyframe.jpg`);
    const videoPath = path.join(segDir, `${segmentId}.mp4`);
    const characterRefs = characterReferencesFor(beat, scene, charLocks);
    const videoOptions = {
      duration: beat.duration || SEGMENT_DURATION_SEC,
      fps: VIDEO_FPS,
      resolution: VIDEO_RESOLUTION,
    };

    try {
      // ── Use pre-generated keyframe or direct continuation ────────────────
      if (i === 0 && fs.existsSync(keyframePath)) {
        // First beat: already pre-generated in Phase 1!
        console.log(`[SegmentGenerator] Using pre-generated keyframe for ${segmentId}`);
        await ltx.imageToVideo(keyframePath, videoPrompt, videoPath, videoOptions);
      } else if (lastFramePath && (beat.strategy === GENERATION_STRATEGY.CONTINUATION || i > 0)) {
        // Continuation beats: direct from video's last frame — ZERO image call!
        console.log(`[SegmentGenerator] Direct continuous video from ${path.basename(lastFramePath)}`);
        await ltx.imageToVideo(lastFramePath, videoPrompt, videoPath, videoOptions);
      } else {
        // Angle change / Frame bridge fallback
        await makeKeyframe({
          imagePrompt,
          keyframePath,
          plate: lastFramePath || envPlate,
          characterRefs,
          label: segmentId,
        });
        await ltx.imageToVideo(keyframePath, videoPrompt, videoPath, videoOptions);
      }

      // Hand this segment's final frame to the next one.
      const lastFrameOutput = path.join(imgDir, `${segmentId}_lastframe.jpg`);
      try {
        await extractLastFrame(videoPath, lastFrameOutput);
        lastFramePath = lastFrameOutput;
      } catch (err) {
        console.warn(`[SegmentGenerator] Could not extract last frame: ${err.message}`);
        // Keep the previous frame rather than dropping continuity entirely.
      }

      segments.push({
        segmentNumber: i + 1,
        beatNumber: beat.globalBeatNumber || beat.beatNumber,
        strategy: beat.strategy,
        keyframePath: existingPath(keyframePath),
        videoPath,
        duration: beat.duration || SEGMENT_DURATION_SEC,
        status: 'done',
      });

      if (onSegmentComplete) await onSegmentComplete(i + 1, videoPath);
      console.log(`[SegmentGenerator] ✅ ${segmentId} complete`);
    } catch (err) {
      console.error(`[SegmentGenerator] ❌ ${segmentId} failed: ${err.message}`);
      segments.push({
        segmentNumber: i + 1,
        beatNumber: beat.globalBeatNumber || beat.beatNumber,
        strategy: beat.strategy,
        videoPath: null,
        duration: beat.duration || SEGMENT_DURATION_SEC,
        status: 'failed',
        error: err.message,
      });
    }
  }

  const sceneVideoPath = await stitchSegments(
    jobId, sceneNum,
    segments.filter((s) => s.status === 'done' && s.videoPath),
  );

  return { segments, sceneVideoPath, lastFramePath };
}

/**
 * Stitch multiple video segments into a single continuous scene video.
 *
 * @param {string} jobId
 * @param {string} sceneNum  zero-padded scene number
 * @param {Array} segments   completed segment objects with videoPath
 * @returns {Promise<string|null>} path to the stitched scene video
 */
async function stitchSegments(jobId, sceneNum, segments) {
  if (segments.length === 0) return null;

  const vidDir = sceneVidDir(jobId);
  await fs.promises.mkdir(vidDir, { recursive: true });
  const outPath = path.join(vidDir, `scene_${sceneNum}.mp4`);

  if (segments.length === 1) {
    await fs.promises.copyFile(segments[0].videoPath, outPath);
    return outPath;
  }

  const tmpDir = path.join(segmentDir(jobId), `stitch_${sceneNum}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  // Standardize first: LTX renders on a %64 grid (720p is 1280x704), so the
  // segments have to be scaled to the delivery size before -c copy concat.
  const standardizedParts = [];
  for (let i = 0; i < segments.length; i++) {
    const stdPath = path.join(tmpDir, `std_${i}.mp4`);
    await execAsync(
      `ffmpeg -y -i "${segments[i].videoPath}" `
      + `-vf "scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}" `
      + '-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k '
      + `"${stdPath}"`,
      { timeout: 120000 },
    );
    standardizedParts.push(stdPath);
  }

  const stdConcatPath = path.join(tmpDir, 'std_concat.txt');
  await fs.promises.writeFile(
    stdConcatPath,
    standardizedParts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8',
  );

  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${stdConcatPath}" -c copy "${outPath}"`,
    { timeout: 300000 },
  );

  if (!fs.existsSync(outPath)) {
    throw new Error(`[SegmentGenerator] Failed to stitch scene ${sceneNum}`);
  }

  console.log(`[SegmentGenerator] ✅ Scene ${sceneNum} stitched: ${segments.length} segments → ${outPath}`);
  return outPath;
}

export default { generateSceneSegments, pregenerateAllSceneKeyframes };
