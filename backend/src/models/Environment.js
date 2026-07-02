import mongoose from 'mongoose';

const environmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  timeOfDay: { type: String, default: 'daylight' },
  weather: { type: String, default: 'clear' },
  referenceImageUrls: [{ type: String }],
  referenceImageKeys: [{ type: String }],
  seedPrompt: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('Environment', environmentSchema);
