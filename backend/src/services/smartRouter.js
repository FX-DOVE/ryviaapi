/**
 * smartRouter.js — Simplified routing for the LTX 2.3 + Flux pipeline.
 *
 * No provider detection logic — always routes to:
 *   Video: LTX 2.3
 *   Image: Flux
 *   No TTS routing (LTX 2.3 has native audio)
 */

import { getColorGradeFilter, getCinematicLetterboxFilter } from './styleService.js';

export async function routeJob(job, project = null) {
  const route = {
    videoProvider:      'ltx',
    imageProvider:      'flux',
    ffmpegFilters:      [],
    costEstimateCredits: 5,
  };

  const style = job.styleConfig || {};

  // Build FFmpeg styling filters
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
        route.ffmpegFilters.push('vignette=PI/4');
      }
    } catch (e) {}
  }

  if (['historical', 'documentary'].includes(style.preset)) {
    route.ffmpegFilters.push('noise=alls=3:allf=t');
  }

  // Calculate cost based on total segments (each scene has multiple 8s segments)
  const totalScenes = job.totalScenes || 1;
  const avgSegmentsPerScene = 5;
  const segmentCost = 3; // credits per 8s segment
  route.costEstimateCredits = (totalScenes * avgSegmentsPerScene * segmentCost) + 10;

  return route;
}

export default { routeJob };
