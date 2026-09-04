import fs from 'fs';
import path from 'path';
import Job from '../models/Job.js';
import {
  getOrBootstrapTimeline,
  validateTimeline,
  exportTimeline,
  bootstrapTimeline,
  EDITOR_FILTERS,
  TRANSITION_TYPES,
  ANIM_PRESETS,
} from '../services/editorService.js';
import { audioDir } from '../config/constants.js';

async function loadOwnedJob(req) {
  const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return job;
}

/** GET /api/jobs/:id/editor — timeline + presets + export status */
export async function getEditor(req, res, next) {
  try {
    const job = await loadOwnedJob(req);
    const timeline = await getOrBootstrapTimeline(job);
    const fresh = await Job.findById(job._id).select('editorExport finalVideoPath audioMix aspectRatio status title');

    res.json({
      jobId: String(job._id),
      title: job.title,
      status: job.status,
      aspectRatio: job.aspectRatio || timeline.aspectRatio,
      timeline,
      presets: {
        filters: Object.keys(EDITOR_FILTERS),
        transitions: TRANSITION_TYPES,
        animations: ANIM_PRESETS,
      },
      audioMix: {
        scorePath: fresh.audioMix?.scorePath || null,
        mixPath: fresh.audioMix?.mixPath || null,
        hasNativeAudio: !!fresh.audioMix?.hasNativeAudio,
      },
      export: fresh.editorExport || null,
      finalVideoPath: fresh.finalVideoPath || null,
      streamUrl: `/api/jobs/${job._id}/stream`,
      editorStreamUrl: `/api/jobs/${job._id}/editor/stream`,
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/jobs/:id/editor — autosave timeline */
export async function putEditor(req, res, next) {
  try {
    const job = await loadOwnedJob(req);
    const timeline = validateTimeline(req.body?.timeline || req.body);
    await Job.findByIdAndUpdate(job._id, { editTimeline: timeline });
    res.json({ ok: true, timeline });
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs/:id/editor/bootstrap — force rebuild from scenes */
export async function bootstrapEditor(req, res, next) {
  try {
    const job = await loadOwnedJob(req);
    const timeline = await bootstrapTimeline(job);
    await Job.findByIdAndUpdate(job._id, { editTimeline: timeline });
    res.json({ ok: true, timeline });
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs/:id/editor/export — start ffmpeg render (async) */
export async function exportEditor(req, res, next) {
  try {
    const job = await loadOwnedJob(req);

    let timeline = job.editTimeline;
    if (req.body?.timeline) {
      timeline = validateTimeline(req.body.timeline);
      await Job.findByIdAndUpdate(job._id, {
        editTimeline: timeline,
        'editorExport.status': 'queued',
        'editorExport.progress': 0,
        'editorExport.error': null,
      });
    } else if (!timeline?.clips?.length) {
      return res.status(400).json({ error: 'No timeline to export — open editor and arrange clips first' });
    } else {
      await Job.findByIdAndUpdate(job._id, {
        'editorExport.status': 'queued',
        'editorExport.progress': 0,
        'editorExport.error': null,
      });
    }

    res.status(202).json({
      ok: true,
      status: 'queued',
      message: 'Export started — poll GET /editor for progress',
    });

    exportTimeline(job._id, timeline).catch(async (err) => {
      console.error(`[Editor] Export failed for ${job._id}:`, err.message);
      await Job.findByIdAndUpdate(job._id, {
        'editorExport.status': 'failed',
        'editorExport.error': err.message,
        'editorExport.finishedAt': new Date(),
      });
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/jobs/:id/editor/stream — stream editor_final.mp4 if present */
export async function streamEditorExport(req, res, next) {
  try {
    const job = await loadOwnedJob(req);
    const filePath = job.editorExport?.outputPath || job.finalVideoPath;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'No editor export available yet' });
    }

    const stat = await fs.promises.stat(filePath);
    const range = req.headers.range;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
}

/** POST /api/jobs/:id/editor/audio — upload optional A2 audio file */
export async function uploadEditorAudio(req, res, next) {
  try {
    const job = await loadOwnedJob(req);
    if (!req.file) return res.status(400).json({ error: 'Audio file required' });

    const destDir = audioDir(String(job._id));
    await fs.promises.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `editor_a2_${Date.now()}${path.extname(req.file.originalname) || '.mp3'}`);
    await fs.promises.rename(req.file.path, dest);

    const timeline = await getOrBootstrapTimeline(job);
    const duration = Math.max(timeline.duration || 1, 1);
    timeline.clips = (timeline.clips || []).filter((c) => !(c.trackId === 'A2' && c.label === 'Imported audio'));
    timeline.clips.push({
      id: `a2_${Date.now().toString(36)}`,
      trackId: 'A2',
      type: 'audio',
      label: 'Imported audio',
      sourcePath: dest,
      start: 0,
      duration,
      sourceIn: 0,
      sourceOut: duration,
      volume: 0.35,
      mute: false,
      fadeIn: 0.4,
      fadeOut: 0.8,
      duckUnderNative: true,
      waveform: 'placeholder',
    });
    timeline.updatedAt = new Date().toISOString();
    await Job.findByIdAndUpdate(job._id, { editTimeline: timeline });

    res.json({ ok: true, sourcePath: dest, timeline });
  } catch (err) {
    next(err);
  }
}
