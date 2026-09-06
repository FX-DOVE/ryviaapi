import express from 'express';
import FilmCharacter from '../models/FilmCharacter.js';
import {
  compileCharacterSeedPrompt,
  refreshCharacterSeedPrompt
} from '../services/characterConsistencyService.js';
import { upload } from '../middleware/upload.js';
import { uploadToCloud, getSignedUrl } from '../services/storageService.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import mongoose from 'mongoose';


const router = express.Router();

/**
 * List/get responses must not expose expired R2/S3 presigned URLs.
 * Prefer the stable API proxy when a reference exists; workers still refresh
 * signed URLs from referenceImageKey via storageService when they need them.
 */
function hasFilmCharacterReference(character) {
  if (!character) return false;
  if (character.referenceImageKey) return true;
  const url = character.referenceImageUrl;
  if (!url || typeof url !== 'string') return false;
  // Local / relative paths still count as a reference existing
  if (url.startsWith('/') || url.startsWith('mock-storage')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  return Boolean(url);
}

function toPublicFilmCharacter(character) {
  const obj = typeof character?.toObject === 'function'
    ? character.toObject()
    : { ...(character || {}) };
  const id = obj._id != null ? String(obj._id) : null;
  if (id && hasFilmCharacterReference(obj)) {
    obj.referenceImageUrl = `/api/v1/film-characters/${id}/reference-image`;
  } else if (obj.referenceImageUrl
    && (String(obj.referenceImageUrl).startsWith('http://')
      || String(obj.referenceImageUrl).startsWith('https://'))) {
    // Stale signed URL with no usable key — omit rather than return a dead link
    obj.referenceImageUrl = null;
  }
  return obj;
}


// Validate ObjectId for all routes containing :id parameter
router.param('id', (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: `Invalid character ID: ${id}` });
  }
  next();
});

// ── List all characters for a workspace ──────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const filter = { workspaceId: req.workspaceId };
    if (projectId) filter.projectId = projectId;

    const characters = await FilmCharacter.find(filter).sort({ name: 1 });
    res.json({ characters: characters.map(toPublicFilmCharacter) });
  } catch (err) { next(err); }
});

// ── Get a single character ────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const character = await FilmCharacter.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json({ character: toPublicFilmCharacter(character) });
  } catch (err) { next(err); }
});

// ── Stream character reference image (avoids expired signed URLs) ─────────────
// The frontend always requests this proxy URL instead of the raw R2 presigned URL.
// We stream from disk if cached locally, or refresh/stream from cloud storage.
router.get('/:id/reference-image', async (req, res, next) => {
  try {
    // Media <img> tags do not carry workspace auth headers, so look up by global _id
    const character = await FilmCharacter.findById(req.params.id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    // 1. If stored locally in mock-storage on disk, stream directly
    if (character.referenceImageKey) {
      const localDiskPath = path.join(process.cwd(), 'storage', 'public', 'mock-storage', character.referenceImageKey);
      if (fs.existsSync(localDiskPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(localDiskPath).pipe(res);
      }
    }

    // 2. Refresh signed URL from cloud key if available
    let imageUrl = character.referenceImageUrl;
    if (character.referenceImageKey && typeof getSignedUrl === 'function') {
      try {
        const fresh = await getSignedUrl(character.referenceImageKey, 86400);
        if (fresh && fresh.startsWith('http')) {
          imageUrl = fresh;
        }
      } catch { /* fall back to stored url */ }
    }

    if (!imageUrl) return res.status(404).json({ error: 'No reference image' });

    // 3. If it's a local relative path, stream from disk
    if (imageUrl.startsWith('/mock-storage') || imageUrl.startsWith('mock-storage')) {
      const rel = imageUrl.replace(/^\/?mock-storage\//, '');
      const localPath = path.join(process.cwd(), 'storage', 'public', 'mock-storage', rel);
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(localPath).pipe(res);
      }
    }

    // 4. If remote URL (Cloudflare R2, AWS S3), stream via axios
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await axios.get(imageUrl, { responseType: 'stream', timeout: 30000 });
      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return response.data.pipe(res);
    }

    res.status(404).json({ error: 'Reference image could not be loaded' });
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

    res.status(201).json({ character: toPublicFilmCharacter(character) });
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
    res.json({ character: toPublicFilmCharacter(character) });
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
    const localPath = req.file.path;

    try {
      const { analyzeCharacterReferenceImage } = await import('../services/characterVisionService.js');
      const analysis = await analyzeCharacterReferenceImage({
        imagePathOrUrl: localPath,
        characterName: character.name,
        role: character.role,
        physicalDescription: character.physicalDescription,
        backstory: character.backstory,
      });
      character.visualAnalysis = analysis;
      const appear = analysis?.character_appearance || {};
      if (!character.ethnicity && appear.ethnicity) character.ethnicity = appear.ethnicity;
      if (!character.physicalDescription && (appear.facial_structure || appear.hair)) {
        character.physicalDescription = [
          appear.ethnicity,
          appear.age ? `about ${appear.age}` : '',
          appear.facial_structure,
          appear.hair,
          appear.eyes,
          appear.body_build,
        ].filter(Boolean).join(', ');
      }
    } catch (visErr) {
      console.warn(`[FilmCharacters] Vision analysis skipped: ${visErr.message}`);
    }

    const cloudUrl = await uploadToCloud(localPath, cloudKey, 'image/jpeg');
    fs.unlink(localPath, () => {});

    character.referenceImageUrl = cloudUrl;
    character.referenceImageKey = cloudKey;
    await character.save();

    // Keep top-level signed URL for immediate post-upload use; public character
    // payload uses the non-expiring proxy so list/get stay consistent.
    res.json({ character: toPublicFilmCharacter(character), referenceImageUrl: cloudUrl });
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


