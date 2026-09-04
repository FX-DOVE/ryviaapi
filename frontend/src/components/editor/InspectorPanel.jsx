import { ANIM_META } from './editorUtils';

function Row({ label, children }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wide">{label}</div>
      {children}
    </label>
  );
}

export default function InspectorPanel({ clip, onChange, onAddKeyframe, playhead }) {
  if (!clip) {
    return (
      <aside className="editor-panel editor-right p-4">
        <h3 className="text-sm font-semibold mb-2">Inspector</h3>
        <p className="caption text-[var(--text-muted)]">Select a clip on the timeline.</p>
      </aside>
    );
  }

  const set = (patch) => onChange({ ...clip, ...patch });
  const isVideo = clip.type === 'video';
  const isText = clip.type === 'text';
  const isAudio = clip.type === 'audio';

  return (
    <aside className="editor-panel editor-right flex flex-col min-h-0">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold truncate">{clip.label || clip.text || clip.id}</h3>
        <p className="caption text-[var(--text-muted)]">{clip.trackId} · {clip.type}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {(isAudio || isVideo) && (
          <>
            <Row label={`Volume ${((clip.volume ?? 1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={2} step={0.05} value={clip.volume ?? 1}
                onChange={(e) => set({ volume: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label="Mute">
              <input type="checkbox" checked={!!clip.mute} onChange={(e) => set({ mute: e.target.checked })} />
            </Row>
            <Row label={`Fade in ${clip.fadeIn || 0}s`}>
              <input type="range" min={0} max={3} step={0.05} value={clip.fadeIn || 0}
                onChange={(e) => set({ fadeIn: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label={`Fade out ${clip.fadeOut || 0}s`}>
              <input type="range" min={0} max={3} step={0.05} value={clip.fadeOut || 0}
                onChange={(e) => set({ fadeOut: Number(e.target.value) })} className="w-full" />
            </Row>
          </>
        )}

        {isVideo && (
          <>
            <Row label={`Speed ${(clip.speed || 1).toFixed(2)}x`}>
              <input type="range" min={0.25} max={2} step={0.05} value={clip.speed || 1}
                onChange={(e) => set({ speed: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label={`Opacity ${Math.round((clip.opacity ?? 1) * 100)}%`}>
              <input type="range" min={0} max={1} step={0.01} value={clip.opacity ?? 1}
                onChange={(e) => set({ opacity: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label={`Scale ${(clip.scale || 1).toFixed(2)}`}>
              <input type="range" min={0.1} max={3} step={0.05} value={clip.scale || 1}
                onChange={(e) => set({ scale: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label={`Rotation ${clip.rotation || 0}°`}>
              <input type="range" min={-180} max={180} step={1} value={clip.rotation || 0}
                onChange={(e) => set({ rotation: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label="Position X">
              <input type="range" min={-100} max={100} step={1} value={clip.position?.x || 0}
                onChange={(e) => set({ position: { ...(clip.position || {}), x: Number(e.target.value) } })} className="w-full" />
            </Row>
            <Row label="Position Y">
              <input type="range" min={-100} max={100} step={1} value={clip.position?.y || 0}
                onChange={(e) => set({ position: { ...(clip.position || {}), y: Number(e.target.value) } })} className="w-full" />
            </Row>
            <Row label="In animation">
              <select
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-xs"
                value={clip.animIn || ''}
                onChange={(e) => set({ animIn: e.target.value || null })}
              >
                {ANIM_META.map((a) => (
                  <option key={String(a.id)} value={a.id || ''}>{a.label}</option>
                ))}
              </select>
            </Row>
            <Row label="Out animation">
              <select
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-xs"
                value={clip.animOut || ''}
                onChange={(e) => set({ animOut: e.target.value || null })}
              >
                {ANIM_META.map((a) => (
                  <option key={String(a.id)} value={a.id || ''}>{a.label}</option>
                ))}
              </select>
            </Row>
            <Row label="Filter">
              <div className="caption text-[var(--text-secondary)]">{clip.filterId || 'none'}</div>
            </Row>
            <button
              type="button"
              className="btn btn-secondary h-8 px-3 text-xs w-full mt-1"
              onClick={() => onAddKeyframe(clip.id, playhead)}
            >
              Add keyframe at playhead
            </button>
            {(clip.keyframes || []).length > 0 && (
              <div className="mt-2 space-y-1">
                {(clip.keyframes || []).map((k, i) => (
                  <div key={i} className="caption text-[var(--text-muted)] font-mono">
                    t={Number(k.time).toFixed(2)} · {k.prop}={String(k.value)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {isText && (
          <>
            <Row label="Text">
              <textarea
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-sm min-h-[72px]"
                value={clip.text || ''}
                onChange={(e) => set({ text: e.target.value, label: e.target.value.slice(0, 24) })}
              />
            </Row>
            <Row label={`Font size ${clip.fontSize || 48}`}>
              <input type="range" min={16} max={120} step={1} value={clip.fontSize || 48}
                onChange={(e) => set({ fontSize: Number(e.target.value) })} className="w-full" />
            </Row>
            <Row label="Color">
              <input type="color" value={clip.fontColor || '#ffffff'}
                onChange={(e) => set({ fontColor: e.target.value })} />
            </Row>
            <Row label="Align">
              <select
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-xs"
                value={clip.align || 'center'}
                onChange={(e) => set({ align: e.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Row>
            <Row label="In animation">
              <select
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md px-2 py-1.5 text-xs"
                value={clip.animIn || ''}
                onChange={(e) => set({ animIn: e.target.value || null })}
              >
                {ANIM_META.map((a) => (
                  <option key={String(a.id)} value={a.id || ''}>{a.label}</option>
                ))}
              </select>
            </Row>
          </>
        )}

        {clip.native && (
          <p className="caption text-[var(--accent-green)] mt-2">
            Native LTX dialogue track — preserved on export.
          </p>
        )}
      </div>
    </aside>
  );
}
