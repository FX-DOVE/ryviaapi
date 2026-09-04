import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import PendingSignup from '../models/PendingSignup.js';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationCodeEmail,
} from '../services/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecret_refresh_key';

const OTP_TTL_MS = 20 * 60 * 1000; // 20 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;

function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      _id: user._id,
      userId: user._id,
      email: user.email,
      role: user.role,
      workspaceId: user.activeWorkspaceId ? String(user.activeWorkspaceId) : null
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { _id: user._id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function mayIncludeDevCode() {
  return process.env.NODE_ENV !== 'production' && !process.env.EMAIL_HOST;
}

function authResponse(user, accessToken, refreshToken) {
  return {
    accessToken,
    refreshToken,
    user: {
      _id:               user._id,
      name:              user.name,
      email:             user.email,
      role:              user.role,
      activeWorkspaceId: user.activeWorkspaceId
    }
  };
}

async function createUserFromPending(pending) {
  const email = pending.email;
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const role = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ? 'admin' : 'user';

  const user = new User({
    name: pending.name,
    email,
    password: pending.passwordHash,
    role,
  });
  user._passwordAlreadyHashed = true;
  await user.save();

  const workspace = new Workspace({
    name:    `${pending.name}'s Workspace`,
    ownerId: user._id,
    members: [{ userId: user._id, role: 'owner' }],
    credits: 0,
  });
  await workspace.save();

  user.activeWorkspaceId = workspace._id;
  await user.save();

  const { accessToken, refreshToken } = generateTokens(user);
  user.refreshTokens.push(refreshToken);
  await user.save();

  await PendingSignup.deleteOne({ _id: pending._id });

  try {
    await sendWelcomeEmail(user);
  } catch (mailErr) {
    console.warn('[auth] welcome email failed:', mailErr.message);
  }

  return { user, accessToken, refreshToken };
}

/**
 * Start registration: store pending signup + email OTP. Does NOT create User yet.
 * POST /api/auth/register
 */
export async function register(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingPending = await PendingSignup.findOne({ email });
    if (existingPending?.lastSentAt) {
      const elapsed = Date.now() - new Date(existingPending.lastSentAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${waitSec}s before requesting another code. Check your email.`,
          retryAfter: waitSec,
        });
      }
    }

    const code = generateOtpCode();
    const codeHash = hashCode(code);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const now = new Date();

    await PendingSignup.findOneAndUpdate(
      { email },
      {
        email,
        name,
        passwordHash,
        codeHash,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await sendVerificationCodeEmail(email, code, name);
    } catch (mailErr) {
      console.warn('[auth] verification email failed:', mailErr.message);
    }

    const payload = { ok: true, email };
    if (mayIncludeDevCode()) {
      payload.devCode = code;
    }
    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

/**
 * Verify OTP and create the user.
 * POST /api/auth/register/verify
 */
export async function registerVerify(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const pending = await PendingSignup.findOne({ email });
    if (!pending) {
      return res.status(400).json({ error: 'No pending signup found. Please register again.' });
    }

    if (pending.expiresAt && pending.expiresAt.getTime() < Date.now()) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.status(400).json({ error: 'Verification code expired. Please register again.' });
    }

    if (pending.attempts >= MAX_VERIFY_ATTEMPTS) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.status(400).json({ error: 'Too many attempts. Please register again.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return res.status(400).json({ error: 'Email already registered' });
    }

    if (hashCode(code) !== pending.codeHash) {
      pending.attempts += 1;
      await pending.save();
      const left = MAX_VERIFY_ATTEMPTS - pending.attempts;
      return res.status(400).json({
        error: left > 0
          ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
          : 'Too many attempts. Please register again.',
      });
    }

    const { user, accessToken, refreshToken } = await createUserFromPending(pending);
    res.status(201).json(authResponse(user, accessToken, refreshToken));
  } catch (err) {
    next(err);
  }
}

/**
 * Resend verification code for a pending signup.
 * POST /api/auth/register/resend
 */
export async function registerResend(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const pending = await PendingSignup.findOne({ email });
    if (!pending) {
      return res.status(400).json({ error: 'No pending signup found. Please register again.' });
    }

    if (pending.lastSentAt) {
      const elapsed = Date.now() - new Date(pending.lastSentAt).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${waitSec}s before requesting another code.`,
          retryAfter: waitSec,
        });
      }
    }

    const code = generateOtpCode();
    pending.codeHash = hashCode(code);
    pending.expiresAt = new Date(Date.now() + OTP_TTL_MS);
    pending.attempts = 0;
    pending.lastSentAt = new Date();
    await pending.save();

    try {
      await sendVerificationCodeEmail(email, code, pending.name);
    } catch (mailErr) {
      console.warn('[auth] verification email failed:', mailErr.message);
    }

    const payload = { ok: true, email };
    if (mayIncludeDevCode()) {
      payload.devCode = code;
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    if (!user.activeWorkspaceId) {
      const workspace = await Workspace.findOne({ ownerId: user._id });
      if (workspace) {
        user.activeWorkspaceId = workspace._id;
      } else {
        const newWs = await Workspace.create({
          name:    `${user.name}'s Workspace`,
          ownerId: user._id,
          members: [{ userId: user._id, role: 'owner' }],
          credits: 0
        });
        user.activeWorkspaceId = newWs._id;
      }
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);

    user.refreshTokens.push(refreshToken);
    if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    await user.save();

    res.json(authResponse(user, accessToken, refreshToken));
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Refresh token is required' });

    const user = await User.findOne({ refreshTokens: token });
    if (!user) return res.status(403).json({ error: 'Invalid refresh token' });

    jwt.verify(token, JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        user.refreshTokens = user.refreshTokens.filter(t => t !== token);
        await user.save();
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

      user.refreshTokens = user.refreshTokens.filter(t => t !== token);
      user.refreshTokens.push(newRefreshToken);
      await user.save();

      res.json({ accessToken, refreshToken: newRefreshToken });
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const { token } = req.body;
    if (token) {
      await User.updateOne(
        { _id: req.user?._id },
        { $pull: { refreshTokens: token } }
      );
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id || req.user?.userId).select('-password -refreshTokens');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    res.json({
      user: {
        _id:               user._id,
        name:              user.name,
        email:             user.email,
        role:              user.role,
        activeWorkspaceId: user.activeWorkspaceId,
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email });
    // Always succeed to avoid email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await sendPasswordResetEmail(user, rawToken);
    } catch (mailErr) {
      console.warn('[auth] reset email failed:', mailErr.message);
    }

    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashed = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: 'Password updated. You can sign in now.' });
  } catch (err) {
    next(err);
  }
}

export default {
  register,
  registerVerify,
  registerResend,
  login,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
};
