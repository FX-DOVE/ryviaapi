import { Server as SocketIOServer } from 'socket.io';
import { socketAuthMiddleware } from '../middleware/socketAuth.js';
import eventBus from '../services/eventBus.js';

let io = null;

/**
 * Initialise Socket.io on an existing HTTP server.
 * Call once from app.js.
 */
export function initSocket(httpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach handshake authentication
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    console.log(`[Socket] Authenticated client connected: ${socket.id} (User: ${socket.user?.email})`);

    // Automatically join workspace room
    if (socket.workspaceId) {
      socket.join(`workspace:${socket.workspaceId}`);
      console.log(`[Socket] ${socket.id} joined room workspace:${socket.workspaceId}`);
    }

    // Automatically join user-specific room
    if (socket.user?._id) {
      socket.join(`user:${socket.user._id}`);
      console.log(`[Socket] ${socket.id} joined room user:${socket.user._id}`);
    }

    // Client subscribes to a specific job's events (additional room filter)
    socket.on('subscribe_job', ({ jobId }) => {
      if (jobId) {
        socket.join(`job:${jobId}`);
        console.log(`[Socket] ${socket.id} subscribed to job:${jobId}`);
      }
    });

    socket.on('unsubscribe_job', ({ jobId }) => {
      if (jobId) socket.leave(`job:${jobId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Forward event bus messages to Socket.io clients
  eventBus.on('socket_job_event', ({ jobId, event, data }) => {
    if (io) io.to(`job:${jobId}`).emit(event, { jobId, ...data });
  });

  eventBus.on('socket_workspace_event', ({ workspaceId, event, data }) => {
    if (io) io.to(`workspace:${workspaceId}`).emit(event, data);
  });

  eventBus.on('socket_user_event', ({ userId, event, data }) => {
    if (io) io.to(`user:${userId}`).emit(event, data);
  });

  eventBus.on('socket_broadcast', ({ event, data }) => {
    if (io) io.emit(event, data);
  });

  return io;
}

/** Get the singleton Socket.io instance. */
export function getIO() {
  if (!io) throw new Error('[Socket] Socket.io not initialised — call initSocket() first');
  return io;
}

/** Emit a job-scoped event to all subscribers of that job. */
export function emitJobEvent(jobId, event, data) {
  eventBus.publish('socket_job_event', { jobId, event, data });
}

/** Broadcast to a specific workspace room. */
export function emitWorkspaceEvent(workspaceId, event, data) {
  eventBus.publish('socket_workspace_event', { workspaceId, event, data });
}

/** Broadcast to a specific user channel. */
export function emitUserEvent(userId, event, data) {
  eventBus.publish('socket_user_event', { userId, event, data });
}

/** Broadcast to all connected clients (e.g. system health). */
export function broadcast(event, data) {
  eventBus.publish('socket_broadcast', { event, data });
}

export default { initSocket, getIO, emitJobEvent, emitWorkspaceEvent, emitUserEvent, broadcast };
