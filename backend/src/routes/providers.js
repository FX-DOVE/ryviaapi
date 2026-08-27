import express from 'express';
import {
  listProviders,
  createProvider,
  testProvider,
  testAllProviders,
  reorderProviders,
  updateProvider,
  deleteProvider,
} from '../controllers/providerController.js';

const router = express.Router();

// GET    /api/providers              — list roles (legacy alias of /status)
router.get('/',            listProviders);

// GET    /api/providers/status       — what each model role is pointed at
router.get('/status',      listProviders);

// POST   /api/providers              — add custom provider (stub: removed)
router.post('/',           createProvider);

// POST   /api/providers/test         — probe every endpoint at once
router.post('/test',       testAllProviders);

// PUT    /api/providers/reorder      — bulk reorder (stub: removed)
// NOTE: literal routes must precede '/:id'/'/:type' so they are not matched as a param.
router.put('/reorder',     reorderProviders);

// POST   /api/providers/:type/test   — probe one of reasoning | video | image
// The controller reads req.params.type, so the param MUST be named :type
// (it was ':id', which made req.params.type undefined → "Unknown provider type").
router.post('/:type/test', testProvider);

// PATCH  /api/providers/:id          — update (stub: removed)
router.patch('/:id',       updateProvider);

// DELETE /api/providers/:id          — remove (stub: removed)
router.delete('/:id',      deleteProvider);

export default router;
