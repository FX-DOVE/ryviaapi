import { useNavigate } from 'react-router-dom';
import { Play, Download, Trash2, Clock, HardDrive, Film, Clapperboard } from 'lucide-react';
import { getThumbnailUrl, getVideoStreamUrl } from '../api/jobs';

function formatSize(bytes) {
  if (!bytes) return null;
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function formatDuration(secs) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// Status metadata — colors reference CSS variables where possible
const STATUS_META = {
  queued:           { label: 'Queued',         color: 'var(--accent-gold)',    bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  dot: true  },
  preparing:        { label: 'Preparing',       color: 'var(--accent-blue)',    bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  pulse: true },
  analyzing:        { label: 'Analyzing',       color: 'var(--brand-light)',    bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', pulse: true },
  scene_generation: { label: 'Building Scenes', color: 'var(--brand-light)',    bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  pulse: true },
  media_generation: { label: 'Generating',      color: 'var(--brand-primary)',  bg: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.3)',  pulse: true },
  assembling:       { label: 'Assembling',      color: '#EC4899',               bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.3)',  pulse: true },
  optimizing:       { label: 'Optimizing',      color: 'var(--accent-green)',   bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  pulse: true },
  completed:        { label: 'Completed',       color: 'var(--accent-green)',   bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  dot: true  },
  failed:           { label: 'Failed',          color: 'var(--accent-red)',     bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   dot: true  },
};

const ACTIVE_STATUSES = ['preparing','analyzing','scene_generation','media_generation','assembling','optimizing'];

export default function JobCard({ job, onDelete }) {
  const navigate   = useNavigate();
  const isComplete = job.status === 'completed';
  const isFailed   = job.status === 'failed';
  const isRunning  = ACTIVE_STATUSES.includes(job.status);
  const meta       = STATUS_META[job.status] || {
    label: job.status, color: 'var(--text-muted)',
    bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)',
  };

  const progress = job.progress || 0;

  // Determine card state modifier class
  const stateClass = isComplete ? 'job-card--completed'
    : isRunning ? 'job-card--running'
    : isFailed  ? 'job-card--failed'
    : 'job-card--default';

  return (
    <div
      className={`job-card ${stateClass}`}
      onClick={() => navigate(`/app/jobs/${job._id}`)}
    >
      {/* ── THUMBNAIL ── */}
      <div
        className="job-card-thumbnail"
        style={{
          background: isComplete
            ? '#000'
            : `radial-gradient(ellipse at 30% 40%, ${meta.bg}, transparent 70%), var(--bg-elevated)`,
        }}
      >
        {/* Grid texture for non-complete */}
        {!isComplete && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(${meta.border} 1px, transparent 1px), linear-gradient(90deg, ${meta.border} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
            opacity: 0.3,
          }} />
        )}

        {/* Glow orb */}
        {!isComplete && !isFailed && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${meta.bg}, transparent 60%)`,
          }} />
        )}

        {/* Thumbnail image */}
        {isComplete && (
          <img
            src={getThumbnailUrl(job._id)}
            alt={job.title}
            style={{ transition: 'transform 0.6s ease' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}

        {/* Center icon / spinner */}
        {!isComplete && (
          <div className="job-card-thumb-placeholder">
            {isRunning ? (
              <div style={{
                width: '52px', height: '52px', borderRadius: 'var(--radius-md)',
                background: meta.bg,
                border: `1px solid ${meta.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 28px ${meta.bg}`,
              }}>
                <div
                  className="spinner"
                  style={{ borderColor: `${meta.border}`, borderTopColor: meta.color }}
                />
              </div>
            ) : isFailed ? (
              <div style={{
                width: '52px', height: '52px', borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-red)', fontSize: '22px',
              }}>✕</div>
            ) : (
              <div style={{
                width: '52px', height: '52px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clapperboard size={22} style={{ color: 'var(--text-muted)' }} />
              </div>
            )}
          </div>
        )}

        {/* Progress bar overlay */}
        {isRunning && (
          <div className="job-card-progress-bar">
            <div
              className="job-card-progress-fill"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}CC)` }}
            />
          </div>
        )}

        {/* Bottom gradient scrim */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '55%',
          background: 'linear-gradient(to top, rgba(16,16,24,0.95), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Bottom badges row */}
        <div style={{
          position: 'absolute', bottom: '10px', left: '12px', right: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        }}>
          {/* Status badge */}
          <span
            className="job-card-status-badge"
            style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
          >
            {isRunning && (
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: meta.color, display: 'inline-block',
                animation: 'pulseDot 1.4s ease-in-out infinite',
              }} />
            )}
            {meta.label}
          </span>

          {/* Preset badge */}
          {job.styleConfig?.preset && (
            <span className="badge badge-preset" style={{ fontSize: '10px', padding: '3px 8px' }}>
              {job.styleConfig.preset}
            </span>
          )}
        </div>

        {/* Delete button (hover-reveal via CSS) */}
        <button
          className="job-card-delete"
          onClick={e => { e.stopPropagation(); onDelete(job._id); }}
          title="Delete job"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── BODY ── */}
      <div className="job-card-body">
        {/* Title + date row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <h3 className="job-card-title">{job.title}</h3>
          <span className="caption" style={{ flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap' }}>
            {formatDate(job.createdAt)}
          </span>
        </div>

        {/* Meta row */}
        <div className="job-card-meta">
          <span className="job-card-meta-item">
            <Film size={11} style={{ opacity: 0.6 }} />
            {job.totalScenes || 0} scenes
          </span>
          {formatDuration(job.duration) && (
            <span className="job-card-meta-item">
              <Clock size={11} style={{ opacity: 0.6 }} />
              {formatDuration(job.duration)}
            </span>
          )}
          {formatSize(job.fileSize) && (
            <span className="job-card-meta-item">
              <HardDrive size={11} style={{ opacity: 0.6 }} />
              {formatSize(job.fileSize)}
            </span>
          )}
        </div>

        {/* Progress row (running) */}
        {isRunning && (
          <div style={{ marginTop: '4px' }}>
            <div className="progress-track" style={{ height: '4px' }}>
              <div
                className="progress-fill"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${meta.color}, ${meta.color}BB)`,
                }}
              />
            </div>
            <p className="caption" style={{ marginTop: '4px', fontWeight: 500 }}>
              {progress}% · {job.completedScenes || 0}/{job.totalScenes || 0} scenes
            </p>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Actions row (completed only) */}
        {isComplete && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', gap: '8px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '4px',
            }}
          >
            <a
              href={getVideoStreamUrl(job._id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ flex: 1, height: '34px', minHeight: 'unset', fontSize: '12px', borderRadius: 'var(--radius-sm)' }}
            >
              <Play size={13} /> Play
            </a>
            <a
              href={getVideoStreamUrl(job._id)}
              download={`${job.title}.mp4`}
              className="btn btn-secondary"
              style={{ width: '34px', height: '34px', minHeight: 'unset', padding: 0, borderRadius: 'var(--radius-sm)' }}
              title="Download"
            >
              <Download size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
