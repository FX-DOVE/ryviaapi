import mongoose from 'mongoose';

const characterSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true },
  age: { type: String, default: '' },
  gender: { type: String, default: '' },
  description: { type: String, default: '' },
  clothingDescription: { type: String, default: '' },
  voiceStyle: { type: String, default: '' },
  emotion: { type: String, default: '' },
  referenceImageUrl: { type: String, default: null },
  referenceImageKey: { type: String, default: null },
  seedPrompt: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('Character', characterSchema);
