import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { LocalGpuProvider } from '../providers/localGpuProvider.js';
import { logInfo } from './logService.js';

/**
 * Apply Lip Sync to a video using the specified provider.
 * Supports 'local-gpu' (MuseTalk) or 'synclabs' (SyncLabs API).
 *
 * @param {string} videoUrl - Public URL of the source video
 * @param {string} audioUrl - Public URL of the source audio
 * @param {string} provider - Provider to use ('local-gpu' or 'synclabs')
 * @param {string} jobId - Job ID for logging
 * @returns {Promise<string|null>} - Public URL to the synced video, or null if failed
 */
export async function applyLipSync(videoUrl, audioUrl, provider = 'synclabs', jobId = 'unknown') {
  if (!videoUrl || !audioUrl) {
    console.warn(`[LipSyncService] Missing input URLs for lipsync. video: ${videoUrl}, audio: ${audioUrl}`);
    return null;
  }

  if (provider === 'local-gpu') {
    await logInfo(jobId, '[LipSyncService] Executing local GPU lipsync (MuseTalk)...');
    try {
      const gpu = new LocalGpuProvider();
      const syncedUrl = await gpu.lipSync(videoUrl, audioUrl);
      if (syncedUrl && syncedUrl.startsWith('http')) {
        return syncedUrl;
      }
    } catch (err) {
      console.warn(`[LipSyncService] Local GPU lipsync failed: ${err.message}`);
    }
    return null;
  }

  if (provider === 'synclabs') {
    await logInfo(jobId, '[LipSyncService] Executing SyncLabs API lipsync...');
    try {
      return await executeSyncLabs(videoUrl, audioUrl, jobId);
    } catch (err) {
      console.warn(`[LipSyncService] SyncLabs lipsync failed: ${err.message}`);
    }
    return null;
  }

  console.warn(`[LipSyncService] Unknown lipsync provider: ${provider}`);
  return null;
}

/**
 * SyncLabs API Integration
 */
async function executeSyncLabs(videoUrl, audioUrl, jobId) {
  const apiKey = process.env.SYNCLABS_API_KEY;
  if (!apiKey) {
    throw new Error('SYNCLABS_API_KEY is missing');
  }

  // 1. Submit job to SyncLabs
  const res = await axios.post('https://api.synclabs.so/lipsync', {
    audioUrl,
    videoUrl,
    syneMode: 'bounce',
  }, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  const syncId = res.data?.id;
  if (!syncId) throw new Error('No SyncLabs job ID returned');

  // 2. Poll for completion
  let retries = 0;
  const MAX_RETRIES = 60; // 5 mins total at 5s intervals
  
  while (retries < MAX_RETRIES) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await axios.get(`https://api.synclabs.so/lipsync/${syncId}`, {
      headers: { 'x-api-key': apiKey }
    });
    
    const status = pollRes.data?.status;
    if (status === 'COMPLETED') {
      return pollRes.data?.videoUrl;
    } else if (status === 'FAILED') {
      throw new Error(`SyncLabs job failed: ${pollRes.data?.error || 'Unknown error'}`);
    }
    
    retries++;
  }

  throw new Error('SyncLabs polling timed out');
}

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

export default { applyLipSync };
