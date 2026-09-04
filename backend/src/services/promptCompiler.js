import styleService from './styleService.js';
import CreativeProfile from '../models/CreativeProfile.js';
import { extractContinuityPrompt } from './continuityService.js';

/**
 * Compile a scene / beat visual prompt with style, ContinuityBible, and
 * character / environment lock text. Used by any path that still goes through
 * promptCompiler (legacy scene gen + director enrichment).
 *
 * @param {string} rawPrompt
 * @param {object} sceneConfig
 * @param {object|null} project
 * @param {object} [extras]
 * @param {string} [extras.characterLockBlock]
 * @param {string} [extras.environmentLockBlock]
 * @param {string} [extras.wardrobeBlock]
 * @param {string} [extras.continuityBlock]  prebuilt; otherwise loaded from projectId
 */
export async function compileScenePrompt(rawPrompt, sceneConfig, project = null, extras = {}) {
  let prompt = await styleService.enrichScenePrompt(rawPrompt, sceneConfig, project);

  const parts = [prompt];

  // ContinuityBible — wardrobe, locations, accessories, spatial rules
  let continuityBlock = extras.continuityBlock || '';
  const projectId = project?._id || project?.id || sceneConfig.projectId;
  if (!continuityBlock && projectId) {
    try {
      continuityBlock = await extractContinuityPrompt(projectId, {
        characterNames: sceneConfig.characterNames || sceneConfig.characters || [],
        locationId: sceneConfig.locationId || sceneConfig.location || '',
      });
    } catch (err) {
      console.warn(`[PromptCompiler] ContinuityBible load skipped: ${err.message}`);
    }
  }
  if (continuityBlock) parts.push(continuityBlock);

  if (extras.characterLockBlock) {
    parts.push(`CHARACTER LOCKS:\n${extras.characterLockBlock}`);
  }
  if (extras.wardrobeBlock) {
    parts.push(`WARDROBE LOCK:\n${extras.wardrobeBlock}`);
  }
  if (extras.environmentLockBlock) {
    parts.push(`ENVIRONMENT LOCK:\n${extras.environmentLockBlock}`);
  }

  // Creative profile modifiers
  if (project?.creativeProfileId) {
    const profile = await CreativeProfile.findById(project.creativeProfileId);
    if (profile?.promptModifiers?.length > 0) {
      parts.push(`styling keywords: ${profile.promptModifiers.join(', ')}`);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

export default { compileScenePrompt };
