import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import {
  createJob, getHistory, getJobDetail,
  getJobStatus, getJobLogs, getJobScenes,
  streamVideo, streamThumbnail, deleteJob,
  streamSceneImage, streamSceneVideo,
  streamCharacterLockImage, streamEnvironmentLockImage,
  stopJob, resumeJob, retryJob, retryScene,
  regenerateCharacterLock, regenerateEnvironmentLock,
} from '../controllers/jobController.js';
import editorRoutes from './editor.js';

const router = Router();

// Create a new job (multipart/form-data)
router.post('/', upload.array('files', 5), createJob);

// History + listing
router.get('/', getHistory);

// Specific job
router.get('/:id',           getJobDetail);
router.get('/:id/status',    getJobStatus);
router.get('/:id/logs',      getJobLogs);
router.get('/:id/scenes',    getJobScenes);
router.get('/:id/stream',    streamVideo);
router.get('/:id/thumbnail', streamThumbnail);
router.delete('/:id',        deleteJob);
router.post('/:id/stop',     stopJob);
router.post('/:id/resume',   resumeJob);
router.post('/:id/retry',    retryJob);

// Consistency lock assets
router.get('/:id/characters/:characterName/image', streamCharacterLockImage);
router.post('/:id/characters/:characterName/regenerate', regenerateCharacterLock);
router.get('/:id/environments/:locationId/image',  streamEnvironmentLockImage);
router.post('/:id/environments/:locationId/regenerate', regenerateEnvironmentLock);

// Per-scene media streaming
router.get('/:id/scenes/:sceneId/image', streamSceneImage);
router.get('/:id/scenes/:sceneId/video', streamSceneVideo);
router.post('/:id/scenes/:sceneId/retry', retryScene);

// CapCut-style in-app film editor
router.use('/:id/editor', editorRoutes);

export default router;
