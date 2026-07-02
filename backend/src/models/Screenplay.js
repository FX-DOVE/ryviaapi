import mongoose from 'mongoose';

/**
 * Screenplay — a full AI-generated feature film screenplay.
 * Contains the story bible, act structure, and all scene data.
 * Generated from a brief user synopsis by the screenplayService.
 */

const characterProfileSchema = new mongoose.Schema({
  filmCharacterId: { type: mongoose.Schema.Types.ObjectId, ref: 'FilmCharacter', default: null },
  name:            { type: String, required: true },
  role:            { type: String, default: 'supporting' },
  arc:             { type: String, default: '' }, // "Goes from coward to hero"
  seedPrompt:      { type: String, default: '' }, // cached at screenplay generation time
}, { _id: false });

const actSchema = new mongoose.Schema({
  actNumber:   { type: Number, required: true },
  title:       { type: String, default: '' },        // e.g. "Act I — The Call"
  description: { type: String, default: '' },
  sceneStart:  { type: Number, required: true },
  sceneEnd:    { type: Number, required: true },
  emotion:     { type: String, default: 'neutral' }, // dominant act mood
  musicStyle:  { type: String, default: 'orchestral' },
}, { _id: false });

const screenplaySceneSchema = new mongoose.Schema({
  sceneNumber:   { type: Number, required: true },
  act:           { type: Number, required: true },
  chapter:       { type: Number, default: 1 },      // which chapter batch this belongs to

  // Story content
  narration:     { type: String, default: '' },     // the spoken narrator text
  dialogue:      [{ speaker: String, line: String }], // per-character dialogue lines
  location:      { type: String, default: '' },     // "INT. THRONE ROOM - NIGHT"
  timeOfDay:     { type: String, default: 'day' },

  // Action & Motion
  actionType: {
    type: String,
    enum: ['establishing', 'walking', 'running', 'talking', 'fighting', 'crying',
           'riding', 'flying', 'celebrating', 'sneaking', 'dying', 'transition', 'other'],
    default: 'establishing'
  },
  actionDescription: { type: String, default: '' }, // plain English scene action
  cameraType:        { type: String, default: 'medium_wide' },

  // Characters
  characterNames: [{ type: String }],              // names of characters in this scene

  // Emotion
  emotion:       { type: String, default: 'neutral' },
  intensity:     { type: Number, min: 1, max: 10, default: 5 },

  duration:      { type: Number, default: 10 },     // target duration in seconds
}, { _id: false });

const screenplaySchema = new mongoose.Schema(
  {
    jobId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    projectId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Film metadata
    title:       { type: String, required: true },
    genre:       { type: String, default: 'drama' },
    synopsis:    { type: String, default: '' },
    targetDurationMinutes: { type: Number, default: 90 },
    animationStyle: {
      type: String,
      enum: ['2d_anime', 'pixar', '3d_cgi_hollywood', 'nollywood_drama', 'realistic', 'cinematic'],
      default: 'cinematic'
    },
    tone:        { type: String, default: 'dramatic' },  // "dark and gritty", "fun and light"
    themes:      [{ type: String }],                     // ["redemption", "love", "power"]
    additionalSettings: { type: String, default: '' },   // Custom director instructions

    // Story structure
    storyBible:  { type: String, default: '' },   // AI-written world/character overview
    characters:  [characterProfileSchema],
    acts:        [actSchema],
    scenes:      [screenplaySceneSchema],

    // Generation metadata
    totalScenes:   { type: Number, default: 0 },
    totalChapters: { type: Number, default: 0 },
    generatedBy:   { type: String, default: '' },  // which AI model wrote it
    generationMs:  { type: Number, default: 0 },   // how long it took to generate

    status: {
      type: String,
      enum: ['draft', 'generating', 'ready', 'in_production', 'completed'],
      default: 'draft'
    },
  },
  { timestamps: true }
);

screenplaySchema.index({ workspaceId: 1, createdAt: -1 });
screenplaySchema.index({ projectId: 1 });

export default mongoose.model('Screenplay', screenplaySchema);
