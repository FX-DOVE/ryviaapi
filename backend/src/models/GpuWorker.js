import mongoose from 'mongoose';

const gpuWorkerSchema = new mongoose.Schema(
  {
    workerId: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
    },
    gpuModel: {
      type:    String,
      default: 'NVIDIA RTX 4090',
    },
    vramTotal: {
      type:    Number,
      default: 24576, // MB
    },
    cudaVersion: {
      type:    String,
      default: '12.2',
    },
    powerUsage: {
      type:    Number,
      default: 0, // in Watts
    },
    runningModel: {
      type:    String,
      default: 'none',
    },
    jobsCompleted: {
      type:    Number,
      default: 0,
    },
    averageJobTime: {
      type:    Number,
      default: 0, // seconds
    },
    status: {
      type:    String,
      enum:    ['idle', 'busy', 'offline'],
      default: 'idle',
    },
    heartbeat: {
      type:    Date,
      default: Date.now,
      index:   { expires: 120 }, // automatically pruned if inactive for 2 mins
    },
    currentJobId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Job',
      default: null,
    },
    metrics: {
      temperature:    { type: Number, default: 0 },
      gpuUtilization: { type: Number, default: 0 },
      memoryUsed:     { type: Number, default: 0 }, // MB
      freeSystemMemory: { type: Number, default: 0 }, // MB
    },
    supportedQueues: [
      {
        type: String, // 'image', 'video', 'upscale', 'thumbnail'
      },
    ],
    version: {
      type:     String,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('GpuWorker', gpuWorkerSchema);
