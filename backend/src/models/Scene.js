import mongoose from 'mongoose';
import { SCENE_STATUS } from '../config/constants.js';

const sceneSchema = new mongoose.Schema(
  {
    jobId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    sceneNumber: { type: Number, required: true },

    narration:      { type: String, default: '' },
    imagePrompt:    { type: String, default: '' },
    videoPrompt:    { type: String, default: '' },
    enrichedPrompt: { type: String, default: '' },
    characterId:    { type: String, default: null },
    environmentId:  { type: String, default: null },
    directorNote:   { type: String, default: '' },
    duration:       { type: Number, default: 8 },   // seconds

    // ── Film Mode Fields ─────────────────────────────────────────
    // Action type — what kind of motion/performance is in this scene
    actionType: {
      type: String,
      enum: ['establishing', 'walking', 'running', 'talking', 'fighting',
             'crying', 'riding', 'flying', 'celebrating', 'sneaking',
             'dying', 'transition', 'other'],
      default: 'establishing'
    },
    actionDescription: { type: String, default: '' },  // plain-English action
    cameraType:        { type: String, default: 'medium_wide' },

    // Characters present in this scene
    characterNames: [{ type: String }],               // character names (from screenplay)
    filmCharacterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FilmCharacter' }],

    // Per-character dialogue lines (for lip sync)
    dialogue: [{
      speaker:    { type: String },
      line:       { type: String },
      audioUrl:   { type: String, default: null },  // ElevenLabs generated audio
      lipSyncUrl: { type: String, default: null },  // MuseTalk/SyncLabs synced video
    }],

    // Emotion and story context
    emotion:    { type: String, default: 'neutral' },
    intensity:  { type: Number, min: 1, max: 10, default: 5 },
    location:   { type: String, default: '' },   // "INT. THRONE ROOM - NIGHT"
    act:        { type: Number, default: 1 },
    chapter:    { type: Number, default: 1 },   // which chapter batch

    // Transition to next scene
    transitionOut: {
      type: String,
      enum: ['cut', 'fade', 'dissolve', 'wipe', 'none'],
      default: 'cut'
    },
    lipSync: {
      required:       { type: Boolean, default: false },
      audioUrl:       { type: String, default: null },
      syncedVideoUrl: { type: String, default: null },
      syncedVideoKey: { type: String, default: null },
      status:         { type: String, enum: ['pending', 'processing', 'done', 'skipped'], default: 'pending' }
    },
    revisions: [{
      version:   { type: Number },
      imagePath: { type: String },
      videoPath: { type: String },
      prompt:    { type: String },
      createdAt: { type: Date, default: Date.now }
    }],

    status:       {
      type:    String,
      enum:    Object.values(SCENE_STATUS),
      default: SCENE_STATUS.PENDING,
    },

    planningDecision: {
      action:  { type: String, enum: ['reuse', 'generate', 'animate', 'image_only', 'skip', 'stock'], default: 'generate' },
      details: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    plannerStatus: {
      type:    String,
      enum:    ['pending', 'planned', 'skipped'],
      default: 'pending'
    },

    imagePath:   { type: String, default: null },
    videoPath:   { type: String, default: null },
    audioPath:   { type: String, default: null },


    retryCount:  { type: Number, default: 0 },
    error:       { type: String, default: null },
  },
  { timestamps: true },
);

// Compound index for efficient batch queries: "give me all pending scenes for job X in order"
sceneSchema.index({ jobId: 1, sceneNumber: 1 });
sceneSchema.index({ jobId: 1, status: 1 });

export default mongoose.model('Scene', sceneSchema);
