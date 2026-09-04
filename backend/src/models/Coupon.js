import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    percentOff: { type: Number, default: null, min: 0, max: 100 },
    fixedCreditCents: { type: Number, default: null, min: 0 },
    maxRedemptions: { type: Number, default: null, min: 1 },
    redeemedCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    redemptions: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
      creditCents: Number,
      redeemedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true },
);

couponSchema.methods.isRedeemable = function isRedeemable() {
  if (!this.active) return { ok: false, error: 'Coupon is disabled' };
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'Coupon has expired' };
  }
  if (this.maxRedemptions != null && this.redeemedCount >= this.maxRedemptions) {
    return { ok: false, error: 'Coupon redemption limit reached' };
  }
  if (!this.percentOff && !this.fixedCreditCents) {
    return { ok: false, error: 'Coupon has no credit value' };
  }
  return { ok: true };
};

export default mongoose.model('Coupon', couponSchema);
