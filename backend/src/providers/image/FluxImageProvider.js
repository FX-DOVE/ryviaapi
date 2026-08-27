/**
 * FluxImageProvider.js
 *
 * Image generation adapter for Flux API.
 * Used for:
 *   1. Character reference lock images (master face/body reference)
 *   2. Environment reference lock images (master location reference)
 *   3. Anchor keyframes (first frame of each scene segment)
 *   4. Angle-change keyframes (new camera angle within a scene)
 *   5. Reaction shot keyframes (close-up expressions)
 *
 * Supports text-to-image and image-to-image (for style-consistent variations).
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {
  IMAGE_WIDTH, IMAGE_HEIGHT, API_POLL_INTERVAL, API_MAX_WAIT_MS,
} from '../../config/constants.js';

export class FluxImageProvider {
  constructor() {
    this.apiKey   = process.env.IMAGE_API_KEY || '';
    this.endpoint = (process.env.IMAGE_API_ENDPOINT || '').replace(/\/$/, '');
    this.pollMs   = API_POLL_INTERVAL;
    this.maxWaitMs = API_MAX_WAIT_MS;
  }

  /** Check if the provider is configured. */
  async isAvailable() {
    if (!this.apiKey || !this.endpoint) return false;
    try {
      const res = await axios.get(`${this.endpoint}/health`, {
        headers: this._headers(),
        timeout: 10000,
      });
      return res.status === 200;
    } catch {
      return Boolean(this.apiKey && this.endpoint);
    }
  }

  /**
   * Text-to-Image: Generate an image from a text prompt.
   *
   * @param {string} prompt - Detailed visual description
   * @param {string} outputPath - Local path to save the image
   * @param {object} [options]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {string} [options.negative_prompt]
   * @returns {Promise<string>} outputPath
   */
  async generateImage(prompt, outputPath, options = {}) {
    console.log(`[FluxImageProvider] Generating: "${String(prompt).slice(0, 80)}..."`);

    const payload = {
      prompt: String(prompt),
      width:  options.width  || IMAGE_WIDTH,
      height: options.height || IMAGE_HEIGHT,
      ...(options.negative_prompt && { negative_prompt: options.negative_prompt }),
      ...(options.num_inference_steps && { num_inference_steps: options.num_inference_steps }),
      ...(options.guidance_scale && { guidance_scale: options.guidance_scale }),
    };

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const media = await this._submitAndPoll(payload, 'text-to-image');
    await this._saveMedia(media, outputPath);
    console.log(`[FluxImageProvider] ✅ Image saved: ${outputPath}`);
    return outputPath;
  }

  /**
   * Image-to-Image: Generate a style-consistent variation from a reference image.
   * Used for creating new camera angles of the same character/environment.
   *
   * @param {string} referenceImagePath - Path to the reference image
   * @param {string} prompt - Description of the desired variation
   * @param {string} outputPath - Local path to save the output
   * @param {object} [options]
   * @param {number} [options.strength] - How much to deviate from reference (0.0-1.0)
   * @returns {Promise<string>} outputPath
   */
  async imageToImage(referenceImagePath, prompt, outputPath, options = {}) {
    console.log(`[FluxImageProvider] I2I: ref=${path.basename(referenceImagePath)}`);

    const refBase64 = await this._encodeImage(referenceImagePath);

    const payload = {
      prompt:   String(prompt),
      image:    refBase64,
      strength: options.strength || 0.65,
      width:    options.width  || IMAGE_WIDTH,
      height:   options.height || IMAGE_HEIGHT,
      ...(options.negative_prompt && { negative_prompt: options.negative_prompt }),
    };

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const media = await this._submitAndPoll(payload, 'image-to-image');
    await this._saveMedia(media, outputPath);
    console.log(`[FluxImageProvider] ✅ I2I saved: ${outputPath}`);
    return outputPath;
  }

  get name() { return 'flux'; }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type':  'application/json',
    };
  }

  async _encodeImage(imagePath) {
    const buffer = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  async _submitAndPoll(payload, mode) {
    if (!this.apiKey || !this.endpoint) {
      throw new Error('[FluxImageProvider] IMAGE_API_KEY and IMAGE_API_ENDPOINT must be set in .env');
    }

    let response;
    try {
      response = await axios.post(`${this.endpoint}/generate`, payload, {
        headers: this._headers(),
        timeout: this.maxWaitMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    } catch (err) {
      throw new Error(
        `[FluxImageProvider] Failed to submit ${mode}: ${err?.response?.data?.error || err?.message}`,
      );
    }

    const data = response.data;

    // Sync response
    const directMedia = this._extractMedia(data);
    if (directMedia) return directMedia;

    // Async — poll
    const jobId = data.id || data.job_id || data.task_id || data.request_id;
    if (!jobId) {
      throw new Error(
        `[FluxImageProvider] ${mode} response has no media and no job ID. Response: ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    console.log(`[FluxImageProvider] ${mode} job submitted. ID: ${jobId}`);
    return this._poll(jobId, mode);
  }

  async _poll(jobId, mode) {
    const deadline = Date.now() + this.maxWaitMs;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.pollMs));

      let data;
      try {
        const res = await axios.get(`${this.endpoint}/status/${jobId}`, {
          headers: this._headers(),
          timeout: 30000,
        });
        data = res.data;
      } catch (err) {
        console.warn(`[FluxImageProvider] Poll error (${err?.message}) — retrying...`);
        continue;
      }

      const status = (data.status || data.state || '').toUpperCase();

      if (status === 'COMPLETED' || status === 'DONE' || status === 'SUCCESS') {
        const media = this._extractMedia(data.output || data.result || data);
        if (!media) {
          throw new Error(
            `[FluxImageProvider] Job ${jobId} completed but no image found.`,
          );
        }
        return media;
      }

      if (['FAILED', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(status)) {
        const reason = data.error || data.message || 'unknown error';
        throw new Error(`[FluxImageProvider] ${mode} job ${jobId} ${status}: ${reason}`);
      }
    }

    throw new Error(`[FluxImageProvider] ${mode} job ${jobId} timed out after ${this.maxWaitMs}ms`);
  }

  _extractMedia(output) {
    if (!output) return null;

    if (typeof output === 'string') {
      if (output.startsWith('http') || output.startsWith('data:')) return output;
    }

    if (typeof output === 'object' && !Array.isArray(output)) {
      for (const key of ['image', 'url', 'image_url', 'media_url', 'output', 'file', 'result']) {
        const val = output[key];
        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) {
          return val;
        }
      }
      if (output.message) return this._extractMedia(output.message);
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const found = this._extractMedia(item);
        if (found) return found;
      }
    }

    return null;
  }

  async _saveMedia(media, outputPath) {
    if (media.startsWith('http')) {
      const response = await axios({ method: 'GET', url: media, responseType: 'stream', timeout: 120000 });
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      return;
    }

    const base64 = media.startsWith('data:') ? media.split(',')[1] : media;
    await fs.promises.writeFile(outputPath, Buffer.from(base64, 'base64'));
  }
}

export default FluxImageProvider;
