import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key';

export async function socketAuthMiddleware(socket, next) {
  try {
    const authHeader = socket.handshake.auth?.token;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new Error('Authentication failed: token missing or malformed'));
    }

    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return next(new Error('Authentication failed: token expired or invalid'));
      }

      const user = await User.findById(decoded._id);
      if (!user) {
        return next(new Error('Authentication failed: user account no longer exists'));
      }

      socket.user = user;

      // Bind socket to workspace room
      if (user.activeWorkspaceId) {
        socket.workspaceId = String(user.activeWorkspaceId);
      } else {
        const ws = await Workspace.findOne({ 'members.userId': user._id });
        if (ws) {
          socket.workspaceId = String(ws._id);
        }
      }

      next();
    });
  } catch (err) {
    next(new Error(`Authentication failed: ${err.message}`));
  }
}

export default socketAuthMiddleware;
