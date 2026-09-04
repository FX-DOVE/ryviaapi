import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecret_refresh_key';

// Helper to generate access and refresh tokens
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

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    const role = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ? 'admin' : 'user';
    const user = new User({ name, email, password, role });
    await user.save();

    const workspace = new Workspace({
      name:    `${name}'s Workspace`,
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

    try {
      await sendWelcomeEmail(user);
    } catch (mailErr) {
      console.warn('[auth] welcome email failed:', mailErr.message);
    }

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        _id:               user._id,
        name:              user.name,
        email:             user.email,
        role:              user.role,
        activeWorkspaceId: user.activeWorkspaceId
      }
    });
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

    const user = await User.findOne({ email });
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

    res.json({
      accessToken,
      refreshToken,
      user: {
        _id:               user._id,
        name:              user.name,
        email:             user.email,
        role:              user.role,
        activeWorkspaceId: user.activeWorkspaceId
      }
    });
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
    const email = String(req.body?.email || '').toLowerCase().trim();
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

export default { register, login, refreshToken, logout, getMe, forgotPassword, resetPassword };
