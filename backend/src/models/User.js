import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:        { type: String, required: true, trim: true },
    password:    { type: String, required: true },
    role:        { type: String, enum: ['user', 'admin'], default: 'user' },
    activeWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
    refreshTokens: [{ type: String }],
    resetPasswordToken:   { type: String, default: null, index: true },
    resetPasswordExpires: { type: Date, default: null },
    storageUsed: { type: Number, default: 0 },   // bytes
    totalJobs:   { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);

