import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(__dirname, '../../..', 'storage');

export const JOBS_DIR      = path.join(STORAGE_ROOT, 'jobs');
export const OUTPUTS_DIR   = path.join(STORAGE_ROOT, 'outputs');

// Sub-directories per job
export const jobDir        = (jobId) => path.join(JOBS_DIR, jobId);
export const inputDir      = (jobId) => path.join(JOBS_DIR, jobId, 'input');
export const sceneImgDir   = (jobId) => path.join(JOBS_DIR, jobId, 'scenes', 'images');
export const sceneVidDir   = (jobId) => path.join(JOBS_DIR, jobId, 'scenes', 'videos');
export const audioDir      = (jobId) => path.join(JOBS_DIR, jobId, 'audio');
export const subtitleDir   = (jobId) => path.join(JOBS_DIR, jobId, 'subtitles');
export const tempDir       = (jobId) => path.join(JOBS_DIR, jobId, 'temp');
export const outputDir     = (jobId) => path.join(OUTPUTS_DIR, jobId);

// Queue names
export const QUEUES = {
  VIDEO:       'videoQueue',
  CLEANUP:     'cleanupQueue',
  MAINTENANCE: 'maintenanceQueue',
};

export const JOB_STATUS = {
  QUEUED:           'queued',
  PREPARING:        'preparing',
  ANALYZING:        'analyzing',
  SCENE_GENERATION: 'scene_generation',
  MEDIA_GENERATION: 'media_generation',
  ASSEMBLING:       'assembling',
  OPTIMIZING:       'optimizing',
  COMPLETED:        'completed',
  FAILED:           'failed',
  STOPPING:         'stopping',
  STOPPED:          'stopped',
};

// Scene status enum
export const SCENE_STATUS = {
  PENDING:    'pending',
  GENERATING: 'generating',
  DONE:       'done',
  FAILED:     'failed',
};

// Batch size: 30 scenes for VPS
export const BATCH_SIZE = parseInt(process.env.GROK_BATCH_SIZE || process.env.BATCH_SIZE || '30', 10);

// Job storage quota: 10GB default
export const JOB_STORAGE_QUOTA = parseInt(
  process.env.JOB_STORAGE_QUOTA_BYTES || String(10 * 1024 * 1024 * 1024),
  10,
);

// Grok CLI
export const GROK_CMD             = process.env.GROK_CMD || 'grok';
export const GROK_TIMEOUT_IMAGE   = parseInt(process.env.GROK_TIMEOUT_IMAGE || '1800000', 10);
export const GROK_TIMEOUT_VIDEO   = parseInt(process.env.GROK_TIMEOUT_VIDEO || '1800000', 10);
export const GROK_TIMEOUT_PER_SCENE = parseInt(process.env.GROK_TIMEOUT_PER_SCENE || '60000', 10);

// Cleanup
export const CLEANUP_FAILED_JOB_DAYS = parseInt(process.env.CLEANUP_FAILED_JOB_DAYS || '7', 10);

// ─── STYLE PRESETS & CAMERA STYLES ──────────────────────────────────────────
export const VALID_STYLE_PRESETS = [
  'documentary', 'cinematic', 'movie_trailer', 'animation_pixar',
  'animation_anime', 'animation_3d', 'animation_disney', 'realistic',
  'news_report', 'horror', 'fantasy', 'luxury', 'scifi',
  'historical', 'african_storytelling', 'custom'
];

export const VALID_CAMERA_STYLES = [
  'hollywood','documentary','drone','handheld',
  'steadicam','closeup','wide','slow_zoom','tracking','pov'
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
