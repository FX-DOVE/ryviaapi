/**
 * QwenImageProvider.js
 *
 * Image adapter for the two Qwen-Image Runpod endpoints on this account.
 *
 *   text2image  -> RUNPOD_QWEN_T2I_ENDPOINT_ID   (template pins QWEN_MODES=text2image)
 *   edit        -> RUNPOD_QWEN_EDIT_ENDPOINT_ID  (template pins QWEN_MODES=edit)
 *
 * There are two endpoints on purpose. Qwen's residency and quantization
 * thresholds disagree in the 44-70 GiB band, so a 48 GB Ada card asked to hold
 * both pipelines at fp8 needs ~56 GB and OOMs during worker init — before
 * runpod.serverless.start() is reached, so the worker dies silently and gets
 * rotated into the same wall. One mode per endpoint is the workaround.
 *
 * Consequence for callers: **img2img is not deployed**. `imageToImage()` routes
 * to the edit pipeline instead, which is the better tool anyway — it takes up
 * to 3 reference images, which is how character + wardrobe + environment
 * continuity is carried from one shot to the next.
 *
 * Used for:
 *   1. Character reference lock sheets
 *   2. Environment reference lock sheets
 *   3. Anchor keyframes (first frame of a scene)
 *   4. Angle-change / reaction keyframes re-anchored from the previous frame
 */

import path from 'path';
import {
  IMAGE_WIDTH, IMAGE_HEIGHT, API_POLL_INTERVAL,
} from '../../config/constants.js';
import {
  runJob, health, hasRunpod, findMedia, saveMedia, toImagePayload, RunpodError,
} from '../runpodClient.js';

// Live endpoint ids for this account (EU-NL-1). Overridable via .env.
const DEFAULT_T2I_ENDPOINT = '4xuntb54hifhu6';
const DEFAULT_EDIT_ENDPOINT = 'c7ra712awpgzqx';

/** Qwen's native aspect presets. Every side is %16 — see src/schema.py. */
export const QWEN_ASPECTS = {
  '1:1': [1328, 1328],
  '16:9': [1664, 928],
  '9:16': [928, 1664],
  '4:3': [1472, 1104],
  '3:4': [1104, 1472],
  '3:2': [1584, 1056],
  '2:3': [1056, 1584],
};

// A single space, not '' — Qwen only engages true CFG when a negative prompt
// is present, and an empty string is falsy on the diffusers side.
const DEFAULT_NEGATIVE_PROMPT = ' ';

const MAX_REFERENCE_IMAGES = 3;
const MAX_PROMPT_CHARS = 4000;

/**
 * Snap a dimension onto Qwen's pixel grid.
 *
 * The VAE downsamples by 8 and the transformer patches 2x2, so both sides must
 * be divisible by 16. The pipeline rounds down *silently* rather than raising,
 * so an off-grid request quietly produces something other than the size it
 * reports — Qwen's own published 4:3 height of 1140 becomes 1136. Rounding here
 * makes that visible and keeps the file on disk the size the caller recorded.
 *
 * Note this grid is coarser than LTX's: every LTX resolution is %16 and so is
 * generatable here, but 1280x720 is valid for Qwen and invalid for LTX (%64).
 * Generate keyframes at LTX_RESOLUTIONS[token] to avoid a resample before
 * conditioning.
 */
export function snap16(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 256) return fallback;
  return Math.max(256, Math.min(2048, Math.floor(n / 16) * 16));
}

export class QwenImageProvider {
  constructor() {
    this.t2iEndpoint = process.env.RUNPOD_QWEN_T2I_ENDPOINT_ID || DEFAULT_T2I_ENDPOINT;
    this.editEndpoint = process.env.RUNPOD_QWEN_EDIT_ENDPOINT_ID || DEFAULT_EDIT_ENDPOINT;
    this.pollMs = Number(process.env.RUNPOD_POLL_INTERVAL_MS || API_POLL_INTERVAL);
    // Cold start on these endpoints measured at 445-685 s, generation ~90-125 s.
    this.maxWaitMs = Number(process.env.RUNPOD_IMAGE_MAX_WAIT_MS || 20 * 60 * 1000);
  }

  get name() { return 'qwen-image'; }

  /** True when the account key and at least the t2i endpoint are configured. */
  configured() {
    return hasRunpod(this.t2iEndpoint);
  }

  /** Live check — reports worker/job counts, or false when unreachable. */
  async isAvailable() {
    if (!this.configured()) return false;
    const h = await health(this.t2iEndpoint);
    return Boolean(h?.ok);
  }

  /**
   * Text-to-image. Used for anchor keyframes and lock sheets.
   *
   * @param {string} prompt
   * @param {string} outputPath
   * @param {object} [options]
   * @param {string} [options.aspectRatio]        one of QWEN_ASPECTS, e.g. '16:9'
   * @param {number} [options.width]              explicit override, snapped to %16
   * @param {number} [options.height]
   * @param {string} [options.negative_prompt]
   * @param {number} [options.num_inference_steps] default 30
   * @param {number} [options.true_cfg_scale]      default 4.0
   * @param {number} [options.seed]
   * @param {string} [options.output_format]       png | jpeg | webp
   * @returns {Promise<string>} outputPath
   */
  async generateImage(prompt, outputPath, options = {}) {
    const input = {
      prompt: this._prompt(prompt),
      mode: 'text2image',
      negative_prompt: options.negative_prompt || DEFAULT_NEGATIVE_PROMPT,
      num_inference_steps: options.num_inference_steps ?? 30,
      true_cfg_scale: options.true_cfg_scale ?? 4.0,
      output_format: options.output_format || this._formatFor(outputPath),
      ...this._sizeFor(options),
      ...(Number.isInteger(options.seed) && { seed: options.seed }),
    };

    console.log(
      `[qwen-image] t2i ${input.width ? `${input.width}x${input.height}` : input.aspect_ratio}`
      + ` "${input.prompt.slice(0, 70)}..."`,
    );
    return this._run(this.t2iEndpoint, input, outputPath, 'qwen-t2i');
  }

  /**
   * Instruction edit against 1-3 reference images. This is the continuity path:
   * pass the previous last frame plus the character and environment lock sheets
   * and describe only what changes.
   *
   * Note: edit mode inherits the source image's dimensions and ignores
   * aspect_ratio, so a scene stays dimensionally consistent for free once its
   * anchor frame is generated.
   *
   * @param {string[]} references  paths, data URLs or https URLs (max 3, first wins)
   * @param {string} prompt        state what changes; pin what must not
   * @param {string} outputPath
   * @param {object} [options]
   * @returns {Promise<string>} outputPath
   */
  async editImage(references, prompt, outputPath, options = {}) {
    const refs = (Array.isArray(references) ? references : [references]).filter(Boolean);
    if (!refs.length) {
      throw new RunpodError('[qwen-image] editImage needs at least one reference image');
    }
    if (refs.length > MAX_REFERENCE_IMAGES) {
      console.warn(
        `[qwen-image] ${refs.length} references given, Qwen-Image-Edit accepts `
        + `${MAX_REFERENCE_IMAGES} — keeping the first ${MAX_REFERENCE_IMAGES}`,
      );
    }
    const images = (await Promise.all(
      refs.slice(0, MAX_REFERENCE_IMAGES).map((ref) => toImagePayload(ref)),
    )).filter(Boolean);  // filter nulls from failed URL downloads

    if (!images.length) {
      throw new RunpodError('[qwen-image] All reference images failed to load — cannot run edit');
    }

    const input = {
      prompt: this._prompt(prompt),
      mode: 'edit',
      images,
      negative_prompt: options.negative_prompt || DEFAULT_NEGATIVE_PROMPT,
      // Edit mode wants more steps than t2i (schema.py notes 40).
      num_inference_steps: options.num_inference_steps ?? 40,
      true_cfg_scale: options.true_cfg_scale ?? 4.0,
      output_format: options.output_format || this._formatFor(outputPath),
      ...(Number.isInteger(options.seed) && { seed: options.seed }),
    };

    console.log(
      `[qwen-image] edit ${images.length} ref(s) "${input.prompt.slice(0, 70)}..."`,
    );
    return this._run(this.editEndpoint, input, outputPath, 'qwen-edit');
  }

  /**
   * Kept for callers written against the old Flux adapter.
   *
   * img2img is not deployed (each endpoint pins a single QWEN_MODES value), so
   * this becomes a single-reference instruction edit. `options.strength` is
   * accepted and ignored — edit mode has no denoise-strength knob.
   */
  async imageToImage(referenceImagePath, prompt, outputPath, options = {}) {
    if (options.strength != null) {
      console.log(
        `[qwen-image] strength=${options.strength} ignored — routed to edit mode, `
        + 'which has no denoise-strength parameter',
      );
    }
    return this.editImage([referenceImagePath], prompt, outputPath, options);
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  async _run(endpointId, input, outputPath, label) {
    const output = await runJob(endpointId, input, {
      label,
      pollMs: this.pollMs,
      maxWaitMs: this.maxWaitMs,
    });

    // InferenceOutput.images is a list of urls or base64 payloads.
    const media = findMedia(output, ['images', 'image', 'image_url', 'url', 'output']);
    if (!media) {
      throw new RunpodError(
        `[${label}] completed without an image. Output keys: `
        + `${Object.keys(output || {}).join(', ') || '(none)'}`,
        { retryable: true },
      );
    }

    const bytes = await saveMedia(media, outputPath);
    console.log(
      `[${label}] saved ${path.basename(outputPath)} `
      + `(${Math.round(bytes / 1024)} KB, ${output?.resolution || 'unknown size'}, `
      + `seed ${output?.seed_used ?? '?'}, ${output?.generation_time_seconds ?? '?'}s)`,
    );
    return outputPath;
  }

  _prompt(prompt) {
    const text = String(prompt ?? '').trim();
    if (!text) throw new RunpodError('[qwen-image] prompt is empty');
    if (text.length <= MAX_PROMPT_CHARS) return text;
    console.warn(
      `[qwen-image] prompt is ${text.length} chars, cap is ${MAX_PROMPT_CHARS} — truncating`,
    );
    return text.slice(0, MAX_PROMPT_CHARS);
  }

  /**
   * Explicit width/height win (snapped to %16); otherwise an aspect token is
   * sent so Qwen resolves its own native size.
   */
  _sizeFor(options = {}) {
    if (options.width || options.height) {
      const width = snap16(options.width, IMAGE_WIDTH);
      const height = snap16(options.height, IMAGE_HEIGHT);
      if (Number(options.width) !== width || Number(options.height) !== height) {
        console.log(
          `[qwen-image] ${options.width}x${options.height} is off Qwen's %16 grid — `
          + `generating ${width}x${height}`,
        );
      }
      return { width, height };
    }

    const token = String(options.aspectRatio || options.aspect_ratio || '16:9');
    if (!QWEN_ASPECTS[token]) {
      console.warn(`[qwen-image] unknown aspect '${token}' — falling back to 16:9`);
      return { aspect_ratio: '16:9' };
    }
    return { aspect_ratio: token };
  }

  /** Match the encoding to the extension the caller chose. */
  _formatFor(outputPath) {
    const ext = path.extname(String(outputPath)).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
    if (ext === '.webp') return 'webp';
    return 'png';
  }
}

export default QwenImageProvider;
