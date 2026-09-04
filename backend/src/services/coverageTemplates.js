/**
 * coverageTemplates.js — Beat recipes by video type.
 *
 * The cinematic director prefers these sequences when decomposing scenes
 * (especially dialogue coverage) so drama/movie/anime/etc. feel watchable.
 */

export const COVERAGE_TEMPLATES = {
  drama: {
    label: 'Drama dialogue / confrontation',
    dialogueSequence: [
      'wide_establishing',
      'two_shot',
      'over_shoulder',
      'medium_close',
      'tight_close_up',
      'extreme_close_up',
      'reaction_hold',
    ],
    actOpener: ['wide_establishing', 'medium_wide', 'slow_push_in'],
    actCloser: ['tight_close_up', 'slow_pull_back', 'wide_establishing'],
    notes: 'Storyboard wide → two-shot → OTS → ECU. One dialogue line per beat. Hold reaction after reveals.',
  },

  movie: {
    label: 'Feature film studio coverage',
    dialogueSequence: [
      'drone_aerial',
      'wide_establishing',
      'two_shot',
      'over_shoulder',
      'over_shoulder',
      'close_up',
      'extreme_close_up',
      'insert_prop',
    ],
    actOpener: ['drone_aerial', 'wide_establishing', 'tracking_steadicam'],
    actCloser: ['high_crane', 'slow_pull_back', 'aerial_wide'],
    notes: 'Master → OTS A/B → CU punches → prop insert. Motivated camera moves only.',
  },

  anime: {
    label: 'Anime episode coverage',
    dialogueSequence: [
      'wide_establishing',
      'medium_close',
      'close_up',
      'extreme_close_up',
      'dutch_angle',
      'impact_hold',
    ],
    actOpener: ['wide_establishing', 'slow_push_in', 'medium_close'],
    actCloser: ['extreme_close_up', 'impact_hold', 'wide_establishing'],
    notes: 'Painted BG establish, eye ECU on turning points, impact frame after reveal. Dutch for rupture only.',
  },

  documentary: {
    label: 'Documentary observational',
    dialogueSequence: [
      'wide_establishing',
      'medium_close',
      'close_up',
      'macro_insert',
      'handheld_organic',
    ],
    actOpener: ['wide_establishing', 'handheld_organic', 'medium_close'],
    actCloser: ['close_up', 'macro_insert', 'wide_establishing'],
    notes: 'Location truth → interview intimacy → B-roll insert. Natural light, VO-friendly pacing.',
  },

  explainer: {
    label: 'Explainer teaching beats',
    dialogueSequence: [
      'medium_wide',
      'medium_close',
      'insert_prop',
      'medium_close',
      'wide_establishing',
    ],
    actOpener: ['medium_wide', 'slow_push_in'],
    actCloser: ['medium_close', 'wide_establishing'],
    notes: 'Hook → concept → visual metaphor → demo → summary. High-key clean lighting.',
  },

  commercial: {
    label: 'Commercial / ad punch',
    dialogueSequence: [
      'tight_close_up',
      'medium_wide',
      'extreme_close_up',
      'slow_push_in',
      'product_hero',
    ],
    actOpener: ['tight_close_up', 'dynamic_push_in'],
    actCloser: ['product_hero', 'slow_pull_back'],
    notes: '3s hook → problem → product hero ECU → aspirational payoff.',
  },

  music_video: {
    label: 'Music video rhythmic',
    dialogueSequence: [
      'wide_establishing',
      'dutch_angle',
      'close_up',
      'tracking_steadicam',
      'extreme_close_up',
      'aerial_wide',
    ],
    actOpener: ['wide_establishing', 'dutch_angle', 'tracking_steadicam'],
    actCloser: ['extreme_close_up', 'aerial_wide'],
    notes: 'Beat-synced cuts, color shifts, recurring motifs, atmospheric set-pieces.',
  },

  cinematic_trailer: {
    label: 'Cinematic trailer montage',
    dialogueSequence: [
      'aerial_wide',
      'extreme_close_up',
      'dutch_angle',
      'low_angle',
      'silence_hold',
      'title_energy',
    ],
    actOpener: ['aerial_wide', 'extreme_close_up', 'dutch_angle'],
    actCloser: ['silence_hold', 'title_energy', 'aerial_wide'],
    notes: 'Hook → stakes montage → silence beat → title card energy. Rapid angle changes.',
  },
};

/**
 * Resolve a coverage template for a video type / genre key.
 * @param {string} videoType
 * @returns {object}
 */
export function getCoverageTemplate(videoType = 'drama') {
  const key = String(videoType || 'drama').toLowerCase().trim();
  return COVERAGE_TEMPLATES[key] || COVERAGE_TEMPLATES.drama;
}

/**
 * Human-readable block for director / screenplay system prompts.
 * @param {string} videoType
 * @returns {string}
 */
export function formatCoverageDirective(videoType = 'drama') {
  const t = getCoverageTemplate(videoType);
  return `COVERAGE TEMPLATE — ${t.label.toUpperCase()}
Preferred dialogue coverage sequence: ${t.dialogueSequence.join(' → ')}
Act opener recipe: ${t.actOpener.join(' → ')}
Act closer recipe: ${t.actCloser.join(' → ')}
Notes: ${t.notes}
Prefer these camera sequences when decomposing scenes. Do not flatten dialogue into a single static medium shot.`;
}

export default { COVERAGE_TEMPLATES, getCoverageTemplate, formatCoverageDirective };
