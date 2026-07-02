import path from 'path';
import fs from 'fs';
import axios from 'axios';

import Job    from '../models/Job.js';
import Scene  from '../models/Scene.js';
import Asset  from '../models/Asset.js';
import Project from '../models/Project.js';

import { JOB_STATUS, SCENE_STATUS, outputDir, tempDir } from '../config/constants.js';
import { logInfo, logWarn, logError } from '../services/logService.js';
import { analyzeScript } from '../services/scriptAnalyzer.js';
import { initializeScenes } from '../services/sceneEngine.js';
import { generateFullAudio } from '../services/voiceService.js';
import { transcribeAndChunkAudio } from '../services/transcriptionService.js';
import { buildScenePromptBatch, buildFilmScenePrompt } from '../providers/promptProvider.js';
import { buildSceneConsistencyBlock } from '../services/characterConsistencyService.js';
import { assembleVideo } from '../services/videoAssembler.js';
import { generateSRT } from '../services/subtitleService.js';
import { generateThumbnailFromVideo } from '../services/thumbnailService.js';
import { deleteTempFiles, getFileSize, uploadToCloud } from '../services/storageService.js';
import { emitJobEvent } from '../config/socket.js';
import { planJobScenes } from '../services/aiPlannerService.js';
import { enqueueImageJob, enqueueVideoJob, enqueueNotificationJob } from '../queues/queueManager.js';
import { ImageProvider } from '../providers/image/ImageProvider.js';
import { VideoProvider } from '../providers/video/VideoProvider.js';
import { LocalGpuProvider } from '../providers/localGpuProvider.js';

// New abstractions
import { compileScenePrompt } from '../services/promptCompiler.js';
import { triggerNextStep } from '../services/executionEngine.js';
import { updateProjectMemory } from '../services/projectMemoryService.js';
import { routeJob } from '../services/smartRouter.js';
import { analyzeRequestAndPlan } from '../services/aiDirectorService.js';

// ─── STEP 1: SCRIPT PROCESSING ───────────────────────────────────────────────
export async function processScriptStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.ANALYZING });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.ANALYZING, progress: 5 });
  await logInfo(jobId, 'Extracting script and style guide...');

  const { cleanScript, styleGuide } = await analyzeScript({
    script:        job.input.script,
    prompt:        job.input.prompt,
    styleGuide:    job.input.styleGuide,
    uploadedFiles: job.input.uploadedFiles || [],
    jobId:         jobId,
  });

  await Job.findByIdAndUpdate(jobId, { 'input.styleGuide': styleGuide });
  await logInfo(jobId, `Script parsed. Narration ready.`);

  // Enqueue next step dynamically via Execution Engine
  await triggerNextStep(jobId, 'script');
}

// ─── STEP 2: AUDIO TTS & TRANSCRIPTION ─────────────────────────────────────────
export async function processAudioStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await logInfo(jobId, 'Generating speech track...');
  
  if (job.filmMode) {
    await logInfo(jobId, 'Generating character dialogue and narration for Film Mode...');
    const scenes = await Scene.find({ jobId }).sort({ sceneNumber: 1 });
    
    // Create a voice map from workspace/project characters
    const characterVoiceMap = {};
    if (job.filmCharacterIds && job.filmCharacterIds.length > 0) {
      const FilmCharacter = (await import('../models/FilmCharacter.js')).default;
      const chars = await FilmCharacter.find({ _id: { $in: job.filmCharacterIds } });
      for (const c of chars) {
        characterVoiceMap[c.name] = c.voiceId;
      }
    }

    const { generateSceneAudio, concatenateAudio } = await import('../services/voiceService.js');

    for (const scene of scenes) {
      const audioParts = [];
      
      // 1. Narration
      if (scene.narration) {
         const path = await generateSceneAudio(jobId, scene.sceneNumber, scene.narration);
         if (path) audioParts.push(path);
      }
      
      // 2. Dialogue lines
      if (scene.dialogue && scene.dialogue.length > 0) {
        for (let i = 0; i < scene.dialogue.length; i++) {
          const d = scene.dialogue[i];
          const vId = characterVoiceMap[d.speaker] || null;
          const outPath = await generateSceneAudio(jobId, `${scene.sceneNumber}_d${i}`, d.line, vId);
          if (outPath) {
             d.audioUrl = outPath; 
             audioParts.push(outPath);
          }
        }
      }
      
      // 3. Concatenate scene audio if there are parts
      if (audioParts.length > 0) {
         const localSceneAudio = await concatenateAudio(jobId, audioParts);
         if (localSceneAudio) {
           const audioKey = `jobs/${jobId}/scenes/audio/scene_${String(scene.sceneNumber).padStart(3, '0')}.mp3`;
           scene.audioPath = await uploadToCloud(localSceneAudio, audioKey, 'audio/mp3');
         }
      }
      
      await scene.save();
    }
    
    await logInfo(jobId, `Audio track successfully generated for all film scenes.`);
    await triggerNextStep(jobId, 'audio');
    return;
  }

  let fullAudioPath = job.input.voiceoverPath || job.fullAudioPath;

  if (!fullAudioPath || !fs.existsSync(fullAudioPath)) {
    const cleanScript = job.input.script || '';
    const { generateFullAudio } = await import('../services/voiceService.js');
    fullAudioPath = await generateFullAudio(jobId, cleanScript);
  }

  if (!fullAudioPath) {
    throw new Error('TTS voiceover generation failed');
  }

  // Upload full audio file to object storage
  const audioKey = `jobs/${jobId}/audio/full_narration.mp3`;
  const cloudAudioUrl = await uploadToCloud(fullAudioPath, audioKey, 'audio/mp3');

  await Job.findByIdAndUpdate(jobId, { fullAudioPath: cloudAudioUrl });
  await logInfo(jobId, `Audio track successfully generated and uploaded: ${cloudAudioUrl}`);

  // Transcribe audio chunks
  let transcriptChunks = job.transcript;
  let transcriptionProvider = job.transcriptionProvider;

  if (!transcriptChunks || transcriptChunks.length === 0) {
    await logInfo(jobId, 'Running STT transcription alignment...');
    const localAudioPath = path.resolve(fullAudioPath);
    const result = await transcribeAndChunkAudio(localAudioPath, 10, job.input.script);
    transcriptChunks = result.chunks;
    transcriptionProvider = result.providerUsed;
    
    await Job.findByIdAndUpdate(jobId, { 
      transcript: transcriptChunks,
      transcriptionProvider: transcriptionProvider
    });
  }

  // Register full audio asset
  const audioSize = await getFileSize(fullAudioPath);
  await Asset.create({ jobId, type: 'audio', path: cloudAudioUrl, size: audioSize });

  // Enqueue prompt step dynamically via Execution Engine
  await triggerNextStep(jobId, 'audio');
}

// ─── STEP 3: PROMPT BUILDING & AI PLANNING ─────────────────────────────────────
export async function processPromptStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.SCENE_GENERATION });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.SCENE_GENERATION, progress: 20 });
  await logInfo(jobId, 'Extracting scenes & generating visual prompts...');

  const scenesInDb = await initializeScenes(jobId, job.transcript);
  const cleanScript = job.input.script || '';
  const styleGuide = job.input.styleGuide || '';

  const PROMPT_BATCH_SIZE = 30;
  const scenesToPrompt = scenesInDb.filter(s => !s.imagePrompt || !s.imagePrompt.trim());
  let lastReasoningProvider = job.reasoningProvider;

  if (scenesToPrompt.length > 0) {
    if (job.filmMode) {
      await logInfo(jobId, 'Running in Film Mode: Building specific cinematic prompts per scene...');
      const filmContext = {
        filmTitle: job.title,
        totalScenes: scenesInDb.length,
        actNumber: 1,
        actTitle: 'Act 1',
        animationStyle: job.animationStyle || 'cinematic',
        styleModifiers: job.styleConfig?.modifiers || ''
      };

      for (const scene of scenesToPrompt) {
        const charConsistency = await buildSceneConsistencyBlock(scene.characterNames, scene.characterIds, 1, filmContext.animationStyle);
        const { prompt, providerUsed } = await buildFilmScenePrompt(scene, filmContext, charConsistency, jobId);
        lastReasoningProvider = providerUsed;
        
        await Scene.findByIdAndUpdate(scene._id, {
          imagePrompt: prompt,
          videoPrompt: prompt
        });
      }
    } else {
      for (let i = 0; i < scenesToPrompt.length; i += PROMPT_BATCH_SIZE) {
        const batch = scenesToPrompt.slice(i, i + PROMPT_BATCH_SIZE);
        const { prompts, providerUsed } = await buildScenePromptBatch(
          batch,
          cleanScript,
          styleGuide,
          jobId,
          lastReasoningProvider
        );
        
        lastReasoningProvider = providerUsed;
        for (const p of prompts) {
          const sceneToUpdate = batch.find(s => s.sceneNumber === p.scene_id);
          if (sceneToUpdate) {
            await Scene.findByIdAndUpdate(sceneToUpdate._id, {
              imagePrompt: p.visual_prompt,
              videoPrompt: p.visual_prompt
            });
          }
        }
      }
    }
  }

  // Set Project and Workflow details
  const project = job.projectId ? await Project.findById(job.projectId) : null;
  const directorPlan = await analyzeRequestAndPlan(job.title, cleanScript, job.styleConfig || {}, jobId);
  
  // Set execution config inside job
  job.totalScenes = scenesInDb.length;
  job.reasoningProvider = lastReasoningProvider;
  job.workflow = {
    steps: directorPlan.workflowSteps,
    activeStep: 'prompt'
  };
  
  // Route job providers
  const routing = await routeJob(job, project);
  job.provider = routing.videoProvider;
  await job.save();

  // Prompt Enrichment Engine
  await logInfo(jobId, 'Enriching scene prompts with Creative Profiles and Workspace characters...');
  const refreshedScenes = await Scene.find({ jobId }).sort({ sceneNumber: 1 });
  for (const scene of refreshedScenes) {
    const enriched = await compileScenePrompt(
      scene.imagePrompt,
      {
        styleConfig: job.styleConfig,
        characterId: scene.characterId,
        environmentId: scene.environmentId,
        directorNote: scene.directorNote
      },
      project
    );
    scene.enrichedPrompt = enriched;
    await scene.save();
  }

  // Call AI Planning Layer to optimize costs and determine reuse decisions
  await logInfo(jobId, 'AI Planner routing scene assets (evaluating reuse vs. compute)...');
  await planJobScenes(jobId);

  // Trigger parallel tasks via Execution Engine
  await triggerNextStep(jobId, 'prompt');
}

// ─── STEP 4: GENERATE IMAGE (GPU Image Worker) ──────────────────────────────────
export async function processImageStep(jobId, sceneId, sceneNumber, prompt) {
  const job = await Job.findById(jobId);
  const scene = await Scene.findById(sceneId);
  if (!scene) throw new Error(`Scene ${sceneId} not found`);

  await Scene.findByIdAndUpdate(sceneId, { status: SCENE_STATUS.GENERATING });
  emitJobEvent(jobId, 'scene_updated', { sceneId, status: SCENE_STATUS.GENERATING });

  const localImagePath = path.join(tempDir(jobId), `scene_${String(sceneNumber).padStart(3, '0')}.jpg`);
  fs.mkdirSync(path.dirname(localImagePath), { recursive: true });

  // Generate Image via resolved provider
  const provider = job?.provider || 'grok';
  const adapter = ImageProvider.getAdapter(provider, 'v1');
  await adapter.generate(scene.enrichedPrompt || prompt, localImagePath);

  // Upload to Cloud
  const key = `jobs/${jobId}/scenes/images/scene_${String(sceneNumber).padStart(3, '0')}.jpg`;
  const cloudUrl = await uploadToCloud(localImagePath, key, 'image/jpeg');

  // Register image asset
  const imageSize = await getFileSize(localImagePath);
  await Asset.create({ jobId, type: 'image', path: cloudUrl, size: imageSize });

  // Update scene in DB and create history version revision
  scene.imagePath = cloudUrl;
  scene.revisions.push({
    version: scene.revisions.length + 1,
    imagePath: cloudUrl,
    videoPath: null,
    prompt: scene.enrichedPrompt || prompt
  });
  await scene.save();
  emitJobEvent(jobId, 'scene_updated', { sceneId, status: SCENE_STATUS.GENERATING, imagePath: cloudUrl });

  // Check action path
  if (scene.planningDecision?.action === 'image_only') {
    scene.status = SCENE_STATUS.DONE;
    scene.videoPath = cloudUrl; // reuse still image as video clip fallback
  }
  await scene.save();
  emitJobEvent(jobId, 'scene_updated', { sceneId, status: scene.status, imagePath: cloudUrl });

  await checkStageComplete(jobId, 'image_generation');
}

// ─── STEP 5: GENERATE VIDEO (GPU Video Worker) ──────────────────────────────────
export async function processVideoStep(jobId, sceneId, sceneNumber, localImagePath, prompt) {
  const job = await Job.findById(jobId);
  const scene = await Scene.findById(sceneId);
  if (!scene) throw new Error(`Scene ${sceneId} not found`);

  const localVideoPath = path.join(tempDir(jobId), `scene_${String(sceneNumber).padStart(3, '0')}.mp4`);
  
  // Download image back from cloud if local temp is empty
  if (!fs.existsSync(localImagePath)) {
    const response = await axios({
      method: 'GET',
      url: scene.imagePath,
      responseType: 'stream'
    });
    fs.mkdirSync(path.dirname(localImagePath), { recursive: true });
    const writer = fs.createWriteStream(localImagePath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  // Generate Video Clip
  const provider = job?.provider || 'grok';
  const adapter = VideoProvider.getAdapter(provider, 'v1');
  await adapter.generate(localImagePath, localVideoPath);

  // Upload raw video to Cloud first
  const key = `jobs/${jobId}/scenes/videos/scene_${String(sceneNumber).padStart(3, '0')}.mp4`;
  let cloudUrl = await uploadToCloud(localVideoPath, key, 'video/mp4');

  // Apply Lip Sync if required
  if (scene.lipSync?.required) {
    const { applyLipSync } = await import('../services/lipSyncService.js');
    const audioUrl = scene.audioPath || job.fullAudioPath;
    if (audioUrl && audioUrl.startsWith('http')) {
      const providerStr = process.env.SYNCLABS_API_KEY ? 'synclabs' : 'local-gpu';
      const syncedUrl = await applyLipSync(cloudUrl, audioUrl, providerStr, jobId);
      
      if (syncedUrl) {
        cloudUrl = syncedUrl;
        // Download synced video back to local for assembly steps
        const response = await axios({ method: 'GET', url: syncedUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(localVideoPath);
        response.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
      }
    }
  }

  // Register video asset
  const videoSize = await getFileSize(localVideoPath);
  await Asset.create({ jobId, type: 'video', path: cloudUrl, size: videoSize });

  // Update scene in DB and create history version revision
  scene.videoPath = cloudUrl;
  scene.status = SCENE_STATUS.DONE;
  if (scene.revisions.length > 0) {
    scene.revisions[scene.revisions.length - 1].videoPath = cloudUrl;
  }
  await scene.save();

  emitJobEvent(jobId, 'scene_updated', { sceneId, status: SCENE_STATUS.DONE, videoPath: cloudUrl });

  // Trigger completion check
  await checkStageComplete(jobId, 'video_generation');
}

// ─── STEP 6: ASSEMBLING & RENDERING ─────────────────────────────────────────────
export async function processRenderingStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.ASSEMBLING, progress: 85 });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.ASSEMBLING, progress: 85 });
  await logInfo(jobId, 'Assembling video clips, layering audio and subtitles...');

  // Download all completed scene videos and audio track locally for FFmpeg compilation
  const scenes = await Scene.find({ jobId, status: SCENE_STATUS.DONE }).sort({ sceneNumber: 1 });
  const localScenes = [];

  const jobTempDir = path.join(tempDir(jobId), 'assembly');
  fs.mkdirSync(jobTempDir, { recursive: true });

  // 1. Download voiceover audio track
  const localAudioPath = path.join(jobTempDir, 'full_narration.mp3');
  const audioResponse = await axios({ method: 'GET', url: job.fullAudioPath, responseType: 'stream' });
  const audioWriter = fs.createWriteStream(localAudioPath);
  audioResponse.data.pipe(audioWriter);
  await new Promise((res, rej) => { audioWriter.on('finish', res); audioWriter.on('error', rej); });

  // 2. Download each scene video
  for (const scene of scenes) {
    const filename = `scene_${String(scene.sceneNumber).padStart(3, '0')}.mp4`;
    const localPath = path.join(jobTempDir, filename);

    const videoResponse = await axios({ method: 'GET', url: scene.videoPath, responseType: 'stream' });
    const videoWriter = fs.createWriteStream(localPath);
    videoResponse.data.pipe(videoWriter);
    await new Promise((res, rej) => { videoWriter.on('finish', res); videoWriter.on('error', rej); });

    localScenes.push({
      ...scene.toObject(),
      videoPath: localPath
    });
  }

  // 3. Generate SRT Subtitles file locally
  let srtPath = null;
  if (job.transcript && job.transcript.length > 0) {
    srtPath = path.join(jobTempDir, 'subtitles.srt');
    await generateSRT(job.transcript, srtPath);
  }

  // 4. Assemble final video with FFmpeg (including intro/outro and watermark filters)
  const { finalVideoPath, duration } = await assembleVideo({
    jobId,
    scenes:         localScenes,
    narrationPath:  localAudioPath,
    srtPath,
    subtitleBurnIn: job.subtitleBurnIn,
  });

  // 5. Generate video thumbnail
  const localThumbnailPath = path.join(jobTempDir, 'thumbnail.jpg');
  await generateThumbnailFromVideo(finalVideoPath, localThumbnailPath);

  // Enqueue file uploads
  await Job.findByIdAndUpdate(jobId, { 
    finalVideoPath: finalVideoPath, 
    thumbnailPath: localThumbnailPath, 
    duration, 
    status: JOB_STATUS.OPTIMIZING, 
    progress: 95 
  });
  
  // Transition next step
  await triggerNextStep(jobId, 'rendering');
}

// ─── STEP 7: UPLOAD FINAL VIDEO & CLEANUP ───────────────────────────────────────
export async function processUploadStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await logInfo(jobId, 'Uploading completed video and thumbnail to cloud...');

  const finalVideoKey = `jobs/${jobId}/outputs/final.mp4`;
  const thumbnailKey = `jobs/${jobId}/outputs/thumbnail.jpg`;

  // Upload to R2 / Object storage
  const finalVideoUrl = await uploadToCloud(job.finalVideoPath, finalVideoKey, 'video/mp4');
  const thumbnailUrl = await uploadToCloud(job.thumbnailPath, thumbnailKey, 'image/jpeg');

  const fileSize = await getFileSize(job.finalVideoPath);

  // Register final outputs as assets
  await Asset.create({ jobId, type: 'final_video', path: finalVideoUrl, size: fileSize });
  await Asset.create({ jobId, type: 'thumbnail', path: thumbnailUrl, size: 10000 });

  // Update job final URL fields
  await Job.findByIdAndUpdate(jobId, {
    status:         JOB_STATUS.COMPLETED,
    progress:       100,
    finalVideoPath: finalVideoUrl,
    thumbnailPath:  thumbnailUrl,
    fileSize,
    completedAt:    new Date(),
  });

  await logInfo(jobId, `SaaS Pipeline completed successfully! Clean URL: ${finalVideoUrl}`);

  // Trigger project AI memory update service if a project is linked
  if (job.projectId) {
    try {
      const project = await Project.findById(job.projectId);
      if (project) {
        await updateProjectMemory(project, job);
      }
    } catch (err) {
      console.warn(`[WorkerSteps] Project memory update failed: ${err.message}`);
    }
  }

  // Delete all local temp workspace files
  await deleteTempFiles(jobId);

  // Enqueue notification job
  await enqueueNotificationJob(jobId, 'email', 'Your video is ready to download!', job.userId);
}

// ─── STEP 8: NOTIFICATION ─────────────────────────────────────────────────────
export async function processNotificationStep(jobId, type, message, recipient) {
  emitJobEvent(jobId, 'job_completed', { message, recipient });
  console.log(`[NotificationService] Dispatching in-app notification: "${message}" to User: ${recipient}`);
}

// ─── UTILS & STATUS TRACKERS ──────────────────────────────────────────────────
export async function checkStageComplete(jobId, stageId) {
  const total = await Scene.countDocuments({ jobId });
  
  let completed = 0;
  if (stageId === 'image_generation') {
    completed = await Scene.countDocuments({ jobId, imagePath: { $ne: null } });
  } else if (stageId === 'video_generation') {
    completed = await Scene.countDocuments({ jobId, status: SCENE_STATUS.DONE });
  } else {
    completed = total;
  }
  
  const progress = total > 0 ? Math.round((completed / total) * 60) + 20 : 20;
  await Job.findByIdAndUpdate(jobId, { completedScenes: completed, progress });
  emitJobEvent(jobId, 'job_progress', { progress, completedScenes: completed, totalScenes: total });

  if (completed === total && total > 0) {
    console.log(`[WorkerSteps] All ${total} scenes completed for stage ${stageId}! Advancing execution engine...`);
    await triggerNextStep(jobId, stageId);
  }
}
