import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useAppStore from '../store/useAppStore';

let _socket = null;

function getSocket() {
  const token = localStorage.getItem('accessToken');
  const authHeader = token ? `Bearer ${token}` : null;

  if (!_socket) {
    _socket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: { token: authHeader }
    });
  } else if (_socket.auth?.token !== authHeader) {
    _socket.auth = { token: authHeader };
    if (_socket.connected) {
      _socket.disconnect().connect();
    } else if (authHeader) {
      _socket.connect();
    }
  }
  return _socket;
}

/**
 * Hook that connects to Socket.io and wires up global event handlers.
 * Call once at the app root level.
 */
export function useSocketGlobal() {
  const { updateJob, setHealth, addToast } = useAppStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect',    () => console.log('[Socket] Connected:', socket.id));
    socket.on('connect_error', (err) => console.warn('[Socket] Connection warning:', err.message));
    socket.on('disconnect', () => console.log('[Socket] Disconnected'));

    // Global job events — update the jobs list regardless of which page we're on
    socket.on('job_progress', ({ jobId, ...data }) => {
      updateJob(jobId, data);
    });

    socket.on('job_completed', ({ jobId, ...data }) => {
      updateJob(jobId, { status: 'completed', progress: 100, ...data });
      addToast('✅ Video generation complete!', 'success');
    });

    socket.on('job_failed', ({ jobId, error }) => {
      updateJob(jobId, { status: 'failed', error });
      addToast(`❌ Job failed: ${error}`, 'error');
    });

    socket.on('system_health', (health) => {
      setHealth(health);
    });

    return () => {
      socket.off('job_progress');
      socket.off('job_completed');
      socket.off('job_failed');
      socket.off('system_health');
    };
  }, []);

  return _socket;
}

/**
 * Hook to subscribe to a specific job's events (for JobDetail page).
 * @param {string} jobId
 */
export function useJobSocket(jobId) {
  const { addLog, updateJob, setActiveJob, updateScene } = useAppStore();

  useEffect(() => {
    if (!jobId) return;

    const socket = getSocket();
    socket.emit('subscribe_job', { jobId });

    const onLog         = ({ level, message, timestamp }) => addLog({ level, message, timestamp });
    const onProgress    = (data) => updateJob(jobId, data);
    const onComplete    = (data) => updateJob(jobId, { status: 'completed', progress: 100, ...data });
    const onFailed      = ({ error }) => updateJob(jobId, { status: 'failed', error });
    // When a scene finishes (or its image is ready), patch it in the grid immediately
    const onSceneUpdate = ({ sceneId, ...patch }) => updateScene(sceneId, patch);

    socket.on('job_log',       onLog);
    socket.on('job_progress',  onProgress);
    socket.on('job_completed', onComplete);
    socket.on('job_failed',    onFailed);
    socket.on('scene_updated', onSceneUpdate);

    return () => {
      socket.emit('unsubscribe_job', { jobId });
      socket.off('job_log',       onLog);
      socket.off('job_progress',  onProgress);
      socket.off('job_completed', onComplete);
      socket.off('job_failed',    onFailed);
      socket.off('scene_updated', onSceneUpdate);
    };
  }, [jobId]);
}


/**
 * Hook to subscribe to a single screenplay's live generation updates.
 *
 * The server emits `screenplay_updated` to the workspace room (auto-joined on
 * connect) at each milestone — bible ready, per-act scene batches, final ready,
 * and generation failure. Payload: `{ screenplayId, status, stage?, acts?,
 * scenesSoFar?, totalScenesTarget?, generationError? }`.
 *
 * @param {string} screenplayId
 * @param {(payload: object) => void} onUpdate  called with the full patch payload
 */
export function useScreenplaySocket(screenplayId, onUpdate) {
  // Keep the latest callback in a ref so the socket listener isn't re-bound on
  // every render (only when the screenplayId changes).
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!screenplayId) return;

    const socket = getSocket();

    const onScreenplayUpdate = (payload) => {
      if (payload?.screenplayId === screenplayId) {
        cbRef.current?.(payload);
      }
    };

    socket.on('screenplay_updated', onScreenplayUpdate);

    return () => {
      socket.off('screenplay_updated', onScreenplayUpdate);
    };
  }, [screenplayId]);
}


export default { useSocketGlobal, useJobSocket, useScreenplaySocket };
