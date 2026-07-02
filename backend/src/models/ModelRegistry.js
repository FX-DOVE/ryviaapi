import mongoose from 'mongoose';

const modelRegistrySchema = new mongoose.Schema(
  {
    type: {
      type:     String,
      enum:     ['image', 'video', 'voice', 'upscale'],
      required: true,
    },
    modelId: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
    },
    version: {
      type:     String,
      required: true,
      trim:     true,
    },
    releaseDate: {
      type:    Date,
      default: Date.now,
    },
    gpuMetrics: {
      vramRequiredMb: { type: Number, required: true },
      averageRuntime: { type: Number, default: 0 }, // in seconds
      qualityScore:   { type: Number, min: 0, max: 10, default: 8 },
    },
    resolutions: [
      {
        type: String, // e.g. ['1920x1080', '1080x1920']
      },
    ],
    active: {
      type:    Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('ModelRegistry', modelRegistrySchema);
