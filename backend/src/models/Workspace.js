import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    ownerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        role: {
          type: String,
          enum: ['owner', 'admin', 'editor', 'viewer'],
          default: 'editor',
        },
      },
    ],
    credits: {
      type:    Number,
      default: 1000, // starting credits
      min:     0,
    },
    billingPlan: {
      type:    String,
      enum:    ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    storageUsed: {
      type:    Number,
      default: 0, // in bytes
    },
  },
  { timestamps: true }
);

workspaceSchema.index({ 'members.userId': 1 });

export default mongoose.model('Workspace', workspaceSchema);
