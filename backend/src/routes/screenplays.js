import express from 'express';
import mongoose from 'mongoose';
import Screenplay from '../models/Screenplay.js';
import FilmCharacter from '../models/FilmCharacter.js';
import Job from '../models/Job.js';
import Project from '../models/Project.js';
import { createScreenplayDraft, runScreenplayGeneration, regenerateScreenplay } from '../services/screenplayService.js';
import { researchAndExpandConcept } from '../services/webResearchService.js';
import { startJobPipeline } from '../services/executionEngine.js';
import { SCREENPLAY_PIPELINE_STEPS } from '../config/constants.js';
import { logInfo } from '../services/logService.js';

const router = express.Router();

// ── Research and expand a brief synopsis using internet trends & video type ────
router.post('/research-expand', async (req, res, next) => {
  try {
    const { title, synopsis, videoType, genre } = req.body;
    if (!synopsis) {
      return res.status(400).json({ error: 'A short description or synopsis is required to expand' });
    }

    const type = videoType || genre || 'drama';
    const result = await researchAndExpandConcept({
      title: title || '',
      synopsis,
      videoType: type,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── List screenplays for workspace ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { projectId, status } = req.query;
    const filter = { workspaceId: req.workspaceId };
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;

    const screenplays = await Screenplay.find(filter)
      .select('-scenes') // omit scene data for list view (too large)
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ screenplays });
  } catch (err) { next(err); }
});

// ── Get a single screenplay (full, with scenes) ───────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId
    });
    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });
    res.json({ screenplay });
  } catch (err) { next(err); }
});

// ── Patch / inline-edit a screenplay ─────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId
    });
    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });

    const allowed = [
      'title', 'synopsis', 'storyBible', 'styleGuide', 'rawScript',
      'acts', 'scenes', 'characters', 'genre', 'tone', 'themes',
    ];
    for (const field of allowed) {
      if (req.body[field] !== undefined) screenplay[field] = req.body[field];
    }
    await screenplay.save();
    res.json({ screenplay });
  } catch (err) { next(err); }
});

// ── Get scenes for a screenplay (paginated) ───────────────────────────────────
router.get('/:id/scenes', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId
    }).select('scenes totalScenes title');

    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;

    const scenes = screenplay.scenes.slice(start, start + limit);
    res.json({
      scenes,
      totalScenes: screenplay.totalScenes,
      page,
      totalPages: Math.ceil(screenplay.totalScenes / limit),
    });
  } catch (err) { next(err); }
});

// ── Generate a new screenplay from synopsis ───────────────────────────────────
router.post('/generate', async (req, res, next) => {
  try {
    const {
      title, genre, synopsis, tone, themes,
      animationStyle, targetDurationMinutes,
      filmCharacterIds, projectId, additionalSettings
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Film title is required' });
    if (!synopsis) return res.status(400).json({ error: 'Synopsis is required' });

    const { assertCanAfford, estimateScreenplayBilledUsd } = await import('../services/walletService.js');
    const scriptEstimate = estimateScreenplayBilledUsd(parseInt(targetDurationMinutes) || 90);
    await assertCanAfford(req.workspaceId, scriptEstimate, 'screenplay');

    console.log(`[ScreenplayRoute] Generating screenplay for "${title}"...`);

    // Auto-create a Project Studio if none was provided, or if the title
    // differs from the currently active project (new film creation).
    let resolvedProjectId = projectId || null;
    if (resolvedProjectId) {
      try {
        const existingProj = await Project.findOne({ _id: resolvedProjectId, workspaceId: req.workspaceId });
        if (existingProj && existingProj.name?.trim().toLowerCase() !== title.trim().toLowerCase()) {
          // New title in film studio -> spin up a new Studio project automatically
          console.log(`[ScreenplayRoute] Title "${title}" differs from project "${existingProj.name}". Creating a new Studio.`);
          resolvedProjectId = null;
        }
      } catch (checkErr) {
        resolvedProjectId = null;
      }
    }

    if (!resolvedProjectId && req.userId) {
      try {
        const autoProj = new Project({
          name: title,
          description: synopsis,
          userId: req.userId,
          workspaceId: req.workspaceId,
          status: 'active',
          style: {
            preset: genre || 'cinematic',
            camera: 'hollywood',
            lighting: 'dusk',
            colorGrade: 'cinematic',
            motionLevel: 'medium',
            emotion: tone || 'neutral',
            musicStyle: 'cinematic',
            customStyleNotes: ''
          }
        });
        await autoProj.save();
        resolvedProjectId = autoProj._id;
        console.log(`[ScreenplayRoute] Auto-created Project Studio "${title}" (${resolvedProjectId})`);
      } catch (projErr) {
        console.error('[ScreenplayRoute] Could not auto-create project:', projErr.message);
      }
    }

    // Create the doc in the `generating` state and return immediately. The
    // multi-stage LLM run (1-3 min) is fired detached below, so a backend restart
    // mid-generation can never strand an in-flight HTTP request — startup recovery
    // resumes the doc instead.
    const screenplay = await createScreenplayDraft({
      title,
      genre: genre || 'drama',
      synopsis,
      tone: tone || 'dramatic',
      themes: themes || [],
      animationStyle: animationStyle || 'cinematic',
      targetDurationMinutes: parseInt(targetDurationMinutes) || 90,
      filmCharacterIds: filmCharacterIds || [],
      additionalSettings: additionalSettings || '',
      workspaceId: req.workspaceId,
      projectId: resolvedProjectId,
      createdBy: req.userId,
    });

    // Detached: progress + completion are delivered via `screenplay_updated`
    // socket events and reflected in the persisted document (polled by the UI).
    runScreenplayGeneration(screenplay._id).catch(err =>
      console.error(`[ScreenplayRoute] Generation failed for ${screenplay._id}:`, err.message)
    );

    res.status(202).json({
      screenplay: {
        _id: screenplay._id,
        projectId: screenplay.projectId,
        title: screenplay.title,
        genre: screenplay.genre,
        totalScenes: screenplay.totalScenes,
        totalChapters: screenplay.totalChapters,
        status: screenplay.status,   // 'generating'
        acts: screenplay.acts,
        characters: screenplay.characters,
        storyBible: screenplay.storyBible,
      }
    });
  } catch (err) { next(err); }
});

// ── Regenerate a failed/draft screenplay ──────────────────────────────────────
router.post('/:id/regenerate', async (req, res, next) => {
  try {
    const existing = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });
    if (!existing) return res.status(404).json({ error: 'Screenplay not found' });
    if (!['draft', 'generating'].includes(existing.status)) {
      return res.status(400).json({ error: `Screenplay cannot be regenerated (status: ${existing.status})` });
    }

    console.log(`[ScreenplayRoute] Regenerating screenplay "${existing.title}" (${existing._id})...`);
    const screenplay = await regenerateScreenplay(existing);

    // Fire the LLM run detached and return immediately (same contract as /generate).
    runScreenplayGeneration(screenplay._id).catch(err =>
      console.error(`[ScreenplayRoute] Regeneration failed for ${screenplay._id}:`, err.message)
    );

    res.status(202).json({
      screenplay: {
        _id: screenplay._id,
        title: screenplay.title,
        genre: screenplay.genre,
        totalScenes: screenplay.totalScenes,
        totalChapters: screenplay.totalChapters,
        status: screenplay.status,   // 'generating'
        acts: screenplay.acts,
        characters: screenplay.characters,
        storyBible: screenplay.storyBible,
      }
    });
  } catch (err) { next(err); }
});

// ── Update a scene in a screenplay (manual edit) ─────────────────────────────
router.patch('/:id/scenes/:sceneNumber', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId
    });
    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });

    const sceneIndex = screenplay.scenes.findIndex(
      s => s.sceneNumber === parseInt(req.params.sceneNumber)
    );
    if (sceneIndex === -1) return res.status(404).json({ error: 'Scene not found' });

    const allowed = ['narration', 'dialogue', 'actionType', 'actionDescription', 'location',
                     'emotion', 'intensity', 'cameraType', 'transitionOut', 'characterNames'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        screenplay.scenes[sceneIndex][field] = req.body[field];
      }
    }

    screenplay.markModified('scenes');
    await screenplay.save();
    res.json({ scene: screenplay.scenes[sceneIndex] });
  } catch (err) { next(err); }
});

// ── Start production from a screenplay (creates a Job) ───────────────────────
router.post('/:id/produce', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOne({
      _id: req.params.id,
      workspaceId: req.workspaceId
    });
    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });
    if (screenplay.status !== 'ready') {
      return res.status(400).json({ error: `Screenplay is not ready (status: ${screenplay.status})` });
    }

    // Resolve all relevant character IDs for this production job
    const incomingCharIds = Array.isArray(req.body?.filmCharacterIds)
      ? req.body.filmCharacterIds.filter(id => mongoose.Types.ObjectId.isValid(id))
      : [];
    const screenplayCharIds = (screenplay.characters || [])
      .map(c => c.filmCharacterId)
      .filter(id => id && mongoose.Types.ObjectId.isValid(id));
    
    let projectCharIds = [];
    if (screenplay.projectId) {
      const pChars = await FilmCharacter.find({ projectId: screenplay.projectId }).select('_id');
      projectCharIds = pChars.map(c => c._id);
    }
    if (!incomingCharIds.length && !screenplayCharIds.length && !projectCharIds.length) {
      const wsChars = await FilmCharacter.find({ workspaceId: req.workspaceId }).select('_id');
      projectCharIds = wsChars.map(c => c._id);
    }

    const combinedCharIds = Array.from(new Set([
      ...incomingCharIds.map(String),
      ...screenplayCharIds.map(String),
      ...projectCharIds.map(String)
    ])).map(id => new mongoose.Types.ObjectId(id));

    const { assertCanAfford, estimateJobBilledUsdFromInput, reserveEstimateOnJob } = await import('../services/walletService.js');
    const estimatedUsd = estimateJobBilledUsdFromInput({
      targetDurationMinutes: screenplay.targetDurationMinutes || 3,
      sceneCount: screenplay.totalScenes,
      characterCount: combinedCharIds.length,
      hasScriptStep: false,
    });
    await assertCanAfford(req.workspaceId, estimatedUsd, 'production');

    // Create the production Job
    const job = new Job({
      userId: req.userId,
      workspaceId: req.workspaceId,
      projectId: screenplay.projectId,
      title: screenplay.title,
      inputMode: 'film_mode',
      filmMode: true,
      screenplayId: screenplay._id,
      animationStyle: screenplay.animationStyle,
      genre: screenplay.genre,
      targetDurationMinutes: screenplay.targetDurationMinutes,
      totalScenes: screenplay.totalScenes,
      totalChapters: screenplay.totalChapters,
      filmCharacterIds: combinedCharIds,
      styleConfig: {
        preset: screenplay.animationStyle || 'cinematic',
        camera: 'hollywood',
        lighting: 'golden_hour',
        colorGrade: 'netflix',
        motionLevel: 'high',
        emotion: 'dramatic',
      },
      status: 'queued',
    });
    await job.save();
    await reserveEstimateOnJob(job, estimatedUsd);

    // Scene documents are NOT created here. The directing step is the single
    // writer of Scene documents (it starts with Scene.deleteMany), and it now
    // decomposes this screenplay into 8-second beats with the continuity payload
    // the image prompts need. Creating them here as well only produced rows that
    // directing immediately deleted, under scene ids the UI had already linked to.

    // Mark screenplay as in production
    screenplay.status = 'in_production';
    screenplay.jobId = job._id;
    await screenplay.save();

    // Enqueue the film pipeline. No 'script' step — the screenplay IS the script,
    // so directing reads it straight from the Screenplay document.
    await startJobPipeline(String(job._id), SCREENPLAY_PIPELINE_STEPS);

    res.status(201).json({
      jobId: job._id,
      totalScenes: screenplay.totalScenes,
      totalChapters: screenplay.totalChapters,
      message: `Production started for "${screenplay.title}" (${screenplay.totalScenes} scenes)`,
    });
  } catch (err) { next(err); }
});

// ── Delete a screenplay ───────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const screenplay = await Screenplay.findOneAndDelete({
      _id: req.params.id,
      workspaceId: req.workspaceId,
    });
    if (!screenplay) return res.status(404).json({ error: 'Screenplay not found' });
    res.json({ message: 'Screenplay deleted', screenplayId: req.params.id });
  } catch (err) { next(err); }
});

export default router;
