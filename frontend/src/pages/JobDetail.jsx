import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, Play, Pause, RefreshCw, Film, Sparkles, Layers, Image as ImageIcon, CheckCircle, Video } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { getJobDetail, getJobLogs, getJobScenes, deleteJob, stopJob, resumeJob, retryJob, retryScene, getVideoStreamUrl } from '../api/jobs';
import { useJobSocket } from '../hooks/useSocket';
import StatusBadge from '../components/StatusBadge';
import LogTimeline from '../components/LogTimeline';
import SceneGrid from '../components/SceneGrid';

import { AppPage } from '../components/ui/AppPage';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';

// Missing components from the original file that were implied
function ProgressRing({ progress, status }) {
  const isComplete = status === 'completed';
  const isFailed = status === 'failed';
  const color = isFailed ? 'var(--accent-red)' : isComplete ? 'var(--accent-green)' : 'var(--brand-primary)';
  return (
    <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border-default)" strokeWidth="6" />
        <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${progress * 1.76} 200`} className="transition-all duration-500 ease-in-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

function VideoPlayer({ jobId }) {
  return (
    <div className="w-full aspect-video bg-black rounded-[var(--radius-lg)] overflow-hidden border border-[var(--border-subtle)] shadow-lg relative group">
      <video
        controls
        className="w-full h-full object-contain"
        src={getVideoStreamUrl(jobId)}
        poster={`/api/jobs/${jobId}/poster`} // Optional, if backend supports it
      />
    </div>
  );
}

// PIPELINE STEPPER LOGIC
const PIPELINE_STEPS = [
  { id: 'preparing', label: 'Initialization', icon: <Layers size={16} /> },
  { id: 'analyzing', label: 'Director Planning', icon: <Sparkles size={16} /> },
  { id: 'scene_generation', label: 'Scene Mapping', icon: <ImageIcon size={16} /> },
  { id: 'media_generation', label: 'Media Rendering', icon: <Video size={16} /> },
  { id: 'assembling', label: 'Final Assembly', icon: <Film size={16} /> }
];

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    activeJob, activeLogs, activeScenes,
    setActiveJob, setActiveLogs, setActiveScenes,
    updateJob, removeJob, addToast, updateScene,
  } = useAppStore();

  useJobSocket(id);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      getJobDetail(id),
      getJobLogs(id),
      getJobScenes(id),
    ]).then(([detail, logs, scenes]) => {
      setActiveJob(detail.data);
      setActiveLogs(logs.data);
      setActiveScenes(scenes.data);
    }).catch(() => addToast('Failed to load job', 'error'));

    return () => { setActiveJob(null); setActiveLogs([]); setActiveScenes([]); };
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this job and all its files?')) return;
    try {
      await deleteJob(id);
      removeJob(id);
      addToast('Job deleted', 'success');
      navigate('/projects');
    } catch {
      addToast('Delete failed', 'error');
    }
  };

  const handleStop = async () => {
    try {
      await stopJob(id);
      addToast('Stop signal sent', 'info');
      updateJob(id, { status: 'stopping' });
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to stop', 'error');
    }
  };

  const handleResume = async () => {
    try {
      await resumeJob(id);
      addToast('Job resumed', 'success');
      updateJob(id, { status: 'queued' });
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to resume', 'error');
    }
  };

  const handleRetry = async () => {
    try {
      await retryJob(id);
      addToast('Job queued for retry', 'success');
      updateJob(id, { status: 'queued', error: null });
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to retry', 'error');
    }
  };

  const handleRetryScene = async (sceneId) => {
    try {
      const res = await retryScene(id, sceneId);
      addToast('Scene queued for retry', 'success');
      updateScene(sceneId, { status: 'pending', error: null });
      if (res.data.jobStatus === 'queued' || res.data.jobStatus === 'pending') {
        updateJob(id, { status: 'queued', error: null });
        getJobDetail(id).then(detail => setActiveJob(detail.data));
      }
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to retry scene', 'error');
    }
  };

  const job = activeJob;
  if (!job) return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
      <div className="spinner w-10 h-10 border-[3px]"></div>
    </div>
  );

  const isComplete = job.status === 'completed';
  const isFailed = job.status === 'failed';

  // Determine current step index
  const activeStepIndex = isComplete ? PIPELINE_STEPS.length : PIPELINE_STEPS.findIndex(s => s.id === job.status);

  return (
    <AppPage>

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <AppButton
            variant="icon"
            className="bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] w-10 h-10 transition-colors"
            onClick={() => navigate(-1)}
            icon={ArrowLeft}
          />
          <div>
            <h1 className="page-title">{job.title}</h1>
            <div className="flex gap-3 items-center mt-2">
              <StatusBadge status={job.status} />
              <span className="caption font-medium">
                {job.totalScenes || 0} scenes • Provider: <span className="text-[var(--text-secondary)]">{job.provider || 'Auto'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {isComplete && (
            <a href={getVideoStreamUrl(id)} download={`${job.title}.mp4`} className="btn btn-primary h-10 px-4">
              <Download size={16} /> <span className="ml-2">Export 4K MP4</span>
            </a>
          )}

          {['queued', 'preparing', 'analyzing', 'scene_generation', 'media_generation', 'assembling', 'optimizing'].includes(job.status) && (
            <AppButton variant="secondary" onClick={handleStop} icon={Pause}>
              Halt Pipeline
            </AppButton>
          )}

          {job.status === 'stopped' && (
            <AppButton variant="primary" onClick={handleResume} icon={Play}>
              Resume Pipeline
            </AppButton>
          )}

          {isFailed && (
            <AppButton variant="secondary" onClick={handleRetry} disabled={job.retryCount >= 3} icon={RefreshCw}>
              Retry Job {job.retryCount > 0 && `(${job.retryCount}/3)`}
            </AppButton>
          )}

          <AppButton variant="ghost" className="text-[var(--accent-red)] hover:bg-[var(--accent-red)] hover:bg-opacity-10 px-3" onClick={handleDelete} icon={Trash2} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* LEFT COLUMN: Main Stage & Scenes */}
        <div style={{ flex: '1 1 600px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {/* Main Stage (Video or Stepper) */}
          <AppCard noPadding>
            {isComplete ? (
              <VideoPlayer jobId={id} />
            ) : (
              <div style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                  <div>
                    <h3 className="card-title">Pipeline Status</h3>
                    <p className="caption" style={{ marginTop: 4 }}>Orchestrating AI models and assembling media</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: 'var(--bg-elevated)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', minWidth: '300px' }}>
                    <ProgressRing progress={job.progress || 0} status={job.status} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {isFailed ? 'Pipeline Failed' : job.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="caption" style={{ marginTop: 4 }}>
                        {isFailed ? job.error : `${job.completedScenes || 0} / ${job.totalScenes || '?'} scenes complete`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pipeline Stepper */}
                <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto', padding: '0 var(--space-2)' }}>
                  {/* Connecting Line background */}
                  <div style={{ position: 'absolute', top: '24px', left: '10%', right: '10%', height: '2px', background: 'var(--border-default)', zIndex: 0 }}></div>
                  {/* Active Line foreground */}
                  <div
                    style={{ position: 'absolute', top: '24px', left: '10%', height: '2px', background: 'var(--brand-primary)', zIndex: 0, transition: 'width 700ms ease-in-out', width: `${Math.max(0, Math.min(100, (activeStepIndex / (PIPELINE_STEPS.length - 1)) * 80))}%` }}
                  ></div>

                  <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between' }}>
                    {PIPELINE_STEPS.map((step, index) => {
                      const isPast = activeStepIndex > index || isComplete;
                      const isCurrent = activeStepIndex === index && !isComplete && !isFailed;
                      const isError = isFailed && activeStepIndex === index;

                      let iconBg = 'var(--bg-elevated)';
                      let iconBorder = 'var(--border-default)';
                      let iconColor = 'var(--text-muted)';
                      let iconShadow = 'none';

                      if (isPast) {
                        iconBg = 'var(--brand-primary)';
                        iconBorder = 'var(--brand-primary)';
                        iconColor = 'white';
                      }
                      if (isCurrent) {
                        iconBg = 'var(--bg-surface)';
                        iconBorder = 'var(--brand-primary)';
                        iconColor = 'var(--brand-primary)';
                        iconShadow = '0 0 15px rgba(var(--brand-primary-rgb), 0.3)';
                      }
                      if (isError) {
                        iconBg = 'var(--accent-red)';
                        iconBorder = 'var(--accent-red)';
                        iconColor = 'white';
                      }

                      return (
                        <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '20%' }}>
                          <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '50%', border: `2px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 500ms ease', background: iconBg, color: iconColor, boxShadow: iconShadow, zIndex: 10 }}>
                            {isPast ? <CheckCircle size={20} /> : step.icon}
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, textAlign: 'center', color: (isCurrent || isPast) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {step.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </AppCard>

          {/* Scene Grid */}
          <AppCard>
            <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Scene Assembly ({activeScenes.length})</h2>
            <SceneGrid scenes={activeScenes} onRetryScene={handleRetryScene} />
          </AppCard>

        </div>

        {/* RIGHT COLUMN: Logs */}
        <div style={{ width: '100%', maxWidth: '400px', flexShrink: 0 }}>
          <AppCard style={{ position: 'sticky', top: '24px', maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>System Log</h2>
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
              <LogTimeline logs={activeLogs} />
            </div>
          </AppCard>
        </div>

      </div>
    </AppPage>
  );
}
