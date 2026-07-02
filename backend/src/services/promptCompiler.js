import styleService from './styleService.js';
import CreativeProfile from '../models/CreativeProfile.js';

export async function compileScenePrompt(rawPrompt, sceneConfig, project = null) {
  let prompt = await styleService.enrichScenePrompt(rawPrompt, sceneConfig, project);

  // If a creative profile has custom prompt modifiers, append them
  if (project?.creativeProfileId) {
    const profile = await CreativeProfile.findById(project.creativeProfileId);
    if (profile?.promptModifiers?.length > 0) {
      const modifiers = profile.promptModifiers.join(', ');
      prompt += `, styling keywords: ${modifiers}`;
    }
  }

  return prompt;
}

export default { compileScenePrompt };
