import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token is missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Access token is invalid or expired' });
      }

      const user = await User.findById(decoded._id);
      if (!user) {
        return res.status(401).json({ error: 'User account no longer exists' });
      }

      // Check if this user is the root admin configured in .env
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && user.email.toLowerCase() === adminEmail.toLowerCase() && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }

      req.user = user;

      // Extract active workspace context
      if (user.activeWorkspaceId) {
        req.workspaceId = String(user.activeWorkspaceId);
        req.user.workspaceId = String(user.activeWorkspaceId);
      } else {
        // Fallback default workspace search
        const ws = await Workspace.findOne({ 'members.userId': user._id });
        if (ws) {
          req.workspaceId = String(ws._id);
          req.user.workspaceId = String(ws._id);
          user.activeWorkspaceId = ws._id;
          await user.save();
        }
      }

      next();
    });
  } catch (err) {
    res.status(500).json({ error: 'Authorization error', details: err.message });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware generator
 * @param {Array<string>} roles Allowed roles
 */
export function requireRoles(roles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

export default authMiddleware;
