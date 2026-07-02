import fs from 'fs';
import path from 'path';

import Job    from '../models/Job.js';
import Scene  from '../models/Scene.js';
import Asset  from '../models/Asset.js';
import JobLog from '../models/JobLog.js';
import User   from '../models/User.js';
import Workspace from '../models/Workspace.js';

import { enqueueScriptJob }  from '../queues/queueManager.js';
import { createJobDirs, deleteJobFiles } from '../services/storageService.js';
import { setJobSignal, clearJobSignal } from '../services/jobControlService.js';
import { JOB_STATUS, SCENE_STATUS }       from '../config/constants.js';

// ─── SCENE ASSET STREAMING ───────────────────────────────────────────────────

/**
 * Stream a scene image file directly from disk.
 * GET /api/jobs/:id/scenes/:sceneId/image
 */
export async function streamSceneImage(req, res, next) {
  try {
    const scene = await Scene.findOne({ _id: req.params.sceneId, jobId: req.params.id });
    if (!scene?.imagePath)       return res.status(404).json({ error: 'Scene image not available' });
    if (!fs.existsSync(scene.imagePath)) return res.status(404).json({ error: 'Image file missing from storage' });

    const ext = path.extname(scene.imagePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(scene.imagePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * Stream a scene video clip directly from disk.
 * GET /api/jobs/:id/scenes/:sceneId/video
 */
export async function streamSceneVideo(req, res, next) {
  try {
    const scene = await Scene.findOne({ _id: req.params.sceneId, jobId: req.params.id });
    if (!scene?.videoPath)       return res.status(404).json({ error: 'Scene video not available' });
    if (!fs.existsSync(scene.videoPath)) return res.status(404).json({ error: 'Video file missing from storage' });

    const stat     = fs.statSync(scene.videoPath);
    const fileSize = stat.size;
    const range    = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : fileSize - 1;
      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': end - start + 1,
        'Content-Type':   'video/mp4',
      });
      fs.createReadStream(scene.videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type':   'video/mp4',
        'Accept-Ranges':  'bytes',
      });
      fs.createReadStream(scene.videoPath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
}

// ─── CREATE JOB ──────────────────────────────────────────────────────────────
export async function createJob(req, res, next) {
  try {
    const { title, script, prompt, styleGuide, style, pacing, provider, subtitleBurnIn } = req.body;
    const userId = req.user._id;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!script?.trim() && !prompt?.trim() && !req.files?.length) {
      return res.status(400).json({ error: 'Provide a script, prompt, or upload a document' });
    }

    // Categorise uploaded files
    const uploadedFiles  = [];
    let   voiceoverPath  = null;

    for (const file of req.files || []) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.mp3', '.wav'].includes(ext)) {
        voiceoverPath = file.path;
      } else {
        uploadedFiles.push(file.path);
      }
    }

    const workspaceId = req.workspaceId || req.user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID context is required' });
    }

    // Validate User & Workspace
    const [userExists, workspace] = await Promise.all([
      User.exists({ _id: userId }),
      Workspace.findById(workspaceId)
    ]);

    if (!userExists) {
      return res.status(404).json({ error: 'Authenticated user not found' });
    }

    if (!workspace) {
      return res.status(404).json({ error: 'Associated workspace not found' });
    }

    // Verify user belongs to workspace
    const isMember = workspace.members.some(member => String(member.userId) === String(userId));
    if (!isMember && String(workspace.ownerId) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied: user is not a member of this workspace' });
    }

    // Create job document
    const job = await Job.create({
      userId,
      workspaceId,
      title:          title.trim(),
      provider:       provider || 'grok',
      subtitleBurnIn: subtitleBurnIn === 'true' || subtitleBurnIn === true,
      status:         JOB_STATUS.QUEUED,
      input: {
        script:        script  || '',
        prompt:        prompt  || '',
        styleGuide:    styleGuide || '',
        style:         style   || 'cinematic',
        pacing:        pacing  || 'medium',
        voiceoverPath,
        uploadedFiles,
      },
    });

    const jobId = String(job._id);

    // Move uploaded files to job-specific input dir
    await createJobDirs(jobId);

    // Enqueue
    await enqueueScriptJob(jobId);

    // Increment user job count
    await User.findByIdAndUpdate(userId, { $inc: { totalJobs: 1 } });

    res.status(201).json({ jobId, status: JOB_STATUS.QUEUED, message: 'Job queued successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GET HISTORY ─────────────────────────────────────────────────────────────
export async function getHistory(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    // REGRESSION GUARD: History Scope
    // This query strictly scopes results to the authenticated user.
    // If you need global/system-wide counts, see `getStats` in systemController.js.
    const filter = { userId: req.user._id };
    if (status) filter.status = status;

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select('-input.uploadedFiles'),  // don't leak internal paths
      Job.countDocuments(filter),
    ]);

    res.json({ jobs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// ─── GET JOB DETAIL ──────────────────────────────────────────────────────────
export async function getJobDetail(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    next(err);
  }
}

// ─── GET JOB STATUS (lightweight polling fallback) ────────────────────────────
export async function getJobStatus(req, res, next) {
  try {
    const job = await Job.findOne(
      { _id: req.params.id, userId: req.user._id },
      'status progress completedScenes totalScenes error',
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    next(err);
  }
}

// ─── GET JOB LOGS ────────────────────────────────────────────────────────────
export async function getJobLogs(req, res, next) {
  try {
    const logs = await JobLog.find({ jobId: req.params.id })
      .sort({ timestamp: 1 })
      .limit(500);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

// ─── GET JOB SCENES ──────────────────────────────────────────────────────────
export async function getJobScenes(req, res, next) {
  try {
    const scenes = await Scene.find({ jobId: req.params.id }).sort({ sceneNumber: 1 });
    res.json(scenes);
  } catch (err) {
    next(err);
  }
}

// ─── STREAM FINAL VIDEO ──────────────────────────────────────────────────────
export async function streamVideo(req, res, next) {
  try {
    const job = await Job.findOne(
      { _id: req.params.id, userId: req.user._id },
      'finalVideoPath status',
    );

    if (!job)                 return res.status(404).json({ error: 'Job not found' });
    if (!job.finalVideoPath)  return res.status(404).json({ error: 'Video not yet available' });
    if (!fs.existsSync(job.finalVideoPath)) return res.status(404).json({ error: 'Video file missing from storage' });

    const stat     = fs.statSync(job.finalVideoPath);
    const fileSize = stat.size;
    const range    = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   'video/mp4',
      });

      fs.createReadStream(job.finalVideoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type':   'video/mp4',
        'Accept-Ranges':  'bytes',
      });
      fs.createReadStream(job.finalVideoPath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
}

// ─── STREAM THUMBNAIL ────────────────────────────────────────────────────────
export async function streamThumbnail(req, res, next) {
  try {
    const job = await Job.findOne(
      { _id: req.params.id, userId: req.user._id },
      'thumbnailPath',
    );

    if (!job?.thumbnailPath || !fs.existsSync(job.thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not available' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(job.thumbnailPath).pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── STOP JOB ──────────────────────────────────────────────────────────────
export async function stopJob(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const stoppableStatuses = [
      JOB_STATUS.QUEUED, JOB_STATUS.PREPARING, JOB_STATUS.ANALYZING, 
      JOB_STATUS.SCENE_GENERATION, JOB_STATUS.MEDIA_GENERATION, 
      JOB_STATUS.ASSEMBLING, JOB_STATUS.OPTIMIZING
    ];
    if (!stoppableStatuses.includes(job.status)) {
      return res.status(400).json({ error: `Cannot stop a job with status: ${job.status}` });
    }

    // Set stop signal in Redis (worker will detect this and throw AbortJobError)
    await setJobSignal(job._id, 'stop');
    
    // Set immediate UI state
    job.status = JOB_STATUS.STOPPING;
    await job.save();

    res.json({ message: 'Stop signal sent successfully', status: JOB_STATUS.STOPPING });
  } catch (err) {
    next(err);
  }
}

// ─── RESUME JOB ──────────────────────────────────────────────────────────────
export async function resumeJob(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== JOB_STATUS.STOPPED) {
      return res.status(400).json({ error: 'Only stopped jobs can be resumed' });
    }

    // Clear any lingering stop signals
    await clearJobSignal(job._id);

    job.status = JOB_STATUS.QUEUED;
    await job.save();

    await enqueueScriptJob(String(job._id));

    res.json({ message: 'Job resumed successfully', status: JOB_STATUS.QUEUED });
  } catch (err) {
    next(err);
  }
}

// ─── RETRY JOB ──────────────────────────────────────────────────────────────
export async function retryJob(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status !== JOB_STATUS.FAILED) {
      return res.status(400).json({ error: 'Only failed jobs can be retried' });
    }

    if (job.retryCount >= 3) {
      return res.status(400).json({ error: 'Job has reached the maximum number of manual retries' });
    }

    // Clear errors and increment retry
    job.error = null;
    job.failureReason = null;
    job.retryCount += 1;
    job.status = JOB_STATUS.QUEUED;
    await job.save();

    await clearJobSignal(job._id);
    await enqueueScriptJob(String(job._id));

    res.json({ message: 'Job queued for retry', status: JOB_STATUS.QUEUED });
  } catch (err) {
    next(err);
  }
}

// ─── RETRY SCENE ──────────────────────────────────────────────────────────────
export async function retryScene(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const scene = await Scene.findOne({ _id: req.params.sceneId, jobId: req.params.id });
    if (!scene) return res.status(404).json({ error: 'Scene not found' });

    // Force set the scene status to pending and clear error so that worker processes it
    scene.status = SCENE_STATUS.PENDING;
    scene.error = null;
    await scene.save();

    // If the job is currently not actively running, set status to queued and queue it
    const activeStatuses = [
      JOB_STATUS.QUEUED, JOB_STATUS.PREPARING, JOB_STATUS.ANALYZING, 
      JOB_STATUS.SCENE_GENERATION, JOB_STATUS.MEDIA_GENERATION, 
      JOB_STATUS.ASSEMBLING, JOB_STATUS.OPTIMIZING
    ];

    if (!activeStatuses.includes(job.status)) {
      job.status = JOB_STATUS.QUEUED;
      job.error = null;
      job.failureReason = null;
      await job.save();

      await clearJobSignal(job._id);
      await enqueueScriptJob(String(job._id));
    }

    res.json({ 
      message: 'Scene queued for retry', 
      sceneStatus: SCENE_STATUS.PENDING, 
      jobStatus: job.status 
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE JOB ──────────────────────────────────────────────────────────────
export async function deleteJob(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Send a delete signal in case worker is currently actively writing files
    const stoppableStatuses = [
      JOB_STATUS.QUEUED, JOB_STATUS.PREPARING, JOB_STATUS.ANALYZING, 
      JOB_STATUS.SCENE_GENERATION, JOB_STATUS.MEDIA_GENERATION, 
      JOB_STATUS.ASSEMBLING, JOB_STATUS.OPTIMIZING
    ];
    if (stoppableStatuses.includes(job.status)) {
      await setJobSignal(job._id, 'delete');
      // Wait a moment for worker to abort
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Delete all VPS files first
    await deleteJobFiles(String(job._id));

    // Delete all DB records
    await Promise.all([
      Job.deleteOne({ _id: job._id }),
      Scene.deleteMany({ jobId: job._id }),
      Asset.deleteMany({ jobId: job._id }),
      JobLog.deleteMany({ jobId: job._id }),
    ]);

    // Clear any lingering signals
    await clearJobSignal(job._id);

    // Update user storage stats
    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: -(job.fileSize || 0) } });

    res.json({ message: 'Job and all associated files deleted successfully' });
  } catch (err) {
    next(err);
  }
}
