import Clip from '../models/Clip.js';
import Project from '../models/Project.js';
import Screenplay from '../models/Screenplay.js';
import { reason } from '../providers/reasoningService.js';
import { mediaRouterService } from '../services/mediaRouterService.js';
import { logInfo, logError } from '../services/logService.js';

export async function getClipsForProject(req, res) {
  try {
    const { projectId } = req.params;
    const clips = await Clip.find({ projectId }).sort({ episodeNumber: 1, actNumber: 1, sceneNumber: 1, clipNumber: 1 });
    const project = await Project.findById(projectId);
    res.json({ clips, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getClip(req, res) {
  try {
    const clip = await Clip.findById(req.params.id);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    res.json({ clip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateClip(req, res) {
  try {
    const { id } = req.params;
    const allowed = [
      'imagePrompt', 'videoPrompt', 'voicePrompt', 'imageEditPrompt',
      'cameraShot', 'cameraAngle', 'cameraMovement',
      'actionDescription', 'dialogue', 'duration', 'lipSyncRequired'
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    // Determine if image change stales downstream video
    if (updates.imagePrompt || updates.imageEditPrompt) {
      if (!updates.videoStatus) updates.videoStatus = 'stale';
    }

    const clip = await Clip.findByIdAndUpdate(id, updates, { new: true });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    res.json({ clip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteClip(req, res) {
  try {
    await Clip.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveClip(req, res) {
  try {
    const clip = await Clip.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    res.json({ clip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveScene(req, res) {
  try {
    const { sceneKey } = req.params;
    const [, actStr,, sceneStr] = sceneKey.match(/Act(\d+)-Scene(\d+)/) || [];
    const actNumber = Number(actStr);
    const sceneNumber = Number(sceneStr);
    if (!actNumber || !sceneNumber) return res.status(400).json({ error: 'Invalid sceneKey format' });

    await Clip.updateMany({ actNumber, sceneNumber }, { status: 'approved' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function generateClipPrompts(req, res) {
  try {
    const clip = await Clip.findById(req.params.id);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });

    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'No edit instruction provided' });

    // Use the reasoning service to generate updated prompts
    const systemPrompt = `You are a film director's AI assistant. You will receive a natural language edit request and the current clip details, and must return ONLY a JSON object with fields to update.`;
    const userPrompt = `
Current clip:
- Action: ${clip.actionDescription}
- Image Prompt: ${clip.imagePrompt}
- Video Prompt: ${clip.videoPrompt}
- Camera: ${clip.cameraShot} / ${clip.cameraAngle} / ${clip.cameraMovement}

User edit request: "${input}"

Return a JSON object with only the fields that need to change. For example:
{"imagePrompt": "...", "videoPrompt": "..."} or {"cameraShot": "Close-up"}
Do NOT include unchanged fields.
`;

    const result = await reason({ systemPrompt, userPrompt, purpose: 'clip-prompt-edit' });

    // Parse and apply updates
    let updates = {};
    try {
      const cleaned = result.text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      updates = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(500).json({ error: 'AI did not return valid JSON', raw: result.text.slice(0, 500) });
    }

    const updatedClip = await Clip.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ clip: updatedClip, changedFields: Object.keys(updates) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function regenerateClipImage(req, res) {
  try {
    const clip = await Clip.findByIdAndUpdate(req.params.id, { imageStatus: 'pending', status: 'pending' }, { new: true });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    // TODO: dispatch to GPU worker for just this clip's image
    res.json({ clip, message: 'Image regeneration queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function regenerateClipVideo(req, res) {
  try {
    const clip = await Clip.findByIdAndUpdate(req.params.id, { videoStatus: 'pending', status: 'pending' }, { new: true });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    // TODO: dispatch to GPU worker for just this clip's video
    res.json({ clip, message: 'Video regeneration queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function generateProjectClips(req, res) {
  try {
    const { projectId } = req.params;
    const screenplay = await Screenplay.findOne({ projectId }).sort({ createdAt: -1 });
    if (!screenplay) return res.status(404).json({ error: 'No screenplay found for project' });

    // Create Clip documents from scenes in the screenplay
    const clips = [];
    for (const scene of screenplay.scenes || []) {
      const actNumber = scene.act || 1;
      const sceneNumber = scene.sceneNumber || 1;

      // Split each scene into 8-second clips based on beat count
      const beats = scene.beats || [{ action: scene.actionDescription, dialogue: scene.dialogue }];
      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        clips.push({
          projectId,
          screenplayId: screenplay._id,
          actNumber,
          sceneNumber,
          clipNumber: i + 1,
          duration: 8,
          characters: scene.characterNames || [],
          actionDescription: beat.action || '',
          dialogue: beat.dialogue ? (typeof beat.dialogue === 'string' ? [{ speaker: '', line: beat.dialogue }] : beat.dialogue) : [],
          location: scene.location,
          environment: scene.timeOfDay,
          cameraShot: scene.cameraType || 'Medium Shot',
          imagePrompt: scene.imagePrompt || '',
          videoPrompt: scene.videoPrompt || '',
          generationMethod: 'image2video',
          status: 'pending',
          imageStatus: 'pending',
          videoStatus: 'pending',
        });
      }
    }

    const insertedClips = await Clip.insertMany(clips, { ordered: false });
    res.json({ clips: insertedClips, count: insertedClips.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}