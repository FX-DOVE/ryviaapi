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
      if (c.accessories && c.accessories.length) prompt += `Accessories (must remain visible when present): ${c.accessories.join(', ')}. `;
      if (c.hairstyle) prompt += `Hairstyle: ${c.hairstyle}. `;
      if (c.currentState) prompt += `Physical state: ${c.currentState}. `;
      if (c.spatialPosition) prompt += `Current Position: ${c.spatialPosition}. `;
      if (c.eyeline) prompt += `Eyeline: ${c.eyeline}. `;
      if (c.emotionalState) prompt += `Emotion: ${c.emotionalState}. `;
      if (c.currentLocationId) prompt += `At location: ${c.currentLocationId}. `;
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

  if (bible.lookBible && (bible.lookBible.colorGrade || bible.lookBible.lightingRecipe)) {
    prompt += '### LOOK BIBLE\n';
    if (bible.lookBible.colorGrade) prompt += '- Color grade: ' + bible.lookBible.colorGrade + '\n';
    if (bible.lookBible.lensLanguage) prompt += '- Lens language: ' + bible.lookBible.lensLanguage + '\n';
    if (bible.lookBible.lightingRecipe) prompt += '- Lighting: ' + bible.lookBible.lightingRecipe + '\n';
    if (bible.lookBible.filmStock) prompt += '- Film stock: ' + bible.lookBible.filmStock + '\n';
    if (bible.lookBible.animationStyleNotes) prompt += '- Style: ' + bible.lookBible.animationStyleNotes + '\n';
    prompt += '\n';
  }

  if (bible.motifs && bible.motifs.length) {
    prompt += '### VISUAL MOTIFS\n';
    bible.motifs.forEach((m) => { prompt += '- ' + m + '\n'; });
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


/**
 * Seed / refresh ContinuityBible from a director plan so wardrobe, locations,
 * accessories and character state are available to every prompt compile path.
 */
export async function seedContinuityFromDirectorPlan(projectId, directorPlan, screenplayId = null, pack = {}) {
  if (!projectId || !directorPlan) return null;

  const bible = await getContinuityState(projectId);
  if (screenplayId) bible.screenplayId = screenplayId;

  const lookBible = pack.lookBible || directorPlan.lookBible;
  if (lookBible && typeof lookBible === 'object') {
    bible.lookBible = {
      colorGrade: lookBible.colorGrade || bible.lookBible?.colorGrade || '',
      lensLanguage: lookBible.lensLanguage || bible.lookBible?.lensLanguage || '',
      lightingRecipe: lookBible.lightingRecipe || bible.lookBible?.lightingRecipe || '',
      filmStock: lookBible.filmStock || bible.lookBible?.filmStock || '',
      animationStyleNotes: lookBible.animationStyleNotes || bible.lookBible?.animationStyleNotes || '',
    };
  }
  const motifs = pack.motifs || directorPlan.motifs || [];
  if (Array.isArray(motifs) && motifs.length) {
    bible.motifs = motifs.slice(0, 5).map(String);
  }

  // Characters + default wardrobe / accessories from plan
  for (const char of directorPlan.characters || []) {
    const name = char.name;
    if (!name) continue;
    let row = bible.characters.find((c) => c.name === name);
    if (!row) {
      row = { name };
      bible.characters.push(row);
    }
    if (char.physicalDescription) row.physicalDescription = char.physicalDescription;
    if (char.clothingDefault) row.clothing = char.clothingDefault;
    // Prefer act-1 wardrobe when clothingByAct is present
    const act1 = char.clothingByAct?.['1'] || char.clothingByAct?.[1];
    if (act1) row.clothing = act1;
    if (Array.isArray(char.accessories)) row.accessories = char.accessories;
    else if (typeof char.accessories === 'string' && char.accessories.trim()) {
      row.accessories = [char.accessories.trim()];
    }
    if (char.filmCharacterId) row.filmCharacterId = char.filmCharacterId;
  }

  // Harvest accessories / state from beats (latest wins)
  for (const act of directorPlan.acts || []) {
    for (const scene of act.scenes || []) {
      for (const beat of scene.beats || []) {
        if (beat.accessories && typeof beat.accessories === 'object') {
          for (const [cname, accessory] of Object.entries(beat.accessories)) {
            if (!accessory) continue;
            let row = bible.characters.find((c) => c.name === cname);
            if (!row) {
              row = { name: cname };
              bible.characters.push(row);
            }
            const list = Array.isArray(row.accessories) ? [...row.accessories] : [];
            const token = String(accessory).trim();
            if (token && !list.includes(token)) list.push(token);
            row.accessories = list;
          }
        }
        if (beat.characterState && typeof beat.characterState === 'object') {
          for (const [cname, state] of Object.entries(beat.characterState)) {
            if (!state) continue;
            let row = bible.characters.find((c) => c.name === cname);
            if (!row) {
              row = { name: cname };
              bible.characters.push(row);
            }
            row.currentState = String(state);
          }
        }
        // Props → objects
        for (const prop of beat.props || []) {
          const pname = String(prop || '').trim();
          if (!pname) continue;
          let obj = bible.objects.find((o) => o.name === pname);
          if (!obj) {
            bible.objects.push({
              name: pname,
              type: 'other',
              description: pname,
              currentLocationId: scene.locationId || '',
              state: 'present',
            });
          } else if (scene.locationId) {
            obj.currentLocationId = scene.locationId;
          }
        }
      }
    }
  }

  // Locations / backdrops
  for (const env of directorPlan.environments || []) {
    const locationId = env.locationId || env.name;
    if (!locationId) continue;
    let loc = bible.locations.find((l) => l.locationId === locationId);
    if (!loc) {
      loc = { locationId, name: env.name || locationId };
      bible.locations.push(loc);
    }
    loc.name = env.name || loc.name;
    loc.description = env.description || loc.description;
    const day = env.timeVariants?.day;
    const night = env.timeVariants?.night;
    if (day && !loc.lighting) loc.lighting = day;
    if (night && !loc.timeOfDay) loc.timeOfDay = 'night variant: ' + night;
    if (!loc.type) {
      const n = String(env.name || '').toUpperCase();
      loc.type = n.startsWith('INT') ? 'interior' : n.startsWith('EXT') ? 'exterior' : 'interior';
    }
  }

  bible.globalRules = Array.from(new Set([
    ...(bible.globalRules || []),
    'Keep wardrobe, accessories, and props identical across cuts unless the story changes them.',
    'Reuse locationId plates — do not redesign rooms between scenes.',
    'Character identity sheets / reference photos override prompt improvisation.',
    'Apply lookBible color grade, lens language, lighting recipe, and film stock on every shot.',
    'Echo visual motifs on act openers, closers, and cold-open beats.',
  ]));

  bible.lastUpdated = new Date();
  await bible.save();
  return bible;
}

export default { getContinuityState, extractContinuityPrompt, updateContinuityState, seedContinuityFromDirectorPlan };
