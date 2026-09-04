import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paystackReference: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['initialized', 'success', 'failed', 'abandoned'],
      default: 'initialized',
      index: true,
    },
    /** Amount the user is charged, USD. */
    chargeUsd: { type: Number, required: true },
    /** Studio balance credited on success, USD (1:1 with charge). */
    creditUsd: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    providerAmount: { type: Number, default: 0 },
    authorizationUrl: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export default mongoose.model('Payment', paymentSchema);
