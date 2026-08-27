import express from 'express';
import FilmCharacter from '../models/FilmCharacter.js';
import {
  compileCharacterSeedPrompt,
  refreshCharacterSeedPrompt
} from '../services/characterConsistencyService.js';
import { upload } from '../middleware/upload.js';
import { uploadToCloud, getSignedUrl } from '../services/storageService.js';
import fs from 'fs';
import axios from 'axios';

const router = express.Router();

// ── List all characters for a workspace ──────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const filter = { workspaceId: req.workspaceId };
    if (projectId) filter.projectId = projectId;

    const characters = await FilmCharacter.find(filter).sort({ name: 1 });
    res.json({ characters });
  } catch (err) { next(err); }
});

// ── Get a single character ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json({ character });
  } catch (err) { next(err); }
});

// ── Stream character reference image (avoids expired signed URLs) ─────────────
// The frontend always requests this proxy URL instead of the raw R2 presigned URL.
// We re-generate a fresh signed URL from the stored cloud key on every request.
router.get('/:id/reference-image', async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });

    // Get a fresh signed URL or use the stored one
    let imageUrl = character.referenceImageUrl;
    if (character.referenceImageKey && typeof getSignedUrl === 'function') {
      try {
        imageUrl = await getSignedUrl(character.referenceImageKey, 3600);
      } catch { /* fall through to stored url */ }
    }

    if (!imageUrl) return res.status(404).json({ error: 'No reference image' });

    // Stream the image through our server to avoid CORS / expiry issues
    const response = await axios.get(imageUrl, { responseType: 'stream', timeout: 30000 });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    response.data.pipe(res);
  } catch (err) { next(err); }
});

// ── Create a new character ────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      name, role, age, gender, ethnicity,
      physicalDescription, clothingDefault, clothingByAct,
      personality, backstory, voiceId, voiceName, animationStyle,
      projectId,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Character name is required' });

    const character = new FilmCharacter({
      workspaceId: req.workspaceId,
      createdBy: req.userId,
      projectId: projectId || null,
      name, role, age, gender, ethnicity,
      physicalDescription, clothingDefault,
      clothingByAct: clothingByAct || {},
      personality, backstory,
      voiceId, voiceName, animationStyle,
    });

    // Auto-compile seed prompt from fields
    character.seedPrompt = compileCharacterSeedPrompt(character);
    await character.save();

    res.status(201).json({ character });
  } catch (err) { next(err); }
});

// ── Update a character ────────────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const allowed = [
      'name', 'role', 'age', 'gender', 'ethnicity',
      'physicalDescription', 'clothingDefault', 'clothingByAct',
      'personality', 'backstory', 'voiceId', 'voiceName', 'animationStyle',
    ];
    for (const field of allowed) {
      if (req.body[field] !== undefined) character[field] = req.body[field];
    }

    // If seedPrompt override is provided, use it; otherwise recompile
    if (req.body.seedPrompt !== undefined) {
      character.seedPrompt = req.body.seedPrompt;
    } else {
      character.seedPrompt = compileCharacterSeedPrompt(character);
    }

    await character.save();
    res.json({ character });
  } catch (err) { next(err); }
});

// ── Upload reference image for IP-Adapter ─────────────────────────────────────
router.post('/:id/reference-image', upload.single('file'), async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });

    // Expect file at req.file (from multer middleware on this route)
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const cloudKey = `workspaces/${req.workspaceId}/characters/${character._id}/reference.jpg`;
    const cloudUrl = await uploadToCloud(req.file.path, cloudKey, 'image/jpeg');

    // Cleanup temp upload
    fs.unlink(req.file.path, () => {});

    character.referenceImageUrl = cloudUrl;
    character.referenceImageKey = cloudKey;
    await character.save();

    res.json({ character, referenceImageUrl: cloudUrl });
  } catch (err) { next(err); }
});

// ── Delete a character ────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json({ message: 'Character deleted', characterId: req.params.id });
  } catch (err) { next(err); }
});

export default router;


