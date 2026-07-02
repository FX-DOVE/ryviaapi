import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  creativeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreativeProfile', default: null },
  brandKitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandKit', default: null },
  
  style: {
    preset: { type: String, default: 'cinematic' },
    camera: { type: String, default: 'hollywood' },
    lighting: { type: String, default: 'golden_hour' },
    colorGrade: { type: String, default: 'netflix' },
    motionLevel: { type: String, default: 'medium' },
    emotion: { type: String, default: 'neutral' },
    musicStyle: { type: String, default: 'documentary' },
    customStyleNotes: { type: String, default: '' }
  },

  creativeLock: {
    enabled: { type: Boolean, default: false },
    lockFaces: { type: Boolean, default: true },
    lockLocations: { type: Boolean, default: true },
    lockColorGrade: { type: Boolean, default: true },
    lockCamera: { type: Boolean, default: true },
    lockLighting: { type: Boolean, default: true }
  },

  referenceImages: [{
    key: String,
    url: String,
    label: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  aiMemory: {
    visualStyle: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    cameraStyle: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    characterMemory: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    environmentMemory: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    colorPalette: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    negativePrompts: [{ type: String }],
    preferredProviders: [{ type: String }],
    lastUpdated: { type: Date, default: null }
  },

  jobIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  status: { type: String, enum: ['active','archived'], default: 'active' }
}, { timestamps: true });

export default mongoose.model('Project', projectSchema);
