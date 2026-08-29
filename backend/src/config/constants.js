import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(__dirname, '../../..', 'storage');

export const JOBS_DIR      = path.join(STORAGE_ROOT, 'jobs');
export const OUTPUTS_DIR   = path.join(STORAGE_ROOT, 'outputs');
export const LOCKS_DIR     = path.join(STORAGE_ROOT, 'locks');

// Sub-directories per job
export const jobDir        = (jobId) => path.join(JOBS_DIR, jobId);
export const inputDir      = (jobId) => path.join(JOBS_DIR, jobId, 'input');
export const sceneImgDir   = (jobId) => path.join(JOBS_DIR, jobId, 'scenes', 'images');
export const sceneVidDir   = (jobId) => path.join(JOBS_DIR, jobId, 'scenes', 'videos');
export const segmentDir    = (jobId) => path.join(JOBS_DIR, jobId, 'scenes', 'segments');
export const audioDir      = (jobId) => path.join(JOBS_DIR, jobId, 'audio');
export const subtitleDir   = (jobId) => path.join(JOBS_DIR, jobId, 'subtitles');
export const tempDir       = (jobId) => path.join(JOBS_DIR, jobId, 'temp');
export const outputDir     = (jobId) => path.join(OUTPUTS_DIR, jobId);

// Character & Environment lock directories
export const charLockDir   = (jobId) => path.join(JOBS_DIR, jobId, 'locks', 'characters');
export const envLockDir    = (jobId) => path.join(JOBS_DIR, jobId, 'locks', 'environments');

// Queue names
export const QUEUES = {
  VIDEO:       'videoQueue',
  CLEANUP:     'cleanupQueue',
  MAINTENANCE: 'maintenanceQueue',
};

/**
 * The pipeline, in order. `executionEngine.triggerNextStep()` walks this list,
 * so a job whose `workflow.steps` is empty stops dead after its first step —
 * which is why every start path goes through `startJobPipeline()`.
 *
 * Each id must have a case in triggerNextStep's switch and a worker consuming
 * the queue it enqueues onto.
 */
export const FILM_PIPELINE_STEPS = [
  'script',              // parse the script, extract the style guide
  'directing',           // decompose into acts / scenes / 8s beats
  'locking',             // character + environment reference images
  'segment_generation',  // keyframe → LTX clip → last frame → next clip
  'rendering',           // stitch scenes into the film
  'upload',              // push the film and thumbnail to storage
  'notify',              // enqueued by the upload step itself
];

/**
 * A job started from an approved Screenplay document skips 'script': there is no
 * raw script to parse (the story is already structured), so script analysis would
 * run an LLM call on an empty string. The directing step reads the screenplay.
 */
export const SCREENPLAY_PIPELINE_STEPS = FILM_PIPELINE_STEPS.filter(s => s !== 'script');

export const JOB_STATUS = {
  QUEUED:             'queued',
  PREPARING:          'preparing',
  ANALYZING:          'analyzing',
  DIRECTING:          'directing',
  LOCKING:            'locking',
  SCENE_GENERATION:   'scene_generation',
  SEGMENT_GENERATION: 'segment_generation',
  MEDIA_GENERATION:   'media_generation',
  ASSEMBLING:         'assembling',
  OPTIMIZING:         'optimizing',
  COMPLETED:          'completed',
  FAILED:             'failed',
  STOPPING:           'stopping',
  STOPPED:            'stopped',
};

// Scene status enum
export const SCENE_STATUS = {
  PENDING:    'pending',
  PLANNING:   'planning',
  GENERATING: 'generating',
  DONE:       'done',
  FAILED:     'failed',
};

// Segment status enum
export const SEGMENT_STATUS = {
  PENDING:    'pending',
  GENERATING: 'generating',
  DONE:       'done',
  FAILED:     'failed',
};

// ─── LTX 2.3 Video Generation ───────────────────────────────────────────────
export const SEGMENT_DURATION_SEC = parseInt(process.env.SEGMENT_DURATION_SEC || '8', 10);
export const MAX_SEGMENTS_PER_SCENE = 10;
export const MAX_SEGMENTS_PER_ACT   = 40;

/**
 * How much script text the director may read in one decomposition call.
 *
 * A feature screenplay rendered back out of the Screenplay document runs well
 * past the old hard-coded 12k, and anything past the cap is simply not directed —
 * the film silently loses its final acts. Gemini takes a large context window, so
 * ~48k chars (~14k tokens) leaves ample room for the plan itself.
 */
export const DIRECTOR_SCRIPT_CHAR_LIMIT = parseInt(
  process.env.DIRECTOR_SCRIPT_CHAR_LIMIT || '48000',
  10,
);

export const VIDEO_WIDTH  = parseInt(process.env.VIDEO_WIDTH  || '1280', 10);
export const VIDEO_HEIGHT = parseInt(process.env.VIDEO_HEIGHT || '720', 10);
export const VIDEO_FPS    = parseInt(process.env.VIDEO_FPS    || '24', 10);

export const IMAGE_WIDTH  = parseInt(process.env.IMAGE_WIDTH  || '1024', 10);
export const IMAGE_HEIGHT = parseInt(process.env.IMAGE_HEIGHT || '1024', 10);

// API polling
export const API_POLL_INTERVAL = parseInt(process.env.API_POLL_INTERVAL || '5000', 10);
export const API_MAX_WAIT_MS   = parseInt(process.env.API_MAX_WAIT_MS || '3600000', 10);

// Batch size
export const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '30', 10);

// Job storage quota: 10GB default
export const JOB_STORAGE_QUOTA = parseInt(
  process.env.JOB_STORAGE_QUOTA_BYTES || String(10 * 1024 * 1024 * 1024),
  10,
);

// Cleanup
export const CLEANUP_FAILED_JOB_DAYS = parseInt(process.env.CLEANUP_FAILED_JOB_DAYS || '7', 10);

// ─── STYLE PRESETS & CAMERA STYLES ──────────────────────────────────────────
export const VALID_STYLE_PRESETS = [
  'documentary', 'cinematic', 'movie_trailer', 'animation_pixar',
  'animation_anime', 'animation_3d', 'animation_disney', 'realistic',
  'news_report', 'horror', 'fantasy', 'luxury', 'scifi',
  'historical', 'african_storytelling', 'nollywood_drama', 'custom'
];

export const VALID_CAMERA_STYLES = [
  'hollywood', 'documentary', 'drone', 'drone_aerial', 'aerial_wide', 'handheld',
  'steadicam', 'closeup', 'close_up', 'tight_close_up', 'extreme_close_up',
  'wide', 'wide_establishing', 'two_shot', 'over_shoulder', 'low_angle',
  'high_crane', 'dutch_angle', 'slow_zoom', 'slow_push_in', 'tracking', 'pov'
];

export const MOTION_LEVEL_PROMPT_MAP = {
  static:  'static shot, no camera movement, locked off',
  low:     'gentle camera movement, minimal motion',
  medium:  'natural camera movement, smooth motion',
  high:    'dynamic camera movement, expressive motion',
  action:  'fast aggressive camera, action movie style, quick cuts'
};

export const EMOTION_PROMPT_MAP = {
  hope:    'hopeful atmosphere, warm light, uplifting',
  fear:    'tense atmosphere, cold light, ominous shadows',
  victory: 'triumphant, golden light, epic scale',
  war:     'intense, dark, dramatic, battle atmosphere',
  love:    'soft warm light, intimate framing, gentle',
  sadness: 'muted colors, soft rain, melancholic',
  joy:     'bright vivid colors, warm sunshine, energetic',
  mystery: 'fog, dim lighting, mysterious atmosphere',
  epic:    'grand scale, dramatic lighting, powerful composition',
  neutral: ''
};

// ─── GENERATION STRATEGIES (for shot planning) ─────────────────────────────
export const GENERATION_STRATEGY = {
  ANCHOR:       'anchor',        // First segment: Flux image → LTX I2V
  CONTINUATION: 'continuation',  // Same angle: last frame → LTX I2V
  ANGLE_CHANGE: 'angle_change',  // New keyframe via Flux → LTX I2V
  FRAME_BRIDGE: 'frame_bridge',  // Start frame → end frame interpolation
  REACTION:     'reaction',      // Close-up keyframe → LTX I2V
};
