import { LocalGpuProvider } from '../providers/localGpuProvider.js';
import { getColorGradeFilter, getCinematicLetterboxFilter } from './styleService.js';

export async function routeJob(job, project = null) {
  const route = {
    videoProvider: 'grok',      // default
    imageProvider: 'grok',
    ttsProvider: 'edge-tts',
    lipSyncEnabled: false,
    ffmpegFilters: [],
    musicEnabled: false,
    musicStyle: null,
    costEstimateCredits: 5
  };

  const style = job.styleConfig || {};

  // 1. Check GPU availability
  const gpu = new LocalGpuProvider();
  const gpuAvailable = await gpu.isAvailable();

  if (gpuAvailable) {
    route.videoProvider = 'local-gpu';
    route.imageProvider = 'local-gpu';
    
    if (process.env.LOCAL_TTS_ENABLED === 'true') {
      route.ttsProvider = 'local_gpu';
    }
  }

  // 2. Overwrite TTS if ElevenLabs key exists
  if (process.env.ELEVENLABS_API_KEY) {
    route.ttsProvider = 'elevenlabs';
  }

  // 3. Resolve Lip Sync capability
  if (process.env.LIP_SYNC_ENABLED === 'true' && route.videoProvider === 'local-gpu') {
    route.lipSyncEnabled = true;
  }

  // 4. Resolve Music style
  if (style.musicStyle && style.musicStyle !== 'none') {
    route.musicEnabled = true;
    route.musicStyle = style.musicStyle;
  }

  // 5. Build FFmpeg styling filters
  if (style.colorGrade) {
    try {
      const colorFilter = getColorGradeFilter(style.colorGrade);
      if (colorFilter) route.ffmpegFilters.push(colorFilter);
    } catch (e) {
      console.warn(`[SmartRouter] Style service grade error: ${e.message}`);
    }
  }

  if (['cinematic', 'movie_trailer'].includes(style.preset)) {
    try {
      const letterbox = getCinematicLetterboxFilter();
      if (letterbox) {
        route.ffmpegFilters.push(letterbox);
        route.ffmpegFilters.push('vignette=PI/4'); // cinematic vignette
      }
    } catch (e) {}
  }

  if (['historical', 'documentary'].includes(style.preset)) {
    route.ffmpegFilters.push('noise=alls=3:allf=t'); // film grain
  }

  // 6. Calculate cost credits dynamically
  let sceneCost = 22; // default
  if (style.preset === 'talking_avatar') {
    sceneCost = 15; // avatar is cheaper (no video animation step)
  }
  
  const totalScenes = job.totalScenes || 1;
  route.costEstimateCredits = (totalScenes * sceneCost) + 10; // scenes + base tts/render

  return route;
}

export default { routeJob };
