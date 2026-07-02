import { jest } from '@jest/globals';

// Mock Mongoose models
jest.mock('../src/models/User.js', () => {
  return {
    __esModule: true,
    default: {
      findById: jest.fn()
    }
  };
});

jest.mock('../src/models/Workspace.js', () => {
  return {
    __esModule: true,
    default: {
      findOne: jest.fn()
    }
  };
});

import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import Workspace from '../src/models/Workspace.js';
import { socketAuthMiddleware } from '../src/middleware/socketAuth.js';

const JWT_SECRET = 'supersecret_jwt_key';

describe('Socket.IO Connection Authentication Middleware', () => {
  let mockSocket;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = {
      handshake: {
        auth: {}
      }
    };
    mockNext = jest.fn();
  });

  it('should call next with an error if token is missing', async () => {
    await socketAuthMiddleware(mockSocket, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.any(Error)
    );
    expect(mockNext.mock.calls[0][0].message).toContain('token missing or malformed');
  });

  it('should authenticate correctly and bind user and workspaceId', async () => {
    const userId = '6682b13f36cf183204d88e0a';
    const workspaceId = '6682b13f36cf183204d88e0b';
    const token = jwt.sign({ _id: userId }, JWT_SECRET);

    mockSocket.handshake.auth.token = `Bearer ${token}`;
    
    User.findById.mockResolvedValue({
      _id: userId,
      name: 'Test User',
      activeWorkspaceId: workspaceId
    });

    await socketAuthMiddleware(mockSocket, mockNext);

    // Wait for the asynchronous jwt.verify callback to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockNext).toHaveBeenCalledWith();
    expect(mockSocket.user._id).toBe(userId);
    expect(mockSocket.workspaceId).toBe(workspaceId);
  });
});
