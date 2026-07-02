import mongoose from 'mongoose';

const jobLogSchema = new mongoose.Schema(
  {
    jobId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    level:     { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message:   { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  {
    // No updatedAt needed — logs are write-once
    timestamps: { createdAt: false, updatedAt: false },
  },
);

jobLogSchema.index({ jobId: 1, timestamp: 1 });

export default mongoose.model('JobLog', jobLogSchema);
