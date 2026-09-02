import mongoose from 'mongoose';
import { JOB_STATUS } from '../config/constants.js';

const jobInputSchema = new mongoose.Schema(
  {
    script:        { type: String, default: '' },
    prompt:        { type: String, default: '' },
    styleGuide:    { type: String, default: '' },
    style:         { type: String, enum: ['cinematic', 'documentary', 'social', 'corporate'], default: 'cinematic' },
    pacing:        { type: String, enum: ['slow', 'medium', 'fast'], default: 'medium' },
    uploadedFiles: [{ type: String }],
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title:           { type: String, required: true, trim: true },
    projectId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    inputMode:       { type: String, enum: ['idea_mode', 'assets_mode', 'film_mode'], default: 'idea_mode' },
    userAssets: {
      scriptText:    { type: String, default: '' },
      titleText:     { type: String, default: '' },
      extraImageUrls:[{ type: String }]
    },
    styleConfig: {
      preset:          { type: String, default: 'cinematic' },
      camera:          { type: String, default: 'hollywood' },
      lighting:        { type: String, default: 'golden_hour' },
      colorGrade:      { type: String, default: 'netflix' },
      motionLevel:     { type: String, default: 'medium' },
      emotion:         { type: String, default: 'neutral' },
      customStyleNotes:{ type: String, default: '' }
    },
    directorNotes: [
      {
        sceneIndex:    { type: Number },
        note:          { type: String }
      }
    ],
    workflow: {
      steps:           [{ type: String }],
      activeStep:      { type: String, default: 'script' }
    },
    analytics: {
      gpuTimeMs:       { type: Number, default: 0 },
      queueWaitTimeMs: { type: Number, default: 0 },
      generationTimeMs:{ type: Number, default: 0 },
      costCredits:     { type: Number, default: 0 }
    },

    status:          {
      type:    String,
      enum:    Object.values(JOB_STATUS),
      default: JOB_STATUS.QUEUED,
      index:   true,
    },
    progress:        { type: Number, default: 0, min: 0, max: 100 },
    creditCost:      { type: Number, default: 0 },
    pipelineEvents:  [
      {
        event:     { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        payload:   { type: mongoose.Schema.Types.Mixed },
      }
    ],

    totalScenes:     { type: Number, default: 0 },
    completedScenes: { type: Number, default: 0 },
    totalBeats:      { type: Number, default: 0 },

    provider:        { type: String, default: 'ltx' },
    reasoningProvider:     { type: String, default: null },
    scriptGenerated:       { type: Boolean, default: false },

    subtitleBurnIn:  { type: Boolean, default: false },

    // Output
    finalVideoPath:  { type: String, default: null },
    thumbnailPath:   { type: String, default: null },
    duration:        { type: Number, default: null },   // seconds
    fileSize:        { type: Number, default: null },   // bytes

    // Cost tracking
    estimatedCost:   { type: Number, default: 0 },
    actualCost:      { type: Number, default: 0 },

    input:           { type: jobInputSchema, default: () => ({}) },

    // ── Cinematic Director Plan ────────────────────────────────
    directorPlan:    { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Consistency Locks ──────────────────────────────────────
    // Map of character name → { lockPrompt, referenceImagePath }
    characterLocks:    { type: mongoose.Schema.Types.Mixed, default: {} },
    // Map of location ID → { lockPrompt, referenceImagePath }
    environmentLocks:  { type: mongoose.Schema.Types.Mixed, default: {} },
    // Master World & Setting DNA (country, setting, cinematography)
    visualDna:         { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Film Mode Fields ───────────────────────────────────────
    filmMode:          { type: Boolean, default: false },
    screenplayId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Screenplay', default: null },
    animationStyle: {
      type: String,
      enum: ['2d_anime', 'pixar', '3d_cgi_hollywood', 'nollywood_drama', 'realistic', 'cinematic', null],
      default: null
    },
    targetDurationMinutes: { type: Number, default: null },
    genre:             { type: String, default: '' },
    aspectRatio:       { type: String, default: '16:9' },

    error:           { type: String, default: null },
    failureReason:   { type: String, default: null },
    retryCount:      { type: Number, default: 0 },

    completedAt:     { type: Date, default: null },
  },
  { timestamps: true },
);

// Indexes for common queries
jobSchema.index({ userId: 1, createdAt: -1 });
jobSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Job', jobSchema);
