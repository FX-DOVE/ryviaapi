import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Trash2, Play, Pause, RefreshCw, Film, Sparkles,
  Layers, Image as ImageIcon, CheckCircle, Video, Users, MapPin,
  ChevronDown, ChevronUp, ShieldCheck, User, Volume2, Shirt, Clapperboard,
  RotateCcw, Eye, Clock, AlertCircle, Quote, Sparkle, Camera, Compass,
  ZoomIn, X, ExternalLink, Scissors
} from 'lucide-react';
import useAppStore from '../store/useAppStore';
import {
  getJobDetail, getJobLogs, getJobScenes, deleteJob, stopJob, resumeJob,
  retryJob, retryScene, getVideoStreamUrl, getSceneImageUrl, getSceneVideoUrl,
  getCharacterLockImageUrl, getEnvironmentLockImageUrl
} from '../api/jobs';
import { useJobSocket } from '../hooks/useSocket';
import StatusBadge from '../components/StatusBadge';
import LogTimeline from '../components/LogTimeline';

import { AppPage } from '../components/ui/AppPage';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { useConfirm } from '../components/ui/ConfirmDialog';

function ProgressRing({ progress, status }) {
  const isComplete = status === 'completed';
  const isFailed = status === 'failed';
  const color = isFailed ? 'var(--accent-red)' : isComplete ? 'var(--accent-green)' : 'var(--brand-primary)';
  return (
    <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border-default)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${Math.max(0, Math.min(100, progress || 0)) * 1.76} 200`}
          className="transition-all duration-500 ease-in-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold">{Math.round(progress || 0)}%</span>
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
      />
    </div>
  );
}

// ── Interactive Image Lightbox Modal ──────────────────────────────────────────
function ImageLightboxModal({ preview, onClose }) {
  if (!preview) return null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--bg-raised)]">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <span className="text-lg">{preview.icon || <Film size={16}/>}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{preview.title}</h3>
              {preview.badge && (
                <span className="text-[10px] text-[var(--brand-light)] font-semibold uppercase tracking-wider">{preview.badge}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={preview.src}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--glass-border)] text-xs flex items-center gap-1 transition-colors"
              title="Open full image in new tab"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline text-[11px] font-medium">Open Full</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--glass-border)] transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image Preview Container */}
        <div className="flex-1 bg-black/75 flex items-center justify-center p-4 overflow-auto min-h-[300px] max-h-[65vh]">
          <img
            src={preview.src}
            alt={preview.title}
            className="max-w-full max-h-[60vh] object-contain rounded-[var(--radius-md)] shadow-2xl border border-white/10"
          />
        </div>

        {/* Details / Prompt / Subtitle */}
        {preview.subtitle && (
          <div className="p-4 bg-[var(--bg-surface)] border-t border-[var(--glass-border)] text-xs text-[var(--text-secondary)] leading-relaxed max-h-32 overflow-y-auto">
            {preview.label && <strong className="text-[var(--text-primary)] block mb-1">{preview.label}</strong>}
            {preview.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// Visual Character Avatar Card Component with click-to-preview
function CharacterAvatar({ jobId, name, role, onPreview, physicalDescription }) {
  const [imgError, setImgError] = useState(false);
  const initials = (name || 'C').slice(0, 2).toUpperCase();
  const imageUrl = getCharacterLockImageUrl(jobId, name);

  const colorPalettes = [
    'from-purple-900/60 to-indigo-900/60 border-purple-500/30 text-purple-200',
    'from-emerald-900/60 to-teal-900/60 border-emerald-500/30 text-emerald-200',
    'from-amber-900/60 to-orange-900/60 border-amber-500/30 text-amber-200',
    'from-rose-900/60 to-pink-900/60 border-rose-500/30 text-rose-200',
  ];
  const charCode = (name || '').charCodeAt(0) || 0;
  const palette = colorPalettes[charCode % colorPalettes.length];

  const handleClick = () => {
    if (!imgError && onPreview) {
      onPreview({
        title: `${name} — Master Character Lock`,
        badge: role ? `${role.toUpperCase()} • MASTER LOCK` : 'CHARACTER LOCK',
        icon: <User size={16} />,
        src: imageUrl,
        label: 'Character Appearance & Physical Prompt',
        subtitle: physicalDescription || 'Master photorealistic character reference lock portrait.',
      });
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`w-16 h-16 rounded-[var(--radius-md)] overflow-hidden bg-gradient-to-br ${palette} border shrink-0 flex flex-col items-center justify-center relative shadow-inner transition-transform duration-300 ${!imgError ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-purple-500/50 group/avatar' : ''}`}
      title={!imgError ? `Click to view full reference lock image for ${name}` : name}
    >
      {!imgError ? (
        <>
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
            <ZoomIn size={18} />
          </div>
          <div className="absolute top-1 right-1 p-0.5 rounded bg-[var(--accent-green)] text-white shadow" title="Visual Reference Locked">
            <ShieldCheck size={10} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <span className="font-bold text-base tracking-wider">{initials}</span>
          <span className="text-[8px] uppercase tracking-widest opacity-70 mt-0.5">{role?.slice(0, 4) || 'CAST'}</span>
        </div>
      )}
    </div>
  );
}

// Visual Environment Plate Card with click-to-preview
function EnvironmentPlate({ jobId, locationId, name, onPreview, description }) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = getEnvironmentLockImageUrl(jobId, locationId);

  const handleClick = () => {
    if (!imgError && onPreview) {
      onPreview({
        title: `${name || locationId} — Environment Reference Plate`,
        badge: 'MASTER LOCATION SET',
        icon: <Film size={16} />,
        src: imageUrl,
        label: 'Location Environment & Lighting',
        subtitle: description || 'Master location plate establishing shot used as reference for all scenes in this set.',
      });
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`w-16 h-16 rounded-[var(--radius-md)] overflow-hidden bg-gradient-to-br from-blue-950/60 to-slate-900/60 border border-blue-500/20 shrink-0 flex flex-col items-center justify-center relative shadow-inner transition-transform duration-300 ${!imgError ? 'cursor-pointer hover:scale-105 hover:ring-2 hover:ring-blue-500/50 group/plate' : ''}`}
      title={!imgError ? `Click to view full reference plate for ${name || locationId}` : (name || locationId)}
    >
      {!imgError ? (
        <>
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/plate:opacity-100 flex items-center justify-center transition-opacity text-white">
            <ZoomIn size={18} />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-blue-300/80">
          <Compass size={22} className="opacity-80" />
          <span className="text-[8px] uppercase font-mono tracking-tighter mt-1 opacity-70">SET</span>
        </div>
      )}
    </div>
  );
}

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

  const { confirm, confirmDialog } = useConfirm();

  // Collapsible cards state
  const [openSections, setOpenSections] = useState({
    characters: true,
    environments: true,
    directorPlan: true,
    scenes: true,
  });

  // Scene video preview state
  const [playingSceneId, setPlayingSceneId] = useState(null);
  const [expandedSceneId, setExpandedSceneId] = useState(null);

  // Full-size image preview lightbox modal
  const [previewImage, setPreviewImage] = useState(null);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
    const ok = await confirm({
      title: 'Delete job?',
      message: 'This permanently deletes the job and all its files. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteJob(id);
      removeJob(id);
      addToast('Job deleted', 'success');
      navigate('/app/projects');
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
      addToast('Pipeline started — workers will generate all assets', 'success');
      updateJob(id, { status: 'queued' });
      getJobDetail(id).then(detail => setActiveJob(detail.data));
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
  const isStoppedOrCancelled = ['stopped', 'cancelled', 'failed'].includes(job.status);

  // Determine current step index
  const activeStepIndex = isComplete ? PIPELINE_STEPS.length : PIPELINE_STEPS.findIndex(s => s.id === job.status);

  // Extract director plan details
  const directorPlan = job.directorPlan || {};
  const characters = directorPlan.characters || [];
  const environments = directorPlan.environments || [];
  const acts = directorPlan.acts || [];
  const characterLocks = job.characterLocks || {};
  const environmentLocks = job.environmentLocks || {};

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
            <div className="flex gap-3 items-center mt-2 flex-wrap">
              <StatusBadge status={job.status} />
              <span className="caption font-medium">
                {activeScenes.length || job.totalScenes || 0} scenes • Provider: <span className="text-[var(--text-secondary)]">{job.provider || 'Auto'}</span>
              </span>
              {job.animationStyle && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium border bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] capitalize">
                  {job.animationStyle.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {(isComplete || activeScenes.some(s => s.videoPath || s.status === 'done')) && (
            <AppButton variant="secondary" onClick={() => navigate(`/app/jobs/${id}/editor`)} icon={Scissors}>
              Edit in Studio
            </AppButton>
          )}

          {isComplete && (
            <a href={getVideoStreamUrl(id)} download={`${job.title}.mp4`} className="btn btn-primary h-10 px-4">
              <Download size={16} /> <span className="ml-2">Export 4K MP4</span>
            </a>
          )}

          {['queued', 'preparing', 'analyzing', 'directing', 'locking', 'scene_generation', 'media_generation', 'assembling', 'optimizing'].includes(job.status) && (
            <AppButton variant="secondary" onClick={handleStop} icon={Pause}>
              Halt Pipeline
            </AppButton>
          )}

          {isStoppedOrCancelled && (
            <AppButton variant="primary" onClick={handleResume} icon={Play}>
              Resume Generation
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

      {/* PIPELINE RESUME BANNER IF STOPPED */}
      {isStoppedOrCancelled && (
        <div className="mb-6 p-4 rounded-[var(--radius-lg)] bg-[color-mix(in_srgb,var(--brand-primary)_12%,var(--bg-surface))] border border-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center shrink-0">
              <Sparkle size={18} />
            </div>
            <div>
              <div className="font-semibold text-sm text-[var(--text-primary)]">
                Director Plan Ready ({characters.length} characters, {activeScenes.length} scenes)
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                Click Resume Generation to have GPU workers generate all master character portraits, scene keyframes, and video clips.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResume}
            className="btn btn-primary h-9 px-4 shrink-0 text-xs font-semibold"
          >
            <Play size={14} className="mr-1.5" /> Start Asset Generation
          </button>
        </div>
      )}

      <div className="flex items-start flex-wrap gap-[var(--space-4)]">

        {/* LEFT COLUMN: Main Stage & Collapsible Cards */}
        <div className="flex flex-col gap-[var(--space-4)] flex-[1_1_650px] min-w-0">

          {/* 1. Main Stage (Video or Stepper) */}
          <AppCard noPadding>
            {isComplete ? (
              <VideoPlayer jobId={id} />
            ) : (
              <div className="p-[var(--space-5)]">
                <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] mb-[var(--space-6)]">
                  <div>
                    <h3 className="card-title">Pipeline Status</h3>
                    <p className="caption mt-1">Orchestrating AI models and assembling media</p>
                  </div>
                  <div className="flex items-center gap-[var(--space-3)] bg-[var(--bg-elevated)] p-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] w-full sm:w-auto sm:min-w-[300px]">
                    <ProgressRing progress={job.progress || 0} status={job.status} />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">
                        {isFailed ? 'Pipeline Failed' : job.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="caption mt-1">
                        {isFailed ? job.error : `${job.completedScenes || 0} / ${activeScenes.length || job.totalScenes || '?'} scenes complete`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pipeline Stepper — horizontally scrollable on narrow screens so
                    icons/labels never compress or overlap (5 steps don't fit
                    comfortably below ~480px at readable size). */}
                <div className="relative max-w-[800px] mx-auto px-[var(--space-2)] overflow-x-auto sm:overflow-visible [-webkit-overflow-scrolling:touch]">
                  <div className="relative min-w-[420px] sm:min-w-0">
                    <div className="absolute top-6 left-[10%] right-[10%] h-[2px] bg-[var(--border-default)] z-0"></div>
                    <div
                      style={{
                        position: 'absolute', top: '24px', left: '10%', height: '2px',
                        background: 'var(--brand-primary)', zIndex: 0, transition: 'width 700ms ease-in-out',
                        width: `${Math.max(0, Math.min(100, (activeStepIndex / (PIPELINE_STEPS.length - 1)) * 80))}%`
                      }}
                    ></div>

                    <div className="relative z-10 flex justify-between">
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
                          <div key={step.id} className="flex flex-col items-center gap-3 w-1/5">
                            <div
                              className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 z-10"
                              style={{ border: `2px solid ${iconBorder}`, background: iconBg, color: iconColor, boxShadow: iconShadow }}
                            >
                              {isPast ? <CheckCircle size={20} /> : step.icon}
                            </div>
                            <div className={`text-xs font-semibold text-center ${isCurrent || isPast ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                              {step.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </AppCard>

          {/* 2. CHARACTERS & REFERENCE LOCKS (Collapsible Card) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              onClick={() => toggleSection('characters')}
              className="w-full px-5 py-4 flex items-center justify-between bg-[var(--bg-raised)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--glass-border)] text-left"
            >
              <div className="flex items-center gap-2.5">
                <Users size={16} className="text-[var(--brand-light)]" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Characters & Visual Consistency Locks
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-secondary)]">
                  {characters.length} characters
                </span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                <span>{openSections.characters ? 'Collapse' : 'Expand'}</span>
                {openSections.characters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {openSections.characters && (
              <div className="p-5">
                {job.visualDna && (
                  <div className="mb-4 p-3.5 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,var(--bg-sunken))] border border-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)]">
                    <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-[var(--brand-light)]">
                      <Sparkles size={14} />
                      <span>Master World & Setting DNA (Multimodal Vision Continuity)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
                      <div><strong className="text-[var(--text-primary)]">Country / Region: </strong>{job.visualDna.country_or_region}</div>
                      <div><strong className="text-[var(--text-primary)]">Atmosphere: </strong>{job.visualDna.socio_economic_setting}</div>
                      <div><strong className="text-[var(--text-primary)]">Lighting Setup: </strong>{job.visualDna.lighting_style}</div>
                      <div><strong className="text-[var(--text-primary)]">Cinematography: </strong>{job.visualDna.film_stock_look || job.visualDna.camera_lens_and_depth}</div>
                    </div>
                  </div>
                )}
                {characters.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic py-2">
                    No characters identified yet. Once the director analyzes the script, character profiles and master lock portraits will appear here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {characters.map((char, idx) => {
                      const lock = characterLocks[char.name] || characterLocks[char.name.toLowerCase()];
                      const hasMasterImage = Boolean(lock?.referenceImagePath);

                      return (
                        <div
                          key={idx}
                          className="flex flex-col bg-[var(--bg-sunken)] border border-[var(--glass-border)] rounded-[var(--radius-md)] p-4 relative overflow-hidden group hover:border-[var(--border-default)] transition-colors"
                        >
                          <div className="flex items-start gap-3.5 mb-3">
                            {/* Avatar / Master Reference Image */}
                            <CharacterAvatar
                              jobId={id}
                              name={char.name}
                              role={char.role}
                              hasLockImage={hasMasterImage}
                              physicalDescription={char.physicalDescription}
                              onPreview={setPreviewImage}
                            />

                            {/* Name & Role */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-sm text-[var(--text-primary)] truncate">{char.name}</h4>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${
                                  char.role === 'protagonist'
                                    ? 'bg-[color-mix(in_srgb,var(--brand-primary)_15%,transparent)] text-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)]'
                                    : char.role === 'antagonist'
                                    ? 'bg-[color-mix(in_srgb,var(--accent-red)_15%,transparent)] text-[var(--accent-red)] border-[color-mix(in_srgb,var(--accent-red)_30%,transparent)]'
                                    : 'bg-[var(--bg-overlay)] text-[var(--text-secondary)] border-[var(--glass-border)]'
                                }`}>
                                  {char.role || 'character'}
                                </span>
                              </div>

                              {char.voiceDescription && (
                                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-1 truncate">
                                  <Volume2 size={11} className="shrink-0 text-[var(--text-secondary)]" />
                                  <span className="truncate">{char.voiceDescription}</span>
                                </div>
                              )}

                              <div className="text-[10px] text-[var(--accent-green)] flex items-center gap-1 mt-1 font-medium">
                                <ShieldCheck size={11} />
                                <span>
                                  {lock?.referenceUsed
                                    ? '📸 Image-to-Image Lock (Visual Reference Preserved)'
                                    : hasMasterImage
                                    ? '🎨 Text-to-Image Lock (World DNA Synchronized)'
                                    : 'Detailed Prompt Lock Active'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Physical Description */}
                          {char.physicalDescription && (
                            <div className="text-xs text-[var(--text-secondary)] mb-2 line-clamp-3 bg-[var(--bg-surface)] p-2 rounded border border-[var(--glass-border)]">
                              <span className="font-medium text-[var(--text-primary)]">Appearance: </span>
                              {char.physicalDescription}
                            </div>
                          )}

                          {/* Wardrobe */}
                          {char.clothingDefault && (
                            <div className="text-[11px] text-[var(--text-muted)] flex items-start gap-1.5 mt-auto pt-1">
                              <Shirt size={12} className="shrink-0 text-[var(--brand-light)] mt-0.5" />
                              <span className="line-clamp-2">
                                <strong className="text-[var(--text-primary)]">Default: </strong>
                                {char.clothingDefault}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. ENVIRONMENTS & SETS (Collapsible Card) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              onClick={() => toggleSection('environments')}
              className="w-full px-5 py-4 flex items-center justify-between bg-[var(--bg-raised)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--glass-border)] text-left"
            >
              <div className="flex items-center gap-2.5">
                <MapPin size={16} className="text-[var(--brand-light)]" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Environments & Location Sets
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-secondary)]">
                  {environments.length} sets
                </span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                <span>{openSections.environments ? 'Collapse' : 'Expand'}</span>
                {openSections.environments ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {openSections.environments && (
              <div className="p-5">
                {environments.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic py-2">
                    No environments registered yet. Set descriptions and environment continuity locks will appear here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {environments.map((env, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col bg-[var(--bg-sunken)] border border-[var(--glass-border)] rounded-[var(--radius-md)] p-4 hover:border-[var(--border-default)] transition-colors"
                      >
                        <div className="flex items-start gap-3.5 mb-2">
                          <EnvironmentPlate
                            jobId={id}
                            locationId={env.locationId}
                            name={env.name || env.locationId}
                            description={env.description}
                            onPreview={setPreviewImage}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-semibold text-sm text-[var(--text-primary)] truncate">{env.name || env.locationId}</h4>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium border bg-[var(--bg-surface)] border-[var(--glass-border)] text-[var(--accent-green)] flex items-center gap-1 shrink-0">
                                <ShieldCheck size={10} /> Set Locked
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">ID: {env.locationId}</span>
                          </div>
                        </div>

                        {env.description && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-3 mb-3">
                            {env.description}
                          </p>
                        )}

                        {env.timeVariants && (
                          <div className="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-[var(--glass-border)] text-[10px]">
                            {env.timeVariants.day && (
                              <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--glass-border)]">
                                <div className="font-semibold text-[var(--text-primary)] mb-0.5">Day</div>
                                <div className="text-[var(--text-muted)] line-clamp-2">{env.timeVariants.day}</div>
                              </div>
                            )}
                            {env.timeVariants.night && (
                              <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--glass-border)]">
                                <div className="font-semibold text-[var(--text-primary)] mb-0.5">Night</div>
                                <div className="text-[var(--text-muted)] line-clamp-2">{env.timeVariants.night}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. CINEMATIC DIRECTOR PLAN & ACTS (Collapsible Card) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              onClick={() => toggleSection('directorPlan')}
              className="w-full px-5 py-4 flex items-center justify-between bg-[var(--bg-raised)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--glass-border)] text-left"
            >
              <div className="flex items-center gap-2.5">
                <Clapperboard size={16} className="text-[var(--brand-light)]" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Cinematic Director Plan & Story Breakdown
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-secondary)]">
                  {acts.length} acts • {directorPlan.totalBeats || 0} beats
                </span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                <span>{openSections.directorPlan ? 'Collapse' : 'Expand'}</span>
                {openSections.directorPlan ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {openSections.directorPlan && (
              <div className="p-5 space-y-4">
                {directorPlan.logline && (
                  <div className="p-3.5 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--brand-primary)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand-primary)_20%,transparent)] flex items-start gap-2.5">
                    <Quote size={18} className="text-[var(--brand-light)] shrink-0 mt-0.5 opacity-80" />
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-[var(--brand-light)] tracking-wide">Film Logline</div>
                      <p className="text-xs text-[var(--text-primary)] font-medium mt-0.5">{directorPlan.logline}</p>
                    </div>
                  </div>
                )}

                {acts.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic py-2">
                    No acts decomposed yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {acts.map((act) => (
                      <div key={act.actNumber} className="border border-[var(--glass-border)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--bg-sunken)]">
                        <div className="px-4 py-2.5 bg-[var(--bg-raised)] border-b border-[var(--glass-border)] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[var(--text-primary)]">
                              Act {act.actNumber}: {act.title || 'Scene Flow'}
                            </span>
                            {act.emotion && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-medium border bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--glass-border)] capitalize">
                                {act.emotion}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {act.scenes?.length || 0} scenes
                          </span>
                        </div>

                        <div className="p-3 space-y-2">
                          {act.description && (
                            <p className="text-[11px] text-[var(--text-secondary)] italic mb-2">
                              {act.description}
                            </p>
                          )}

                          <div className="grid grid-cols-1 gap-2">
                            {(act.scenes || []).map((scene) => (
                              <div key={scene.sceneNumber || scene.globalSceneNumber} className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--glass-border)] text-xs">
                                <div className="flex items-center justify-between gap-2 font-medium text-[var(--text-primary)] mb-1">
                                  <span>Scene {scene.globalSceneNumber || scene.sceneNumber}: {scene.location}</span>
                                  <span className="text-[10px] font-mono text-[var(--brand-light)]">{scene.timeOfDay || 'day'}</span>
                                </div>
                                <p className="text-[11px] text-[var(--text-secondary)] mb-1.5">{scene.summary}</p>
                                <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-3">
                                  <span>Characters: <strong className="text-[var(--text-primary)]">{(scene.characters || []).join(', ') || 'None'}</strong></span>
                                  <span>Beats: <strong className="text-[var(--text-primary)]">{scene.beats?.length || 1}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. SCENE ASSEMBLY & GENERATED MEDIA (Collapsible Card) */}
          <div className="bg-[var(--bg-surface)] border border-[var(--glass-border)] rounded-[var(--radius-lg)] overflow-hidden shadow-sm transition-all">
            <button
              type="button"
              onClick={() => toggleSection('scenes')}
              className="w-full px-5 py-4 flex items-center justify-between bg-[var(--bg-raised)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--glass-border)] text-left"
            >
              <div className="flex items-center gap-2.5">
                <Film size={16} className="text-[var(--brand-light)]" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Scene Assembly & Media Gallery
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-surface)] border border-[var(--glass-border)] text-[var(--text-secondary)]">
                  {activeScenes.length} scenes
                </span>
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                <span>{openSections.scenes ? 'Collapse' : 'Expand'}</span>
                {openSections.scenes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {openSections.scenes && (
              <div className="p-5">
                {activeScenes.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic py-2">
                    No scenes generated yet. Scenes will be populated as the AI director maps out the story.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeScenes.map((scene) => {
                      const hasImage = Boolean(scene.imagePath || scene.segments?.[0]?.keyframePath);
                      const hasVideo = Boolean(scene.videoPath || scene.segments?.[0]?.videoPath);
                      const isPlaying = playingSceneId === scene._id;
                      const isExpanded = expandedSceneId === scene._id;

                      return (
                        <div
                          key={scene._id}
                          className="flex flex-col bg-[var(--bg-sunken)] border border-[var(--glass-border)] rounded-[var(--radius-md)] overflow-hidden hover:border-[var(--border-default)] transition-all"
                        >
                          {/* Media Preview Box */}
                          <div className="aspect-video bg-black/50 relative overflow-hidden flex items-center justify-center group">
                            {isPlaying && hasVideo ? (
                              <video
                                src={getSceneVideoUrl(id, scene._id)}
                                autoPlay
                                controls
                                className="w-full h-full object-contain"
                                onEnded={() => setPlayingSceneId(null)}
                              />
                            ) : hasImage ? (
                              <div className="relative w-full h-full group/sceneImg cursor-pointer" onClick={() => {
                                if (!hasVideo) {
                                  setPreviewImage({
                                    title: `Scene ${scene.sceneNumber}: ${scene.location || 'Location'}`,
                                    badge: `SCENE ${scene.sceneNumber} KEYFRAME`,
                                    icon: <Clapperboard size={16} />,
                                    src: getSceneImageUrl(id, scene._id),
                                    label: 'Scene Action & Keyframe Framing',
                                    subtitle: scene.actionDescription || scene.summary || scene.description || 'Master scene anchor keyframe.',
                                  });
                                }
                              }}>
                                <img
                                  src={getSceneImageUrl(id, scene._id)}
                                  alt={`Scene ${scene.sceneNumber}`}
                                  className="w-full h-full object-cover group-hover/sceneImg:scale-105 transition-transform duration-300"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/sceneImg:opacity-100 flex items-center justify-center transition-opacity text-white">
                                  <ZoomIn size={22} className="drop-shadow-lg" />
                                </div>
                                {hasVideo && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPlayingSceneId(scene._id);
                                    }}
                                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                                      <Play size={18} className="ml-0.5" />
                                    </div>
                                  </button>
                                )}
                              </div>
                            ) : (
                              /* Cinematic Slate Fallback */
                              <div className="w-full h-full p-3 flex flex-col justify-between bg-gradient-to-b from-slate-900/90 to-slate-950/95 border-b border-white/5">
                                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                                  <span>SCENE {scene.sceneNumber}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 uppercase">
                                    {scene.cameraType || scene.beats?.[0]?.cameraAngle || 'MEDIUM'}
                                  </span>
                                </div>
                                <div className="text-center my-auto">
                                  <Camera size={20} className="mx-auto text-[var(--brand-light)] opacity-70 mb-1" />
                                  <div className="text-[11px] font-medium text-white/90 truncate px-2">
                                    {scene.location || `Scene ${scene.sceneNumber}`}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)]">
                                  <span className="capitalize">{scene.timeOfDay || 'day'}</span>
                                  <span className="text-[var(--accent-blue)] font-medium">Ready to Render</span>
                                </div>
                              </div>
                            )}

                            {/* Status Overlay Badge */}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-black/70 backdrop-blur-md text-white border border-white/10">
                              Scene {scene.sceneNumber}
                            </div>
                          </div>

                          {/* Footer & Meta */}
                          <div className="p-3 flex flex-col flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {scene.location || `Scene ${scene.sceneNumber}`}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {scene.status === 'failed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryScene(scene._id)}
                                    className="p-1 rounded text-[var(--accent-red)] hover:bg-[var(--bg-elevated)]"
                                    title="Retry Scene"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase ${
                                  scene.status === 'done' || scene.status === 'completed'
                                    ? 'bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)] text-[var(--accent-green)] border-[color-mix(in_srgb,var(--accent-green)_26%,transparent)]'
                                    : scene.status === 'failed'
                                    ? 'bg-[color-mix(in_srgb,var(--accent-red)_12%,transparent)] text-[var(--accent-red)] border-[color-mix(in_srgb,var(--accent-red)_26%,transparent)]'
                                    : scene.status === 'generating'
                                    ? 'bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] text-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand-primary)_26%,transparent)]'
                                    : 'bg-[var(--bg-overlay)] text-[var(--text-muted)] border-[var(--glass-border)]'
                                }`}>
                                  {scene.status}
                                </span>
                              </div>
                            </div>

                            {scene.actionDescription && (
                              <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mb-2">
                                {scene.actionDescription}
                              </p>
                            )}

                            {/* Collapsible Beat Details */}
                            <div className="mt-auto pt-2 border-t border-[var(--glass-border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                              <span>{scene.beats?.length || 1} segments ({(scene.beats?.length || 1) * 8}s)</span>
                              <button
                                type="button"
                                onClick={() => setExpandedSceneId(isExpanded ? null : scene._id)}
                                className="text-[var(--brand-light)] hover:underline font-medium flex items-center gap-0.5"
                              >
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                            </div>

                            {isExpanded && scene.beats?.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-[var(--glass-border)] space-y-1.5 text-[10px]">
                                {scene.beats.map((b, bIdx) => (
                                  <div key={bIdx} className="p-1.5 rounded bg-[var(--bg-surface)] border border-[var(--glass-border)]">
                                    <div className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                                      <span>Beat {b.beatNumber || bIdx + 1} ({b.cameraAngle || 'medium'})</span>
                                      <span className="text-[var(--text-muted)] font-mono">{b.duration || 8}s</span>
                                    </div>
                                    {b.dialogue && (
                                      <div className="text-[var(--text-secondary)] italic mt-0.5">
                                        "{b.dialogue}" {b.speaker && `— ${b.speaker}`}
                                      </div>
                                    )}
                                    {b.action && (
                                      <div className="text-[var(--text-muted)] mt-0.5">{b.action}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Logs */}
        <div className="w-full max-w-[380px] shrink-0">
          <AppCard className="sticky top-6 flex flex-col max-h-[calc(100vh-100px)]">
            <h2 className="section-title mb-[var(--space-3)] flex items-center gap-2">
              <Clock size={15} className="text-[var(--text-secondary)]" />
              System Log
            </h2>
            <div className="custom-scrollbar flex-1 overflow-y-auto pr-2">
              <LogTimeline logs={activeLogs} />
            </div>
          </AppCard>
        </div>

      </div>
      {confirmDialog}
      <ImageLightboxModal preview={previewImage} onClose={() => setPreviewImage(null)} />
    </AppPage>
  );
}
