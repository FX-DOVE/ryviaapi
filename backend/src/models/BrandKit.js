import mongoose from 'mongoose';

const brandKitSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true },
  logoUrl: { type: String, default: null },
  logoKey: { type: String, default: null },
  introUrl: { type: String, default: null },
  introKey: { type: String, default: null },
  outroUrl: { type: String, default: null },
  outroKey: { type: String, default: null },
  watermark: {
    enabled: { type: Boolean, default: false },
    position: { type: String, enum: ['top_left', 'top_right', 'bottom_left', 'bottom_right'], default: 'top_right' }
  },
  typography: {
    fontFamily: { type: String, default: 'Arial' },
    fontSize: { type: Number, default: 16 },
    fontColor: { type: String, default: '#FFFFFF' },
    backgroundColor: { type: String, default: '#00000088' }
  },
  preferredVoice: { type: String, default: null },
  preferredMusicStyle: { type: String, default: null }
}, { timestamps: true });

export default mongoose.model('BrandKit', brandKitSchema);
