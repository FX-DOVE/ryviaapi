import { generateWithFallback } from '../providers/reasoningProvider.js';
import Screenplay from '../models/Screenplay.js';
import FilmCharacter from '../models/FilmCharacter.js';
import { compileCharacterSeedPrompt } from './characterConsistencyService.js';

/**
 * SCREENPLAY SERVICE — AI Feature Film Writer
 *
 * Takes a brief synopsis and generates a full professional feature-length
 * screenplay with:
 *   - Story Bible (world, themes, character arcs)
 *   - 3-5 Act structure with turning points
 *   - 540 scene entries (for 90-min film at 10s/scene)
 *   - Each scene has: narration, action type, dialogue, location, emotion
 *   - Character consistency data locked into each scene
 *
 * Generation is multi-stage to stay within LLM context limits:
 *   Stage 1: Story Bible + Act Structure  (~500 tokens)
 *   Stage 2: Scene List per Act          (~2000 tokens per act)
 *   Stage 3: Dialogue Generation         (per scene with dialogue)
 */

const SCENES_PER_MINUTE = 6;  // 10-second clips = 6 scenes per minute

// ─── Stage 1: Story Bible ──────────────────────────────────────────────────────

async function generateStoryBible({ title, genre, synopsis, characters, tone, themes, animationStyle, additionalSettings, jobId }) {
  const characterList = characters.map(c =>
    `- ${c.name} (${c.role}): ${c.physicalDescription || c.backstory || 'undefined'}`
  ).join('\n');

  const systemPrompt = `You are a world-class screenplay writer and story architect. You create compelling, emotionally rich feature films with strong character arcs, dramatic tension, and satisfying resolutions. Your stories are suitable for professional production.`;

  const userPrompt = `Write a detailed Story Bible for the following feature film:

TITLE: "${title}"
GENRE: ${genre}
TONE: ${tone}
THEMES: ${themes.join(', ')}
ANIMATION STYLE: ${animationStyle}
SYNOPSIS: ${synopsis}

DIRECTOR'S NOTES / CUSTOM INSTRUCTIONS:
${additionalSettings || "None provided. Rely on your standard creative instincts."}

MAIN CHARACTERS:
${characterList}

Write the Story Bible as a JSON object with EXACTLY these fields:
{
  "logline": "One powerful sentence describing the film",
  "storyBible": "3-5 paragraphs: world setting, central conflict, tone, visual style, and emotional journey",
  "characterArcs": [
    { "name": "character name", "arc": "Where they start and where they end emotionally/morally" }
  ],
  "acts": [
    {
      "actNumber": 1,
      "title": "Act title (e.g. 'The Call to Adventure')",
      "description": "What happens in this act (2-3 sentences)",
      "sceneCount": 108,
      "emotion": "dominant emotional tone (e.g. 'hopeful', 'tense', 'triumphant')",
      "musicStyle": "background music style (e.g. 'gentle orchestral', 'dramatic strings', 'electronic pulse')"
    }
  ],
  "themes": ["theme1", "theme2"],
  "openingImage": "Description of the very first shot — must be visually stunning",
  "closingImage": "Description of the final shot — emotional payoff"
}

Output ONLY the raw JSON. No markdown, no explanation.`;

  const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'screenplay-bible' });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ─── Stage 2: Scene List Generation (per act) ──────────────────────────────────

async function generateActScenes({ title, actData, characters, animationStyle, additionalSettings, sceneOffset, jobId }) {
  const characterNames = characters.map(c => c.name).join(', ');

  const systemPrompt = `You are a master screenwriter generating detailed scene breakdowns for a ${animationStyle} film. Every scene must be visually compelling, narratively purposeful, and cinematically specific.`;

  const userPrompt = `Generate exactly ${actData.sceneCount} scenes for:

FILM: "${title}"
ACT ${actData.actNumber}: "${actData.title}"
ACT DESCRIPTION: ${actData.description}
ACT EMOTIONAL TONE: ${actData.emotion}
CHARACTERS: ${characterNames}
STARTING SCENE NUMBER: ${sceneOffset + 1}

DIRECTOR'S NOTES / CUSTOM INSTRUCTIONS:
${additionalSettings || "None provided. Use standard cinematic conventions."}

For each scene produce a JSON object. Return a JSON ARRAY of exactly ${actData.sceneCount} scene objects.

Each scene object must have EXACTLY these fields:
{
  "sceneNumber": <integer, starting from ${sceneOffset + 1}>,
  "location": "INT./EXT. LOCATION - TIME (e.g. EXT. DESERT ROAD - DUSK)",
  "timeOfDay": "day|night|dawn|dusk|interior",
  "characterNames": ["name1", "name2"],
  "actionType": "establishing|walking|running|talking|fighting|crying|riding|flying|celebrating|sneaking|dying|transition|other",
  "actionDescription": "Plain English: what literally happens visually (1-2 sentences)",
  "narration": "Narrator's spoken words for this scene (2-4 sentences, evocative and cinematic)",
  "dialogue": [{"speaker": "CharacterName", "line": "What they say"}],
  "emotion": "tense|happy|sad|angry|fearful|neutral|romantic|epic|mysterious",
  "intensity": <1-10 integer>,
  "cameraType": "extreme_close_up|close_up|medium_close|medium_wide|wide|aerial|low_angle|over_shoulder",
  "transitionOut": "cut|fade|dissolve|wipe",
  "duration": 10
}

Rules:
- Vary action types throughout the act (don't just use 'establishing' for every scene)
- Use 'talking' only when dialogue[] is not empty
- Emotional scenes use close_up or extreme_close_up
- Action scenes use medium_wide or low_angle
- Every 8-12 scenes, include an establishing shot to orient the viewer
- Make the narration CINEMATIC — not just describing what's happening, but evoking feeling

Output ONLY the raw JSON array. No markdown, no explanation.`;

  const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'screenplay-scenes' });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // Parse with safety
  let scenes;
  try {
    scenes = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON array from response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) scenes = JSON.parse(match[0]);
    else throw new Error(`Scene generation parse failed for Act ${actData.actNumber}`);
  }

  return scenes;
}

// ─── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Generate a complete feature-length screenplay from a brief synopsis.
 *
 * @param {Object} input
 * @param {string} input.title
 * @param {string} input.genre
 * @param {string} input.synopsis
 * @param {string} input.tone
 * @param {string[]} input.themes
 * @param {string} input.animationStyle
 * @param {number} input.targetDurationMinutes
 * @param {ObjectId[]} input.filmCharacterIds
 * @param {ObjectId} input.workspaceId
 * @param {ObjectId} input.projectId
 * @param {ObjectId} input.createdBy
 * @param {string} [input.jobId]
 * @returns {Promise<Screenplay>} Saved Screenplay document
 */
export async function generateScreenplay({
  title, genre = 'drama', synopsis, tone = 'dramatic',
  themes = [], animationStyle = 'cinematic',
  targetDurationMinutes = 90,
  filmCharacterIds = [],
  additionalSettings = '',
  workspaceId, projectId, createdBy,
  jobId = '',
}) {
  const startTime = Date.now();
  console.log(`[ScreenplayService] Starting screenplay generation for "${title}" (${targetDurationMinutes} min)`);

  // Load character records
  const characters = filmCharacterIds.length > 0
    ? await FilmCharacter.find({ _id: { $in: filmCharacterIds } })
    : [];

  // Refresh seed prompts for all characters
  for (const char of characters) {
    if (!char.seedPrompt) {
      char.seedPrompt = compileCharacterSeedPrompt(char);
      await char.save();
    }
  }

  // Create screenplay document in draft state
  const screenplay = new Screenplay({
    workspaceId, projectId, createdBy,
    title, genre, synopsis, tone, themes, animationStyle,
    targetDurationMinutes, additionalSettings,
    status: 'generating',
    characters: characters.map(c => ({
      filmCharacterId: c._id,
      name: c.name,
      role: c.role,
      arc: '',
      seedPrompt: c.seedPrompt,
    })),
  });
  await screenplay.save();

  try {
    // ── Stage 1: Story Bible ──────────────────────────────────────
    console.log(`[ScreenplayService] Stage 1: Generating story bible...`);
    const bible = await generateStoryBible({
      title, genre, synopsis, tone, themes, animationStyle, additionalSettings,
      characters: screenplay.characters,
      jobId,
    });

    screenplay.storyBible = bible.storyBible || '';
    screenplay.acts = (bible.acts || []).map((act, i) => ({
      actNumber: act.actNumber || (i + 1),
      title: act.title || `Act ${i + 1}`,
      description: act.description || '',
      sceneStart: 0, // will be updated
      sceneEnd: 0,
      emotion: act.emotion || 'neutral',
      musicStyle: act.musicStyle || 'orchestral',
    }));

    // Update character arcs
    if (bible.characterArcs) {
      for (const arc of bible.characterArcs) {
        const charEntry = screenplay.characters.find(c => c.name === arc.name);
        if (charEntry) charEntry.arc = arc.arc;
      }
    }

    await screenplay.save();

    // ── Stage 2: Scene Generation per Act ────────────────────────
    const totalScenes = targetDurationMinutes * SCENES_PER_MINUTE;
    const scenesPerAct = Math.ceil(totalScenes / screenplay.acts.length);

    // Distribute scenes across acts
    const actsWithCounts = screenplay.acts.map((act, i) => {
      const remaining = totalScenes - (i * scenesPerAct);
      return { ...act.toObject(), sceneCount: Math.min(scenesPerAct, remaining) };
    });

    const allScenes = [];
    let sceneOffset = 0;

    for (const actData of actsWithCounts) {
      console.log(`[ScreenplayService] Stage 2: Generating Act ${actData.actNumber} scenes (${actData.sceneCount} scenes)...`);

      const actScenes = await generateActScenes({
        title, actData, animationStyle, additionalSettings,
        characters: screenplay.characters,
        sceneOffset,
        jobId,
      });

      // Annotate each scene with act/chapter info
      const SCENES_PER_CHAPTER = 30;
      for (const scene of actScenes) {
        scene.act = actData.actNumber;
        scene.chapter = Math.ceil((sceneOffset + (scene.sceneNumber - sceneOffset)) / SCENES_PER_CHAPTER);
      }

      // Update act scene range
      const actEntry = screenplay.acts.find(a => a.actNumber === actData.actNumber);
      if (actEntry) {
        actEntry.sceneStart = sceneOffset + 1;
        actEntry.sceneEnd = sceneOffset + actScenes.length;
      }

      allScenes.push(...actScenes);
      sceneOffset += actScenes.length;
    }

    // Save all scenes to screenplay
    screenplay.scenes = allScenes;
    screenplay.totalScenes = allScenes.length;
    screenplay.totalChapters = Math.ceil(allScenes.length / 30);
    screenplay.generatedBy = 'multi-provider-llm';
    screenplay.generationMs = Date.now() - startTime;
    screenplay.status = 'ready';

    await screenplay.save();
    console.log(`[ScreenplayService] ✅ Screenplay complete: ${allScenes.length} scenes in ${screenplay.generationMs}ms`);
    return screenplay;

  } catch (err) {
    screenplay.status = 'draft';
    await screenplay.save();
    console.error(`[ScreenplayService] Screenplay generation failed:`, err.message);
    throw err;
  }
}

/**
 * Convert a saved Screenplay's scenes into Job Scene documents.
 * Called when the user starts production of a screenplay.
 */
export async function screenplayToScenes(screenplayId, jobId) {
  const screenplay = await Screenplay.findById(screenplayId);
  if (!screenplay) throw new Error(`Screenplay ${screenplayId} not found`);

  const Scene = (await import('../models/Scene.js')).default;
  await Scene.deleteMany({ jobId });

  const scenes = screenplay.scenes.map(s => ({
    jobId,
    sceneNumber:       s.sceneNumber,
    narration:         s.narration || '',
    imagePrompt:       '',  // built during prompt step
    videoPrompt:       '',
    enrichedPrompt:    '',
    duration:          s.duration || 10,
    actionType:        s.actionType || 'establishing',
    actionDescription: s.actionDescription || '',
    cameraType:        s.cameraType || 'medium_wide',
    characterNames:    s.characterNames || [],
    dialogue:          (s.dialogue || []).map(d => ({ speaker: d.speaker, line: d.line })),
    emotion:           s.emotion || 'neutral',
    intensity:         s.intensity || 5,
    location:          s.location || '',
    act:               s.act || 1,
    chapter:           s.chapter || 1,
    transitionOut:     s.transitionOut || 'cut',
    status:            'pending',
  }));

  const saved = await Scene.insertMany(scenes);
  console.log(`[ScreenplayService] Created ${saved.length} scenes from screenplay ${screenplayId}`);
  return saved;
}

export default { generateScreenplay, screenplayToScenes };
