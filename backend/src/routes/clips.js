import express from 'express';
import {
  getClipsForProject,
  getClip,
  updateClip,
  deleteClip,
  approveClip,
  approveScene,
  generateClipPrompts,
  regenerateClipImage,
  regenerateClipVideo,
  generateProjectClips,
} from '../controllers/clipController.js';

const router = express.Router();

// Project-level: GET all clips grouped by scene/act
router.get('/project/:projectId', getClipsForProject);

// Generate clips from a screenplay (POST: triggers plan → clip creation)
router.post('/project/:projectId/generate', generateProjectClips);

// Scene-level approval
router.post('/scene/:sceneKey/approve', approveScene);

// Clip-level CRUD
router.get('/:id', getClip);
router.patch('/:id', updateClip);
router.delete('/:id', deleteClip);

// Clip-level actions
router.post('/:id/approve', approveClip);
router.post('/:id/generate-prompts', generateClipPrompts);
router.post('/:id/regenerate-image', regenerateClipImage);
router.post('/:id/regenerate-video', regenerateClipVideo);

export default router;