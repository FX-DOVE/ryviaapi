import mongoose from 'mongoose';

const creativeProfileSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
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
  renderSettings: {
    resolution: { type: String, default: '1920x1080' },
    fps: { type: Number, default: 25 },
    subtitleStyle: { type: String, default: 'Yellow-Bottom' },
    thumbnailStyle: { type: String, default: 'Cinematic-Frame' }
  },
  promptModifiers: [{ type: String }]
}, { timestamps: true });

export default mongoose.model('CreativeProfile', creativeProfileSchema);
