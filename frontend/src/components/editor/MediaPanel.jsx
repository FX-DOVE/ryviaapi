import { Film, Music, Type, Sparkles, ArrowLeftRight, SlidersHorizontal, Upload } from 'lucide-react';
import { FILTER_META, TRANSITION_META, ANIM_META, videoClips } from './editorUtils';

const TABS = [
  { id: 'media', label: 'Media', Icon: Film },
  { id: 'audio', label: 'Audio', Icon: Music },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'effects', label: 'Effects', Icon: Sparkles },
  { id: 'transitions', label: 'Transitions', Icon: ArrowLeftRight },
  { id: 'filters', label: 'Filters', Icon: SlidersHorizontal },
];

export default function MediaPanel({
  tab, setTab,
  timeline,
  onAddText,
  onApplyFilter,
  onSetTransition,
  onApplyAnim,
  onUploadAudio,
  duckingDb,
  onDuckingChange,
  selectedClipId,
}) {
  const media = videoClips(timeline?.clips || []);
  const a2 = (timeline?.clips || []).filter((c) => c.trackId === 'A2');

  return (
    <aside className="editor-panel editor-left flex flex-col min-h-0">
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--border-subtle)]">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              tab === id
                ? 'bg-[var(--brand-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]'
            }`}
            title={label}
          >
            <Icon size={13} />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'media' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">Scene clips on V1 — drag on timeline to rearrange.</p>
            {media.length === 0 && <p className="text-sm text-[var(--text-muted)]">No video clips yet.</p>}
            {media.map((c) => (
              <div key={c.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{c.label}</div>
                <div className="caption text-[var(--text-muted)] mt-0.5">
                  {c.duration?.toFixed?.(1) || c.duration}s · @{c.start?.toFixed?.(1)}s
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'audio' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">
              A1 = native LTX dialogue (never stripped). A2 = score/SFX ducked under.
            </p>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              A2 ducking ({duckingDb} dB)
            </label>
            <input
              type="range" min={-24} max={0} step={1} value={duckingDb}
              onChange={(e) => onDuckingChange(Number(e.target.value))}
              className="w-full mb-3"
            />
            {a2.map((c) => (
              <div key={c.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 mb-2">
                <div className="text-xs font-semibold">{c.label}</div>
                <div className="caption text-[var(--text-muted)]">vol {(c.volume ?? 0.35).toFixed(2)}</div>
              </div>
            ))}
            <label className="btn btn-secondary h-9 px-3 text-xs inline-flex items-center gap-2 cursor-pointer w-full justify-center">
              <Upload size={14} /> Import audio to A2
              <input type="file" accept="audio/*,.mp3,.wav,.m4a" className="hidden" onChange={onUploadAudio} />
            </label>
          </>
        )}

        {tab === 'text' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">Add title/caption clips on T1.</p>
            <button type="button" className="btn btn-primary h-9 px-3 text-xs w-full" onClick={onAddText}>
              + Add title / caption
            </button>
            {(timeline?.clips || []).filter((c) => c.trackId === 'T1').map((c) => (
              <div key={c.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 mt-2">
                <div className="text-xs font-semibold truncate">{c.text || c.label}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'effects' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">In/out animation presets for selected clip.</p>
            <div className="grid grid-cols-2 gap-2">
              {ANIM_META.map((a) => (
                <button
                  key={String(a.id)}
                  type="button"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-xs hover:border-[var(--brand-primary)]"
                  onClick={() => onApplyAnim(a.id)}
                  disabled={!selectedClipId}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'transitions' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">Transition to next video clip (select a V1 clip).</p>
            <div className="grid grid-cols-2 gap-2">
              {TRANSITION_META.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-xs hover:border-[var(--brand-primary)]"
                  onClick={() => onSetTransition(t.id)}
                  disabled={!selectedClipId}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'filters' && (
          <>
            <p className="caption text-[var(--text-muted)] mb-2">Local ffmpeg presets — applied at export.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-subtle)] p-2 text-xs"
                onClick={() => onApplyFilter(null)}
                disabled={!selectedClipId}
              >
                None
              </button>
              {FILTER_META.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="rounded-lg border border-[var(--border-subtle)] overflow-hidden text-left hover:border-[var(--brand-primary)]"
                  onClick={() => onApplyFilter(f.id)}
                  disabled={!selectedClipId}
                >
                  <div className="h-10" style={{ background: f.swatch }} />
                  <div className="px-2 py-1.5 text-xs">{f.label}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
