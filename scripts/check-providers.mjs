/**
 * Preflight for a production run.
 *
 *   node scripts/check-providers.mjs              # free: config + /health + infra
 *   node scripts/check-providers.mjs --live       # + one real Qwen text2image
 *   node scripts/check-providers.mjs --live-video # + one real LTX clip (slow, ~$)
 *
 * Everything in the default pass is free: /health needs no worker, so a stale
 * endpoint id (HTTP 404 on a valid key) and a region with no GPU capacity are
 * both visible without paying a 7-11 minute cold start. The --live flags are
 * opt-in precisely because a Qwen call is ~90 s of billed Ada-48 time and an LTX
 * clip can be ten times that.
 *
 * Exit code is 1 if any check FAILs. WARNs do not fail the run: an unset
 * optional fallback key is not a broken deployment.
 *
 * No secret is ever printed — only key names, booleans, and endpoint ids, which
 * are not secrets and are the field that actually identifies a misconfiguration.
 */
import '../backend/env.js';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve dependencies the way a backend module would.
 *
 * ESM walks up from the *importing* file, and this script lives in scripts/, so a
 * bare `import 'mongoose'` looks for scripts/node_modules and the repo root and
 * fails — the dependency is installed in backend/node_modules. Rooting a require
 * at backend/package.json resolves from there instead. (Bare imports inside the
 * backend modules this script pulls in are fine: they resolve from their own
 * directory, which is why ioredis works without this.)
 */
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));

const ARGS = new Set(process.argv.slice(2));
const LIVE_IMAGE = ARGS.has('--live') || ARGS.has('--live-video');
const LIVE_VIDEO = ARGS.has('--live-video');
const OUT_DIR = path.join(__dirname, '_preflight-out');

const results = [];
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function record(status, name, detail = '') {
  results.push({ section: currentSection, status, name, detail });
  const mark = { ok: '\x1b[32m  ok \x1b[0m', warn: '\x1b[33mwarn \x1b[0m', fail: '\x1b[31mFAIL \x1b[0m' }[status];
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

const ok = (n, d) => record('ok', n, d);
const warn = (n, d) => record('warn', n, d);
const fail = (n, d) => record('fail', n, d);

function which(bin) {
  return new Promise((resolve) => {
    execFile(bin, ['-version'], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout).split('\n')[0].trim());
    });
  });
}

/** Reject a promise that hangs, so one dead service cannot stall the preflight. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ─── 1. Environment ──────────────────────────────────────────────────────────

// Only names are inspected. A key is "set" when it is present and non-empty.
const REQUIRED_ENV = ['RUNPOD_API_KEY', 'MONGODB_URI', 'REDIS_URL'];
const OPTIONAL_ENV = [
  'RUNPOD_QWEN_T2I_ENDPOINT_ID', 'RUNPOD_QWEN_EDIT_ENDPOINT_ID', 'RUNPOD_LTX_ENDPOINT_ID',
  'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL', 'AI_API_ENDPOINT', 'AI_API_KEY',
  'LTX_RESOLUTION', 'DIRECTOR_SCRIPT_CHAR_LIMIT',
];

function checkEnv() {
  section('1. Environment');
  for (const key of REQUIRED_ENV) {
    if (process.env[key]?.trim()) ok(key, 'set');
    else fail(key, 'missing — required');
  }
  const unset = OPTIONAL_ENV.filter((k) => !process.env[k]?.trim());
  const set = OPTIONAL_ENV.filter((k) => process.env[k]?.trim());
  if (set.length) ok('optional keys set', set.join(', '));
  if (unset.length) {
    warn('optional keys unset', `${unset.join(', ')} — endpoint ids fall back to the deployed defaults in code`);
  }
}

// ─── 2. Provider configuration ───────────────────────────────────────────────

async function checkProviderConfig() {
  section('2. Provider configuration');
  const { getAIConfig } = await import('../backend/src/providers/reasoningProvider.js');
  const config = getAIConfig();

  if (config.reasoning.configured) {
    ok('reasoning', `${config.reasoning.transports.length} transport(s): `
      + config.reasoning.transports.map((t) => `${t.id}/${t.model}`).join(' → '));
  } else {
    fail('reasoning', 'no transport configured — the director cannot run. '
      + 'Set GEMINI_API_KEY (or AI_API_ENDPOINT + AI_API_KEY)');
  }

  if (config.image.configured) ok('qwen-image', `t2i + edit: ${config.image.endpoint} / ${config.image.editEndpoint}`);
  else fail('qwen-image', 'RUNPOD_API_KEY or the t2i endpoint id is unset');

  if (config.video.configured) ok('ltx-video', `${config.video.endpoint} @ ${config.video.resolution}`);
  else fail('ltx-video', 'RUNPOD_API_KEY or the LTX endpoint id is unset');

  return config;
}

// ─── 3. Endpoint health (free — no worker, no cold start) ────────────────────

async function checkEndpointHealth() {
  section('3. Endpoint health');
  const { health } = await import('../backend/src/providers/runpodClient.js');
  const { LtxVideoProvider } = await import('../backend/src/providers/video/LtxVideoProvider.js');
  const { QwenImageProvider } = await import('../backend/src/providers/image/QwenImageProvider.js');

  const qwen = new QwenImageProvider();
  const ltx = new LtxVideoProvider();
  const targets = [
    ['qwen text2image', qwen.t2iEndpoint],
    ['qwen edit', qwen.editEndpoint],
    ['ltx-2.5', ltx.endpointId],
  ];

  for (const [label, id] of targets) {
    const h = await withTimeout(health(id), 20000, `health(${label})`).catch((e) => ({ ok: false, error: e.message }));
    if (!h) { fail(label, `${id} — no API key or endpoint id`); continue; }
    if (!h.ok) { fail(label, `${id} — HTTP ${h.httpStatus ?? '?'} ${h.error || ''}`.trim()); continue; }
    reportWorkers(label, id, h);
  }
}

function reportWorkers(label, id, h) {
  const w = h.workers || {};
  const j = h.jobs || {};
  const parts = [
    `${id}`,
    `${w.ready || 0} ready / ${w.running || 0} running / ${w.idle || 0} idle`,
  ];
  if (j.inQueue) parts.push(`${j.inQueue} queued`);
  if (j.inProgress) parts.push(`${j.inProgress} in progress`);
  const detail = parts.join(' — ');

  // `throttled` is the one that matters: the endpoint is healthy, the account is
  // fine, and there is simply no GPU of the allowed types free in the region. A
  // job submitted now sits IN_QUEUE with a climbing delayTime and looks like a hang.
  if (w.throttled) {
    warn(label, `${detail} — ${w.throttled} THROTTLED, no GPU capacity in region right now`);
  } else if (!w.ready && !w.idle && !w.running) {
    warn(label, `${detail} — cold, first job pays the full cold start`);
  } else {
    ok(label, detail);
  }
}

// ─── 4. Infrastructure ───────────────────────────────────────────────────────

async function checkInfra() {
  section('4. Infrastructure');

  // Redis. BullMQ is the whole pipeline: without it every enqueue silently
  // buffers and no step ever runs.
  try {
    const { createRedisConnection } = await import('../backend/src/config/redis.js');
    const conn = createRedisConnection({ maxRetriesPerRequest: 1, retryStrategy: () => null });
    const pong = await withTimeout(conn.ping(), 8000, 'redis ping');
    ok('redis', `${pong} — ${process.env.REDIS_URL || 'redis://localhost:6379'}`);
    await conn.quit().catch(() => conn.disconnect());
  } catch (err) {
    fail('redis', `${err.message} — REDIS_URL=${process.env.REDIS_URL || 'redis://localhost:6379'}; `
      + 'no queue means no pipeline');
  }

  // Mongo. Connected directly rather than through connectDB(), which retries ten
  // times at 5 s intervals before throwing — fine for a server coming up, far too
  // slow for a preflight that should tell you Mongo is down in six seconds.
  try {
    const mongoose = backendRequire('mongoose');
    await withTimeout(
      mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 6000 }),
      10000, 'mongo connect',
    );
    ok('mongodb', `connected to ${mongoose.connection.name}`);
    await mongoose.disconnect();
  } catch (err) {
    fail('mongodb', err.message);
  }

  // ffmpeg/ffprobe assemble the film and read clip durations. Missing ffprobe
  // fails only at the very end of a run, after every GPU minute is already spent.
  for (const bin of ['ffmpeg', 'ffprobe']) {
    const version = await which(bin);
    if (version) ok(bin, version.slice(0, 60));
    else fail(bin, 'not on PATH — assembly will fail after all GPU work is paid for');
  }

  // Storage root must be writable before a job starts writing frames into it.
  const { STORAGE_ROOT } = await import('../backend/src/config/constants.js');
  try {
    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    const probe = path.join(STORAGE_ROOT, `.preflight-${Date.now()}`);
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
    ok('storage', `${STORAGE_ROOT} writable`);
  } catch (err) {
    fail('storage', `${STORAGE_ROOT} — ${err.message}`);
  }
}

// ─── 5. Pipeline plan and generation grid ────────────────────────────────────

/**
 * Which queue each pipeline step dispatches onto.
 *
 * This mirrors the switch in executionEngine.triggerNextStep(). Duplicating the
 * mapping would rot, so `checkPipeline` also greps the engine source for a
 * `case '<id>':` per planned step — the table says where work goes, the source
 * check says the step is routed at all. A step with no case logs "Unmapped
 * dynamic step triggered" and the job stops there with no error and no failure.
 *
 * `notify` is null on purpose: the upload step enqueues the notification itself,
 * so the notify case is deliberately empty.
 */
const STEP_QUEUE = {
  script:             'scriptQueue',
  directing:          'directingQueue',
  locking:            'lockingQueue',
  segment_generation: 'segmentQueue',
  audio:              'audioQueue',
  prompt:             'promptQueue',
  image_generation:   'imageQueue',
  video_generation:   'videoQueue',
  rendering:          'renderingQueue',
  upload:             'uploadQueue',
  notify:             null,
};

async function checkPipeline() {
  section('5. Pipeline plan');
  const { FILM_PIPELINE_STEPS, SCREENPLAY_PIPELINE_STEPS, SEGMENT_DURATION_SEC, DIRECTOR_SCRIPT_CHAR_LIMIT } =
    await import('../backend/src/config/constants.js');
  const { queues } = await import('../backend/src/queues/queueManager.js');

  ok('film plan', FILM_PIPELINE_STEPS.join(' → '));
  ok('screenplay plan', SCREENPLAY_PIPELINE_STEPS.join(' → '));

  if (SCREENPLAY_PIPELINE_STEPS.includes('script')) {
    fail('screenplay plan', 'still contains the script step — it would analyse an empty string');
  }

  // Read the two sources that decide whether a step actually moves: the engine
  // routes it, and a worker in the PM2-managed scheduler drains the queue.
  const engineSrc = await fs.readFile(
    path.join(__dirname, '../backend/src/services/executionEngine.js'), 'utf8');
  const schedulerSrc = await fs.readFile(
    path.join(__dirname, '../backend/src/workers/schedulerWorker.js'), 'utf8');

  const registered = new Set(Object.values(queues).map((q) => q.name));
  const consumed = new Set(schedulerSrc.match(/'[a-zA-Z]+Queue'/g)?.map((s) => s.slice(1, -1)) || []);

  const unrouted = [];
  const unregistered = [];
  const unconsumed = [];

  for (const step of FILM_PIPELINE_STEPS) {
    if (!engineSrc.includes(`case '${step}':`)) unrouted.push(step);
    const queueName = STEP_QUEUE[step];
    if (!queueName) continue; // notify — enqueued by the upload step itself
    if (!registered.has(queueName)) unregistered.push(`${step} → ${queueName}`);
    else if (!consumed.has(queueName)) unconsumed.push(`${step} → ${queueName}`);
  }

  if (unrouted.length) {
    fail('step routing', `no case in triggerNextStep for: ${unrouted.join(', ')} `
      + '— the job logs "Unmapped dynamic step triggered" and stops there silently');
  } else {
    ok('step routing', `all ${FILM_PIPELINE_STEPS.length} film steps have a case in triggerNextStep`);
  }

  if (unregistered.length) {
    fail('queues', `enqueued onto a queue queueManager never created: ${unregistered.join(', ')}`);
  } else {
    ok('queues', `${registered.size} registered — every film step targets one that exists`);
  }

  if (unconsumed.length) {
    fail('workers', `no worker in schedulerWorker drains: ${unconsumed.join(', ')} `
      + '— work enqueues and sits there forever');
  } else {
    ok('workers', `${consumed.size} queues drained by the scheduler process`);
  }

  // imageQueue/videoQueue belong to gpuWorker.js, which is intentionally not in
  // PM2: the film pipeline generates through segment_generation, not the
  // per-scene image_generation/video_generation fan-out.
  const idle = [...registered].filter((n) => !consumed.has(n) && n !== 'retryQueue' && n !== 'deadLetterQueue');
  if (idle.length) ok('unattended queues', `${idle.join(', ')} — gpuWorker.js only, not used by the film plan`);

  ok('segment length', `${SEGMENT_DURATION_SEC}s per beat`);
  ok('director budget', `${DIRECTOR_SCRIPT_CHAR_LIMIT} chars of screenplay per decomposition call`);
}

// ─── 6. Generation grid ──────────────────────────────────────────────────────

/**
 * The two grids disagree, and that is the whole point of this check.
 *
 * Qwen needs both sides %16; LTX needs %64. Every LTX resolution is also %16, so
 * generating the keyframe at exactly LTX_RESOLUTIONS[token] means the frame that
 * conditions the clip is never resampled. 1280x720 — the obvious value, and the
 * VIDEO_HEIGHT default — is legal for Qwen and illegal for LTX; 720p is 1280x704.
 */
async function checkGrid() {
  section('6. Generation grid');
  const { LTX_RESOLUTIONS, framesForDuration, LtxVideoProvider } =
    await import('../backend/src/providers/video/LtxVideoProvider.js');
  const { snap16 } = await import('../backend/src/providers/image/QwenImageProvider.js');
  const { SEGMENT_DURATION_SEC, VIDEO_FPS, VIDEO_HEIGHT } = await import('../backend/src/config/constants.js');

  const requested = process.env.LTX_RESOLUTION;
  if (requested && !LTX_RESOLUTIONS[requested]) {
    warn('LTX_RESOLUTION', `'${requested}' is not one of ${Object.keys(LTX_RESOLUTIONS).join(' ')} — falls back to 720p`);
  }

  const ltx = new LtxVideoProvider();
  const [w, h] = LTX_RESOLUTIONS[ltx.resolution];
  if (w % 64 || h % 64) fail('ltx grid', `${ltx.resolution} = ${w}x${h} is not %64`);
  else ok('ltx grid', `${ltx.resolution} = ${w}x${h} (%64)`);

  if (snap16(w, w) !== w || snap16(h, h) !== h) {
    fail('keyframe grid', `${w}x${h} does not survive Qwen's %16 snap — the keyframe would be resampled`);
  } else {
    ok('keyframe grid', `${w}x${h} is %16, so keyframes condition LTX with no resample`);
  }

  if (h !== VIDEO_HEIGHT) {
    warn('VIDEO_HEIGHT', `${VIDEO_HEIGHT} != the LTX height ${h} — ffmpeg standardises segments, so this costs a rescale`);
  }

  const frames = framesForDuration(SEGMENT_DURATION_SEC, VIDEO_FPS);
  if ((frames - 1) % 8) fail('temporal grid', `${frames} frames violates (n-1)%8==0`);
  else ok('temporal grid', `${SEGMENT_DURATION_SEC}s @ ${VIDEO_FPS}fps → ${frames} frames ((n-1)%8==0)`);
}

// ─── 7. Live calls (opt-in, billed) ──────────────────────────────────────────

async function checkLive() {
  section('7. Live generation (billed)');
  await fs.mkdir(OUT_DIR, { recursive: true });

  const { LTX_RESOLUTIONS, LtxVideoProvider } = await import('../backend/src/providers/video/LtxVideoProvider.js');
  const { QwenImageProvider } = await import('../backend/src/providers/image/QwenImageProvider.js');

  const ltx = new LtxVideoProvider();
  const [w, h] = LTX_RESOLUTIONS[ltx.resolution];
  const qwen = new QwenImageProvider();
  const imagePath = path.join(OUT_DIR, 'preflight-keyframe.png');

  console.log(`  … Qwen text2image at ${w}x${h}. Cold start is 445-685 s on this account.`);
  const t0 = Date.now();
  try {
    await qwen.generateImage(
      'a lone lighthouse on a cliff at dusk, storm clouds, cinematic, 35mm film still',
      imagePath,
      { width: w, height: h },
    );
    const bytes = (await fs.stat(imagePath)).size;
    ok('qwen text2image', `${Math.round((Date.now() - t0) / 1000)}s, ${Math.round(bytes / 1024)} KB → ${imagePath}`);
  } catch (err) {
    fail('qwen text2image', err.message);
    return; // No keyframe means the video call has nothing to condition on.
  }

  if (!LIVE_VIDEO) {
    warn('ltx clip', 'skipped — pass --live-video to render one (7-11 min cold start)');
    return;
  }

  const videoPath = path.join(OUT_DIR, 'preflight-clip.mp4');
  console.log('  … LTX image→video. This is the expensive one.');
  const t1 = Date.now();
  try {
    await ltx.imageToVideo(
      imagePath,
      'slow push in on the lighthouse as the beam sweeps across the water, wind and distant surf',
      videoPath,
    );
    const bytes = (await fs.stat(videoPath)).size;
    ok('ltx clip', `${Math.round((Date.now() - t1) / 1000)}s, ${Math.round(bytes / 1024)} KB → ${videoPath}`);
  } catch (err) {
    fail('ltx clip', err.message);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\x1b[1mAI Film Studio — provider preflight\x1b[0m');
  console.log(LIVE_IMAGE
    ? '  mode: LIVE — real GPU calls will be billed'
    : '  mode: free checks only (pass --live to generate, --live-video to also render a clip)');

  checkEnv();
  await checkProviderConfig();
  await checkEndpointHealth();
  await checkInfra();
  await checkPipeline();
  await checkGrid();
  if (LIVE_IMAGE) await checkLive();

  const failed = results.filter((r) => r.status === 'fail');
  const warned = results.filter((r) => r.status === 'warn');

  section('Summary');
  console.log(`  ${results.length - failed.length - warned.length} ok, ${warned.length} warn, ${failed.length} fail`);
  if (failed.length) {
    console.log('\n\x1b[31mBlocking:\x1b[0m');
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`);
    console.log('\nA production run will not complete until these are resolved.');
  } else {
    console.log('\n\x1b[32mReady to produce.\x1b[0m'
      + (warned.length ? ' Review the warnings above — none of them block a run.' : ''));
  }

  // Queue/Redis/Mongo handles keep the loop alive, so exit explicitly.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n\x1b[31mPreflight crashed:\x1b[0m', err);
  process.exit(1);
});
