/**
 * emotionPictureMap.js — Map scene emotion → default camera + color/lighting.
 * Applied in director, beauty pass, and style injection.
 */

export const EMOTION_PICTURE_MAP = {
  betrayal: {
    camera: 'dutch_angle',
    colorLighting: 'cool teal shadows, sickly practical greens, desaturated skin, harsh side light',
    dof: 'shallow DoF with uneasy background tilt',
    microExpression: 'tight jaw, averted then locked eyes, micro flinch',
  },
  angry: {
    camera: 'low_angle',
    colorLighting: 'hard contrast, warm practicals against cool fill, crushed blacks',
    dof: 'medium-tight, aggressive framing',
    microExpression: 'flared nostrils, clenched teeth, sharp blinks',
  },
  romance: {
    camera: 'tight_close_up',
    colorLighting: 'warm golden practicals, soft wrap light, gentle bloom on highlights',
    dof: 'very shallow DoF, creamy bokeh',
    microExpression: 'soft eyes, half-smile, lingering gaze',
  },
  romantic: {
    camera: 'tight_close_up',
    colorLighting: 'warm golden practicals, soft wrap light, gentle bloom on highlights',
    dof: 'very shallow DoF, creamy bokeh',
    microExpression: 'soft eyes, half-smile, lingering gaze',
  },
  sad: {
    camera: 'close_up',
    colorLighting: 'cool blue fill, dim practicals, muted saturation',
    dof: 'shallow DoF isolating the face',
    microExpression: 'glistening eyes, slow blink, trembling lip',
  },
  crying: {
    camera: 'extreme_close_up',
    colorLighting: 'soft cool key, reflective tears catching practical light',
    dof: 'macro-shallow on eyes/tears',
    microExpression: 'tear tracks, quivering chin, broken inhale',
  },
  fearful: {
    camera: 'dutch_angle',
    colorLighting: 'cold cyan practicals, deep underexposure, sharp rim',
    dof: 'uneasy shallow focus, background threats soft',
    microExpression: 'wide eyes, shallow breath, darting gaze',
  },
  tense: {
    camera: 'medium_close',
    colorLighting: 'high contrast, cool shadows, warm practical accents',
    dof: 'tight medium with compressed perspective',
    microExpression: 'tight mouth, held breath, micro sweat',
  },
  mysterious: {
    camera: 'over_shoulder',
    colorLighting: 'low-key noir, practical pools, cool haze',
    dof: 'selective focus, silhouettes',
    microExpression: 'half-lit face, guarded eyes',
  },
  epic: {
    camera: 'wide_establishing',
    colorLighting: 'rich cinematic grade, volumetric god rays, deep contrast',
    dof: 'deep focus for scale',
    microExpression: 'resolute jaw, wind-touched hair',
  },
  happy: {
    camera: 'medium_wide',
    colorLighting: 'warm daylight, lifted shadows, soft golden accents',
    dof: 'open aperture with cheerful bokeh',
    microExpression: 'genuine smile reaching the eyes',
  },
  triumphant: {
    camera: 'low_angle',
    colorLighting: 'heroic warm key, lens flare accents, lifted mids',
    dof: 'clean medium-wide hero framing',
    microExpression: 'open chest, bright eyes, controlled smile',
  },
  hopeful: {
    camera: 'medium_close',
    colorLighting: 'soft warm dawn light, gentle lift in shadows',
    dof: 'soft focus background, open face',
    microExpression: 'softened brow, quiet smile',
  },
  neutral: {
    camera: 'medium_wide',
    colorLighting: 'naturalistic 3-point, balanced skin tones',
    dof: 'moderate DoF',
    microExpression: 'natural resting face, attentive eyes',
  },
};

/**
 * Normalize emotion string and look up modifiers.
 * @param {string} emotion
 * @returns {object}
 */
export function getEmotionPicture(emotion = 'neutral') {
  const key = String(emotion || 'neutral').toLowerCase().trim();
  // Allow compound emotions like "tense betrayal"
  if (EMOTION_PICTURE_MAP[key]) return { emotion: key, ...EMOTION_PICTURE_MAP[key] };
  for (const [k, v] of Object.entries(EMOTION_PICTURE_MAP)) {
    if (key.includes(k)) return { emotion: k, ...v };
  }
  return { emotion: 'neutral', ...EMOTION_PICTURE_MAP.neutral };
}

/**
 * Compact prompt fragment for beauty / director / segment injection.
 * @param {string} emotion
 * @returns {string}
 */
export function formatEmotionPictureHint(emotion = 'neutral') {
  const m = getEmotionPicture(emotion);
  return `EMOTION→PICTURE (${m.emotion}): prefer camera ${m.camera}; ${m.colorLighting}; ${m.dof}; micro-expression: ${m.microExpression}`;
}

/**
 * Apply emotion defaults onto a scene-like object (mutates copy-friendly).
 * Only fills cameraType when missing/generic.
 */
export function applyEmotionDefaults(scene = {}) {
  const m = getEmotionPicture(scene.emotion);
  const out = { ...scene };
  const cam = String(out.cameraType || '').toLowerCase();
  if (!cam || cam === 'medium_wide' || cam === 'medium') {
    // Escalate camera for high-stakes emotions even if medium_wide was defaulted
    if (['betrayal', 'fearful', 'crying', 'romance', 'romantic', 'angry'].includes(m.emotion)) {
      out.cameraType = m.camera;
    } else if (!cam) {
      out.cameraType = m.camera;
    }
  }
  out.emotionPicture = {
    camera: m.camera,
    colorLighting: m.colorLighting,
    dof: m.dof,
    microExpression: m.microExpression,
  };
  return out;
}

export default {
  EMOTION_PICTURE_MAP,
  getEmotionPicture,
  formatEmotionPictureHint,
  applyEmotionDefaults,
};
