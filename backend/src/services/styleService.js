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
  const presetKey = (sceneConfig.styleConfig?.preset || 'cinematic').toLowerCase();
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

export default { enrichScenePrompt, getColorGradeFilter, getCinematicLetterboxFilter, STYLE_PRESETS };
