import { useNavigate } from 'react-router-dom';
import { Play, Download, Trash2, Clock, HardDrive, Film, Image as ImageIcon, Clapperboard } from 'lucide-react';
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

const STATUS_META = {
  queued:           { label: 'Queued',          color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  dot: true  },
  preparing:        { label: 'Preparing',        color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  pulse: true },
  analyzing:        { label: 'Analyzing',        color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', pulse: true },
  scene_generation: { label: 'Building Scenes',  color: '#A855F7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  pulse: true },
  media_generation: { label: 'Generating',       color: '#7C3AED', bg: 'rgba(124,58,237,0.12)',  border: 'rgba(124,58,237,0.3)',  pulse: true },
  assembling:       { label: 'Assembling',       color: '#EC4899', bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.3)',  pulse: true },
  optimizing:       { label: 'Optimizing',       color: '#10B981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  pulse: true },
  completed:        { label: 'Completed',        color: '#10B981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  dot: true  },
  failed:           { label: 'Failed',           color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   dot: true  },
};

const ACTIVE_STATUSES = ['preparing','analyzing','scene_generation','media_generation','assembling','optimizing'];

export default function JobCard({ job, onDelete }) {
  const navigate   = useNavigate();
  const isComplete = job.status === 'completed';
  const isFailed   = job.status === 'failed';
  const isRunning  = ACTIVE_STATUSES.includes(job.status);
  const meta       = STATUS_META[job.status] || { label: job.status, color: '#6B7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' };

  const progress   = job.progress || 0;

  return (
    <div
      onClick={() => navigate(`/jobs/${job._id}`)}
      style={{
        cursor: 'pointer',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'linear-gradient(160deg, #1A1A26, #101018)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.borderColor = isComplete ? 'rgba(16,185,129,0.3)' : isRunning ? 'rgba(124,58,237,0.35)' : isFailed ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.14)';
        e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.45)';
        const btn = e.currentTarget.querySelector('.job-card-delete');
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
        const btn = e.currentTarget.querySelector('.job-card-delete');
        if (btn) btn.style.opacity = '0';
      }}
    >
      {/* ── THUMBNAIL ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        overflow: 'hidden',
        background: isComplete
          ? '#000'
          : `radial-gradient(ellipse at 30% 40%, ${meta.color}18, transparent 70%), #0D0D15`,
      }}>
        {/* Grid texture */}
        {!isComplete && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `linear-gradient(${meta.color}07 1px, transparent 1px), linear-gradient(90deg, ${meta.color}07 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }} />
        )}

        {/* Glow orb */}
        {!isComplete && !isFailed && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${meta.color}20, transparent 60%)`,
          }} />
        )}

        {/* Thumbnail image */}
        {isComplete && (
          <img
            src={getThumbnailUrl(job._id)}
            alt={job.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease', display: 'block' }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}

        {/* Center icon / spinner for non-complete */}
        {!isComplete && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isRunning ? (
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: `linear-gradient(135deg, ${meta.color}28, ${meta.color}0A)`,
                border: `1px solid ${meta.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 28px ${meta.color}30`,
              }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  border: `2px solid ${meta.color}30`,
                  borderTopColor: meta.color,
                  animation: 'spin 0.8s linear infinite',
                }} />
              </div>
            ) : isFailed ? (
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
              }}>✕</div>
            ) : (
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clapperboard size={22} style={{ color: 'rgba(255,255,255,0.25)' }} />
              </div>
            )}
          </div>
        )}

        {/* Progress bar overlay (running jobs) */}
        {isRunning && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
            background: 'rgba(255,255,255,0.06)',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${meta.color}, ${meta.color}CC)`,
              transition: 'width 0.6s ease',
              boxShadow: `0 0 8px ${meta.color}80`,
            }} />
          </div>
        )}

        {/* Bottom gradient */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '55%',
          background: 'linear-gradient(to top, rgba(16,16,24,0.95), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Badges row */}
        <div style={{
          position: 'absolute', bottom: '10px', left: '12px', right: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        }}>
          {/* Status badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: '999px',
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            color: meta.color,
            backdropFilter: 'blur(8px)',
          }}>
            {isRunning && (
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: meta.color,
                display: 'inline-block',
                animation: 'pulseDot 1.4s ease-in-out infinite',
              }} />
            )}
            {meta.label}
          </span>

          {/* Preset badge */}
          {job.styleConfig?.preset && (
            <span style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: '999px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.15))',
              border: '1px solid rgba(124,58,237,0.4)',
              color: '#C4B5FD',
              backdropFilter: 'blur(8px)',
            }}>{job.styleConfig.preset}</span>
          )}
        </div>

        {/* Delete button (hover reveal) */}
        <button
          className="job-card-delete"
          onClick={e => { e.stopPropagation(); onDelete(job._id); }}
          title="Delete job"
          style={{
            position: 'absolute', top: '10px', right: '10px',
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.35)',
            cursor: 'pointer',
            opacity: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#EF4444';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
            e.currentTarget.style.background = 'rgba(239,68,68,0.14)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.background = 'rgba(0,0,0,0.55)';
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* ── BODY ── */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <h3 style={{
            fontSize: '14px', fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
          }}>{job.title}</h3>
          <span style={{
            fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500,
            flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap',
          }}>{formatDate(job.createdAt)}</span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <Film size={11} style={{ opacity: 0.6 }} />
            {job.totalScenes || 0} scenes
          </span>
          {formatDuration(job.duration) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <Clock size={11} style={{ opacity: 0.6 }} />
              {formatDuration(job.duration)}
            </span>
          )}
          {formatSize(job.fileSize) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <HardDrive size={11} style={{ opacity: 0.6 }} />
              {formatSize(job.fileSize)}
            </span>
          )}
        </div>

        {/* Progress row (running) */}
        {isRunning && (
          <div style={{ marginTop: '4px' }}>
            <div style={{
              width: '100%', height: '4px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '999px', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`,
                background: `linear-gradient(90deg, ${meta.color}, ${meta.color}BB)`,
                borderRadius: '999px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 500 }}>
              {progress}% · {job.completedScenes || 0}/{job.totalScenes || 0} scenes
            </p>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions row (completed only) */}
        {isComplete && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', gap: '8px',
              paddingTop: '10px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              marginTop: '4px',
            }}
          >
            <a
              href={getVideoStreamUrl(job._id)}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                height: '34px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                color: 'white', fontWeight: 700, fontSize: '12px',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 4px 12px rgba(124,58,237,0.35)',
                textDecoration: 'none',
                transition: 'filter 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.12)'}
              onMouseLeave={e => e.currentTarget.style.filter = ''}
            >
              <Play size={13} /> Play
            </a>
            <a
              href={getVideoStreamUrl(job._id)}
              download={`${job.title}.mp4`}
              style={{
                width: '34px', height: '34px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <Download size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
