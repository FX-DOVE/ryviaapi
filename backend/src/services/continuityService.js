/**
 * continuityService.js - Manages the continuity truth (characters, objects, spatial)
 * for the AI Reasoning Layer.
 */
import ContinuityBible from '../models/ContinuityBible.js';
import FilmCharacter from '../models/FilmCharacter.js';

export async function getContinuityState(projectId) {
  let bible = await ContinuityBible.findOne({ projectId });
  if (!bible) {
    bible = await ContinuityBible.create({ projectId, characters: [], objects: [], locations: [], globalRules: [] });
  }
  return bible;
}

export async function extractContinuityPrompt(projectId, sceneContext = {}) {
  const bible = await getContinuityState(projectId);

  let prompt = '## CONTINUITY BIBLE\n';
  prompt += 'CRITICAL: You must maintain strict visual and spatial continuity across scenes.\n\n';

  if (bible.characters && bible.characters.length > 0) {
    prompt += '### CHARACTERS\n';
    bible.characters.forEach(c => {
      // If scene filter is provided, only include characters in this scene
      if (sceneContext.characterNames && !sceneContext.characterNames.includes(c.name)) return;

      prompt += `- ${c.name}: ${c.physicalDescription || ''}. Wearing: ${c.clothing || 'default'}. `;
      if (c.accessories && c.accessories.length) prompt += `Accessories: ${c.accessories.join(', ')}. `;
      if (c.hairstyle) prompt += `Hairstyle: ${c.hairstyle}. `;
      if (c.spatialPosition) prompt += `Current Position: ${c.spatialPosition}. `;
      if (c.eyeline) prompt += `Eyeline: ${c.eyeline}. `;
      if (c.emotionalState) prompt += `Emotion: ${c.emotionalState}. `;
      prompt += '\n';
    });
    prompt += '\n';
  }

  if (bible.objects && bible.objects.length > 0) {
    prompt += '### OBJECTS & PROPS\n';
    bible.objects.forEach(o => {
      // Filter objects by location if known
      if (sceneContext.locationId && o.currentLocationId && o.currentLocationId !== sceneContext.locationId) return;
      prompt += `- ${o.name} (${o.type}): ${o.description || ''}. State: ${o.state || 'normal'}. `;
      if (o.spatialPosition) prompt += `Position: ${o.spatialPosition}. `;
      prompt += '\n';
    });
    prompt += '\n';
  }

  if (bible.locations && bible.locations.length > 0) {
    prompt += '### LOCATIONS\n';
    bible.locations.forEach(l => {
      if (sceneContext.locationId && l.locationId !== sceneContext.locationId) return;
      prompt += `- ${l.name} (${l.type}): ${l.description || ''}. Time: ${l.timeOfDay || 'unknown'}. Lighting: ${l.lighting || 'standard'}. Weather: ${l.weather || 'clear'}.\n`;
    });
    prompt += '\n';
  }

  prompt += '### SPATIAL & MOVEMENT RULES\n';
  prompt += '- Respect the 180-degree rule. Do not flip character screen directions randomly.\n';
  prompt += '- If Character A looks screen-right at B, Character B must look screen-left at A.\n';
  prompt += '- Maintain logical entrances and exits (e.g., if exiting frame left, next shot should have them entering frame right or already established).\n';

  return prompt;
}

/**
 * Updates the continuity bible based on the director's structured output for a scene.
 */
export async function updateContinuityState(projectId, directorSceneData) {
  const bible = await getContinuityState(projectId);

  if (directorSceneData.updatedCharacters) {
    directorSceneData.updatedCharacters.forEach(uc => {
      const char = bible.characters.find(c => c.name === uc.name);
      if (char) {
        if (uc.clothing) char.clothing = uc.clothing;
        if (uc.accessories) char.accessories = uc.accessories;
        if (uc.hairstyle) char.hairstyle = uc.hairstyle;
        if (uc.spatialPosition) char.spatialPosition = uc.spatialPosition;
        if (uc.eyeline) char.eyeline = uc.eyeline;
        if (uc.currentState) char.currentState = uc.currentState;
        if (uc.emotionalState) char.emotionalState = uc.emotionalState;
        if (uc.locationId) char.currentLocationId = uc.locationId;
      } else {
        bible.characters.push({
          name: uc.name,
          clothing: uc.clothing,
          accessories: uc.accessories,
          hairstyle: uc.hairstyle,
          spatialPosition: uc.spatialPosition,
          eyeline: uc.eyeline,
          currentState: uc.currentState,
          emotionalState: uc.emotionalState,
          currentLocationId: uc.locationId
        });
      }
    });
  }

  if (directorSceneData.updatedObjects) {
    directorSceneData.updatedObjects.forEach(uo => {
      const obj = bible.objects.find(o => o.name === uo.name);
      if (obj) {
        if (uo.state) obj.state = uo.state;
        if (uo.spatialPosition) obj.spatialPosition = uo.spatialPosition;
        if (uo.locationId) obj.currentLocationId = uo.locationId;
        if (uo.description) obj.description = uo.description;
      } else {
        bible.objects.push(uo);
      }
    });
  }

  bible.lastUpdated = new Date();
  await bible.save();
  return bible;
}

export default { getContinuityState, extractContinuityPrompt, updateContinuityState };