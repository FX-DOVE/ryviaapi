/**
 * editorService.js — CapCut-inspired in-app film editor
 *
 * Timeline JSON on Job.editTimeline:
 *   { version, aspectRatio, duration, duckingDb, tracks[], clips[], transitions[] }
 *
 * Export rules:
 *   - Never strip LTX native audio from source video clips (drama/movie/anime).
 *   - A2 score/SFX is mixed under A1/native with configurable ducking.
 *   - Filters map to local ffmpeg presets (no paid CapCut asset libs).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Job from '../models/Job.js';
import Scene from '../models/Scene.js';
import { SCENE_STATUS, tempDir, outputDir, audioDir } from '../config/constants.js';
import { hasAudioStream, isNativeAudioGenre, scoreDuckDb } from './audioMixService.js';

const execAsync = promisify(exec);

export const EDITOR_FILTERS = {
  cinematic: "curves=r='0/0 0.5/0.55 1/1':g='0/0 0.5/0.5 1/0.95':b='0/0 1/0.9'",
  warm: 'colortemperature=temperature=4500',
  cool: 'colortemperature=temperature=7500',
  vignette: 'vignette=PI/4',
  grain: 'noise=alls=8:allf=t+u',
};

export const TRANSITION_TYPES = ['dissolve', 'fade-black', 'slide', 'wipe', 'cut'];
export const ANIM_PRESETS = ['fade', 'slide', 'zoom', 'none'];

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function aspectToSize(aspect = '16:9') {
  const map = {
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '1:1': [1080, 1080],
    '4:5': [1080, 1350],
    '21:9': [1920, 822],
    '4:3': [1440, 1080],
  };
  return map[aspect] || map['16:9'];
}

/** Build empty CapCut-style tracks */
export function emptyTracks() {
  return [
    { id: 'V1', type: 'video', name: 'Video', locked: false },
    { id: 'A1', type: 'audio', name: 'Native / Dialogue', locked: false },
    { id: 'A2', type: 'audio', name: 'Score / SFX', locked: false },
    { id: 'T1', type: 'text', name: 'Text Overlays', locked: false },
  ];
}

export function createEmptyTimeline({ aspectRatio = '16:9' } = {}) {
  return {
    version: 1,
    aspectRatio,
    duration: 0,
    duckingDb: scoreDuckDb(),
    tracks: emptyTracks(),
    clips: [],
    transitions: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Bootstrap timeline from completed scenes + optional scorePath on A2.
 */
export async function bootstrapTimeline(job) {
  const scenes = await Scene.find({
    jobId: job._id,
    status: { $in: [SCENE_STATUS.DONE, 'completed', 'done'] },
  }).sort({ sceneNumber: 1 });

  const withVideo = scenes.filter((s) => s.videoPath);
  const timeline = createEmptyTimeline({
    aspectRatio: job.aspectRatio || '16:9',
  });

  let cursor = 0;
  const clips = [];
  const transitions = [];

  for (let i = 0; i < withVideo.length; i++) {
    const s = withVideo[i];
    const dur = Math.max(0.5, Number(s.duration) || 8);
    const clipId = uid('v');
    clips.push({
      id: clipId,
      trackId: 'V1',
      type: 'video',
      sceneId: String(s._id),
      sceneNumber: s.sceneNumber,
      label: `Scene ${s.sceneNumber}`,
      sourcePath: s.videoPath,
      mediaUrl: `/api/jobs/${job._id}/scenes/${s._id}/video`,
      start: cursor,
      duration: dur,
      sourceIn: 0,
      sourceOut: dur,
      volume: 1,
      mute: false,
      fadeIn: 0,
      fadeOut: 0,
      speed: 1,
      opacity: 1,
      scale: 1,
      position: { x: 0, y: 0 },
      rotation: 0,
      filterId: null,
      animIn: null,
      animOut: null,
      keyframes: [],
    });

    // Implicit A1 marker (native audio rides on the video clip — never stripped)
    clips.push({
      id: uid('a1'),
      trackId: 'A1',
      type: 'audio',
      linkedClipId: clipId,
      label: `Dialogue S${s.sceneNumber}`,
      start: cursor,
      duration: dur,
      sourceIn: 0,
      sourceOut: dur,
      volume: 1,
      mute: false,
      fadeIn: 0,
      fadeOut: 0,
      waveform: 'placeholder',
      native: true,
    });

    if (i > 0) {
      const prev = clips.filter((c) => c.trackId === 'V1')[i - 1];
      const tOut = String(withVideo[i - 1].transitionOut || 'cut').toLowerCase();
      const type =
        tOut === 'fade' ? 'fade-black'
          : tOut === 'dissolve' ? 'dissolve'
            : tOut === 'wipe' ? 'wipe'
              : 'cut';
      if (type !== 'cut') {
        transitions.push({
          id: uid('tr'),
          fromClipId: prev.id,
          toClipId: clipId,
          type,
          duration: 0.5,
        });
      }
    }

    cursor += dur;
  }

  // Seed A2 from audioMix.scorePath when present
  const scorePath = job.audioMix?.scorePath;
  if (scorePath && fs.existsSync(scorePath) && cursor > 0) {
    clips.push({
      id: uid('a2'),
      trackId: 'A2',
      type: 'audio',
      label: 'Underscore score',
      sourcePath: scorePath,
      mediaUrl: null,
      start: 0,
      duration: cursor,
      sourceIn: 0,
      sourceOut: cursor,
      volume: 0.35,
      mute: false,
      fadeIn: 0.5,
      fadeOut: 1,
      duckUnderNative: true,
      waveform: 'placeholder',
    });
  }

  timeline.clips = clips;
  timeline.transitions = transitions;
  timeline.duration = cursor;
  timeline.updatedAt = new Date().toISOString();
  return timeline;
}

export function validateTimeline(raw) {
  if (!raw || typeof raw !== 'object') {
    throw Object.assign(new Error('Timeline must be an object'), { status: 400 });
  }
  const tl = {
    version: Number(raw.version) || 1,
    aspectRatio: raw.aspectRatio || '16:9',
    duration: Math.max(0, Number(raw.duration) || 0),
    duckingDb: Number.isFinite(Number(raw.duckingDb)) ? Number(raw.duckingDb) : scoreDuckDb(),
    tracks: Array.isArray(raw.tracks) && raw.tracks.length ? raw.tracks : emptyTracks(),
    clips: Array.isArray(raw.clips) ? raw.clips : [],
    transitions: Array.isArray(raw.transitions) ? raw.transitions : [],
    updatedAt: new Date().toISOString(),
  };

  // Soft-sanitize clip numbers
  for (const c of tl.clips) {
    if (!c.id) c.id = uid('clip');
    c.start = Math.max(0, Number(c.start) || 0);
    c.duration = Math.max(0.05, Number(c.duration) || 1);
    c.speed = clamp(Number(c.speed) || 1, 0.25, 2);
    c.volume = clamp(Number(c.volume) ?? 1, 0, 2);
    c.opacity = clamp(Number(c.opacity) ?? 1, 0, 1);
    c.scale = clamp(Number(c.scale) ?? 1, 0.1, 4);
    c.rotation = Number(c.rotation) || 0;
    if (c.filterId && !EDITOR_FILTERS[c.filterId]) c.filterId = null;
  }

  // Recompute duration from clips if needed
  const maxEnd = tl.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  if (maxEnd > tl.duration) tl.duration = maxEnd;

  return tl;
}

async function probeDuration(mediaPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${mediaPath}"`,
      { timeout: 30000 },
    );
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

function escapeDrawtext(s = '') {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ')
    .slice(0, 200);
}

function filterForClip(clip) {
  const parts = [];
  if (clip.filterId && EDITOR_FILTERS[clip.filterId]) {
    parts.push(EDITOR_FILTERS[clip.filterId]);
  }
  // Opacity via colorchannelmixer / format+colorchannelmixer is heavy;
  // use geq for alpha when opacity < 1 after format=yuva420p
  if (clip.opacity != null && clip.opacity < 0.999) {
    const a = clamp(clip.opacity, 0, 1);
    parts.push(`format=yuva420p,colorchannelmixer=aa=${a}`);
  }
  const scale = clamp(Number(clip.scale) || 1, 0.1, 4);
  const rot = Number(clip.rotation) || 0;
  if (Math.abs(scale - 1) > 0.01) {
    parts.push(`scale=iw*${scale}:ih*${scale}`);
  }
  if (Math.abs(rot) > 0.01) {
    parts.push(`rotate=${(rot * Math.PI) / 180}:fillcolor=black@0`);
  }
  // In/out animation fades (simple opacity ramp via fade filter)
  const fadeIn = Number(clip.fadeIn) || (clip.animIn === 'fade' ? 0.4 : 0);
  const fadeOut = Number(clip.fadeOut) || (clip.animOut === 'fade' ? 0.4 : 0);
  const dur = Math.max(0.1, Number(clip.duration) || 1);
  if (fadeIn > 0) parts.push(`fade=t=in:st=0:d=${Math.min(fadeIn, dur / 2)}`);
  if (fadeOut > 0) {
    const st = Math.max(0, dur - fadeOut);
    parts.push(`fade=t=out:st=${st}:d=${Math.min(fadeOut, dur / 2)}`);
  }
  return parts.join(',');
}

function xfadeName(type) {
  switch (type) {
    case 'dissolve': return 'fade';
    case 'fade-black': return 'fadeblack';
    case 'slide': return 'slideleft';
    case 'wipe': return 'wipeleft';
    default: return 'fade';
  }
}

/**
 * Render timeline → final.mp4 (editor export), preserving native clip audio.
 */
export async function exportTimeline(jobId, timeline) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const tl = validateTimeline(timeline || job.editTimeline);
  const tmp = path.join(tempDir(jobId), 'editor');
  const outDir = outputDir(jobId);
  await fs.promises.mkdir(tmp, { recursive: true });
  await fs.promises.mkdir(outDir, { recursive: true });

  await Job.findByIdAndUpdate(jobId, {
    'editorExport.status': 'rendering',
    'editorExport.progress': 5,
    'editorExport.error': null,
    'editorExport.startedAt': new Date(),
    'editorExport.finishedAt': null,
  });

  const [W, H] = aspectToSize(tl.aspectRatio);
  const scalePad = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=25,setsar=1`;

  const videoClips = tl.clips
    .filter((c) => c.trackId === 'V1' && c.type === 'video')
    .sort((a, b) => a.start - b.start);

  if (!videoClips.length) {
    throw new Error('No video clips on V1 to export');
  }

  // 1. Standardize each video clip (keep native audio)
  const prepared = [];
  for (let i = 0; i < videoClips.length; i++) {
    const clip = videoClips[i];
    const src = clip.sourcePath;
    if (!src || !fs.existsSync(src)) {
      console.warn(`[Editor] Missing source for clip ${clip.id}: ${src}`);
      continue;
    }

    const speed = clamp(Number(clip.speed) || 1, 0.25, 2);
    const sourceIn = Math.max(0, Number(clip.sourceIn) || 0);
    const outDur = Math.max(0.1, Number(clip.duration) || 1);
    // source duration needed at given speed
    const readDur = outDur * speed;

    const vfParts = [scalePad];
    const clipVf = filterForClip({ ...clip, duration: outDur });
    if (clipVf) vfParts.push(clipVf);

    // setpts for speed
    if (Math.abs(speed - 1) > 0.01) {
      vfParts.push(`setpts=PTS/${speed}`);
    }

    const outPath = path.join(tmp, `clip_${String(i).padStart(3, '0')}.mp4`);
    const hasA = await hasAudioStream(src);
    const afParts = [];
    if (Math.abs(speed - 1) > 0.01) {
      // atempo supports 0.5–2.0; chain if needed
      let s = speed;
      const tempos = [];
      while (s > 2.0) { tempos.push(2.0); s /= 2.0; }
      while (s < 0.5) { tempos.push(0.5); s /= 0.5; }
      tempos.push(s);
      for (const t of tempos) afParts.push(`atempo=${t.toFixed(4)}`);
    }
    const vol = clip.mute ? 0 : clamp(Number(clip.volume) ?? 1, 0, 2);
    if (vol !== 1) afParts.push(`volume=${vol}`);
    const fadeIn = Number(clip.fadeIn) || 0;
    const fadeOut = Number(clip.fadeOut) || 0;
    if (fadeIn > 0) afParts.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) afParts.push(`afade=t=out:st=${Math.max(0, outDur - fadeOut)}:d=${fadeOut}`);

    if (hasA) {
      const af = afParts.length ? `-af "${afParts.join(',')}"` : '';
      await execAsync(
        `ffmpeg -y -ss ${sourceIn} -t ${readDur} -i "${src}" ` +
          `-vf "${vfParts.join(',')}" ${af} ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k -ar 44100 -ac 2 -t ${outDur} ` +
          `"${outPath}"`,
        { timeout: 600000 },
      );
    } else {
      await execAsync(
        `ffmpeg -y -ss ${sourceIn} -t ${readDur} -i "${src}" ` +
          `-f lavfi -i anullsrc=r=44100:cl=stereo ` +
          `-vf "${vfParts.join(',')}" ` +
          `-map 0:v:0 -map 1:a:0 -shortest ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k -ar 44100 -ac 2 -t ${outDur} ` +
          `"${outPath}"`,
        { timeout: 600000 },
      );
    }

    prepared.push({ clip, path: outPath, duration: outDur });
    await Job.findByIdAndUpdate(jobId, {
      'editorExport.progress': 10 + Math.round((i / videoClips.length) * 40),
    });
  }

  if (!prepared.length) throw new Error('No preparable video clips for export');

  // 2. Chain with xfade transitions (or concat if cut)
  let mergedPath = prepared[0].path;
  let mergedDur = prepared[0].duration;

  for (let i = 1; i < prepared.length; i++) {
    const prevClip = prepared[i - 1].clip;
    const next = prepared[i];
    const tr = (tl.transitions || []).find(
      (t) => t.fromClipId === prevClip.id && t.toClipId === next.clip.id,
    );
    const trType = tr?.type || 'cut';
    const trDur = clamp(Number(tr?.duration) || 0.5, 0.1, Math.min(mergedDur, next.duration) / 2);
    const stepOut = path.join(tmp, `merge_${i}.mp4`);

    if (trType === 'cut' || !tr) {
      const listPath = path.join(tmp, `concat_${i}.txt`);
      await fs.promises.writeFile(
        listPath,
        `file '${mergedPath.replace(/\\/g, '/')}'\nfile '${next.path.replace(/\\/g, '/')}'\n`,
        'utf8',
      );
      await execAsync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k -ar 44100 -ac 2 "${stepOut}"`,
        { timeout: 600000 },
      );
      mergedDur += next.duration;
    } else {
      const offset = Math.max(0, mergedDur - trDur);
      const xname = xfadeName(trType);
      await execAsync(
        `ffmpeg -y -i "${mergedPath}" -i "${next.path}" ` +
          `-filter_complex "[0:v][1:v]xfade=transition=${xname}:duration=${trDur}:offset=${offset}[v];` +
          `[0:a][1:a]acrossfade=d=${trDur}[a]" ` +
          `-map "[v]" -map "[a]" ` +
          `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k -ar 44100 -ac 2 "${stepOut}"`,
        { timeout: 600000 },
      );
      mergedDur = mergedDur + next.duration - trDur;
    }
    mergedPath = stepOut;
    await Job.findByIdAndUpdate(jobId, {
      'editorExport.progress': 50 + Math.round((i / prepared.length) * 20),
    });
  }

  // 3. Text overlays (drawtext)
  const textClips = tl.clips
    .filter((c) => c.trackId === 'T1' && c.type === 'text' && c.text)
    .sort((a, b) => a.start - b.start);

  let withTextPath = mergedPath;
  if (textClips.length) {
    withTextPath = path.join(tmp, 'with_text.mp4');
    const filters = textClips.map((c) => {
      const start = Number(c.start) || 0;
      const end = start + (Number(c.duration) || 2);
      const size = Math.max(12, Number(c.fontSize) || 48);
      const color = (c.fontColor || '#ffffff').replace('#', '');
      const align = c.align || 'center';
      let x = '(w-text_w)/2';
      if (align === 'left') x = '40';
      if (align === 'right') x = 'w-text_w-40';
      const y = c.position?.y != null
        ? `h*${clamp(0.5 + (Number(c.position.y) || 0) / 200, 0.05, 0.9)}`
        : 'h*0.82';
      const txt = escapeDrawtext(c.text);
      return `drawtext=text='${txt}':fontsize=${size}:fontcolor=0x${color}:x=${x}:y=${y}:enable='between(t,${start},${end})':shadowcolor=black@0.6:shadowx=2:shadowy=2`;
    });
    await execAsync(
      `ffmpeg -y -i "${mergedPath}" -vf "${filters.join(',')}" ` +
        `-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ` +
        `-c:a copy "${withTextPath}"`,
      { timeout: 600000 },
    );
  }

  // 4. Mix A2 score/SFX under native (never replace native)
  const a2Clips = tl.clips
    .filter((c) => c.trackId === 'A2' && c.type === 'audio' && c.sourcePath && fs.existsSync(c.sourcePath))
    .sort((a, b) => a.start - b.start);

  let finalMixPath = withTextPath;
  if (a2Clips.length) {
    finalMixPath = path.join(tmp, 'with_a2.mp4');
    // Build a single A2 bed spanning timeline (first clip or concat)
    const bedPath = path.join(tmp, 'a2_bed.m4a');
    const primary = a2Clips[0];
    const bedVol = primary.mute ? 0 : clamp(Number(primary.volume) ?? 0.35, 0, 2);
    const duckDb = Number.isFinite(Number(tl.duckingDb)) ? Number(tl.duckingDb) : scoreDuckDb();
    // Further duck relative to full scale
    const linear = bedVol * Math.pow(10, duckDb / 20);

    await execAsync(
      `ffmpeg -y -stream_loop -1 -i "${primary.sourcePath}" -t ${mergedDur} ` +
        `-af "volume=${linear.toFixed(4)},afade=t=in:st=0:d=${Number(primary.fadeIn) || 0.3},` +
        `afade=t=out:st=${Math.max(0, mergedDur - (Number(primary.fadeOut) || 0.8))}:d=${Number(primary.fadeOut) || 0.8}" ` +
        `-c:a aac -b:a 192k -ar 44100 -ac 2 "${bedPath}"`,
      { timeout: 300000 },
    );

    // Mix: preserve video native audio, duck A2 under it
    const videoHasA = await hasAudioStream(withTextPath);
    if (videoHasA) {
      await execAsync(
        `ffmpeg -y -i "${withTextPath}" -i "${bedPath}" ` +
          `-filter_complex "[1:a]volume=1[a2];[0:a][a2]amix=inputs=2:duration=first:dropout_transition=2:weights=1 0.7[aout]" ` +
          `-map 0:v:0 -map "[aout]" -c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 -shortest "${finalMixPath}"`,
        { timeout: 600000 },
      );
    } else {
      await execAsync(
        `ffmpeg -y -i "${withTextPath}" -i "${bedPath}" ` +
          `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${finalMixPath}"`,
        { timeout: 600000 },
      );
    }
  }

  // 5. Final faststart encode → editor_final.mp4 (keep original final.mp4 intact)
  const exportPath = path.join(outDir, 'editor_final.mp4');
  await execAsync(
    `ffmpeg -y -i "${finalMixPath}" ` +
      `-c:v libx264 -crf 23 -preset veryfast -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
      `-movflags +faststart "${exportPath}"`,
    { timeout: 600000 },
  );

  const duration = await probeDuration(exportPath);

  await Job.findByIdAndUpdate(jobId, {
    'editorExport.status': 'done',
    'editorExport.progress': 100,
    'editorExport.outputPath': exportPath,
    'editorExport.finishedAt': new Date(),
    // Optionally promote to finalVideoPath so stream endpoint serves the edit
    finalVideoPath: exportPath,
    duration: duration || job.duration,
  });

  return { outputPath: exportPath, duration };
}

export async function getOrBootstrapTimeline(job) {
  // Respect a previously saved timeline (even if clips were cleared)
  if (job.editTimeline && typeof job.editTimeline === 'object' && job.editTimeline.version) {
    return validateTimeline(job.editTimeline);
  }
  const tl = await bootstrapTimeline(job);
  await Job.findByIdAndUpdate(job._id, { editTimeline: tl });
  return tl;
}

export default {
  EDITOR_FILTERS,
  TRANSITION_TYPES,
  ANIM_PRESETS,
  createEmptyTimeline,
  bootstrapTimeline,
  validateTimeline,
  exportTimeline,
  getOrBootstrapTimeline,
};
