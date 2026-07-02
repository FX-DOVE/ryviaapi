import fs from 'fs';
import path from 'path';
import Project from '../models/Project.js';
import Character from '../models/Character.js';
import Environment from '../models/Environment.js';
import BrandKit from '../models/BrandKit.js';
import CreativeProfile from '../models/CreativeProfile.js';
import Job from '../models/Job.js';
import { uploadToCloud } from '../services/storageService.js';

// ─── PROJECTS CRUD ───────────────────────────────────────────────────────────

export async function createProject(req, res, next) {
  try {
    const { name, description, creativeProfileId, brandKitId, style, creativeLock } = req.body;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace ID is required' });
    if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });

    const project = await Project.create({
      userId: req.user._id,
      workspaceId,
      name: name.trim(),
      description: description || '',
      creativeProfileId: creativeProfileId || null,
      brandKitId: brandKitId || null,
      style: style || {
        preset: 'cinematic',
        camera: 'hollywood',
        lighting: 'golden_hour',
        colorGrade: 'netflix',
        motionLevel: 'medium',
        emotion: 'neutral',
        musicStyle: 'documentary'
      },
      creativeLock: creativeLock || {
        enabled: false,
        lockFaces: true,
        lockLocations: true,
        lockColorGrade: true,
        lockCamera: true,
        lockLighting: true
      }
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}

export async function listProjects(req, res, next) {
  try {
    const workspaceId = req.workspaceId;
    const projects = await Project.find({ workspaceId, status: 'active' }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    next(err);
  }
}

export async function getProject(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req, res, next) {
  try {
    const { name, description, creativeProfileId, brandKitId, style, creativeLock, status } = req.body;
    const project = await Project.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (name?.trim()) project.name = name.trim();
    if (description !== undefined) project.description = description;
    if (creativeProfileId !== undefined) project.creativeProfileId = creativeProfileId;
    if (brandKitId !== undefined) project.brandKitId = brandKitId;
    if (style !== undefined) project.style = { ...project.style, ...style };
    if (creativeLock !== undefined) project.creativeLock = { ...project.creativeLock, ...creativeLock };
    if (status !== undefined) project.status = status;

    await project.save();
    res.json(project);
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    project.status = 'archived';
    await project.save();
    res.json({ message: 'Project archived successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── CHARACTERS CRUD (Workspace-scoped) ──────────────────────────────────────

export async function getWorkspaceCharacters(req, res, next) {
  try {
    const characters = await Character.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
    res.json(characters);
  } catch (err) {
    next(err);
  }
}

export async function addCharacter(req, res, next) {
  try {
    const { name, age, gender, description, clothingDescription, voiceStyle, emotion, seedPrompt } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Character name is required' });

    let referenceImageUrl = null;
    let referenceImageKey = null;

    if (req.file) {
      const workspaceId = req.workspaceId;
      const filename = `${Date.now()}_${req.file.originalname}`;
      referenceImageKey = `workspaces/${workspaceId}/characters/${filename}`;
      referenceImageUrl = await uploadToCloud(req.file.path, referenceImageKey, req.file.mimetype);
      // clean up local file
      fs.unlink(req.file.path, () => {});
    }

    const character = await Character.create({
      workspaceId: req.workspaceId,
      name: name.trim(),
      age: age || '',
      gender: gender || '',
      description: description || '',
      clothingDescription: clothingDescription || '',
      voiceStyle: voiceStyle || '',
      emotion: emotion || '',
      referenceImageUrl,
      referenceImageKey,
      seedPrompt: seedPrompt || ''
    });

    res.status(201).json(character);
  } catch (err) {
    next(err);
  }
}

export async function updateCharacter(req, res, next) {
  try {
    const { name, age, gender, description, clothingDescription, voiceStyle, emotion, seedPrompt } = req.body;
    const character = await Character.findOne({ _id: req.params.charId, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });

    if (name?.trim()) character.name = name.trim();
    if (age !== undefined) character.age = age;
    if (gender !== undefined) character.gender = gender;
    if (description !== undefined) character.description = description;
    if (clothingDescription !== undefined) character.clothingDescription = clothingDescription;
    if (voiceStyle !== undefined) character.voiceStyle = voiceStyle;
    if (emotion !== undefined) character.emotion = emotion;
    if (seedPrompt !== undefined) character.seedPrompt = seedPrompt;

    if (req.file) {
      const filename = `${Date.now()}_${req.file.originalname}`;
      const referenceImageKey = `workspaces/${req.workspaceId}/characters/${filename}`;
      const referenceImageUrl = await uploadToCloud(req.file.path, referenceImageKey, req.file.mimetype);
      character.referenceImageKey = referenceImageKey;
      character.referenceImageUrl = referenceImageUrl;
      fs.unlink(req.file.path, () => {});
    }

    await character.save();
    res.json(character);
  } catch (err) {
    next(err);
  }
}

export async function removeCharacter(req, res, next) {
  try {
    const character = await Character.findOneAndDelete({ _id: req.params.charId, workspaceId: req.workspaceId });
    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json({ message: 'Character removed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── ENVIRONMENTS CRUD (Workspace-scoped) ────────────────────────────────────

export async function getWorkspaceEnvironments(req, res, next) {
  try {
    const environments = await Environment.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
    res.json(environments);
  } catch (err) {
    next(err);
  }
}

export async function addEnvironment(req, res, next) {
  try {
    const { name, description, timeOfDay, weather, seedPrompt } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Environment name is required' });

    const referenceImageUrls = [];
    const referenceImageKeys = [];

    const files = req.files || [];
    for (const file of files) {
      const filename = `${Date.now()}_${file.originalname}`;
      const key = `workspaces/${req.workspaceId}/environments/${filename}`;
      const url = await uploadToCloud(file.path, key, file.mimetype);
      referenceImageKeys.push(key);
      referenceImageUrls.push(url);
      fs.unlink(file.path, () => {});
    }

    const env = await Environment.create({
      workspaceId: req.workspaceId,
      name: name.trim(),
      description: description || '',
      timeOfDay: timeOfDay || 'daylight',
      weather: weather || 'clear',
      referenceImageUrls,
      referenceImageKeys,
      seedPrompt: seedPrompt || ''
    });

    res.status(201).json(env);
  } catch (err) {
    next(err);
  }
}

export async function updateEnvironment(req, res, next) {
  try {
    const { name, description, timeOfDay, weather, seedPrompt } = req.body;
    const env = await Environment.findOne({ _id: req.params.envId, workspaceId: req.workspaceId });
    if (!env) return res.status(404).json({ error: 'Environment not found' });

    if (name?.trim()) env.name = name.trim();
    if (description !== undefined) env.description = description;
    if (timeOfDay !== undefined) env.timeOfDay = timeOfDay;
    if (weather !== undefined) env.weather = weather;
    if (seedPrompt !== undefined) env.seedPrompt = seedPrompt;

    if (req.files?.length > 0) {
      const files = req.files || [];
      for (const file of files) {
        const filename = `${Date.now()}_${file.originalname}`;
        const key = `workspaces/${req.workspaceId}/environments/${filename}`;
        const url = await uploadToCloud(file.path, key, file.mimetype);
        env.referenceImageKeys.push(key);
        env.referenceImageUrls.push(url);
        fs.unlink(file.path, () => {});
      }
    }

    await env.save();
    res.json(env);
  } catch (err) {
    next(err);
  }
}

export async function removeEnvironment(req, res, next) {
  try {
    const env = await Environment.findOneAndDelete({ _id: req.params.envId, workspaceId: req.workspaceId });
    if (!env) return res.status(404).json({ error: 'Environment not found' });
    res.json({ message: 'Environment removed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── CREATIVE PROFILES CRUD ──────────────────────────────────────────────────

export async function getCreativeProfiles(req, res, next) {
  try {
    const profiles = await CreativeProfile.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
    res.json(profiles);
  } catch (err) {
    next(err);
  }
}

export async function createCreativeProfile(req, res, next) {
  try {
    const { name, description, style, renderSettings, promptModifiers } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Profile name is required' });

    const profile = await CreativeProfile.create({
      workspaceId: req.workspaceId,
      name: name.trim(),
      description: description || '',
      style: style || {},
      renderSettings: renderSettings || {},
      promptModifiers: promptModifiers || []
    });

    res.status(201).json(profile);
  } catch (err) {
    next(err);
  }
}

export async function updateCreativeProfile(req, res, next) {
  try {
    const { name, description, style, renderSettings, promptModifiers } = req.body;
    const profile = await CreativeProfile.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!profile) return res.status(404).json({ error: 'Creative profile not found' });

    if (name?.trim()) profile.name = name.trim();
    if (description !== undefined) profile.description = description;
    if (style !== undefined) profile.style = { ...profile.style, ...style };
    if (renderSettings !== undefined) profile.renderSettings = { ...profile.renderSettings, ...renderSettings };
    if (promptModifiers !== undefined) profile.promptModifiers = promptModifiers;

    await profile.save();
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function deleteCreativeProfile(req, res, next) {
  try {
    const profile = await CreativeProfile.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!profile) return res.status(404).json({ error: 'Creative profile not found' });
    res.json({ message: 'Creative profile deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── BRAND KITS CRUD ─────────────────────────────────────────────────────────

export async function getBrandKits(req, res, next) {
  try {
    const kits = await BrandKit.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
    res.json(kits);
  } catch (err) {
    next(err);
  }
}

export async function createBrandKit(req, res, next) {
  try {
    const { name, watermark, typography, preferredVoice, preferredMusicStyle } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Brand kit name is required' });

    let logoUrl = null;
    let logoKey = null;
    let introUrl = null;
    let introKey = null;
    let outroUrl = null;
    let outroKey = null;

    const files = req.files || {};
    const workspaceId = req.workspaceId;

    if (files.logo?.[0]) {
      const f = files.logo[0];
      logoKey = `workspaces/${workspaceId}/brandkits/logo_${Date.now()}_${f.originalname}`;
      logoUrl = await uploadToCloud(f.path, logoKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    if (files.intro?.[0]) {
      const f = files.intro[0];
      introKey = `workspaces/${workspaceId}/brandkits/intro_${Date.now()}_${f.originalname}`;
      introUrl = await uploadToCloud(f.path, introKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    if (files.outro?.[0]) {
      const f = files.outro[0];
      outroKey = `workspaces/${workspaceId}/brandkits/outro_${Date.now()}_${f.originalname}`;
      outroUrl = await uploadToCloud(f.path, outroKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    const kit = await BrandKit.create({
      workspaceId,
      name: name.trim(),
      logoUrl,
      logoKey,
      introUrl,
      introKey,
      outroUrl,
      outroKey,
      watermark: watermark ? JSON.parse(watermark) : undefined,
      typography: typography ? JSON.parse(typography) : undefined,
      preferredVoice,
      preferredMusicStyle
    });

    res.status(201).json(kit);
  } catch (err) {
    next(err);
  }
}

export async function updateBrandKit(req, res, next) {
  try {
    const { name, watermark, typography, preferredVoice, preferredMusicStyle } = req.body;
    const kit = await BrandKit.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

    if (name?.trim()) kit.name = name.trim();
    if (preferredVoice !== undefined) kit.preferredVoice = preferredVoice;
    if (preferredMusicStyle !== undefined) kit.preferredMusicStyle = preferredMusicStyle;
    if (watermark) kit.watermark = typeof watermark === 'string' ? JSON.parse(watermark) : watermark;
    if (typography) kit.typography = typeof typography === 'string' ? JSON.parse(typography) : typography;

    const files = req.files || {};
    const workspaceId = req.workspaceId;

    if (files.logo?.[0]) {
      const f = files.logo[0];
      kit.logoKey = `workspaces/${workspaceId}/brandkits/logo_${Date.now()}_${f.originalname}`;
      kit.logoUrl = await uploadToCloud(f.path, kit.logoKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    if (files.intro?.[0]) {
      const f = files.intro[0];
      kit.introKey = `workspaces/${workspaceId}/brandkits/intro_${Date.now()}_${f.originalname}`;
      kit.introUrl = await uploadToCloud(f.path, kit.introKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    if (files.outro?.[0]) {
      const f = files.outro[0];
      kit.outroKey = `workspaces/${workspaceId}/brandkits/outro_${Date.now()}_${f.originalname}`;
      kit.outroUrl = await uploadToCloud(f.path, kit.outroKey, f.mimetype);
      fs.unlink(f.path, () => {});
    }

    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
}

export async function deleteBrandKit(req, res, next) {
  try {
    const kit = await BrandKit.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!kit) return res.status(404).json({ error: 'Brand kit not found' });
    res.json({ message: 'Brand kit deleted successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── REFERENCE POOL AND NOTES ───────────────────────────────────────────────

export async function uploadReferenceImages(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const files = req.files || [];
    for (const file of files) {
      const filename = `${Date.now()}_${file.originalname}`;
      const key = `projects/${project._id}/references/${filename}`;
      const url = await uploadToCloud(file.path, key, file.mimetype);
      project.referenceImages.push({
        key,
        url,
        label: file.originalname,
        uploadedAt: new Date()
      });
      fs.unlink(file.path, () => {});
    }

    await project.save();
    res.json(project.referenceImages);
  } catch (err) {
    next(err);
  }
}

export async function deleteReference(req, res, next) {
  try {
    const project = await Project.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    project.referenceImages = project.referenceImages.filter(img => img.key !== req.params.key);
    await project.save();
    res.json({ message: 'Reference image removed successfully' });
  } catch (err) {
    next(err);
  }
}

export async function updateDirectorNotes(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.directorNotes = req.body; // array of [{ sceneIndex, note }]
    await job.save();
    res.json(job.directorNotes);
  } catch (err) {
    next(err);
  }
}

export async function applyStyleToJob(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.styleConfig = req.body;
    await job.save();
    res.json(job.styleConfig);
  } catch (err) {
    next(err);
  }
}

export default {
  createProject, listProjects, getProject, updateProject, deleteProject,
  getWorkspaceCharacters, addCharacter, updateCharacter, removeCharacter,
  getWorkspaceEnvironments, addEnvironment, updateEnvironment, removeEnvironment,
  getCreativeProfiles, createCreativeProfile, updateCreativeProfile, deleteCreativeProfile,
  getBrandKits, createBrandKit, updateBrandKit, deleteBrandKit,
  uploadReferenceImages, deleteReference, updateDirectorNotes, applyStyleToJob
};
