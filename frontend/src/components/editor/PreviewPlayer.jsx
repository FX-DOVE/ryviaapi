import { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import { formatTime, videoClips } from './editorUtils';

/**
 * Preview: plays the active V1 clip under the playhead via scene stream URL.
 * Full timeline scrubbing is approximate (switches source at clip boundaries).
 */
export default function PreviewPlayer({
  timeline,
  playhead,
  setPlayhead,
  playing,
  setPlaying,
  jobId,
  aspectRatio = '16:9',
}) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const clips = videoClips(timeline?.clips || []);

  const active = clips.find(
    (c) => playhead >= c.start - 0.001 && playhead < c.start + c.duration,
  ) || clips[0];

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;

  // Build authenticated media URL — browser <video> can't send Authorization,
  // so we rely on cookie-less token query only if backend supports it.
  // Scene stream routes use authMiddleware; for preview we use the stream with
  // fetch→blob when needed. Simpler MVP: use /api/jobs/:id/scenes/:sceneId/video
  // and hope axios interceptor isn't needed — auth is Bearer. Use blob load.
  const mediaUrl = active?.mediaUrl
    || (active?.sceneId ? `/api/jobs/${jobId}/scenes/${active.sceneId}/video` : null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !mediaUrl) return;
    let revoked = null;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(mediaUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`media ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        el.src = url;
        const local = Math.max(0, (playhead - (active?.start || 0)) * (active?.speed || 1) + (active?.sourceIn || 0));
        el.currentTime = local;
        if (playing) el.play().catch(() => {});
      } catch (err) {
        console.warn('[Preview] load failed', err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, mediaUrl, jobId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) el.play().catch(() => {});
    else el.pause();
  }, [playing]);

  // Advance playhead while playing
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return undefined;
    }
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setPlayhead((p) => {
        const next = p + dt;
        const max = timeline?.duration || 0;
        if (next >= max) {
          setPlaying(false);
          return max;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, setPlayhead, setPlaying, timeline?.duration]);

  // Sync video currentTime when scrubbing while paused
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active || playing) return;
    const local = Math.max(0, playhead - active.start);
    if (Math.abs(el.currentTime - local) > 0.25) {
      try { el.currentTime = local; } catch { /* ignore */ }
    }
  }, [playhead, active, playing]);

  const [aw, ah] = String(aspectRatio).split(':').map(Number);
  const aspect = aw && ah ? `${aw} / ${ah}` : '16 / 9';

  // Text overlays at playhead
  const texts = (timeline?.clips || []).filter(
    (c) => c.trackId === 'T1' && c.type === 'text'
      && playhead >= c.start && playhead < c.start + c.duration,
  );

  return (
    <div className="editor-preview flex flex-col min-h-0 flex-1">
      <div className="flex-1 flex items-center justify-center bg-black/60 p-3 min-h-0">
        <div
          className="relative bg-black rounded-lg overflow-hidden shadow-lg max-h-full max-w-full"
          style={{ aspectRatio: aspect, width: '100%' }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            muted={false}
            onClick={() => setPlaying((p) => !p)}
          />
          {texts.map((t) => (
            <div
              key={t.id}
              className="absolute left-0 right-0 px-4 text-center pointer-events-none"
              style={{
                bottom: t.align === 'top' ? undefined : '12%',
                top: t.align === 'top' ? '10%' : undefined,
                color: t.fontColor || '#fff',
                fontSize: Math.min(48, (t.fontSize || 36) * 0.55),
                fontWeight: 700,
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
                textAlign: t.align || 'center',
                opacity: t.opacity ?? 1,
              }}
            >
              {t.text}
            </div>
          ))}
          {!active && (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-sm">
              No clip at playhead
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <button type="button" className="btn-icon" onClick={() => { setPlayhead(0); setPlaying(false); }} title="Go to start">
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="w-9 h-9 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center"
          onClick={() => setPlaying((p) => !p)}
          title="Space — play/pause"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
          {formatTime(playhead)} / {formatTime(timeline?.duration || 0)}
        </span>
        {active && (
          <span className="caption text-[var(--text-muted)] truncate ml-auto">
            {active.label}
            {active.filterId ? ` · ${active.filterId}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
