import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import c from '../controllers/projectController.js';

const router = Router();

// Apply auth middleware to all project and workspace library routes
router.use(authMiddleware);

// Projects routes
router.post('/', c.createProject);
router.get('/', c.listProjects);
router.get('/:id', c.getProject);
router.put('/:id', c.updateProject);
router.delete('/:id', c.deleteProject);

// Workspace Characters routes
router.get('/workspace/characters', c.getWorkspaceCharacters);
router.post('/workspace/characters', upload.single('referenceImage'), c.addCharacter);
router.put('/workspace/characters/:charId', upload.single('referenceImage'), c.updateCharacter);
router.delete('/workspace/characters/:charId', c.removeCharacter);

// Workspace Environments routes
router.get('/workspace/environments', c.getWorkspaceEnvironments);
router.post('/workspace/environments', upload.array('referenceImages', 5), c.addEnvironment);
router.put('/workspace/environments/:envId', upload.array('referenceImages', 5), c.updateEnvironment);
router.delete('/workspace/environments/:envId', c.removeEnvironment);

// Creative Profiles routes
router.get('/workspace/creative-profiles', c.getCreativeProfiles);
router.post('/workspace/creative-profiles', c.createCreativeProfile);
router.put('/workspace/creative-profiles/:id', c.updateCreativeProfile);
router.delete('/workspace/creative-profiles/:id', c.deleteCreativeProfile);

// Brand Kits routes
router.get('/workspace/brand-kits', c.getBrandKits);
router.post('/workspace/brand-kits', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'intro', maxCount: 1 },
  { name: 'outro', maxCount: 1 }
]), c.createBrandKit);
router.put('/workspace/brand-kits/:id', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'intro', maxCount: 1 },
  { name: 'outro', maxCount: 1 }
]), c.updateBrandKit);
router.delete('/workspace/brand-kits/:id', c.deleteBrandKit);

// References & notes
router.post('/:id/references', upload.array('referenceImages', 10), c.uploadReferenceImages);
router.delete('/:id/references/:key', c.deleteReference);
router.put('/:id/director-notes', c.updateDirectorNotes);
router.post('/:id/apply-style', c.applyStyleToJob);

export default router;
