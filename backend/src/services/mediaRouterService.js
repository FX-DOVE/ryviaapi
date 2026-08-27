/**
 * mediaRouterService.js - Determines the correct generation method for a clip
 * based on its references, existing output, and prompt constraints (Phase 6).
 */

export function determineGenerationRoute(clip, promptUpdates = {}) {
  // If we just want to reuse a shot via semantic matching
  if (promptUpdates.generationMethod === 'reuse' || clip.generationMethod === 'reuse') {
    return 'reuse';
  }

  // Check if we are modifying an existing output vs creating new
  const hasExistingImage = !!clip.imagePath;
  const hasExistingVideo = !!clip.videoPath;

  const imagePromptChanged = !!promptUpdates.imagePrompt && promptUpdates.imagePrompt !== clip.imagePrompt;
  const videoPromptChanged = !!promptUpdates.videoPrompt && promptUpdates.videoPrompt !== clip.videoPrompt;

  // 1. Text -> Image: Standard start for a new clip or regenerated concept
  if (!hasExistingImage || imagePromptChanged) {
    // If there's an imageEditPrompt and a reference frame, we actually want image2image
    if (promptUpdates.imageEditPrompt && (clip.referenceAssets?.startFrame?.url || hasExistingImage)) {
      return 'image2image';
    }
    return 'text2image'; // Default new anchor
  }

  // 2. Image -> Image: Existing image exists, but we want to modify it (e.g. changing shirt color)
  if (hasExistingImage && promptUpdates.imageEditPrompt) {
    return 'image2image';
  }

  // 3. Image -> Video: We have an approved image, just animate it
  if (hasExistingImage && (!hasExistingVideo || videoPromptChanged)) {
    return 'image2video';
  }

  // 4. Video -> Video: (Future architecture support if natively supported by model)
  if (hasExistingVideo && promptUpdates.videoEditPrompt) {
    return 'video2video';
  }

  // 5. Text -> Video: Generating directly to video without an anchor image
  if (promptUpdates.generationMethod === 'text2video') {
    return 'text2video';
  }

  // Default fallback
  return clip.generationMethod || 'image2video';
}

export function determineDependencies(clip) {
  // Identify if regenerating an image makes the video stale
  return {
    videoRequiresImage: ['image2video', 'image2image'].includes(clip.generationMethod),
    audioRequiresScript: !!clip.dialogue?.length || !!clip.narration
  };
}

export default { determineGenerationRoute, determineDependencies };