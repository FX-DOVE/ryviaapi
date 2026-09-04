/**
 * workerSteps.js — Pipeline Steps for AI Film Studio
 *
 * New pipeline (LTX 2.3 + Flux):
 *   Step 1: Script Processing      — Parse script, extract narration
 *   Step 2: Directing              — Cinematic Director decomposes into acts/scenes/beats
 *   Step 3: Consistency Locking    — Generate character + environment reference images
 *   Step 4: Segment Generation     — Generate 8s video segments per scene
 *   Step 5: Assembly               — Stitch segments → scenes → acts → final film
 *   Step 6: Upload                 — Upload final film to cloud
 *   Step 7: Notification           — Notify user
 *
 * No TTS, lip-sync, or audio pipeline — LTX 2.3 generates video WITH native audio.
 */

import path from 'path';
import fs from 'fs';
import axios from 'axios';

import Job    from '../models/Job.js';
import Scene  from '../models/Scene.js';
import Asset  from '../models/Asset.js';
import Project from '../models/Project.js';
import FilmCharacter from '../models/FilmCharacter.js';
import Screenplay from '../models/Screenplay.js';

import { JOB_STATUS, SCENE_STATUS, SEGMENT_STATUS, outputDir, tempDir, sceneVidDir } from '../config/constants.js';
import { logInfo, logWarn, logError } from '../services/logService.js';
import { analyzeScript } from '../services/scriptAnalyzer.js';
import { decomposeScript, planGenerationStrategies, buildBeatPrompts } from '../services/cinematicDirectorEngine.js';
import { createCharacterLock, createEnvironmentLock, getActWardrobe, buildCharacterLockPrompt } from '../services/consistencyLockService.js';
import { generateSceneSegments, pregenerateAllSceneKeyframes } from '../services/segmentGenerator.js';
import { seedContinuityFromDirectorPlan, extractContinuityPrompt } from '../services/continuityService.js';
import { getDirectorBible } from '../services/styleService.js';
import { getFormatDirective } from '../services/webResearchService.js';
import { assembleVideo } from '../services/videoAssembler.js';
import { generateThumbnailFromVideo } from '../services/thumbnailService.js';
import { deleteTempFiles, getFileSize, uploadToCloud } from '../services/storageService.js';
import { emitJobEvent } from '../config/socket.js';
import { enqueueNotificationJob } from '../queues/queueManager.js';
import { triggerNextStep } from '../services/executionEngine.js';
import { routeJob } from '../services/smartRouter.js';
import { updateProjectMemory } from '../services/projectMemoryService.js';

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
  await logInfo(jobId, `Script parsed. Narration: ${cleanScript.length} chars.`);

  await triggerNextStep(jobId, 'script');
}

// ─── STEP 2: DIRECTING — Cinematic Director Decomposition ────────────────────

export async function processDirectingStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.DIRECTING, progress: 10 });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.DIRECTING, progress: 10 });
  await logInfo(jobId, '🎬 Cinematic Director analyzing script...');

  // ── Resumption Check: If director plan and scenes already exist, skip LLM decomposition ──
  if (job.directorPlan?.acts?.length > 0) {
    const existingScenesCount = await Scene.countDocuments({ jobId });
    if (existingScenesCount > 0) {
      await logInfo(jobId, `⏩ Reusing existing director plan (${job.directorPlan.acts.length} acts, ${job.directorPlan.totalScenes} scenes)`);
      emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.DIRECTING, progress: 20 });
      await triggerNextStep(jobId, 'directing');
      return;
    }
  }

  const rawScript = job.input.script || job.input.prompt || '';
  const animationStyle = job.animationStyle || 'cinematic';

  // A screenplay-backed job has no input.script — the approved story lives in the
  // Screenplay document. Decompose that instead, or the director would plan a
  // film from an empty string and then overwrite the screenplay's scenes with it.
  let sourceScript = rawScript;
  let directorNotes = job.input.styleGuide || '';
  let screenplayScenes = null;
  let lookBible = null;
  let motifs = [];
  let audioSpine = [];
  if (job.screenplayId) {
    const { default: Screenplay } = await import('../models/Screenplay.js');
    const { renderScreenplayForDirector } = await import('../services/screenplayService.js');
    const screenplay = await Screenplay.findById(job.screenplayId);
    if (!screenplay) throw new Error(`[WorkerSteps] Job ${jobId} references missing screenplay ${job.screenplayId}`);

    sourceScript = renderScreenplayForDirector(screenplay);
    directorNotes = [directorNotes, screenplay.additionalSettings]
      .filter(Boolean).join('\n');
    // Capture approved scenes for dialogue reconciliation
    screenplayScenes = screenplay.scenes || [];
    lookBible = screenplay.lookBible || null;
    motifs = screenplay.motifs || [];
    audioSpine = screenplay.audioSpine || [];
    await logInfo(jobId, `📖 Directing from approved screenplay "${screenplay.title}" (${screenplayScenes.length} scenes, ${sourceScript.length} chars)`);
  } else if (!sourceScript.trim()) {
    throw new Error(`[WorkerSteps] Job ${jobId} has no script, prompt or screenplay to direct`);
  }

  // Read uploaded character photographs BEFORE directing so locations, country,
  // architecture, and lighting are locked to the real world in the photos.
  let worldDna = job.visualDna || null;
  try {
    const {
      buildWorldDnaForJob,
      formatWorldDnaForDirector,
    } = await import('../services/characterReferenceService.js');
    const built = await buildWorldDnaForJob(job);
    if (built.worldDna) {
      worldDna = built.worldDna;
      await Job.findByIdAndUpdate(jobId, { visualDna: worldDna });
      await logInfo(
        jobId,
        `🌍 World DNA from reference photos: ${worldDna.country_or_region} · ${worldDna.lighting_style}`,
      );
      directorNotes = [directorNotes, formatWorldDnaForDirector(worldDna)].filter(Boolean).join('\n\n');
    }
  } catch (visErr) {
    console.warn(`[WorkerSteps] Pre-direct vision pass skipped: ${visErr.message}`);
  }

  const genreKey = job.genre || job.videoType || 'drama';
  const bibleNotes = [
    getDirectorBible(genreKey),
    getFormatDirective(genreKey),
  ].filter(Boolean).join('\n\n');
  directorNotes = [directorNotes, bibleNotes].filter(Boolean).join('\n\n');

  // Stage 1: Decompose script into director plan
  let directorPlan = await decomposeScript({
    rawScript: sourceScript,
    title: job.title || 'Untitled',
    genre: genreKey,
    animationStyle,
    additionalNotes: directorNotes,
    jobId,
    screenplayScenes, // pass approved scenes for dialogue reconciliation
    worldDna,
    lookBible,
    motifs,
    audioSpine,
  });

  // Stage 4: Plan generation strategies for each beat
  directorPlan = planGenerationStrategies(directorPlan);

  // Save director plan to job
  await Job.findByIdAndUpdate(jobId, {
    directorPlan,
    totalScenes: directorPlan.totalScenes,
    totalBeats: directorPlan.totalBeats,
  });

  // Create Scene documents from the director plan
  await Scene.deleteMany({ jobId });
  const scenesDocs = [];

  for (const act of directorPlan.acts || []) {
    for (const scene of act.scenes || []) {
      const spMatch = (screenplayScenes || []).find(s =>
        Number(s.sceneNumber) === Number(scene.screenplaySceneNumber || scene.sceneNumber)
        || Number(s.sceneNumber) === Number(scene.globalSceneNumber)
      );
      scenesDocs.push({
        jobId,
        sceneNumber:       scene.globalSceneNumber,
        act:               act.actNumber,
        location:          scene.location || '',
        // Carried so the segment step can find this scene's environment lock
        // without re-deriving it from the free-text slugline.
        locationId:        scene.locationId || '',
        timeOfDay:         scene.timeOfDay || '',
        characterNames:    scene.characters || [],
        emotion:           scene.emotion || 'neutral',
        intensity:         scene.intensity || 5,
        actionDescription: scene.summary || '',
        enrichedVisual:    spMatch?.enrichedVisual || '',
        beautyNotes:       spMatch?.beautyNotes || '',
        motifRefs:         spMatch?.motifRefs || [],
        isColdOpen:        !!spMatch?.isColdOpen,
        beats:             (scene.beats || []).map((b, i) => ({
          beatNumber:      i + 1,
          globalBeatNumber: b.globalBeatNumber,
          action:          b.action || '',
          dialogue:        b.dialogue || '',
          speaker:                b.speaker || '',
          expression:             b.expression || '',
          mood:                   b.mood || '',
          gaze:                   b.gaze || '',
          voiceDirection:         b.voiceDirection || '',
          audioCues:              b.audioCues || '',
          startFrameVisual:       b.startFrameVisual || '',
          endFrameVisual:         b.endFrameVisual || '',
          emotionalContinuity:    b.emotionalContinuity || '',
          cameraAngle:            b.cameraAngle || 'medium_wide',
          cameraMovement:         b.cameraMovement || 'static_tripod',
          strategy:               b.strategy || 'anchor',
          duration:               b.duration || 8,
          // Continuity payload — normalized and forward-filled by
          // decomposeScript(), and what makes consecutive shots read as one take.
          props:                  Array.isArray(b.props) ? b.props : [],
          accessories:            b.accessories || {},
          characterState:         b.characterState || {},
          continuityFromPrevious: b.continuityFromPrevious || '',
        })),
        totalSegments:     (scene.beats || []).length,
        duration:          scene.estimatedDuration || (scene.beats || []).length * 8,
        status:            SCENE_STATUS.PENDING,
      });
    }
  }

  if (scenesDocs.length > 0) {
    await Scene.insertMany(scenesDocs);
  }

  // Seed ContinuityBible so wardrobe / locations / accessories inject into every prompt path
  if (job.projectId) {
    try {
      await seedContinuityFromDirectorPlan(job.projectId, directorPlan, job.screenplayId || null, {
        lookBible: directorPlan.lookBible || lookBible,
        motifs: directorPlan.motifs || motifs,
      });
      await logInfo(jobId, '📖 ContinuityBible seeded from director plan (wardrobe, locations, accessories, lookBible)');
    } catch (contErr) {
      console.warn(`[WorkerSteps] ContinuityBible seed failed: ${contErr.message}`);
    }
  }

  await logInfo(jobId, `✅ Director plan: ${directorPlan.acts?.length} acts, ${directorPlan.totalScenes} scenes, ${directorPlan.totalBeats} beats (8s segments)`);
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.DIRECTING, progress: 20 });

  await triggerNextStep(jobId, 'directing');
}

// ─── STEP 3: CONSISTENCY LOCKING — Character + Environment References ────────

export async function processLockStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.LOCKING, progress: 25 });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.LOCKING, progress: 25 });
  await logInfo(jobId, '🔒 Generating consistency lock reference images...');

  const directorPlan = job.directorPlan;
  if (!directorPlan) {
    throw new Error('[WorkerSteps] No director plan found — run directing step first');
  }

  const animationStyle = job.animationStyle || 'cinematic';
  const characterLocks = {};
  const environmentLocks = {};

  // Load all available FilmCharacters for this job/screenplay/workspace
  let dbCharacters = [];
  try {
    if (job.filmCharacterIds?.length > 0) {
      dbCharacters = await FilmCharacter.find({ _id: { $in: job.filmCharacterIds } });
    }
    if (!dbCharacters.length && job.screenplayId) {
      const screenplay = await Screenplay.findById(job.screenplayId);
      const charIds = (screenplay?.characters || []).map(c => c.filmCharacterId).filter(Boolean);
      if (charIds.length) {
        dbCharacters = await FilmCharacter.find({ _id: { $in: charIds } });
      }
    }
    if (!dbCharacters.length && job.projectId) {
      dbCharacters = await FilmCharacter.find({ projectId: job.projectId });
    }
    if (!dbCharacters.length && job.workspaceId) {
      dbCharacters = await FilmCharacter.find({ workspaceId: job.workspaceId }).sort({ updatedAt: -1 });
    }
  } catch (err) {
    console.warn(`[WorkerSteps] Could not load DB characters: ${err.message}`);
  }

  // Generate character lock images
  const characters = [...(directorPlan.characters || [])];

  // Prioritize and ensure any user-created characters from DB (especially with uploaded photos) are included
  for (const dbC of dbCharacters) {
    const existing = characters.find(c =>
      (c.filmCharacterId && String(c.filmCharacterId) === String(dbC._id)) ||
      c.name.trim().toLowerCase() === dbC.name.trim().toLowerCase()
    );
    if (!existing) {
      characters.unshift({
        name: dbC.name,
        role: dbC.role || 'protagonist',
        physicalDescription: dbC.physicalDescription || '',
        clothingDefault: dbC.clothingDefault || '',
        referenceImageUrl: dbC.referenceImageUrl,
        referenceImageKey: dbC.referenceImageKey,
        avatar: dbC.avatar,
        filmCharacterId: dbC._id,
      });
    }
  }

  // ── Step 2.5: Multimodal Gemini Analysis for Characters with Reference Images ──
  const {
    analyzeCharacterReferenceImage,
    synthesizeWorldContinuity,
  } = await import('../services/characterVisionService.js');

  const analyzedReferenceCharacters = [];

  for (const char of characters) {
    // Merge matching DB character (match by ID, exact name, or partial name)
    const match = dbCharacters.find(c =>
      (char.filmCharacterId && String(c._id) === String(char.filmCharacterId)) ||
      c.name.trim().toLowerCase() === String(char.name).trim().toLowerCase() ||
      c.name.trim().toLowerCase().includes(String(char.name).trim().toLowerCase()) ||
      String(char.name).trim().toLowerCase().includes(c.name.trim().toLowerCase())
    ) || (dbCharacters.length === 1 && characters.length === 1 ? dbCharacters[0] : null);

    if (match) {
      char.referenceImageUrl = match.referenceImageUrl || char.referenceImageUrl;
      char.referenceImageKey = match.referenceImageKey || char.referenceImageKey;
      char.avatar = match.avatar || char.avatar;
      char.physicalDescription = match.physicalDescription || char.physicalDescription;
      char.clothingDefault = match.clothingDefault || char.clothingDefault;
      char.filmCharacterId = match._id;
      console.log(`[WorkerSteps] 🔗 Attached DB FilmCharacter "${match.name}" to plan character "${char.name}" (refImage: ${Boolean(char.referenceImageUrl || char.referenceImageKey)})`);
    }

    const refSource = char.referenceImageUrl || char.referenceImageKey || char.referenceImagePath || char.avatar;
    if (refSource) {
      await logInfo(jobId, `👁️ Reasoning LLM analyzing reference photo for "${char.name}"...`);
      try {
        const analysis = await analyzeCharacterReferenceImage({
          imagePathOrUrl: refSource,
          characterName: char.name,
          role: char.role,
          physicalDescription: char.physicalDescription,
          backstory: char.backstory,
        });
        char.visualAnalysis = analysis;
        analyzedReferenceCharacters.push({ name: char.name, role: char.role, ...analysis });
      } catch (err) {
        console.warn(`[WorkerSteps] Vision analysis failed for ${char.name}:`, err.message);
      }
    }
  }

  // Synthesize Master World & Setting DNA from analyzed characters
  const masterWorldDna = synthesizeWorldContinuity(analyzedReferenceCharacters);
  if (masterWorldDna) {
    job.visualDna = masterWorldDna;
    await Job.findByIdAndUpdate(jobId, { visualDna: masterWorldDna });
    await logInfo(
      jobId,
      `🌍 Master World & Setting DNA locked: ${masterWorldDna.country_or_region} (${masterWorldDna.socio_economic_setting}) · Lighting: ${masterWorldDna.lighting_style}`
    );
  }

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];

    // Check if lock already exists and is valid
    const existingCharLock = job.characterLocks?.[char.name];
    if (existingCharLock?.referenceImagePath && fs.existsSync(existingCharLock.referenceImagePath)) {
      console.log(`[WorkerSteps] ⏩ Reusing existing character lock for "${char.name}": ${existingCharLock.referenceImagePath}`);
      characterLocks[char.name] = existingCharLock;
      continue;
    }

    const hasRef = Boolean(char.referenceImageUrl || char.referenceImageKey || char.referenceImagePath || char.avatar);
    await logInfo(jobId, `Locking character ${i + 1}/${characters.length}: ${char.name}${hasRef ? ' (📸 using Image-to-Image with reference)' : ' (🎨 using Text-to-Image with World DNA)'}`);

    try {
      const lock = await createCharacterLock(char, animationStyle, jobId, masterWorldDna);
      characterLocks[char.name] = {
        lockPrompt: lock.lockPrompt,
        referenceImagePath: lock.referenceImagePath,
        referenceUsed: lock.referenceUsed,
        visualAnalysis: lock.visualAnalysis,
      };
    } catch (err) {
      console.error(`[WorkerSteps] Character lock failed for "${char.name}": ${err.message}`);
      // Fallback: text-only lock
      characterLocks[char.name] = {
        lockPrompt: buildCharacterLockPrompt(char, animationStyle),
        referenceImagePath: null,
        referenceUsed: false,
      };
    }
  }

  // Load all available Environments for this job/workspace
  let dbEnvironments = [];
  try {
    const { default: Environment } = await import('../models/Environment.js');
    const envQuery = { workspaceId: job.workspaceId };
    if (job.projectId) envQuery.projectId = job.projectId;
    dbEnvironments = await Environment.find(envQuery);
  } catch (err) {
    console.warn(`[WorkerSteps] Could not load DB environments: ${err.message}`);
  }

  // Generate environment lock images
  const environments = [...(directorPlan.environments || [])];
  for (let i = 0; i < environments.length; i++) {
    const env = environments[i];
    const envKey = env.locationId || env.name;

    // Check if lock already exists
    const existingEnvLock = job.environmentLocks?.[envKey];
    if (existingEnvLock?.referenceImagePath && fs.existsSync(existingEnvLock.referenceImagePath)) {
      console.log(`[WorkerSteps] ⏩ Reusing existing environment lock for "${env.name}": ${existingEnvLock.referenceImagePath}`);
      environmentLocks[envKey] = existingEnvLock;
      continue;
    }

    // Match DB environment
    const envMatch = dbEnvironments.find(e =>
      e.name.trim().toLowerCase() === String(env.name).trim().toLowerCase() ||
      e.name.trim().toLowerCase().includes(String(env.name).trim().toLowerCase()) ||
      String(env.name).trim().toLowerCase().includes(e.name.trim().toLowerCase())
    );

    if (envMatch) {
      env.referenceImageUrl = envMatch.referenceImageUrls?.[0] || env.referenceImageUrl;
      env.referenceImageKey = envMatch.referenceImageKeys?.[0] || env.referenceImageKey;
      console.log(`[WorkerSteps] 🔗 Attached DB Environment "${envMatch.name}" to plan location "${env.name}"`);
    }

    await logInfo(jobId, `Locking environment ${i + 1}/${environments.length}: ${env.name}${env.referenceImageUrl || env.referenceImageKey ? ' (📸 with uploaded reference)' : ''}`);

    try {
      const lock = await createEnvironmentLock(env, animationStyle, jobId, masterWorldDna);
      environmentLocks[envKey] = {
        lockPrompt: lock.lockPrompt,
        referenceImagePath: lock.referenceImagePath,
      };
    } catch (err) {
      console.error(`[WorkerSteps] Environment lock failed for "${env.name}": ${err.message}`);
    }
  }

  // Enrich lock prompts with act wardrobe so clothingByAct reaches every beat compile
  const wardrobeByAct = {};
  for (const char of characters) {
    const lock = characterLocks[char.name];
    if (!lock) continue;
    const byAct = char.clothingByAct || {};
    for (const [actKey, outfit] of Object.entries(byAct)) {
      if (!outfit) continue;
      if (!wardrobeByAct[actKey]) wardrobeByAct[actKey] = {};
      wardrobeByAct[actKey][char.name] = outfit;
    }
    // Also expose default via getActWardrobe helper for act 1
    const act1 = getActWardrobe(char, 1);
    if (act1) {
      if (!wardrobeByAct['1']) wardrobeByAct['1'] = {};
      wardrobeByAct['1'][char.name] = wardrobeByAct['1'][char.name] || act1;
      if (lock.lockPrompt && !String(lock.lockPrompt).includes(act1)) {
        lock.lockPrompt = `${lock.lockPrompt} Act-1 wardrobe: ${act1}.`;
      }
    }
  }

  // Refresh ContinuityBible with lock-derived wardrobe if project exists
  if (job.projectId && directorPlan) {
    try {
      // Stamp clothing onto plan characters from locks before re-seed
      for (const char of directorPlan.characters || []) {
        const w = wardrobeByAct['1']?.[char.name] || getActWardrobe(char, 1);
        if (w) char.clothingDefault = w;
      }
      await seedContinuityFromDirectorPlan(job.projectId, directorPlan, job.screenplayId || null);
    } catch (e) {
      console.warn(`[WorkerSteps] ContinuityBible wardrobe refresh failed: ${e.message}`);
    }
  }

  // Save locks to job
  await Job.findByIdAndUpdate(jobId, {
    characterLocks,
    environmentLocks,
    wardrobeByAct,
  });

  await logInfo(jobId, `✅ Locked: ${Object.keys(characterLocks).length} characters, ${Object.keys(environmentLocks).length} environments`);
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.LOCKING, progress: 35 });

  await triggerNextStep(jobId, 'locking');
}

// ─── STEP 4: SEGMENT GENERATION — 8-Second Video Segments ───────────────────

/** Lowercase a key or slugline down to comparable words. */
function simplifyKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Find the environment lock for a scene.
 *
 * processLockStep stores locks under `env.locationId || env.name`, while a scene
 * carries a slugline ("INT. KITCHEN - NIGHT"). The plan's `locationId` is the
 * real join key; the name and token matches below only exist to rescue plans
 * generated before that field was required.
 *
 * @returns {object|string} the lock object ({ lockPrompt, referenceImagePath }) or '' when none matches
 */
export function pickEnvironmentLock(environmentLocks = {}, sceneDoc = {}, planScene = null) {
  const keys = Object.keys(environmentLocks);
  if (keys.length === 0) return '';

  for (const key of [planScene?.locationId, sceneDoc.locationId, sceneDoc.location, planScene?.location]) {
    if (key && environmentLocks[key]) return environmentLocks[key];
  }

  const slug = simplifyKey(sceneDoc.location || planScene?.location);
  if (slug) {
    const hit = keys.find((key) => {
      const words = simplifyKey(key).split(' ').filter((w) => w.length > 2);
      return words.length > 0 && words.every((w) => slug.includes(w));
    });
    if (hit) return environmentLocks[hit];
  }

  console.warn(
    `[WorkerSteps] scene ${sceneDoc.sceneNumber}: no environment lock matched `
    + `"${sceneDoc.location || ''}" (locks: ${keys.join(', ')}) — the location will drift`,
  );
  return '';
}

export async function processSegmentStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.SEGMENT_GENERATION, progress: 40 });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.SEGMENT_GENERATION, progress: 40 });

  const directorPlan = job.directorPlan;
  const characterLocks = job.characterLocks || {};
  const environmentLocks = job.environmentLocks || {};
  const animationStyle = job.animationStyle || 'cinematic';
  const wardrobeByAct = job.wardrobeByAct || {};
  const lookBible = directorPlan?.lookBible || null;
  const motifs = directorPlan?.motifs || [];

  let continuityBlock = '';
  if (job.projectId) {
    try {
      continuityBlock = await extractContinuityPrompt(job.projectId, {});
      // Keep prompt budgets sane for Qwen / LTX (full bible can be huge on long films)
      if (continuityBlock && continuityBlock.length > 3500) {
        continuityBlock = continuityBlock.slice(0, 3500) + '\n[ContinuityBible truncated]';
      }
    } catch (e) {
      console.warn(`[WorkerSteps] ContinuityBible extract failed: ${e.message}`);
    }
  }

  const scenes = await Scene.find({ jobId }).sort({ sceneNumber: 1 });
  if (!scenes.length) {
    throw new Error(`[WorkerSteps] No scenes found for job ${jobId} — directing step produced an empty plan`);
  }

  // ─── PHASE 1: BATCH KEYFRAME PRE-GENERATION (Keeps Qwen Image GPU warm) ───
  await logInfo(jobId, `🖼️ Phase 1/2: Batch-generating all ${scenes.length} scene anchor keyframes...`);
  await pregenerateAllSceneKeyframes({
    jobId,
    scenes,
    directorPlan,
    characterLocks,
    environmentLocks,
    animationStyle,
    continuityBlock,
    wardrobeByAct,
    lookBible,
    motifs,
    onKeyframeReady: async (sceneDoc, keyframePath) => {
      sceneDoc.imagePath = keyframePath;
      await sceneDoc.save();
      emitJobEvent(jobId, 'scene_updated', {
        sceneId: sceneDoc._id,
        sceneNumber: sceneDoc.sceneNumber,
        imagePath: keyframePath,
      });
    },
  });
  await logInfo(jobId, `✅ Phase 1 complete: all ${scenes.length} scene keyframes ready.`);

  // ─── PHASE 2: CONTINUOUS VIDEO ANIMATION (Keeps LTX Video GPU warm) ───────
  await logInfo(jobId, `🎬 Phase 2/2: Rendering continuous video segments with LTX-2.5...`);
  let completedScenes = 0;
  let carryInFrame = null;

  for (const sceneDoc of scenes) {
    const sceneNum = sceneDoc.sceneNumber;

    // ── Resumption Check: If scene is already DONE and has valid videoPath, skip generation ──
    if (sceneDoc.status === SCENE_STATUS.DONE && sceneDoc.videoPath) {
      console.log(`[WorkerSteps] ⏩ Scene ${sceneNum} is already complete (${sceneDoc.videoPath}) — reusing existing video`);
      completedScenes++;

      // Update carryInFrame to this scene's last frame if it exists
      const imgDir = sceneImgDir(jobId);
      const beatsCount = sceneDoc.beats?.length || 1;
      const lastSegmentId = `scene_${String(sceneNum).padStart(4, '0')}_seg_${String(beatsCount).padStart(2, '0')}`;
      const lastFrameCandidate = path.join(imgDir, `${lastSegmentId}_lastframe.jpg`);
      if (fs.existsSync(lastFrameCandidate)) {
        carryInFrame = lastFrameCandidate;
      }
      continue;
    }

    await logInfo(jobId, `Animating scene ${sceneNum}/${scenes.length}...`);

    // Find matching scene from director plan
    let planScene = null;
    for (const act of directorPlan.acts || []) {
      planScene = (act.scenes || []).find(s => s.globalSceneNumber === sceneNum);
      if (planScene) {
        planScene._act = act;
        break;
      }
    }

    // Environment lock for this scene, looked up by the plan's locationId — the
    // key processLockStep actually stored it under. The whole lock object is
    // passed on, not just its prompt, because the reference image is what holds
    // the location steady between shots.
    const envLock = pickEnvironmentLock(environmentLocks, sceneDoc, planScene);

    // Use beats from the scene document (populated from director plan)
    const sceneData = {
      ...sceneDoc.toObject(),
      beats: sceneDoc.beats || [],
      globalSceneNumber: sceneNum,
    };

    try {
      const actObj = planScene?._act || { actNumber: sceneDoc.act || 1 };
      const actKey = String(actObj.actNumber || 1);
      const { segments, sceneVideoPath, lastFramePath } = await generateSceneSegments({
        jobId,
        scene: sceneData,
        act: actObj,
        // Full lock objects: segmentGenerator needs referenceImagePath to pass the
        // character sheets to Qwen-Image-Edit, and accepts bare prompts too.
        characterLocks,
        environmentLock: envLock,
        animationStyle,
        carryInFrame,
        continuityBlock,
        wardrobeByCharacter: wardrobeByAct[actKey] || {},
        lookBible,
        motifs,
        onSegmentComplete: async (segNum, videoPath) => {
          emitJobEvent(jobId, 'segment_complete', {
            sceneNumber: sceneNum,
            segmentNumber: segNum,
            videoPath,
          });
        },
      });

      // Seed the next scene from this scene's final frame.
      if (lastFramePath) carryInFrame = lastFramePath;

      // Update scene document
      sceneDoc.segments = segments;
      sceneDoc.videoPath = sceneVideoPath;
      sceneDoc.environmentLockRef = envLock?.referenceImagePath || null;
      sceneDoc.status = sceneVideoPath ? SCENE_STATUS.DONE : SCENE_STATUS.FAILED;
      await sceneDoc.save();

      // Upload scene video to cloud
      if (sceneVideoPath && fs.existsSync(sceneVideoPath)) {
        const key = `jobs/${jobId}/scenes/videos/scene_${String(sceneNum).padStart(4, '0')}.mp4`;
        const cloudUrl = await uploadToCloud(sceneVideoPath, key, 'video/mp4');
        sceneDoc.videoPath = cloudUrl;
        await sceneDoc.save();
      }

      completedScenes++;
    } catch (err) {
      console.error(`[WorkerSteps] Scene ${sceneNum} generation failed: ${err.message}`);
      sceneDoc.status = SCENE_STATUS.FAILED;
      sceneDoc.error = err.message;
      await sceneDoc.save();
    }

    // Update progress
    const progress = 40 + Math.round((completedScenes / scenes.length) * 40);
    await Job.findByIdAndUpdate(jobId, { completedScenes, progress });
    emitJobEvent(jobId, 'job_progress', { progress, completedScenes, totalScenes: scenes.length });
  }

  const failedCount = await Scene.countDocuments({ jobId, status: SCENE_STATUS.FAILED });
  const doneCount = await Scene.countDocuments({ jobId, status: SCENE_STATUS.DONE });

  await logInfo(
    jobId,
    `Segment generation finished: ${doneCount} done, ${failedCount} failed, ${scenes.length} total `
    + `(completedScenes counter=${completedScenes})`,
  );

  if (doneCount === 0) {
    const errMsg = (
      `All ${scenes.length} scenes failed during segment generation. `
      + 'Check RunPod image/video endpoints, character reference uploads, and worker logs. '
      + 'The job will not assemble an empty film.'
    );
    await logError(jobId, errMsg);
    await Job.findByIdAndUpdate(jobId, {
      status: JOB_STATUS.FAILED,
      error: errMsg,
      progress: 40,
    });
    emitJobEvent(jobId, 'job_failed', { error: errMsg });
    throw new Error(errMsg);
  }

  if (failedCount > 0 && failedCount >= Math.ceil(scenes.length / 2)) {
    const errMsg = (
      `Segment generation incomplete: ${failedCount}/${scenes.length} scenes failed `
      + `(only ${doneCount} succeeded). Fix failing scenes and retry — refusing to assemble a half-broken film.`
    );
    await logError(jobId, errMsg);
    await Job.findByIdAndUpdate(jobId, {
      status: JOB_STATUS.FAILED,
      error: errMsg,
      progress: 40 + Math.round((doneCount / scenes.length) * 40),
    });
    emitJobEvent(jobId, 'job_failed', { error: errMsg });
    throw new Error(errMsg);
  }

  if (failedCount > 0) {
    await logWarn(
      jobId,
      `${failedCount} scene(s) failed but ${doneCount} succeeded — continuing assembly with available scenes`,
    );
  }

  await triggerNextStep(jobId, 'segment_generation');
}

// ─── STEP 5: ASSEMBLY — Stitch Everything Together ──────────────────────────

export async function processRenderingStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.ASSEMBLING, progress: 85 });
  emitJobEvent(jobId, 'job_progress', { status: JOB_STATUS.ASSEMBLING, progress: 85 });
  await logInfo(jobId, '🎬 Assembling final film from scene videos...');

  const scenes = await Scene.find({ jobId, status: SCENE_STATUS.DONE }).sort({ sceneNumber: 1 });
  if (!scenes.length) {
    const errMsg = 'Rendering aborted: no completed scenes to assemble.';
    await logError(jobId, errMsg);
    await Job.findByIdAndUpdate(jobId, { status: JOB_STATUS.FAILED, error: errMsg });
    throw new Error(errMsg);
  }
  const localScenes = [];

  const jobTempDir = path.join(tempDir(jobId), 'assembly');
  fs.mkdirSync(jobTempDir, { recursive: true });

  // Download each scene video locally for assembly
  for (const scene of scenes) {
    if (!scene.videoPath) continue;
    const filename = `scene_${String(scene.sceneNumber).padStart(4, '0')}.mp4`;
    const localPath = path.join(jobTempDir, filename);

    if (!fs.existsSync(localPath)) {
      try {
        if (scene.videoPath.startsWith('http')) {
          const res = await axios({ method: 'GET', url: scene.videoPath, responseType: 'stream' });
          const writer = fs.createWriteStream(localPath);
          res.data.pipe(writer);
          await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
        } else if (fs.existsSync(scene.videoPath)) {
          await fs.promises.copyFile(scene.videoPath, localPath);
        }
      } catch (err) {
        console.warn(`[WorkerSteps] Failed to download scene ${scene.sceneNumber}: ${err.message}`);
        continue;
      }
    }

    localScenes.push({
      ...scene.toObject(),
      videoPath: localPath,
    });
  }

  // Assemble final video (no narration audio — LTX already has native audio)
  const { finalVideoPath, duration } = await assembleVideo({
    jobId,
    scenes: localScenes,
    narrationPath: null,  // No separate audio — LTX generates it natively
    srtPath: null,
    subtitleBurnIn: false,
  });

  // Generate thumbnail
  const localThumbnailPath = path.join(jobTempDir, 'thumbnail.jpg');
  await generateThumbnailFromVideo(finalVideoPath, localThumbnailPath);

  await Job.findByIdAndUpdate(jobId, {
    finalVideoPath,
    thumbnailPath: localThumbnailPath,
    duration,
    status: JOB_STATUS.OPTIMIZING,
    progress: 95,
  });

  await triggerNextStep(jobId, 'rendering');
}

// ─── STEP 6: UPLOAD ─────────────────────────────────────────────────────────

export async function processUploadStep(jobId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await logInfo(jobId, 'Uploading completed film and thumbnail to cloud...');

  const finalVideoKey = `jobs/${jobId}/outputs/final.mp4`;
  const thumbnailKey  = `jobs/${jobId}/outputs/thumbnail.jpg`;

  const finalVideoUrl = await uploadToCloud(job.finalVideoPath, finalVideoKey, 'video/mp4');
  const thumbnailUrl  = await uploadToCloud(job.thumbnailPath, thumbnailKey, 'image/jpeg');

  const fileSize = await getFileSize(job.finalVideoPath);

  await Asset.create({ jobId, type: 'final_video', path: finalVideoUrl, size: fileSize });
  await Asset.create({ jobId, type: 'thumbnail', path: thumbnailUrl, size: 10000 });

  await Job.findByIdAndUpdate(jobId, {
    status:         JOB_STATUS.COMPLETED,
    progress:       100,
    finalVideoPath: finalVideoUrl,
    thumbnailPath:  thumbnailUrl,
    fileSize,
    completedAt:    new Date(),
  });

  await logInfo(jobId, `🎬 Film complete! URL: ${finalVideoUrl}`);

  try {
    const { settleJobBilling } = await import('../services/costTracker.js');
    const settled = await settleJobBilling(jobId);
    if (settled?.billedUsd) {
      await logInfo(jobId, `Production charge applied.`);
    }
  } catch (billErr) {
    console.error(`[WorkerSteps] Billing settlement failed for ${jobId}: ${billErr.message}`);
  }

  // Update project memory
  if (job.projectId) {
    try {
      const project = await Project.findById(job.projectId);
      if (project) await updateProjectMemory(project, job);
    } catch (err) {
      console.warn(`[WorkerSteps] Project memory update failed: ${err.message}`);
    }
  }

  await deleteTempFiles(jobId);
  await enqueueNotificationJob(jobId, 'email', 'Your film is ready to download!', job.userId);
}

// ─── STEP 7: NOTIFICATION ────────────────────────────────────────────────────

export async function processNotificationStep(jobId, type, message, recipient) {
  emitJobEvent(jobId, 'job_completed', { message, recipient });
  console.log(`[NotificationService] Notification: "${message}" → ${recipient}`);
}

// ─── Legacy compatibility stubs (for executionEngine.js) ──────────────────────

export async function processAudioStep(jobId) {
  // No-op: LTX 2.3 generates audio natively. Skip to next step.
  await logInfo(jobId, 'Audio step skipped — LTX 2.3 generates native audio.');
  await triggerNextStep(jobId, 'audio');
}

export async function processPromptStep(jobId) {
  // Redirect to directing step (prompts are now built by the Cinematic Director)
  return processDirectingStep(jobId);
}

export async function processImageStep(jobId, sceneId, sceneNumber, prompt) {
  // Images are now generated as part of segment generation. No-op.
  console.log(`[WorkerSteps] processImageStep is deprecated — images generated during segment step`);
}

export async function processVideoStep(jobId, sceneId, sceneNumber, localImagePath, prompt) {
  // Videos are now generated as part of segment generation. No-op.
  console.log(`[WorkerSteps] processVideoStep is deprecated — videos generated during segment step`);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

export async function checkStageComplete(jobId, stageId) {
  const total     = await Scene.countDocuments({ jobId });
  const completed = await Scene.countDocuments({ jobId, status: SCENE_STATUS.DONE });

  const progress = total > 0 ? Math.round((completed / total) * 40) + 40 : 40;
  await Job.findByIdAndUpdate(jobId, { completedScenes: completed, progress });
  emitJobEvent(jobId, 'job_progress', { progress, completedScenes: completed, totalScenes: total });

  if (completed === total && total > 0) {
    console.log(`[WorkerSteps] All ${total} scenes complete for stage ${stageId}! Advancing...`);
    await triggerNextStep(jobId, stageId);
  }
}
