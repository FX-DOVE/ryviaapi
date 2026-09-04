/**
 * Smoke test — ffmpeg-only audio mix (no RunPod, no Mongo).
 *
 * Creates two short clips with "dialogue" sine tones, builds an audioSpine
 * underscore mix, ducks score under native, and asserts final_mix.m4a exists.
 *
 * Run: node tests/audioMix.smoke.js
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point STORAGE_ROOT at a temp folder before importing constants-backed services
const smokeRoot = path.join('/tmp', `ryvia-audio-smoke-${Date.now()}`);
process.env.STORAGE_ROOT = smokeRoot;
process.env.AUDIO_MIX_ENABLED = 'true';
process.env.SCORE_DUCK_DB = '-12';

const {
  buildFinalMix,
  hasAudioStream,
  probeDurationSec,
  applyMixToVideo,
  generateUnderscoreBed,
} = await import('../src/services/audioMixService.js');
const { audioDir } = await import('../src/config/constants.js');

async function makeToneClip(outPath, { freq = 440, duration = 2, color = 'black' }) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  // Video color bars + audible "dialogue" tone (stands in for LTX native audio)
  await execAsync(
    `ffmpeg -y -f lavfi -i color=c=${color}:s=320x240:d=${duration}:r=24 ` +
      `-f lavfi -i sine=frequency=${freq}:duration=${duration} ` +
      `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${outPath}"`,
    { timeout: 60000 },
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const jobId = 'smoke_audio_001';
  const sceneDir = path.join(smokeRoot, 'jobs', jobId, 'scenes', 'videos');
  await fs.promises.mkdir(sceneDir, { recursive: true });

  const s1 = path.join(sceneDir, 'scene_0001.mp4');
  const s2 = path.join(sceneDir, 'scene_0002.mp4');
  await makeToneClip(s1, { freq: 440, duration: 2, color: 'navy' });
  await makeToneClip(s2, { freq: 523.25, duration: 2, color: 'maroon' });

  assert(await hasAudioStream(s1), 'scene 1 should have native audio');
  assert(await hasAudioStream(s2), 'scene 2 should have native audio');

  // Bed generator alone
  const bedPath = path.join(audioDir(jobId), 'beds', 'smoke_bed.wav');
  await generateUnderscoreBed({
    outPath: bedPath,
    duration: 1.5,
    mood: 'tense',
    intensity: 6,
    type: 'music',
    cue: 'smoke underscore',
  });
  assert(fs.existsSync(bedPath), 'underscore bed wav written');

  const scenes = [
    { sceneNumber: 1, duration: 2, videoPath: s1 },
    { sceneNumber: 2, duration: 2, videoPath: s2 },
  ];
  const audioSpine = [
    { atScene: 1, type: 'music', cue: 'Opening pad — underscore only', mood: 'warm', intensity: 4 },
    { atScene: 2, type: 'silence', cue: 'Score dip before reveal', mood: 'tense', intensity: 1 },
  ];

  const result = await buildFinalMix({
    jobId,
    scenes,
    audioSpine,
    genre: 'drama',
    videoType: 'drama',
    lookBible: { colorPalette: 'warm amber' },
  });

  assert(!result.skipped, 'mix should not be skipped');
  assert(result.hasNativeAudio === true, 'should detect native audio');
  assert(result.mode === 'native_plus_ducked_score', `expected ducked mix, got ${result.mode}`);
  assert(fs.existsSync(result.mixPath), 'final_mix.m4a missing');
  assert(fs.existsSync(result.scorePath), 'score_bed.m4a missing');
  assert(fs.existsSync(result.nativePath), 'native_dialogue.m4a missing');
  assert(await hasAudioStream(result.mixPath), 'final_mix must have audio');

  const mixDur = await probeDurationSec(result.mixPath);
  assert(mixDur >= 3.5 && mixDur <= 4.5, `mix duration ~4s, got ${mixDur}`);

  // Apply mix onto a concatenated stand-in video
  const concatList = path.join(smokeRoot, 'concat.txt');
  await fs.promises.writeFile(
    concatList,
    `file '${s1}'\nfile '${s2}'\n`,
    'utf8',
  );
  const merged = path.join(smokeRoot, 'merged.mp4');
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:v libx264 -c:a aac "${merged}"`,
    { timeout: 60000 },
  );
  const mixedVideo = path.join(smokeRoot, 'with_mix.mp4');
  const applied = await applyMixToVideo({
    videoPath: merged,
    outPath: mixedVideo,
    mixPath: result.mixPath,
    genre: 'drama',
  });
  assert(applied.applied === 'final_mix', `expected final_mix apply, got ${applied.applied}`);
  assert(await hasAudioStream(mixedVideo), 'output video must keep audio');

  console.log('AUDIO MIX SMOKE PASSED');
  console.log(JSON.stringify({
    mixPath: result.mixPath,
    scorePath: result.scorePath,
    mode: result.mode,
    mixDur,
    applied: applied.applied,
  }, null, 2));

  // Cleanup
  await fs.promises.rm(smokeRoot, { recursive: true, force: true });
}

main().catch(async (err) => {
  console.error('AUDIO MIX SMOKE FAILED:', err);
  process.exitCode = 1;
});
