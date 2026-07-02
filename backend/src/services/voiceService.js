import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { audioDir } from '../config/constants.js';
import { LocalGpuProvider } from '../providers/localGpuProvider.js';

const execAsync = promisify(exec);

async function downloadAsset(url, destPath) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 30000
  });
  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((res, rej) => {
    writer.on('finish', res);
    writer.on('error', rej);
  });
}

async function resolveVoiceNarration(jobId, text, sceneNumber = null, customVoiceId = null) {
  const filename = sceneNumber !== null 
    ? `scene_${String(sceneNumber).padStart(3, '0')}.mp3` 
    : 'full_narration.mp3';
  const outPath = path.join(audioDir(jobId), filename);
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  // Tier 1: ElevenLabs API (if key present)
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      console.log('[VoiceService] Generating speech via ElevenLabs API...');
      await generateWithElevenLabs(text, outPath, customVoiceId);
      if (fs.existsSync(outPath)) return outPath;
    } catch (e) {
      console.warn(`[VoiceService] ElevenLabs failed: ${e.message}. Trying Local GPU TTS tier...`);
    }
  }

  // Tier 2: Local GPU XTTS-v2 (if enabled)
  if (process.env.LOCAL_TTS_ENABLED === 'true') {
    try {
      const gpu = new LocalGpuProvider();
      if (await gpu.isAvailable()) {
        console.log('[VoiceService] Generating speech via Local GPU XTTS-v2...');
        const audioUrl = await gpu.generateSpeech(text);
        if (audioUrl) {
          if (audioUrl.startsWith('http')) {
            await downloadAsset(audioUrl, outPath);
          } else {
            // Simulated/Mock local string fallback
            await createSilentAudio(outPath, 8);
          }
          if (fs.existsSync(outPath)) return outPath;
        }
      }
    } catch (e) {
      console.warn(`[VoiceService] Local XTTS failed: ${e.message}. Falling back to Edge-TTS...`);
    }
  }

  // Tier 3: Edge-TTS (default free offline-capable API)
  console.log('[VoiceService] Generating speech via Edge-TTS free fallback...');
  const voice = process.env.TTS_VOICE || 'en-US-AriaNeural';
  await execAsync(
    `edge-tts --voice "${voice}" --text "${text.replace(/"/g, "'")}" --write-media "${outPath}"`,
    { timeout: 120000 },
  );

  return fs.existsSync(outPath) ? outPath : null;
}

/**
 * Generate TTS narration for a single scene or dialogue line.
 */
export async function generateSceneAudio(jobId, sceneNumber, text, customVoiceId = null) {
  if (!text?.trim()) return null;
  return resolveVoiceNarration(jobId, text, sceneNumber, customVoiceId);
}

/**
 * Generate TTS narration for the entire script.
 */
export async function generateFullAudio(jobId, text) {
  if (!text?.trim()) return null;
  return resolveVoiceNarration(jobId, text, null);
}

/**
 * Concatenate all scene audio files into a single narration track.
 */
export async function concatenateAudio(jobId, audioPaths) {
  const validPaths = audioPaths.filter((p) => p && fs.existsSync(p));
  if (!validPaths.length) return null;

  const outDir    = audioDir(jobId);
  const concatTxt = path.join(outDir, 'audio_concat.txt');
  const outPath   = path.join(outDir, 'narration.mp3');

  const content = validPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  await fs.promises.writeFile(concatTxt, content, 'utf8');

  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatTxt}" -c copy "${outPath}"`,
    { timeout: 120000 },
  );

  return fs.existsSync(outPath) ? outPath : null;
}

async function createSilentAudio(outputPath, seconds = 8) {
  await execAsync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${seconds} "${outputPath}"`,
    { timeout: 30000 },
  );
}

async function generateWithElevenLabs(text, outputPath, customVoiceId = null) {
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = customVoiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    { text, model_id: 'eleven_monolingual_v1' },
    {
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 30000,
    },
  );

  await fs.promises.writeFile(outputPath, response.data);
}

export default { generateSceneAudio, generateFullAudio, concatenateAudio };
