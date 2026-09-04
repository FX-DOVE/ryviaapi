import Character from '../models/Character.js';
import Environment from '../models/Environment.js';

export const STYLE_PRESETS = {
  documentary: {
    visualModifiers: 'documentary style, realistic, natural lighting, handheld feel, highly detailed textures',
    colorModifiers: 'slightly desaturated, warm natural tones, subtle film grain',
    motionModifiers: 'slow deliberate camera panning, subtle drift',
    voiceTone: 'calm authoritative narrator, warm resonance'
  },
  cinematic: {
    visualModifiers: 'cinematic, highly detailed, dramatic composition, anamorphic look, professional set photography',
    colorModifiers: 'high contrast color grading, deep shadows, rich highlights',
    motionModifiers: 'smooth tracking shots, subtle steady camera movement',
    voiceTone: 'dramatic, powerful narrator voice'
  },
  african_storytelling: {
    visualModifiers: 'African setting, vibrant colors, rich storytelling atmosphere, warm firelight reflections',
    colorModifiers: 'golden sun-drenched tones, rich saturation, earthy palettes',
    motionModifiers: 'epic wide framing, slow tracking shots',
    voiceTone: 'warm storytelling voice, deep resonance'
  },
  animation_pixar: {
    visualModifiers: 'Pixar 3D animation style, clay renders, expressive eyes, smooth stylized surfaces',
    colorModifiers: 'bright vivid colors, soft ambient occlusion shadows',
    motionModifiers: 'bouncy natural motion, cartoon logic',
    voiceTone: 'friendly, upbeat, character voices'
  },
  animation_anime: {
    visualModifiers: 'modern anime style, detailed digital hand-drawn illustration, highly stylized cells, beautiful skies',
    colorModifiers: 'saturated color palettes, clean lineart, soft cel shading',
    motionModifiers: 'dynamic camera pans, speedlines, anime action',
    voiceTone: 'expressive Japanese-style narration'
  },
  historical: {
    visualModifiers: 'historical period accurate costumes, authentic set props, dusty atmospheric haze',
    colorModifiers: 'vintage warm color grade, sepia accents, faded film stock',
    motionModifiers: 'sweeping camera views, slow pans',
    voiceTone: 'deep narrator with gravitas and historical perspective'
  },
  realistic: {
    visualModifiers: 'photorealistic, shot on 35mm lens, raw photograph, natural details, sharp textures',
    colorModifiers: 'neutral realistic colors, unbiased lighting, lifelike shadows',
    motionModifiers: 'natural organic camera movement',
    voiceTone: 'clear natural narrator'
  },
  news_report: {
    visualModifiers: 'news broadcast quality, clean digital studio lighting, presenter frame',
    colorModifiers: 'neutral daylight balance, professional broadcast coloring',
    motionModifiers: 'static locked camera',
    voiceTone: 'informative, objective reporter voice'
  },
  luxury: {
    visualModifiers: 'ultra-premium luxury aesthetic, glossy surfaces, sleek clean minimalism, gold and marble details',
    colorModifiers: 'high-end commercial grading, pristine highlights, deep clean blacks',
    motionModifiers: 'slow expensive camera movements, glidecam glide',
    voiceTone: 'sophisticated, smooth whispering narrator'
  },
  scifi: {
    visualModifiers: 'futuristic sci-fi design, neon practical highlights, chrome materials, advanced technology interfaces',
    colorModifiers: 'cool cyberpunk teal and orange color grade, neon highlights',
    motionModifiers: 'dynamic tracking, high-tech dolly zooms',
    voiceTone: 'synth-layered, robotic or mysterious voice'
  },

  // ─── Feature Film Animation Styles ────────────────────────────────────────
  '2d_anime': {
    visualModifiers: 'professional anime production quality, Studio Ghibli and Demon Slayer inspired, hand-drawn digital illustration, highly detailed cel shading, expressive characters with detailed hair and emotionally rich eyes, beautiful painted backgrounds, dynamic composition',
    colorModifiers: 'vivid saturated anime color palette, clean precise lineart, soft cel shadows with colored ambient occlusion, glowing specular highlights, rich sky gradients',
    motionModifiers: 'dynamic anime camera work, dramatic zoom-ins on emotional moments, speedlines in action sequences, slow emotional panning shots, impact frames',
    voiceTone: 'expressive emotive voice acting, anime-style character voices with distinct personality'
  },

  'pixar': {
    visualModifiers: 'Pixar 3D animation quality, warm stylized character designs with smooth rounded forms, expressive micro-facial animations, richly textured environments with photorealistic materials, professional studio lighting rigs, detailed secondary character expressions',
    colorModifiers: 'bright warm joyful color palette, soft ambient occlusion shadows, warm practical rim lighting, saturated hero colors with desaturated backgrounds, Pixar signature color science',
    motionModifiers: 'bouncy animation with squash-and-stretch principles, smooth arcing camera moves, character-driven action with physical comedy timing, expressive walk cycles',
    voiceTone: 'warm friendly character voices, emotionally expressive delivery, family-appropriate tone'
  },

  '3d_cgi_hollywood': {
    visualModifiers: 'photorealistic 3D CGI render at film production quality, subsurface skin scattering on characters, detailed facial pores and individual hair strands, high-resolution environment textures, advanced ray-traced lighting, cinematic depth of field with anamorphic bokeh',
    colorModifiers: 'ACES cinematic color space, deep film blacks with crushed shadows, warm practical accents against cool fill, anamorphic horizontal lens flares, subtle film grain at 35mm stock emulation',
    motionModifiers: 'professional Hollywood cinematography, smooth dolly and Steadicam tracking shots, epic crane reveals, precise motivated camera placement, dynamic action coverage with smart cutting rhythm',
    voiceTone: 'powerful dramatic actor voices, Hollywood blockbuster delivery, emotionally intense performances'
  },

  'nollywood_drama': {
    visualModifiers: 'vibrant authentic Nigerian and African setting, detailed traditional and contemporary African fashion, authentic Lagos, Abuja or village locations, emotionally expressive performance-focused framing, rich cultural props and costumes, natural African environmental lighting',
    colorModifiers: 'warm rich African skin tones accurately rendered with deep brown saturation, golden hour warmth, rich earthy color palette with vibrant fabric accents, naturalistic skin tone preservation',
    motionModifiers: 'dramatic close-ups during emotional confrontations, wide establishing shots of African landscapes and cityscapes, handheld intimacy during tense scenes, expressive reaction shot coverage',
    voiceTone: 'authentic Nigerian English with cultural warmth, emotionally expressive delivery, dramatic Nollywood performance energy'
  },
};

/**
 * Map FilmStudioPage videoType ids onto STYLE_PRESETS keys.
 * Drama/movie stay photoreal cinematic; anime maps to the anime production bible.
 */
export const MODE_TO_STYLE_PRESET = {
  documentary: 'documentary',
  drama: 'cinematic',
  movie: 'cinematic',
  explainer: 'realistic',
  commercial: 'luxury',
  music_video: 'cinematic',
  cinematic_trailer: 'cinematic',
  anime: '2d_anime',
  animation_anime: '2d_anime',
  nollywood: 'nollywood_drama',
};

/**
 * Studio director bibles — injected into screenplay + cinematic decomposition
 * so drama / movie / anime produce structured shot lists, wardrobe, locations,
 * and camera language the pipeline can consume.
 */
export const DIRECTOR_BIBLES = {
  drama: `STUDIO DIRECTOR BIBLE — DRAMA
You are the lead director on a prestige drama series / film. Prioritize emotional truth over spectacle.
STRUCTURE:
- Act architecture: setup → wound → confrontation → collapse → reckoning.
- Scenes are dialogue-forward. Each confrontation beat gets its own 8s segment.
- Storyboard first: wide establish → two-shot → OTS → reaction ECU → hold.
CAMERA LANGUAGE (mandatory variety):
- Opening of a new location: wide_establishing or aerial_wide.
- Dialogue: alternate two_shot, over_shoulder, medium_close, close_up.
- Peak emotion (tears, betrayal, confession): tight_close_up or extreme_close_up on eyes / hands / ring.
- Power imbalance: low_angle on aggressor, high_crane on vulnerable character.
- Dutch angle ONLY for psychological rupture, never decorative.
WARDROBE / CONTINUITY:
- Lock each character's default outfit per act in clothingByAct.
- Accessories (rings, phones, walking sticks, bags) listed in every beat where still present.
- CharacterState (tear-stained, sweat, bruised, disheveled) carries forward until story changes it.
LOCATIONS:
- Intimate interiors preferred (sitting rooms, kitchens, corridors). TimeOfDay and practical lighting locked.
- Reuse locationId whenever the same room returns.
PERFORMANCE DIRECTION:
- gaze must name who looks at whom. Characters speaking to each other maintain eyeline.
- voiceDirection and expression are required on every dialogue beat.
OUTPUT: structured JSON acts → scenes → beats the pipeline consumes — never prose summaries.`,

  movie: `STUDIO DIRECTOR BIBLE — FEATURE FILM / MOVIE
You are a feature-film director planning coverage like a Hollywood / Nollywood studio unit.
STRUCTURE:
- Classic three-act feature architecture with clear inciting incident, midpoint turn, dark night, climax.
- Scenes cover action AND dialogue. Mix establishing, coverage, insert, and reaction.
CAMERA LANGUAGE (mandatory studio coverage):
- New exterior / estate / city: drone_aerial or aerial_wide with drone_sweep.
- Dialogue scenes: master two_shot → over_shoulder A → over_shoulder B → close_up punches.
- Action / chase: tracking_steadicam, low_angle, handheld_organic — never static for more than one beat.
- Inserts: extreme_close_up on critical props (keys, phones, documents, weapons).
- Transitions between acts: high_crane or slow_pull_back reveals.
WARDROBE / CONTINUITY:
- Hero wardrobe locked per act; costume changes only at act boundaries or explicit story beats.
- Props introduced once must persist in props[] on every later beat until removed by story.
- Spatial blocking respects 180-degree rule; eyelines reverse correctly across cuts.
LOCATIONS:
- Grand establishing plates for every major location; interiors keep identical architecture and lighting.
- timeVariants day/night required for every environment.
PRODUCTION VALUES:
- Motivated camera moves only. Explicit startFrameVisual / endFrameVisual on every beat.
- audioCues for ambience, Foley, and score swell notes (LTX native audio).
OUTPUT: structured JSON with reusable locationId, clothingByAct, props, accessories, characterState.`,

  anime: `STUDIO DIRECTOR BIBLE — ANIME / ANIMATED SERIES
You are a series episode director for a high-end anime production (Ghibli / MAPPA / Kyoto Animation calibre).
STRUCTURE:
- Episode / act arcs with cold open, character focus, emotional peak, and cliff or resolve.
- Inner monologue allowed as dialogue with voiceDirection = "internal monologue / soft voiceover".
- Expressive extremes: shock, resolve, tenderness — face and eyes carry the story.
CAMERA / COMPOSITION LANGUAGE:
- Opening: wide painted-background establishing with slow_push_in.
- Dialogue: medium_close and close_up with strong eyelines; extreme_close_up on eyes for turning points.
- Action: dutch_angle, low_angle hero shots, tracking_steadicam, speed-implied motion in action text.
- Impact frames: hold tight_close_up one beat after a revelation.
VISUAL STYLE LOCK:
- Cel shading, clean lineart, painted backgrounds, saturated but controlled palette.
- Character sheets are IDENTITY ASSETS — hair color, eye shape, costume silhouette must never drift.
- Separate identity (who they are) from action (what they do this beat) in prompts.
WARDROBE / CONTINUITY:
- Signature costumes locked; school uniforms / battle outfits in clothingByAct.
- Accessories (ribbons, weapons, charms) listed every beat they remain.
- Emotional visual states (blush, tears, sweat-drop, glowing eyes) in characterState.
LOCATIONS:
- Distinct painted BG plates with timeVariants (day / dusk / night / golden hour).
- Reuse locationId for recurring school, home, city rooftop, etc.
OUTPUT: structured JSON acts/scenes/beats with anime camera enums, wardrobe locks, and prop continuity.`,

  documentary: `STUDIO DIRECTOR BIBLE — DOCUMENTARY
Observational and interview-led. Handheld intimacy, natural light, B-roll inserts, VO-friendly pacing.
Prefer wide_establishing for location truth, close_up for interview emotion, macro inserts for detail.`,

  cinematic_trailer: `STUDIO DIRECTOR BIBLE — CINEMATIC TRAILER
Teaser architecture: hook → stakes montage → silence beat → title card energy.
Rapid angle changes, epic wides, extreme close-ups on iconic props, dutch angles for tension.`,

  commercial: `STUDIO DIRECTOR BIBLE — COMMERCIAL
3-second hook, problem, product hero, aspirational payoff. Clean lighting, product ECUs, dynamic push-ins.`,

  music_video: `STUDIO DIRECTOR BIBLE — MUSIC VIDEO
Beat-synced visual poetry. Color shifts, rhythmic cuts, atmospheric sets, recurring motifs.`,

  explainer: `STUDIO DIRECTOR BIBLE — EXPLAINER
Clear teaching beats, high-key lighting, visual metaphors, structured progression, clean medium framing.`,
};

export function resolveStylePreset(videoTypeOrPreset = 'cinematic') {
  const key = String(videoTypeOrPreset || 'cinematic').toLowerCase().trim();
  if (STYLE_PRESETS[key]) return key;
  return MODE_TO_STYLE_PRESET[key] || 'cinematic';
}

export function getDirectorBible(genreOrVideoType = 'drama') {
  const key = String(genreOrVideoType || 'drama').toLowerCase().trim();
  return DIRECTOR_BIBLES[key]
    || DIRECTOR_BIBLES[MODE_TO_STYLE_PRESET[key]]
    || DIRECTOR_BIBLES.drama;
}

export function getStyleModifiers(videoTypeOrPreset = 'cinematic') {
  const presetKey = resolveStylePreset(videoTypeOrPreset);
  return STYLE_PRESETS[presetKey] || STYLE_PRESETS.cinematic;
}

export const COLOR_GRADE_FFMPEG = {
  netflix:      "curves=r='0/0 0.5/0.55 1/1':g='0/0 0.5/0.5 1/0.95':b='0/0 1/0.9'",
  sepia:        "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
  vintage:      "curves=all='0/0.1 0.5/0.5 1/0.9',hue=s=0.7",
  hollywood:    "curves=r='0/0 0.5/0.6 1/1':b='0/0 1/0.85'",
  warm:         "colortemperature=temperature=4500",
  cold:         "colortemperature=temperature=7500",
  desaturated:  "hue=s=0.5",
  film:         "curves=all='0/0.05 0.5/0.5 1/0.95',noise=alls=2:allf=t"
};

export const CAMERA_PROMPT_MAP = {
  hollywood:    'Hollywood style cinematography, professional camera movement',
  drone:        'aerial drone shot, bird eye view, sweeping landscape panning',
  closeup:      'extreme close-up shot, tight framing, high facial detail and expressions',
  tracking:     'tracking shot following subject, lateral camera movement',
  handheld:     'handheld camera, slightly shaky, realistic documentary feel',
  slow_zoom:    'slow deliberate zoom towards subject, building cinematic tension'
};

export async function enrichScenePrompt(rawPrompt, sceneConfig, project = null) {
  let promptParts = [];

  // 1. Add AI Creative Lock prefix / consistency from project memory
  if (project?.aiMemory?.consistencyPromptPrefix) {
    promptParts.push(project.aiMemory.consistencyPromptPrefix);
  }

  // 2. Fetch Character description if set
  if (sceneConfig.characterId) {
    const char = await Character.findById(sceneConfig.characterId);
    if (char) {
      const desc = `Featuring ${char.name}, a ${char.age} year old character, described as ${char.description}. Wearing ${char.clothingDescription || 'standard clothing'}, displaying ${char.emotion || 'neutral'} expression.`;
      promptParts.push(desc);
      if (char.seedPrompt) promptParts.push(char.seedPrompt);
    }
  }

  // 3. Fetch Environment context if set
  if (sceneConfig.environmentId) {
    const env = await Environment.findById(sceneConfig.environmentId);
    if (env) {
      const desc = `Set in ${env.name} environment: ${env.description}. Weather is ${env.weather}, time of day is ${env.timeOfDay}.`;
      promptParts.push(desc);
      if (env.seedPrompt) promptParts.push(env.seedPrompt);
    }
  }

  // 4. Inject style preset modifiers
  const presetKey = resolveStylePreset(sceneConfig.styleConfig?.preset || sceneConfig.videoType || 'cinematic');
  const preset = STYLE_PRESETS[presetKey];
  if (preset) {
    promptParts.push(preset.visualModifiers);
    promptParts.push(preset.colorModifiers);
  }

  // 5. Camera modifiers
  const cameraKey = sceneConfig.styleConfig?.camera || 'hollywood';
  const cameraPrompt = CAMERA_PROMPT_MAP[cameraKey];
  if (cameraPrompt) promptParts.push(cameraPrompt);

  // 6. Lighting and Emotion
  if (sceneConfig.styleConfig?.lighting) {
    promptParts.push(`lit with ${sceneConfig.styleConfig.lighting} style lighting`);
  }
  if (sceneConfig.styleConfig?.emotion) {
    promptParts.push(`conveying ${sceneConfig.styleConfig.emotion} mood`);
  }

  // 7. Base prompt
  promptParts.push(rawPrompt);

  // 8. Append Director Note if present
  if (sceneConfig.directorNote) {
    promptParts.push(`(Director Note: ${sceneConfig.directorNote})`);
  }

  return promptParts.join('. ').replace(/\.+/g, '.');
}

export function getColorGradeFilter(colorGrade) {
  return COLOR_GRADE_FFMPEG[colorGrade] || COLOR_GRADE_FFMPEG['netflix'];
}

export function getCinematicLetterboxFilter() {
  // Pad video with black borders for 2.39:1 aspect ratio
  return 'drawbox=y=0:h=ih*0.12:color=black:t=fill,drawbox=y=ih-ih*0.12:h=ih*0.12:color=black:t=fill';
}

export default { enrichScenePrompt, getColorGradeFilter, getCinematicLetterboxFilter, STYLE_PRESETS, MODE_TO_STYLE_PRESET, DIRECTOR_BIBLES, resolveStylePreset, getDirectorBible, getStyleModifiers };
