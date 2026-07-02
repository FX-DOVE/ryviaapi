import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { BaseProvider } from './BaseProvider.js';

export class LocalGpuProvider extends BaseProvider {
  constructor() {
    super();
    this.gpuWorkerUrl = process.env.GPU_WORKER_URL || 'http://localhost:8188';
    this.timeout = parseInt(process.env.GPU_TIMEOUT || '1800000', 10);
  }

  async generateImage(prompt, outputPath, options = {}) {
    console.log(`[LocalGpuProvider] Generating image with prompt: "${prompt.slice(0, 60)}..."`);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const response = await this._post('/image/generate', {
      prompt,
      model: process.env.GPU_IMAGE_MODEL || 'flux1-dev',
      options
    });

    if (response.data?.imageUrl) {
      await this._downloadFile(response.data.imageUrl, outputPath);
      return outputPath;
    }
    
    // Sim fallback if server is mocking
    if (response.data?.simulated) {
      await fs.promises.writeFile(outputPath, Buffer.from('mock_image_data_local_gpu'));
      return outputPath;
    }

    throw new Error('Local GPU worker failed to return image URL');
  }

  async generateVideo(imagePath, outputPath, options = {}) {
    console.log(`[LocalGpuProvider] Animating image into video: ${path.basename(imagePath)}`);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    // Upload/reference the image
    const response = await this._post('/video/generate', {
      imagePath,
      prompt: options.prompt || 'cinematic motion, slow pan',
      model: process.env.GPU_VIDEO_MODEL || 'wan2.1-i2v-14b',
      options
    });

    if (response.data?.videoUrl) {
      await this._downloadFile(response.data.videoUrl, outputPath);
      return outputPath;
    }

    if (response.data?.simulated) {
      await fs.promises.writeFile(outputPath, Buffer.from('mock_video_data_local_gpu'));
      return outputPath;
    }

    throw new Error('Local GPU worker failed to return video URL');
  }

  async generateSpeech(text, options = {}) {
    console.log(`[LocalGpuProvider] Generating speech via GPU XTTS: "${text.slice(0, 60)}..."`);
    
    const response = await this._post('/speech/generate', {
      text,
      model: process.env.GPU_TTS_MODEL || 'xtts-v2',
      voiceStyle: options.voiceStyle || 'neutral',
      characterVoiceSample: options.characterVoiceSample || null
    });

    if (response.data?.audioUrl) {
      return response.data.audioUrl;
    }

    if (response.data?.simulated) {
      return '/mock-storage/xtts_simulated_speech.mp3';
    }

    throw new Error('Local GPU XTTS generator failed');
  }

  async lipSync(videoPath, audioPath, options = {}) {
    console.log(`[LocalGpuProvider] Running lip sync for: ${path.basename(videoPath)}`);

    const response = await this._post('/lipsync/generate', {
      videoPath,
      audioPath,
      model: process.env.LIP_SYNC_MODEL || 'musetalk',
      options
    });

    if (response.data?.syncedVideoUrl) {
      return response.data.syncedVideoUrl;
    }

    if (response.data?.simulated) {
      return videoPath; // fallback to original
    }

    throw new Error('Local GPU MuseTalk sync failed');
  }

  async isAvailable() {
    try {
      const resp = await axios.get(`${this.gpuWorkerUrl}/health`, { timeout: 3000 });
      return resp.status === 200;
    } catch (err) {
      console.warn(`[LocalGpuProvider] Health check failed for ${this.gpuWorkerUrl}: ${err.message}`);
      // Default to true in offline mock simulation environment if configured
      if (process.env.NODE_ENV === 'development' && this.gpuWorkerUrl.includes('localhost')) {
        return true;
      }
      return false;
    }
  }

  async _post(endpoint, body) {
    try {
      return await axios.post(`${this.gpuWorkerUrl}${endpoint}`, body, {
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      // Simulate endpoint responses during local development if worker is missing
      if (process.env.NODE_ENV === 'development') {
        console.log(`[LocalGpuProvider Mock] Simulating endpoint ${endpoint}`);
        return { data: { simulated: true } };
      }
      throw err;
    }
  }

  async _downloadFile(url, destPath) {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 60000
    });
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  get name() { return 'local-gpu'; }
}

export default LocalGpuProvider;
