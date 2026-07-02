import GpuWorker from '../models/GpuWorker.js';
import { queues } from '../queues/queueManager.js';

/**
 * Get the current health status of all registered GPU worker nodes.
 * @returns {Promise<Object>}
 */
export async function getFleetHealth() {
  const activeWorkers = await GpuWorker.find({
    heartbeat: { $gte: new Date(Date.now() - 30000) } // Active within 30 seconds
  }).lean();

  const idleCount = activeWorkers.filter(w => w.status === 'idle').length;
  const busyCount = activeWorkers.filter(w => w.status === 'busy').length;

  return {
    totalActive: activeWorkers.length,
    idleCount,
    busyCount,
    workers: activeWorkers.map(w => ({
      workerId:       w.workerId,
      status:         w.status,
      gpuModel:       w.gpuModel,
      vramTotal:      w.vramTotal,
      metrics:        w.metrics,
      currentJobId:   w.currentJobId,
      lastHeartbeat:  w.heartbeat,
    }))
  };
}

/**
 * Calculates current backlog size and estimates autoscaling requirements.
 * @returns {Promise<Object>}
 */
export async function getFleetMetrics() {
  const fleet = await getFleetHealth();
  
  // Get active queue sizes
  const [
    scriptJobs,
    promptJobs,
    audioJobs,
    imageJobs,
    videoJobs,
    renderingJobs,
    uploadJobs,
    notificationJobs
  ] = await Promise.all([
    queues.script.getJobCounts('waiting', 'active', 'delayed'),
    queues.prompt.getJobCounts('waiting', 'active', 'delayed'),
    queues.audio.getJobCounts('waiting', 'active', 'delayed'),
    queues.image.getJobCounts('waiting', 'active', 'delayed'),
    queues.video.getJobCounts('waiting', 'active', 'delayed'),
    queues.rendering.getJobCounts('waiting', 'active', 'delayed'),
    queues.upload.getJobCounts('waiting', 'active', 'delayed'),
    queues.notification.getJobCounts('waiting', 'active', 'delayed')
  ]);

  const scriptCount = (scriptJobs.waiting || 0) + (scriptJobs.active || 0) + (scriptJobs.delayed || 0);
  const promptCount = (promptJobs.waiting || 0) + (promptJobs.active || 0) + (promptJobs.delayed || 0);
  const audioCount = (audioJobs.waiting || 0) + (audioJobs.active || 0) + (audioJobs.delayed || 0);
  const imageCount = (imageJobs.waiting || 0) + (imageJobs.active || 0) + (imageJobs.delayed || 0);
  const videoCount = (videoJobs.waiting || 0) + (videoJobs.active || 0) + (videoJobs.delayed || 0);
  const renderingCount = (renderingJobs.waiting || 0) + (renderingJobs.active || 0) + (renderingJobs.delayed || 0);
  const uploadCount = (uploadJobs.waiting || 0) + (uploadJobs.active || 0) + (uploadJobs.delayed || 0);
  const notificationCount = (notificationJobs.waiting || 0) + (notificationJobs.active || 0) + (notificationJobs.delayed || 0);

  const totalBacklog = scriptCount + promptCount + audioCount + imageCount + videoCount + renderingCount + uploadCount + notificationCount;

  // Simple autoscaling advice
  let scalingAdvice = 'maintain'; // maintain | scale_up | scale_down
  let recommendedWorkers = fleet.totalActive;

  if (totalBacklog > 0 && fleet.totalActive === 0) {
    scalingAdvice = 'scale_up';
    recommendedWorkers = Math.max(1, Math.ceil(totalBacklog / 10));
  } else if (totalBacklog > fleet.totalActive * 8) {
    scalingAdvice = 'scale_up';
    recommendedWorkers = Math.min(10, fleet.totalActive + 2);
  } else if (totalBacklog === 0 && fleet.totalActive > 1 && fleet.idleCount === fleet.totalActive) {
    scalingAdvice = 'scale_down';
    recommendedWorkers = 1; // scale down to baseline worker
  }

  return {
    backlog: {
      scriptQueue: scriptCount,
      promptQueue: promptCount,
      audioQueue: audioCount,
      imageQueue: imageCount,
      videoQueue: videoCount,
      renderingQueue: renderingCount,
      uploadQueue: uploadCount,
      notificationQueue: notificationCount,
      total:      totalBacklog
    },
    fleet: {
      totalActive: fleet.totalActive,
      idleCount:   fleet.idleCount,
      busyCount:   fleet.busyCount,
    },
    autoscaling: {
      advice:             scalingAdvice,
      recommendedWorkers: recommendedWorkers
    }
  };
}

export default { getFleetHealth, getFleetMetrics };
