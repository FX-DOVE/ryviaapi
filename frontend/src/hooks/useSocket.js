import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useAppStore from '../store/useAppStore';

let _socket = null;

function getSocket() {
  if (!_socket) {
    _socket = io('/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
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


export default { useSocketGlobal, useJobSocket };
