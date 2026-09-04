import { useCallback, useRef, useState } from 'react';
import { Scissors, Trash2, Copy, ZoomIn, ZoomOut } from 'lucide-react';
import { TRACK_COLORS, formatTime, clipsOnTrack } from './editorUtils';

const TRACK_H = 36;
const LABEL_W = 72;

export default function Timeline({
  timeline,
  playhead,
  setPlayhead,
  selectedClipId,
  setSelectedClipId,
  pxPerSec,
  setPxPerSec,
  onMoveClip,
  onTrimClip,
  onSplit,
  onDelete,
  onRippleDelete,
  onDuplicate,
  simplified = false,
}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  const duration = Math.max(timeline?.duration || 10, 10);
  const width = Math.max(duration * pxPerSec + 80, 400);
  const tracks = simplified
    ? (timeline?.tracks || []).filter((t) => t.id === 'V1' || t.id === 'T1')
    : (timeline?.tracks || []);

  const timeFromClientX = useCallback((clientX) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - LABEL_W;
    return Math.max(0, Math.min(duration, x / pxPerSec));
  }, [duration, pxPerSec]);

  const onRulerDown = (e) => {
    setPlayhead(timeFromClientX(e.clientX));
  };

  const onClipPointerDown = (e, clip, mode = 'move') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedClipId(clip.id);
    const startX = e.clientX;
    const origStart = clip.start;
    const origDur = clip.duration;
    const origSourceIn = clip.sourceIn || 0;
    dragRef.current = { clipId: clip.id, mode, startX, origStart, origDur, origSourceIn };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const dt = (ev.clientX - d.startX) / pxPerSec;
      if (d.mode === 'move') {
        onMoveClip(d.clipId, Math.max(0, d.origStart + dt));
      } else if (d.mode === 'trim-left') {
        const maxShrink = d.origDur - 0.2;
        const delta = Math.max(-d.origStart, Math.min(maxShrink, dt));
        onTrimClip(d.clipId, {
          start: d.origStart + delta,
          duration: d.origDur - delta,
          sourceIn: d.origSourceIn + delta * (clip.speed || 1),
        });
      } else if (d.mode === 'trim-right') {
        const newDur = Math.max(0.2, d.origDur + dt);
        onTrimClip(d.clipId, { duration: newDur });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const ticks = [];
  const step = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : 5;
  for (let t = 0; t <= duration + 0.01; t += step) ticks.push(t);

  return (
    <div className="editor-timeline border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)]">
        <button type="button" className="btn-icon" title="Split at playhead (B)" onClick={onSplit}>
          <Scissors size={14} />
        </button>
        <button type="button" className="btn-icon" title="Delete" onClick={() => onDelete(selectedClipId)}>
          <Trash2 size={14} />
        </button>
        <button type="button" className="btn-icon" title="Ripple delete" onClick={() => onRippleDelete(selectedClipId)}>
          <Trash2 size={14} className="text-[var(--accent-orange)]" />
        </button>
        <button type="button" className="btn-icon" title="Duplicate" onClick={() => onDuplicate(selectedClipId)}>
          <Copy size={14} />
        </button>
        <div className="flex-1" />
        <button type="button" className="btn-icon" onClick={() => setPxPerSec((z) => Math.max(20, z - 10))}>
          <ZoomOut size={14} />
        </button>
        <span className="caption tabular-nums w-12 text-center">{pxPerSec}px</span>
        <button type="button" className="btn-icon" onClick={() => setPxPerSec((z) => Math.min(200, z + 10))}>
          <ZoomIn size={14} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden relative select-none"
        style={{ height: tracks.length * TRACK_H + 28 }}
        onPointerMove={(e) => setHoverX(timeFromClientX(e.clientX))}
        onPointerLeave={() => setHoverX(null)}
      >
        <div style={{ width, position: 'relative' }}>
          {/* Ruler */}
          <div
            className="h-6 border-b border-[var(--border-subtle)] relative cursor-pointer"
            style={{ marginLeft: LABEL_W }}
            onPointerDown={onRulerDown}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-[var(--border-subtle)]"
                style={{ left: t * pxPerSec }}
              >
                <span className="absolute top-0.5 left-1 text-[9px] text-[var(--text-muted)] font-mono">
                  {formatTime(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          {tracks.map((track, ti) => {
            const clips = clipsOnTrack(timeline?.clips || [], track.id);
            return (
              <div
                key={track.id}
                className="relative border-b border-[var(--border-subtle)]"
                style={{ height: TRACK_H }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget || e.target.dataset?.lane) {
                    setPlayhead(timeFromClientX(e.clientX));
                    setSelectedClipId(null);
                  }
                }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 flex items-center px-2 text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--bg-raised)] border-r border-[var(--border-subtle)] z-10"
                  style={{ width: LABEL_W }}
                >
                  {track.id}
                </div>
                <div data-lane="1" className="absolute inset-0" style={{ marginLeft: LABEL_W }}>
                  {/* waveform placeholder for audio */}
                  {track.type === 'audio' && (
                    <div className="absolute inset-y-2 left-0 right-0 opacity-20 pointer-events-none"
                      style={{
                        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, currentColor 3px, currentColor 4px)',
                        color: TRACK_COLORS[track.id],
                      }}
                    />
                  )}
                  {clips.map((clip) => {
                    const left = clip.start * pxPerSec;
                    const w = Math.max(8, clip.duration * pxPerSec);
                    const selected = clip.id === selectedClipId;
                    return (
                      <div
                        key={clip.id}
                        className={`absolute top-1 bottom-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing border ${
                          selected ? 'border-white shadow-md z-[5]' : 'border-transparent'
                        }`}
                        style={{
                          left,
                          width: w,
                          background: TRACK_COLORS[track.id] || '#6366f1',
                          opacity: clip.mute ? 0.45 : 0.92,
                        }}
                        onPointerDown={(e) => onClipPointerDown(e, clip, 'move')}
                        title={clip.label || clip.text || clip.id}
                      >
                        {/* trim handles */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70"
                          onPointerDown={(e) => onClipPointerDown(e, clip, 'trim-left')}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/30 hover:bg-white/70"
                          onPointerDown={(e) => onClipPointerDown(e, clip, 'trim-right')}
                        />
                        <div className="px-2 text-[10px] font-semibold text-white truncate leading-[28px]">
                          {clip.type === 'text' ? (clip.text || 'Text') : (clip.label || track.id)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* lane tint */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.04]"
                  style={{ background: TRACK_COLORS[track.id], marginLeft: LABEL_W }}
                />
                <span className="sr-only">{ti}</span>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-[var(--accent-warm)] z-20 pointer-events-none"
            style={{ left: LABEL_W + playhead * pxPerSec }}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-[var(--accent-warm)]" />
          </div>

          {/* Hover scrub ghost */}
          {hoverX != null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/20 z-10 pointer-events-none"
              style={{ left: LABEL_W + hoverX * pxPerSec }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
