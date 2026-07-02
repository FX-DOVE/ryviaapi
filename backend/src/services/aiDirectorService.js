import { generateWithFallback } from '../providers/reasoningProvider.js';

export async function analyzeRequestAndPlan(title, textInput, styleConfig = {}, jobId = '') {
  console.log(`[AIDirector] Planning creative layout for script: "${title}"`);

  // Default steps with explicit providers
  let workflowSteps = [
    { id: 'script', provider: 'llm' },
    { id: 'audio', provider: 'elevenlabs' },
    { id: 'prompt', provider: 'llm' },
    { id: 'image_generation', provider: 'flux' },
    { id: 'video_generation', provider: 'wan21' },
    { id: 'rendering', provider: 'system' },
    { id: 'upload', provider: 'system' },
    { id: 'notify', provider: 'system' }
  ];
  let detectedType = 'cinematic';
  let reasoning = 'Standard cinematic documentary generation selected.';

  const preset = (styleConfig.preset || 'cinematic').toLowerCase();

  // Smart director heuristics based on presets and inputs
  if (preset === 'documentary') {
    detectedType = 'documentary';
    reasoning = 'Documentary layout: slow panning, historical context, elevenlabs narration.';
  } else if (preset.includes('avatar') || textInput.includes('avatar') || textInput.includes('talking')) {
    detectedType = 'talking_avatar';
    workflowSteps = [
      { id: 'audio', provider: 'elevenlabs' },
      { id: 'prompt', provider: 'llm' },
      { id: 'image_generation', provider: 'flux' },
      { id: 'lipsync', provider: 'musetalk' },
      { id: 'rendering', provider: 'system' },
      { id: 'upload', provider: 'system' },
      { id: 'notify', provider: 'system' }
    ];
    reasoning = 'Talking avatar layout: bypass video animation, generate close-up character and apply MuseTalk lipsync.';
  } else if (preset === 'movie_trailer') {
    detectedType = 'movie_trailer';
    workflowSteps.find(s => s.id === 'video_generation').provider = 'kling'; // Faster motion provider
    reasoning = 'Trailer layout: fast pacing, dramatic music, high-action motion keyframes using Kling.';
  }

  // Enforce structured details
  const plan = {
    videoType: detectedType,
    workflowSteps,
    styleSettings: {
      preset: styleConfig.preset || 'cinematic',
      camera: styleConfig.camera || 'hollywood',
      lighting: styleConfig.lighting || 'golden_hour',
      colorGrade: styleConfig.colorGrade || 'netflix',
      motionLevel: styleConfig.motionLevel || 'medium',
      emotion: styleConfig.emotion || 'neutral',
      musicStyle: styleConfig.musicStyle || 'documentary',
      customStyleNotes: styleConfig.customStyleNotes || ''
    },
    reasoning,
    timestamp: new Date()
  };

  console.log(`[AIDirector] Created plan: ${JSON.stringify(plan, null, 2)}`);
  return plan;
}

export default { analyzeRequestAndPlan };
