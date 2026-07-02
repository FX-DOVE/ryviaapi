import mongoose from 'mongoose';

const creditLedgerSchema = new mongoose.Schema(
  {
    workspaceId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Workspace',
      required: true,
      index:    true,
    },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      enum:     ['addition', 'deduction', 'refund', 'expiration'],
      required: true,
    },
    credits: {
      type:     Number,
      required: true,
    },
    reason: {
      type:     String,
      required: true,
      trim:     true,
    },
    jobId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Job',
      default: null,
    },
    adminNotes: {
      type:    String,
      default: '',
    },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ workspaceId: 1, createdAt: -1 });

export default mongoose.model('CreditLedger', creditLedgerSchema);
