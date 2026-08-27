/**
 * LtxVideoProvider.js
 *
 * Video adapter for the LTX-2.5 Runpod endpoint on this account
 * (RUNPOD_LTX_ENDPOINT_ID, L40S, EU-NL-1).
 *
 * Three modes, auto-promoted by the handler from whichever images are present:
 *   text2video   prompt only
 *   image2video  prompt + first_frame_image   -> the continuity workhorse
 *   flf2video    prompt + first + last frame  -> bridges into a known next frame
 *
 * LTX-2.5 muxes a native audio track into the MP4, so no separate TTS,
 * lip-sync or music pass is needed for ambience and effects.
 *
 * Schema facts that the previous generic REST adapter got wrong, all load-bearing:
 *   • Sizes come from a RESOLUTION TOKEN, not width/height. Both sides must be
 *     %64 because DistilledPipeline is two-stage (stage 1 at half res, stage 2
 *     upsamples x2) and upstream assert_resolution() demands 64. The familiar
 *     848x480 / 1280x720 / 1920x1080 all raise before a single step runs.
 *   • Length is `num_frames`, not `duration`, and (num_frames - 1) must be
 *     divisible by 8. Max 257.
 *   • Conditioning images are `first_frame_image` / `last_frame_image`.
 *   • `negative_prompt`, `num_inference_steps` and `guidance_scale` are accepted
 *     but IGNORED — the checkpoint is guidance-distilled with a baked-in 8+3
 *     step sigma schedule. They are not sent.
 *   • Delivery may be `video_base64` rather than `video_url` when S3 is
 *     unconfigured; the old _extractMedia() dropped that silently.
 */

import fs from 'fs';
import path from 'path';
import { VIDEO_WIDTH, VIDEO_FPS, SEGMENT_DURATION_SEC, API_POLL_INTERVAL } from '../../config/constants.js';
import {
  runJob, health, hasRunpod, findMedia, saveMedia, toImagePayload, RunpodError,
} from '../runpodClient.js';

// Live endpoint id for this account (EU-NL-1). Overridable via .env.
const DEFAULT_LTX_ENDPOINT = 'hoxdil79z7nafq';

/** LTX-2.5 resolution tokens -> [width, height]. Every side is %64. */
export const LTX_RESOLUTIONS = {
  '450p': [768, 448],
  '480p': [896, 512],
  '576p': [1024, 576],
  '720p': [1280, 704],
  '1080p': [1920, 1088],
};

const MAX_PROMPT_CHARS = 2000;
const MIN_FRAMES = 9;
const MAX_FRAMES = 257;

/**
 * Snap a frame count onto LTX's temporal grid: (n - 1) % 8 == 0, 9..257.
 * Rounds to the nearest valid value rather than failing the request.
 */
export function snapFrames(frames) {
  const n = Number(frames);
  if (!Number.isFinite(n)) return 193;
  const clamped = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Math.round(n)));
  const steps = Math.round((clamped - 1) / 8);
  return Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, steps * 8 + 1));
}

/** Seconds -> a valid num_frames at the given fps. */
export function framesForDuration(seconds, fps = VIDEO_FPS) {
  return snapFrames((Number(seconds) || SEGMENT_DURATION_SEC) * (Number(fps) || VIDEO_FPS));
}

/** Pick the resolution token whose width is closest to the requested width. */
export function resolutionToken(width) {
  const target = Number(width);
  if (!Number.isFinite(target)) return '720p';
  let best = '720p';
  let bestGap = Infinity;
  for (const [token, [w]] of Object.entries(LTX_RESOLUTIONS)) {
    const gap = Math.abs(w - target);
    if (gap < bestGap) { bestGap = gap; best = token; }
  }
  return best;
}

export class LtxVideoProvider {
  constructor() {
    this.endpointId = process.env.RUNPOD_LTX_ENDPOINT_ID || DEFAULT_LTX_ENDPOINT;
    this.pollMs = Number(process.env.RUNPOD_POLL_INTERVAL_MS || API_POLL_INTERVAL);
    // Cold start is 7-11 min on this account before a single frame is rendered.
    this.maxWaitMs = Number(process.env.RUNPOD_VIDEO_MAX_WAIT_MS || 25 * 60 * 1000);
    // 450p is the schema default (tuned for the L40S); the pipeline standardises
    // segments to 1280x720 in ffmpeg, so 720p avoids an upscale. Set
    // LTX_RESOLUTION=450p to cut GPU time while dialling in a story.
    this.resolution = process.env.LTX_RESOLUTION || resolutionToken(VIDEO_WIDTH);
    if (!LTX_RESOLUTIONS[this.resolution]) {
      console.warn(`[ltx-2.5] unknown LTX_RESOLUTION '${this.resolution}' — using 720p`);
      this.resolution = '720p';
    }
  }

  get name() { return 'ltx-2.5'; }

  configured() { return hasRunpod(this.endpointId); }

  async isAvailable() {
    if (!this.configured()) return false;
    const h = await health(this.endpointId);
    return Boolean(h?.ok);
  }

  /**
   * Text-to-video. No conditioning frame, so nothing anchors the look — use it
   * only for an establishing shot with no prior frame to continue from.
   *
   * @param {string} prompt
   * @param {string} outputPath
   * @param {object} [options]
   * @param {number} [options.duration]    seconds, snapped to LTX's frame grid
   * @param {number} [options.num_frames]  explicit override of duration
   * @param {number} [options.fps]         8-30, default 24
   * @param {string} [options.resolution]  450p | 480p | 576p | 720p | 1080p
   * @param {number} [options.seed]
   * @returns {Promise<string>} outputPath
   */
  async textToVideo(prompt, outputPath, options = {}) {
    return this._generate({ ...options, mode: 'text2video' }, prompt, outputPath);
  }

  /**
   * Image-to-video. The frame pins the look, the prompt directs motion and
   * dialogue. Feeding the previous segment's last frame here is what makes the
   * next clip start where the last one stopped.
   *
   * @param {string} imagePath                 first frame (path, data URL or https URL)
   * @param {string} prompt
   * @param {string} outputPath
   * @param {object} [options]
   * @param {number} [options.conditioning_strength] 1.0 pins the frame exactly
   * @returns {Promise<string>} outputPath
   */
  async imageToVideo(imagePath, prompt, outputPath, options = {}) {
    return this._generate(
      { ...options, mode: 'image2video', firstFrame: imagePath },
      prompt,
      outputPath,
    );
  }

  /**
   * First-frame/last-frame. Lands the clip on a frame you already have, so the
   * following segment can be conditioned on that same image with no drift.
   *
   * @param {string} startFramePath
   * @param {string} endFramePath
   * @param {string} prompt
   * @param {string} outputPath
   * @param {object} [options]
   * @returns {Promise<string>} outputPath
   */
  async frameToFrame(startFramePath, endFramePath, prompt, outputPath, options = {}) {
    return this._generate(
      { ...options, mode: 'flf2video', firstFrame: startFramePath, lastFrame: endFramePath },
      prompt,
      outputPath,
    );
  }

  /** Legacy signature kept for VideoProvider.getAdapter(). */
  async generateVideo(imagePath, outputPath, options = {}) {
    if (imagePath && fs.existsSync(imagePath)) {
      return this.imageToVideo(imagePath, options.prompt || '', outputPath, options);
    }
    return this.textToVideo(options.prompt || '', outputPath, options);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _generate(options, prompt, outputPath) {
    const fps = Math.max(8, Math.min(30, Number(options.fps) || VIDEO_FPS));
    const numFrames = options.num_frames
      ? snapFrames(options.num_frames)
      : framesForDuration(options.duration, fps);
    const resolution = LTX_RESOLUTIONS[options.resolution] ? options.resolution : this.resolution;

    const input = {
      prompt: this._prompt(prompt),
      mode: options.mode || 'text2video',
      resolution,
      num_frames: numFrames,
      fps,
      ...(Number.isInteger(options.seed) && { seed: options.seed }),
    };

    if (options.firstFrame) {
      input.first_frame_image = await toImagePayload(options.firstFrame);
      input.conditioning_strength = clampStrength(options.conditioning_strength);
    }
    if (options.lastFrame) {
      input.last_frame_image = await toImagePayload(options.lastFrame);
    }

    if (input.mode !== 'text2video' && !input.first_frame_image) {
      throw new RunpodError(`[ltx-2.5] mode '${input.mode}' requires a first frame`);
    }

    const [w, h] = LTX_RESOLUTIONS[resolution];
    const seconds = ((numFrames - 1) / fps).toFixed(1);
    console.log(
      `[ltx-2.5] ${input.mode} ${w}x${h} ${numFrames}f @${fps}fps (~${seconds}s)`
      + `${input.last_frame_image ? ' [bridged]' : ''} "${input.prompt.slice(0, 60)}..."`,
    );

    const output = await runJob(this.endpointId, input, {
      label: 'ltx-2.5',
      pollMs: this.pollMs,
      maxWaitMs: this.maxWaitMs,
    });

    const media = findMedia(output, ['video_url', 'video_base64', 'video', 'url', 'output']);
    if (!media) {
      throw new RunpodError(
        `[ltx-2.5] completed without a video. Output keys: `
        + `${Object.keys(output || {}).join(', ') || '(none)'}`,
        { retryable: true },
      );
    }

    const bytes = await saveMedia(media, outputPath);
    console.log(
      `[ltx-2.5] saved ${path.basename(outputPath)} (${(bytes / 1048576).toFixed(1)} MB, `
      + `${output?.duration_seconds ?? '?'}s, ${output?.resolution || 'unknown'}, `
      + `audio=${output?.has_audio ? 'yes' : 'no'}, seed ${output?.seed_used ?? '?'}, `
      + `gen ${output?.generation_time_seconds ?? '?'}s)`,
    );
    return outputPath;
  }

  _prompt(prompt) {
    const text = String(prompt ?? '').trim();
    if (!text) throw new RunpodError('[ltx-2.5] prompt is empty');
    if (text.length <= MAX_PROMPT_CHARS) return text;
    console.warn(
      `[ltx-2.5] prompt is ${text.length} chars, cap is ${MAX_PROMPT_CHARS} — truncating`,
    );
    return text.slice(0, MAX_PROMPT_CHARS);
  }
}

function clampStrength(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return 1.0;
  return n;
}

export default LtxVideoProvider;
