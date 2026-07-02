import mongoose from 'mongoose';

const ASSET_TYPES = ['image', 'video', 'audio', 'subtitle', 'final_video', 'thumbnail'];

const assetSchema = new mongoose.Schema(
  {
    jobId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    type:      { type: String, enum: ASSET_TYPES, required: true },
    path:      { type: String, required: true }, // acts as the remote URL or key
    size:      { type: Number, default: 0 },   // bytes
    embedding: { type: [Number], default: [] },
    metadata:  {
      dominantColors: [{ type: String }],
      cameraMovement: { type: String, default: null },
      emotion:        { type: String, default: 'neutral' },
      characters:     [{ type: String }],
      visualTags:     [{ type: String }],
    },
  },
  { timestamps: true },
);


assetSchema.index({ jobId: 1, type: 1 });

export default mongoose.model('Asset', assetSchema);
