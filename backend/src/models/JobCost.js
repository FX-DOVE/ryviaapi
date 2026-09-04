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
      default: 0, // billed USD shown internally after markup
    },
    infraUsdCents:  { type: Number, default: 0 },
    markupUsdCents: { type: Number, default: 0 },
    billedUsdCents: { type: Number, default: 0 },
    settled:        { type: Boolean, default: false },
    lineItems: [{
      kind:          { type: String },
      label:         { type: String },
      infraUsdCents: { type: Number, default: 0 },
      meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
      at:            { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

export default mongoose.model('JobCost', jobCostSchema);
