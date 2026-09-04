export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTime(sec = 0) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const ms = Math.floor((r - whole) * 10);
  return `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${ms}`;
}

export function recomputeDuration(clips = []) {
  return clips.reduce((m, c) => Math.max(m, (Number(c.start) || 0) + (Number(c.duration) || 0)), 0);
}

export function clipsOnTrack(clips, trackId) {
  return (clips || [])
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}

export function videoClips(clips) {
  return clipsOnTrack(clips, 'V1').filter((c) => c.type === 'video');
}

/** Ripple delete: remove clip and shift later same-track clips left */
export function rippleDelete(clips, clipId) {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return clips;
  const end = target.start + target.duration;
  return clips
    .filter((c) => c.id !== clipId && c.linkedClipId !== clipId)
    .map((c) => {
      if (c.trackId === target.trackId && c.start >= end - 0.001) {
        return { ...c, start: Math.max(0, c.start - target.duration) };
      }
      return c;
    });
}

export function splitClipAt(clips, clipId, playhead) {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return clips;
  const local = playhead - clip.start;
  if (local <= 0.05 || local >= clip.duration - 0.05) return clips;

  const left = {
    ...clip,
    id: uid(clip.type === 'video' ? 'v' : 'c'),
    duration: local,
    sourceOut: (clip.sourceIn || 0) + local * (clip.speed || 1),
  };
  const right = {
    ...clip,
    id: uid(clip.type === 'video' ? 'v' : 'c'),
    start: playhead,
    duration: clip.duration - local,
    sourceIn: (clip.sourceIn || 0) + local * (clip.speed || 1),
  };
  return clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]));
}

export function duplicateClip(clips, clipId) {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return clips;
  const copy = {
    ...clip,
    id: uid(clip.type === 'video' ? 'v' : 'c'),
    start: clip.start + clip.duration,
    label: `${clip.label || 'Clip'} copy`,
  };
  return [...clips, copy];
}

export const FILTER_META = [
  { id: 'cinematic', label: 'Cinematic', swatch: 'linear-gradient(135deg,#1e1b4b,#6366f1)' },
  { id: 'warm', label: 'Warm', swatch: 'linear-gradient(135deg,#78350f,#f59e0b)' },
  { id: 'cool', label: 'Cool', swatch: 'linear-gradient(135deg,#0c4a6e,#38bdf8)' },
  { id: 'vignette', label: 'Vignette', swatch: 'radial-gradient(circle,#444 40%,#000 100%)' },
  { id: 'grain', label: 'Grain', swatch: 'linear-gradient(135deg,#525252,#a3a3a3)' },
];

export const TRANSITION_META = [
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'fade-black', label: 'Fade Black' },
  { id: 'slide', label: 'Slide' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'cut', label: 'Cut' },
];

export const ANIM_META = [
  { id: null, label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide', label: 'Slide' },
  { id: 'zoom', label: 'Zoom' },
];

export const TRACK_COLORS = {
  V1: '#6366f1',
  A1: '#10b981',
  A2: '#f59e0b',
  T1: '#ec4899',
};
