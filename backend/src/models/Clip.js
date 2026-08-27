import mongoose from 'mongoose';
import { SCENE_STATUS } from '../config/constants.js';

const clipSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  screenplayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Screenplay' },

  // Hierarchy
  episodeNumber: { type: Number, default: 1 },
  actNumber: { type: Number, required: true },
  sceneNumber: { type: Number, required: true },
  clipNumber: { type: Number, required: true },
  duration: { type: Number, default: 8 },

  // Story / Content
  characters: [{ type: String }],
  actionDescription: { type: String },
  dialogue: [{ speaker: String, line: String }],
  narration: { type: String },
  soundEffects: [{ type: String }],
  location: { type: String },
  environment: { type: String },
  continuityRequirements: { type: String },

  // Camera
  cameraShot: { type: String },      // e.g. "close-up", "wide shot"
  cameraAngle: { type: String },     // e.g. "low angle", "eye level"
  cameraMovement: { type: String },  // e.g. "static", "pan right", "slow zoom"

  // Generation Routing (Phase 6)
  generationMethod: {
    type: String,
    enum: ['text2image', 'image2image', 'image2video', 'video2video', 'text2video', 'reuse', 'stock'],
    default: 'image2video'
  },

  // Prompts
  imagePrompt: { type: String },
  imageEditPrompt: { type: String },
  videoPrompt: { type: String },
  voicePrompt: { type: String },
  lipSyncRequired: { type: Boolean, default: false },

  // Dependencies & Output
  previousClipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clip' },
  nextClipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clip' },
  referenceAssets: {
    characterLocks: [{ name: String, url: String }],
    environmentLock: { url: String },
    startFrame: { url: String },
    endFrame: { url: String },
    audioTrack: { url: String }
  },

  // Rendered Output Paths
  imagePath: { type: String },
  videoPath: { type: String },
  audioPath: { type: String },
  finalCompositionPath: { type: String },

  // Status
  status: { type: String, enum: Object.values(SCENE_STATUS), default: SCENE_STATUS.PENDING },
  imageStatus: { type: String, enum: ['pending', 'generating', 'done', 'failed', 'approved', 'stale'], default: 'pending' },
  videoStatus: { type: String, enum: ['pending', 'generating', 'done', 'failed', 'approved', 'stale'], default: 'pending' },
  audioStatus: { type: String, enum: ['pending', 'generating', 'done', 'failed', 'approved', 'stale'], default: 'pending' },

  error: { type: String },
  revisions: [{
    version: Number,
    imagePath: String,
    videoPath: String,
    createdAt: Date
  }]
}, { timestamps: true });

// Ensure correct ordering
clipSchema.index({ projectId: 1, episodeNumber: 1, actNumber: 1, sceneNumber: 1, clipNumber: 1 });

export default mongoose.models.Clip || mongoose.model('Clip', clipSchema);