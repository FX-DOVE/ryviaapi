/**
 * audioMixService.js — Underscore score beds + native-dialogue mix
 *
 * Critical product rule for drama / movie / anime:
 *   LTX already outputs native dialogue + room tone. Never strip or replace it.
 *   audioSpine music/sfx/silence is an UNDERSCORE layer ducked UNDER dialogue.
 *   Silence cues = intentional score dips, not deletion of native audio.
 *
 * Documentary / explainer / commercial may still use narration overlay elsewhere;
 * this service only builds the spine mix + optional native+score final_mix.
 *
 * Default path is ffmpeg-only procedural beds (no paid music API).
 * Optional future hooks: MUSIC_API_URL / MUSIC_API_KEY (not required).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { audioDir, tempDir } from '../config/constants.js';

const execAsync = promisify(exec);

/** Genres where LTX native dialogue must be preserved end-to-end. */
export const NATIVE_AUDIO_GENRES = new Set([
  'drama',
  'movie',
  'anime',
  'animation_anime',
  'nollywood',
  'nollywood_drama',
  'cinematic_trailer',
  'cinematic',
]);

export function isNativeAudioGenre(genreOrType = '') {
  const key = String(genreOrType || '').toLowerCase().trim();
  return NATIVE_AUDIO_GENRES.has(key);
}

export function isAudioMixEnabled() {
  const v = String(process.env.AUDIO_MIX_ENABLED ?? 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'off';
}

/** Base score level before sidechain ducking (dB relative to full scale). */
export function scoreDuckDb() {
  const n = Number(process.env.SCORE_DUCK_DB);
  return Number.isFinite(n) ? n : -12;
}

export function scoreBaseVolume() {
  // Convert SCORE_DUCK_DB to linear amplitude for ffmpeg volume=
  const db = scoreDuckDb();
  return Math.pow(10, db / 20);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * ffprobe: does this media file have at least one audio stream?
 */
export async function hasAudioStream(mediaPath) {
  if (!mediaPath || !fs.existsSync(mediaPath)) return false;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${mediaPath}"`,
      { timeout: 30000 },
    );
    return String(stdout || '').toLowerCase().includes('audio');
  } catch {
    return false;
  }
}

export async function probeDurationSec(mediaPath) {
  if (!mediaPath || !fs.existsSync(mediaPath)) return 0;
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

/**
 * Map mood / intensity → procedural lavfi generators (underscore beds only).
 * Labels are explicit: these are NOT licensed music — soft pads / noise beds.
 */
function bedLavfiSources({ mood = '', intensity = 5, duration = 8, type = 'music' }) {
  const dur = Math.max(0.25, Number(duration) || 8);
  const i = Math.min(10, Math.max(1, Number(intensity) || 5));
  const amp = 0.012 + (i / 10) * 0.04; // keep beds quiet — underscore only
  const m = String(mood || '').toLowerCase();

  if (type === 'silence') {
    return {
      label: 'underscore_silence',
      inputs: [`-f lavfi -i anullsrc=r=44100:cl=stereo:d=${dur}`],
      filter: null,
      mapHint: '0:a',
    };
  }

  if (type === 'sfx') {
    // Soft impact / whoosh-ish pink burst — still an underscore bed, not dialogue
    return {
      label: 'underscore_sfx_bed',
      inputs: [
        `-f lavfi -i anoisesrc=color=pink:duration=${Math.min(1.2, dur)}:amplitude=${0.08 + i * 0.01}`,
        `-f lavfi -i anullsrc=r=44100:cl=stereo:d=${dur}`,
      ],
      filter: `[0:a]lowpass=f=800,afade=t=out:st=0.15:d=0.6,apad=whole_dur=${dur}[sfx];[1:a][sfx]amix=inputs=2:duration=first:dropout_transition=0,volume=${amp * 1.4}[out]`,
      mapHint: '[out]',
    };
  }

  // music / default — mood-mapped soft pads + filtered noise
  let f1 = 110;
  let f2 = 164.81;
  let noiseColor = 'pink';
  let lowpass = 350;

  if (/tens|dark|suspen|thriller|fear|omin/.test(m)) {
    f1 = 55; f2 = 82.5; noiseColor = 'brown'; lowpass = 280;
  } else if (/warm|romanc|love|tender|hope|gentle/.test(m)) {
    f1 = 220; f2 = 277.18; noiseColor = 'pink'; lowpass = 500;
  } else if (/triumph|hero|epic|victory|power/.test(m)) {
    f1 = 146.83; f2 = 220; noiseColor = 'pink'; lowpass = 600;
  } else if (/sad|grief|mourn|melanch|loss/.test(m)) {
    f1 = 98; f2 = 146.83; noiseColor = 'brown'; lowpass = 320;
  } else if (/joy|play|light|comic|upbeat/.test(m)) {
    f1 = 261.63; f2 = 329.63; noiseColor = 'white'; lowpass = 700;
  }

  return {
    label: `underscore_pad_${(m || 'neutral').replace(/\W+/g, '_').slice(0, 24) || 'neutral'}`,
    inputs: [
      `-f lavfi -i anoisesrc=color=${noiseColor}:duration=${dur}:amplitude=${amp}`,
      `-f lavfi -i sine=frequency=${f1}:duration=${dur}`,
      `-f lavfi -i sine=frequency=${f2}:duration=${dur}`,
    ],
    filter:
      `[0:a]lowpass=f=${lowpass},volume=0.7[n];` +
      `[1:a]volume=${0.05 + i * 0.004}[t1];` +
      `[2:a]volume=${0.035 + i * 0.003}[t2];` +
      `[n][t1][t2]amix=inputs=3:duration=first:dropout_transition=0,` +
      `afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, dur - 0.5)}:d=0.45,` +
      `volume=${amp * 8}[out]`,
    mapHint: '[out]',
  };
}

/**
 * Generate one underscore bed WAV for a cue (ffmpeg-only, offline).
 * Optional MUSIC_API_* hooks are reserved for a future paid bed provider.
 */
export async function generateUnderscoreBed({
  outPath,
  duration = 8,
  mood = 'neutral',
  intensity = 5,
  type = 'music',
  cue = '',
}) {
  await ensureDir(path.dirname(outPath));

  // Future hook — never required for default offline path
  if (process.env.MUSIC_API_URL && process.env.MUSIC_API_KEY) {
    console.log(
      `[AudioMix] MUSIC_API_* set but offline procedural beds are the default; ` +
      `skipping remote fetch for cue="${cue || type}"`,
    );
  }

  const spec = bedLavfiSources({ mood, intensity, duration, type });
  const filterArg = spec.filter
    ? `-filter_complex "${spec.filter}" -map "${spec.mapHint}"`
    : `-map ${spec.mapHint}`;

  const cmd =
    `ffmpeg -y ${spec.inputs.join(' ')} ${filterArg} ` +
    `-c:a pcm_s16le -ar 44100 -ac 2 "${outPath}"`;

  await execAsync(cmd, { timeout: 120000 });
  if (!fs.existsSync(outPath)) {
    throw new Error(`Underscore bed not written: ${outPath}`);
  }
  return { path: outPath, label: spec.label, type, mood, intensity, cue };
}

/**
 * Build scene start offsets (seconds) from ordered scenes with durations.
 */
export function computeSceneTimeline(scenes = []) {
  const timeline = [];
  let t = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const duration = Math.max(0.1, Number(s.duration) || Number(s.estimatedDuration) || 8);
    const sceneNumber = Number(s.sceneNumber ?? i + 1);
    timeline.push({
      index: i,
      sceneNumber,
      start: t,
      duration,
      videoPath: s.videoPath || s.localPath || null,
    });
    t += duration;
  }
  return { entries: timeline, totalDuration: t };
}

/**
 * Place audioSpine cues onto a continuous score timeline WAV/AAC.
 * Silence cues = intentional dips (anullsrc), never "delete native".
 */
export async function buildScoreTimeline({
  jobId,
  scenes = [],
  audioSpine = [],
  lookBible = null,
}) {
  const outRoot = audioDir(jobId);
  const bedsDir = path.join(outRoot, 'beds');
  const tmp = path.join(tempDir(jobId), 'audio_mix');
  await ensureDir(bedsDir);
  await ensureDir(tmp);

  const { entries, totalDuration } = computeSceneTimeline(scenes);
  if (totalDuration <= 0) {
    throw new Error('Cannot build score timeline: total duration is 0');
  }

  const sceneStartByNumber = new Map(entries.map((e) => [e.sceneNumber, e.start]));
  // Also allow atScene 0 (cold open) → start 0
  if (!sceneStartByNumber.has(0)) sceneStartByNumber.set(0, 0);

  const cues = (Array.isArray(audioSpine) ? audioSpine : [])
    .filter((c) => c && Number.isFinite(Number(c.atScene)))
    .slice()
    .sort((a, b) => Number(a.atScene) - Number(b.atScene));

  // Default soft underscore if spine empty — quiet ambient for whole film
  const paletteHint = lookBible?.colorPalette || lookBible?.palette || '';
  if (cues.length === 0) {
    cues.push({
      atScene: entries[0]?.sceneNumber ?? 1,
      type: 'music',
      cue: 'Default underscore ambient bed (no spine cues)',
      mood: paletteHint ? 'warm' : 'neutral',
      intensity: 3,
    });
  }

  // Determine each cue's duration: until next cue start or end of film
  const placed = cues.map((c, idx) => {
    const at = Number(c.atScene);
    let start = sceneStartByNumber.has(at)
      ? sceneStartByNumber.get(at)
      : (entries.find((e) => e.sceneNumber >= at)?.start ?? 0);
    // If atScene points past last scene, clamp
    if (start >= totalDuration) start = Math.max(0, totalDuration - 0.5);
    const next = cues[idx + 1];
    let end = totalDuration;
    if (next) {
      const nat = Number(next.atScene);
      end = sceneStartByNumber.has(nat)
        ? sceneStartByNumber.get(nat)
        : (entries.find((e) => e.sceneNumber >= nat)?.start ?? totalDuration);
    }
    if (end <= start) end = Math.min(totalDuration, start + 8);
    return {
      ...c,
      type: ['music', 'silence', 'sfx'].includes(c.type) ? c.type : 'music',
      start,
      duration: Math.max(0.25, end - start),
    };
  });

  const bedPaths = [];
  for (let i = 0; i < placed.length; i++) {
    const c = placed[i];
    const bedPath = path.join(bedsDir, `cue_${String(i).padStart(3, '0')}_${c.type}.wav`);
    await generateUnderscoreBed({
      outPath: bedPath,
      duration: c.duration,
      mood: c.mood,
      intensity: c.intensity,
      type: c.type,
      cue: c.cue,
    });
    bedPaths.push({ path: bedPath, start: c.start, duration: c.duration, type: c.type });
  }

  // Mix beds onto a silent canvas of totalDuration via adelay + amix
  const canvasPath = path.join(tmp, 'score_canvas.wav');
  await execAsync(
    `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo:d=${totalDuration.toFixed(3)} -c:a pcm_s16le "${canvasPath}"`,
    { timeout: 120000 },
  );

  // Build filter: canvas + each bed delayed
  // adelay takes ms for each channel
  const inputs = [`-i "${canvasPath}"`];
  const parts = [];
  for (let i = 0; i < bedPaths.length; i++) {
    const b = bedPaths[i];
    inputs.push(`-i "${b.path}"`);
    const delayMs = Math.round(b.start * 1000);
    parts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},apad=whole_dur=${totalDuration.toFixed(3)}[b${i}]`);
  }
  const mixInputs = ['[0:a]', ...bedPaths.map((_, i) => `[b${i}]`)].join('');
  const n = bedPaths.length + 1;
  const filter =
    (parts.length ? parts.join(';') + ';' : '') +
    `${mixInputs}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0,` +
    `volume=${scoreBaseVolume().toFixed(4)}[out]`;

  const scoreWav = path.join(outRoot, 'score_bed.wav');
  const scoreM4a = path.join(outRoot, 'score_bed.m4a');

  await execAsync(
    `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filter}" -map "[out]" -c:a pcm_s16le -ar 44100 -ac 2 "${scoreWav}"`,
    { timeout: 600000 },
  );
  await execAsync(
    `ffmpeg -y -i "${scoreWav}" -c:a aac -b:a 192k -ar 44100 -ac 2 "${scoreM4a}"`,
    { timeout: 300000 },
  );

  return {
    scorePath: scoreM4a,
    scoreWavPath: scoreWav,
    bedsDir,
    totalDuration,
    cueCount: placed.length,
    placed,
  };
}

/**
 * Extract / concat native audio from scene videos into one timeline WAV.
 * Videos without audio contribute silence of matching duration.
 */
export async function extractNativeAudioTimeline({ jobId, scenes = [] }) {
  const outRoot = audioDir(jobId);
  const tmp = path.join(tempDir(jobId), 'audio_mix', 'native_parts');
  await ensureDir(tmp);
  await ensureDir(outRoot);

  const { entries, totalDuration } = computeSceneTimeline(scenes);
  const parts = [];
  let anyNative = false;

  for (const e of entries) {
    const partPath = path.join(tmp, `native_${String(e.index).padStart(4, '0')}.wav`);
    const hasA = e.videoPath && (await hasAudioStream(e.videoPath));
    if (hasA) {
      anyNative = true;
      await execAsync(
        `ffmpeg -y -i "${e.videoPath}" -t ${e.duration.toFixed(3)} ` +
          `-vn -acodec pcm_s16le -ar 44100 -ac 2 "${partPath}"`,
        { timeout: 300000 },
      );
      // Pad/trim to exact duration
      const actual = await probeDurationSec(partPath);
      if (actual + 0.05 < e.duration) {
        const padded = partPath.replace(/\.wav$/, '_pad.wav');
        await execAsync(
          `ffmpeg -y -i "${partPath}" -af "apad=whole_dur=${e.duration.toFixed(3)}" -c:a pcm_s16le "${padded}"`,
          { timeout: 120000 },
        );
        await fs.promises.rename(padded, partPath);
      } else if (actual > e.duration + 0.05) {
        const trimmed = partPath.replace(/\.wav$/, '_trim.wav');
        await execAsync(
          `ffmpeg -y -i "${partPath}" -t ${e.duration.toFixed(3)} -c:a pcm_s16le "${trimmed}"`,
          { timeout: 120000 },
        );
        await fs.promises.rename(trimmed, partPath);
      }
    } else {
      await execAsync(
        `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo:d=${e.duration.toFixed(3)} -c:a pcm_s16le "${partPath}"`,
        { timeout: 60000 },
      );
    }
    parts.push(partPath);
  }

  const listFile = path.join(tmp, 'native_concat.txt');
  await fs.promises.writeFile(
    listFile,
    parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
    'utf8',
  );

  const nativeWav = path.join(outRoot, 'native_dialogue.wav');
  const nativeM4a = path.join(outRoot, 'native_dialogue.m4a');
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a pcm_s16le -ar 44100 -ac 2 "${nativeWav}"`,
    { timeout: 600000 },
  );
  await execAsync(
    `ffmpeg -y -i "${nativeWav}" -c:a aac -b:a 192k -ar 44100 -ac 2 "${nativeM4a}"`,
    { timeout: 300000 },
  );

  return {
    nativePath: nativeM4a,
    nativeWavPath: nativeWav,
    hasNativeAudio: anyNative,
    totalDuration,
  };
}

/**
 * Duck score under native dialogue via sidechaincompress, write final_mix.m4a.
 * If no native audio: score (+ ambience) only.
 */
export async function mixNativeWithScore({
  jobId,
  nativePath,
  scorePath,
  hasNativeAudio = true,
}) {
  const outRoot = audioDir(jobId);
  await ensureDir(outRoot);
  const mixPath = path.join(outRoot, 'final_mix.m4a');
  const mixWav = path.join(outRoot, 'final_mix.wav');

  if (!scorePath || !fs.existsSync(scorePath)) {
    throw new Error('mixNativeWithScore requires scorePath');
  }

  if (!hasNativeAudio || !nativePath || !fs.existsSync(nativePath)) {
    // Score / ambience only
    await execAsync(
      `ffmpeg -y -i "${scorePath}" -c:a aac -b:a 192k -ar 44100 -ac 2 "${mixPath}"`,
      { timeout: 300000 },
    );
    return { mixPath, mode: 'score_only' };
  }

  // sidechain: dialogue keys the compressor on the score bed
  const filter =
    `[1:a]volume=1.0[score];` +
    `[score][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=350:makeup=1:detection=peak[ducked];` +
    `[0:a]volume=1.0[dial];` +
    `[dial][ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mix]`;

  await execAsync(
    `ffmpeg -y -i "${nativePath}" -i "${scorePath}" ` +
      `-filter_complex "${filter}" -map "[mix]" -c:a pcm_s16le -ar 44100 -ac 2 "${mixWav}"`,
    { timeout: 600000 },
  );
  await execAsync(
    `ffmpeg -y -i "${mixWav}" -c:a aac -b:a 192k -ar 44100 -ac 2 "${mixPath}"`,
    { timeout: 300000 },
  );

  return { mixPath, mixWavPath: mixWav, mode: 'native_plus_ducked_score' };
}

/**
 * Full pipeline for a job: detect native streams, build score bed, mix, write stems.
 *
 * @returns {{ mixPath, scorePath, nativePath, hasNativeAudio, totalDuration, mode }}
 */
export async function buildFinalMix({
  jobId,
  scenes = [],
  audioSpine = [],
  genre = '',
  videoType = '',
  lookBible = null,
}) {
  if (!isAudioMixEnabled()) {
    return { skipped: true, reason: 'AUDIO_MIX_ENABLED=false' };
  }

  const usable = (scenes || []).filter((s) => s && (s.videoPath || s.localPath));
  if (!usable.length) {
    throw new Error('buildFinalMix: no scenes with local video paths');
  }

  // Normalize videoPath
  const normalized = usable.map((s) => ({
    ...s,
    videoPath: s.videoPath || s.localPath,
    duration: s.duration || s.estimatedDuration || 8,
  }));

  const genreKey = videoType || genre || '';
  const preferNative = isNativeAudioGenre(genreKey);

  // Probe how many clips actually carry audio
  let nativeCount = 0;
  for (const s of normalized) {
    if (await hasAudioStream(s.videoPath)) nativeCount += 1;
  }

  const score = await buildScoreTimeline({
    jobId,
    scenes: normalized,
    audioSpine,
    lookBible,
  });

  const native = await extractNativeAudioTimeline({ jobId, scenes: normalized });

  const hasNative = native.hasNativeAudio || nativeCount > 0;
  // For drama/movie/anime we always attempt to keep native when present
  const mix = await mixNativeWithScore({
    jobId,
    nativePath: native.nativePath,
    scorePath: score.scorePath,
    hasNativeAudio: hasNative,
  });

  console.log(
    `[AudioMix] job=${jobId} genre=${genreKey || 'n/a'} preferNative=${preferNative} ` +
      `nativeClips=${nativeCount}/${normalized.length} mode=${mix.mode} ` +
      `duration=${score.totalDuration.toFixed(1)}s cues=${score.cueCount}`,
  );

  return {
    mixPath: mix.mixPath,
    scorePath: score.scorePath,
    nativePath: native.nativePath,
    hasNativeAudio: hasNative,
    nativeClipCount: nativeCount,
    totalDuration: score.totalDuration,
    mode: mix.mode,
    cueCount: score.cueCount,
    preferNative,
  };
}

/**
 * During assembly: duck an external score under already-concatenated video audio,
 * or mux a prebuilt final_mix. Returns path to video with final audio mapped.
 */
export async function applyMixToVideo({
  videoPath,
  outPath,
  mixPath = null,
  scorePath = null,
  narrationPath = null,
  genre = '',
  allowNarrationOverlay = false,
}) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('applyMixToVideo: missing videoPath');
  }
  await ensureDir(path.dirname(outPath));

  const videoHasAudio = await hasAudioStream(videoPath);
  const preferNative = isNativeAudioGenre(genre);

  // 1) Prebuilt final mix wins (already native + ducked score).
  // Pad mix with silence if brand intro/outro made the video longer than the scene mix.
  if (mixPath && fs.existsSync(mixPath)) {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${mixPath}" ` +
        `-filter_complex "[1:a]apad[a]" -map 0:v:0 -map "[a]" ` +
        `-c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
      { timeout: 600000 },
    );
    return { outPath, applied: 'final_mix' };
  }

  // 2) Score bed only — duck under native if present
  if (scorePath && fs.existsSync(scorePath) && videoHasAudio) {
    const filter =
      `[1:a]volume=${scoreBaseVolume().toFixed(4)}[score];` +
      `[score][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=40:release=350:makeup=1:detection=peak[ducked];` +
      `[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a]`;
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${scorePath}" ` +
        `-filter_complex "${filter}" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
      { timeout: 600000 },
    );
    return { outPath, applied: 'score_ducked_under_native' };
  }

  if (scorePath && fs.existsSync(scorePath) && !videoHasAudio) {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${scorePath}" ` +
        `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
      { timeout: 600000 },
    );
    return { outPath, applied: 'score_only' };
  }

  // 3) Narration — NEVER for drama/movie/anime when native audio is present
  const canNarrate =
    allowNarrationOverlay &&
    narrationPath &&
    fs.existsSync(narrationPath) &&
    !(preferNative && videoHasAudio);

  if (canNarrate) {
    if (videoHasAudio) {
      const filter =
        `[1:a]volume=1.0[nar];` +
        `[0:a]volume=0.25[bed];` +
        `[bed][nar]amix=inputs=2:duration=first:dropout_transition=2[a]`;
      await execAsync(
        `ffmpeg -y -i "${videoPath}" -i "${narrationPath}" ` +
          `-filter_complex "${filter}" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
        { timeout: 600000 },
      );
      return { outPath, applied: 'narration_over_bed' };
    }
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -i "${narrationPath}" ` +
        `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`,
      { timeout: 600000 },
    );
    return { outPath, applied: 'narration_only' };
  }

  if (preferNative && narrationPath && videoHasAudio) {
    console.log(
      `[AudioMix] Ignoring narrationPath for genre=${genre} — preserving LTX native audio`,
    );
  }

  // 4) Passthrough (re-encode audio for consistency)
  if (videoHasAudio) {
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -c:v copy -c:a aac -b:a 192k "${outPath}"`,
      { timeout: 600000 },
    );
    return { outPath, applied: 'native_passthrough' };
  }

  await fs.promises.copyFile(videoPath, outPath);
  return { outPath, applied: 'video_only_no_audio' };
}

export default {
  NATIVE_AUDIO_GENRES,
  isNativeAudioGenre,
  isAudioMixEnabled,
  scoreDuckDb,
  hasAudioStream,
  probeDurationSec,
  generateUnderscoreBed,
  computeSceneTimeline,
  buildScoreTimeline,
  extractNativeAudioTimeline,
  mixNativeWithScore,
  buildFinalMix,
  applyMixToVideo,
};
