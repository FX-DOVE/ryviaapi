import mongoose from 'mongoose';
import { SCENE_STATUS, SEGMENT_STATUS } from '../config/constants.js';

const beatSchema = new mongoose.Schema({
  beatNumber:       { type: Number },
  globalBeatNumber: { type: Number },
  action:           { type: String, default: '' },
  dialogue:         { type: String, default: '' },
  speaker:          { type: String, default: '' },
  expression:       { type: String, default: '' },
  mood:             { type: String, default: '' },
  cameraAngle:      { type: String, default: 'medium_wide' },
  cameraMovement:   { type: String, default: 'static' },
  strategy:         { type: String, enum: ['anchor', 'continuation', 'angle_change', 'frame_bridge', 'reaction'], default: 'anchor' },
  duration:         { type: Number, default: 8 },

  // ── Studio Directing & Acting Payload ────────────────────────
  gaze:                { type: String, default: '' },
  voiceDirection:      { type: String, default: '' },
  audioCues:           { type: String, default: '' },
  startFrameVisual:    { type: String, default: '' },
  endFrameVisual:      { type: String, default: '' },
  emotionalContinuity: { type: String, default: '' },

  // ── Continuity payload (drives the image prompts) ────────────
  props:                  [{ type: String }],
  accessories:            { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  characterState:         { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  continuityFromPrevious: { type: String, default: '' },
}, { _id: false });

const segmentSchema = new mongoose.Schema({
  segmentNumber:  { type: Number },
  beatNumber:     { type: Number },
  strategy:       { type: String, default: 'anchor' },
  keyframePath:   { type: String, default: null },
  videoPath:      { type: String, default: null },
  duration:       { type: Number, default: 8 },
  status:         { type: String, enum: Object.values(SEGMENT_STATUS), default: SEGMENT_STATUS.PENDING },
  error:          { type: String, default: null },
}, { _id: false });

const sceneSchema = new mongoose.Schema(
  {
    jobId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    sceneNumber: { type: Number, required: true },

    // ── Director Plan Fields ────────────────────────────────────
    narration:      { type: String, default: '' },
    imagePrompt:    { type: String, default: '' },
    videoPrompt:    { type: String, default: '' },
    enrichedPrompt: { type: String, default: '' },

    // Scene metadata
    actionDescription: { type: String, default: '' },
    location:          { type: String, default: '' },
    // Join key onto directorPlan.environments[].locationId. The environment lock
    // is stored under this key, so without it the lock never resolves and every
    // scene re-invents its own version of the same room.
    locationId:        { type: String, default: '' },
    timeOfDay:         { type: String, default: '' },
    emotion:           { type: String, default: 'neutral' },
    intensity:         { type: Number, min: 1, max: 10, default: 5 },
    act:               { type: Number, default: 1 },
    chapter:           { type: Number, default: 1 },

    // ── Screenplay pipeline fields ──────────────────────────────
    // screenplayToScenes() writes these; strict mode dropped them silently, so
    // scripted dialogue never reached the scene documents.
    actionType: { type: String, default: '' },
    cameraType: { type: String, default: '' },
    dialogue: [{
      speaker: { type: String, default: '' },
      line:    { type: String, default: '' },
      _id:     false,
    }],

    // Characters in this scene
    characterNames: [{ type: String }],

    // ── Beats (8-second segment plans from Cinematic Director) ──
    beats:         [beatSchema],
    totalSegments: { type: Number, default: 0 },
    duration:      { type: Number, default: 8 },

    // ── Generated Segments (actual video segments) ──────────────
    segments:      [segmentSchema],

    // ── Consistency Lock References ─────────────────────────────
    characterLockRefs:  [{ type: String }],  // paths to character reference images
    environmentLockRef: { type: String, default: null },

    // ── Transition ──────────────────────────────────────────────
    transitionOut: {
      type: String,
      enum: ['cut', 'fade', 'dissolve', 'wipe', 'none'],
      default: 'cut'
    },

    // ── Revision History ────────────────────────────────────────
    revisions: [{
      version:   { type: Number },
      imagePath: { type: String },
      videoPath: { type: String },
      prompt:    { type: String },
      createdAt: { type: Date, default: Date.now }
    }],

    // ── Status ──────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    Object.values(SCENE_STATUS),
      default: SCENE_STATUS.PENDING,
    },

    planningDecision: {
      action:  { type: String, enum: ['reuse', 'generate', 'animate', 'image_only', 'skip', 'stock'], default: 'generate' },
      details: { type: mongoose.Schema.Types.Mixed, default: null }
    },

    imagePath:   { type: String, default: null },
    videoPath:   { type: String, default: null },

    retryCount:  { type: Number, default: 0 },
    error:       { type: String, default: null },
  },
  { timestamps: true },
);

// Compound index for efficient batch queries
sceneSchema.index({ jobId: 1, sceneNumber: 1 });
sceneSchema.index({ jobId: 1, status: 1 });

export default mongoose.model('Scene', sceneSchema);
