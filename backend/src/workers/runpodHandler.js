import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import runpod from 'runpod-sdk'; // Assuming this is installed as runpod-serverless

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import { connectDB } from '../config/db.js';
import { processImageStep, processVideoStep } from './workerSteps.js';

let isInitialized = false;

async function init() {
  if (!isInitialized) {
    await connectDB();
    isInitialized = true;
    console.log('[RunPodHandler] Initialized DB connection.');
  }
}

/**
 * Main RunPod Serverless Handler
 */
async function handler(job) {
  await init();

  const input = job.input;
  
  if (!input || !input.type) {
    return { error: 'Invalid input payload. Missing type (image or video).' };
  }

  console.log(`[RunPodHandler] Received job type: ${input.type} for jobId: ${input.jobId}`);

  try {
    if (input.type === 'image') {
      // processImageStep(jobId, sceneId, sceneNumber, prompt)
      await processImageStep(input.jobId, input.sceneId, input.sceneNumber, input.prompt);
      return { status: 'success', message: 'Image processed successfully' };
    } 
    else if (input.type === 'video') {
      // processVideoStep(jobId, sceneId, sceneNumber, imagePath, prompt)
      await processVideoStep(input.jobId, input.sceneId, input.sceneNumber, input.imagePath, input.prompt);
      return { status: 'success', message: 'Video processed successfully' };
    } 
    else {
      return { error: `Unknown job type: ${input.type}` };
    }
  } catch (err) {
    console.error(`[RunPodHandler] Error processing ${input.type}:`, err);
    return { error: err.message };
  }
}

// Start the RunPod Serverless listener
console.log('[RunPodHandler] Starting Serverless listener...');
runpod.serverless.start({ handler });
