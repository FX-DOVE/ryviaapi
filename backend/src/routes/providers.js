import express from 'express';
import {
  listProviders,
  createProvider,
  testProvider,
  reorderProviders,
  updateProvider,
  deleteProvider,
} from '../controllers/providerController.js';

const router = express.Router();

// GET    /api/providers              — list all providers
router.get('/',           listProviders);

// POST   /api/providers              — add custom provider (test-connects first)
router.post('/',          createProvider);

// PUT    /api/providers/reorder      — bulk update priority order
// NOTE: 'reorder' must be defined BEFORE '/:id' to avoid Express matching 'reorder' as an ID
router.put('/reorder',    reorderProviders);

// POST   /api/providers/:id/test     — re-test an existing provider's connection
router.post('/:id/test',  testProvider);

// PATCH  /api/providers/:id          — toggle enabled / update name / update key
router.patch('/:id',      updateProvider);

// DELETE /api/providers/:id          — remove (custom only)
router.delete('/:id',     deleteProvider);

export default router;
