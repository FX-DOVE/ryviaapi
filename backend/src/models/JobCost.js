import mongoose from 'mongoose';

const jobCostSchema = new mongoose.Schema(
  {
    jobId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Job',
      required: true,
      unique:   true,
    },
    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
      index:    true,
    },
    gpuTimeSec: {
      type:    Number,
      default: 0,
    },
    gpuCostUsd: {
      type:    Number,
      default: 0, // calculated from GPU usage seconds
    },
    apiCostUsd: {
      type:    Number,
      default: 0, // e.g. elevenlabs or gemini API cost
    },
    storageCost: {
      type:    Number,
      default: 0, // storage size bytes cost per hour/day
    },
    totalCostUsd: {
      type:    Number,
      default: 0, // sum of GPU, API, and storage costs
    },
  },
  { timestamps: true }
);

export default mongoose.model('JobCost', jobCostSchema);
