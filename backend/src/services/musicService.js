import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * MUSIC SERVICE — Suno / Udio Integration
 * Generates background music for chapters or acts.
 */

export async function generateBackgroundMusic(prompt, durationSeconds, outputPath) {
  const apiKey = process.env.SUNO_API_KEY || process.env.UDIO_API_KEY;

  if (apiKey) {
    try {
      console.log(`[MusicService] Generating music via API: "${prompt}"`);
      // Fake implementation for typical third-party unofficial Suno APIs
      const response = await axios.post('https://api.suno.ai/api/generate', {
        prompt,
        make_instrumental: true,
        wait_audio: true
      }, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      const audioUrl = response.data?.[0]?.audio_url;
      if (audioUrl) {
        const streamRes = await axios({ method: 'GET', url: audioUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(outputPath);
        streamRes.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
        return outputPath;
      }
    } catch (e) {
      console.warn(`[MusicService] Suno API failed: ${e.message}. Falling back to default.`);
    }
  }

  // Fallback: Generate a simple 10-second silent/noise track or loop a local file if available
  console.log(`[MusicService] No API key. Generating placeholder ambient track for ${durationSeconds}s...`);
  await execAsync(
    `ffmpeg -y -f lavfi -i aevalsrc="0.1*sin(2*PI*55*t)+0.05*sin(2*PI*220*t):s=44100" -t ${durationSeconds} "${outputPath}"`,
    { timeout: 30000 }
  );

  return fs.existsSync(outputPath) ? outputPath : null;
}

export default { generateBackgroundMusic };
