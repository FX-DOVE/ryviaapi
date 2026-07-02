import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';

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
    { expiresIn: '15m' } // 15 mins expiration
  );
  
  const refreshToken = jwt.sign(
    { _id: user._id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // 7 days expiration
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

    // 1. Create User
    const adminEmail = process.env.ADMIN_EMAIL;
    const role = (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) ? 'admin' : 'user';
    const user = new User({ name, email, password, role });
    await user.save();

    // 2. Create Default Workspace
    const workspace = new Workspace({
      name:    `${name}'s Workspace`,
      ownerId: user._id,
      members: [{ userId: user._id, role: 'owner' }],
      credits: 1000, // starting credits budget
    });
    await workspace.save();

    // 3. Link Workspace back to User
    user.activeWorkspaceId = workspace._id;
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user);
    
    // Save refresh token to user array
    user.refreshTokens.push(refreshToken);
    await user.save();

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

    // Check if this user is the root admin configured in .env
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    // Ensure user has at least one workspace
    if (!user.activeWorkspaceId) {
      const workspace = await Workspace.findOne({ ownerId: user._id });
      if (workspace) {
        user.activeWorkspaceId = workspace._id;
      } else {
        const newWs = await Workspace.create({
          name:    `${user.name}'s Workspace`,
          ownerId: user._id,
          members: [{ userId: user._id, role: 'owner' }],
          credits: 1000
        });
        user.activeWorkspaceId = newWs._id;
      }
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);

    user.refreshTokens.push(refreshToken);
    // Limit stored refresh tokens
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
        // Token is invalid/expired, prune it
        user.refreshTokens = user.refreshTokens.filter(t => t !== token);
        await user.save();
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      // Rotate token
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

export default { register, login, refreshToken, logout };
