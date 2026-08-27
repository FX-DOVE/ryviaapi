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
 * Generate all video segments for a single scene.
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {object} params.scene              scene object from the director plan
 * @param {object} params.act                parent act
 * @param {object} params.characterLocks     name -> lock prompt, or name -> { lockPrompt, referenceImagePath }
 * @param {string|object} params.environmentLock  lock prompt, or { lockPrompt, referenceImagePath }
 * @param {string} params.animationStyle
 * @param {string} [params.carryInFrame]     last frame of the PREVIOUS scene, so
 *                                           continuity survives scene boundaries
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
  // Seeded from the previous scene: this is what makes the next clip start where
  // the last one stopped instead of restarting the look at every scene.
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
      switch (beat.strategy) {
        case GENERATION_STRATEGY.CONTINUATION: {
          if (lastFramePath) {
            // Cheapest and most continuous path: no image call at all.
            await ltx.imageToVideo(lastFramePath, videoPrompt, videoPath, videoOptions);
            break;
          }
          await makeKeyframe({
            imagePrompt, keyframePath, plate: envPlate, characterRefs, label: segmentId,
          });
          await ltx.imageToVideo(keyframePath, videoPrompt, videoPath, videoOptions);
          break;
        }

        case GENERATION_STRATEGY.FRAME_BRIDGE: {
          if (lastFramePath) {
            const endFramePath = path.join(imgDir, `${segmentId}_endframe.jpg`);
            await makeKeyframe({
              imagePrompt,
              keyframePath: endFramePath,
              plate: lastFramePath,
              characterRefs,
              label: segmentId,
            });
            await ltx.frameToFrame(lastFramePath, endFramePath, videoPrompt, videoPath, videoOptions);
            break;
          }
          await makeKeyframe({
            imagePrompt, keyframePath, plate: envPlate, characterRefs, label: segmentId,
          });
          await ltx.imageToVideo(keyframePath, videoPrompt, videoPath, videoOptions);
          break;
        }

        // ANCHOR, ANGLE_CHANGE, REACTION and anything unrecognised: build a
        // keyframe, re-anchored from the previous frame whenever there is one.
        default: {
          await makeKeyframe({
            imagePrompt,
            keyframePath,
            plate: lastFramePath || envPlate,
            characterRefs,
            label: segmentId,
          });
          await ltx.imageToVideo(keyframePath, videoPrompt, videoPath, videoOptions);
        }
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

export default { generateSceneSegments };
