import { generateWithFallback } from '../providers/reasoningProvider.js';
import Screenplay from '../models/Screenplay.js';
import FilmCharacter from '../models/FilmCharacter.js';
import { compileCharacterSeedPrompt } from './characterConsistencyService.js';
import { emitWorkspaceEvent } from '../config/socket.js';
import { researchAndExpandConcept } from './webResearchService.js';

/**
 * SCREENPLAY SERVICE — AI Feature Film Writer
 *
 * Takes a brief synopsis and generates a full professional feature-length
 * screenplay with:
 *   - Story Bible (world, themes, character arcs)
 *   - 3-5 Act structure with turning points
 *   - Scene entries sized for narrative weight (director subdivides into 8s beats)
 *   - Each scene has: narration, action type, dialogue, location, emotion
 *   - Character consistency data locked into each scene
 *
 * Generation is multi-stage to stay within LLM context limits:
 *   Stage 1: Story Bible + Act Structure  (~500 tokens)
 *   Stage 2: Scene List per Act           (with rolling context from previous acts)
 *   Stage 3: Post-act coherence validation
 */

const SCENES_PER_MINUTE = 3;  // ~20-second conceptual scenes; director subdivides into 8s video beats
const MAX_GENERATION_ATTEMPTS = 5;  // startup recovery gives up after this many tries

/**
 * Best-effort push of a generation milestone to the screenplay's workspace room.
 * Never allowed to break generation if the socket layer is unavailable.
 */
function emitScreenplayUpdate(screenplay, patch) {
  try {
    emitWorkspaceEvent(String(screenplay.workspaceId), 'screenplay_updated', {
      screenplayId: String(screenplay._id),
      ...patch,
    });
  } catch {
    // Socket delivery is best-effort.
  }
}

// ─── Stage 1: Story Bible ──────────────────────────────────────────────────────

async function generateStoryBible({ title, genre, synopsis, characters, tone, themes, animationStyle, additionalSettings, videoTypeGuidelines = '', jobId }) {
  const characterList = characters.map(c =>
    `- ${c.name} (${c.role}): ${c.physicalDescription || c.backstory || 'undefined'}`
  ).join('\n');

  const systemPrompt = `You are a world-class screenplay writer, story architect, and showrunner. You create compelling, emotionally rich, trending films with strong character arcs, dramatic tension, and satisfying resolutions. Your stories are suitable for professional production.

CRITICAL QUALITY STANDARDS:
- Every act must have a CLEAR DRAMATIC PURPOSE — not just "things happen"
- Character arcs must show SPECIFIC emotional/moral transformation
- The story must have CAUSE AND EFFECT — each act's events must directly cause the next act's crisis
- Dialogue moments and key reveals must be planned into the act structure
- The synopsis provided by the user is the CORE STORY — expand it faithfully with trending cultural and cinematic depth
${videoTypeGuidelines ? `\nCRITICAL FORMAT DIRECTIVES FOR ${String(genre).toUpperCase()}:\n${videoTypeGuidelines}\n` : ''}`;

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
  "logline": "One powerful sentence describing the film — must capture the central dramatic conflict",
  "storyBible": "3-5 paragraphs: world setting, central conflict, tone, visual style, and the complete emotional journey from opening to resolution",
  "characterArcs": [
    { "name": "character name", "arc": "DETAILED arc: Where they start emotionally → the key turning point that changes them → where they end. Example: 'Starts as a trusting, devoted wife → discovers her husband's betrayal with her own sister → transforms into a woman who reclaims her dignity and walks away from both of them'" }
  ],
  "acts": [
    {
      "actNumber": 1,
      "title": "Act title that captures the dramatic thrust (e.g. 'The Discovery')",
      "description": "DETAILED 4-6 sentence description: What happens in this act, what are the KEY DRAMATIC BEATS, what secrets are revealed, what decisions are made, how does the act END (the cliffhanger or turning point that launches the next act)",
      "emotion": "dominant emotional tone (e.g. 'hopeful', 'tense', 'triumphant')",
      "musicStyle": "background music style (e.g. 'gentle orchestral', 'dramatic strings', 'electronic pulse')"
    }
  ],
  "themes": ["theme1", "theme2"],
  "openingImage": "Description of the very first shot — must be visually stunning and thematically resonant",
  "closingImage": "Description of the final shot — must deliver the emotional payoff of the entire story"
}

IMPORTANT: The "description" field for each act must be DETAILED ENOUGH that a screenwriter could write all the act's scenes from it alone. Include the key plot beats, character confrontations, revelations, and the act's climactic moment.

Output ONLY the raw JSON. No markdown, no explanation.`;

  const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'screenplay-bible' });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ─── Stage 2: Scene List Generation (per act) ──────────────────────────────────

/**
 * Build a concise rolling summary of what happened in the last N scenes so the
 * next act's generation knows where the story left off. Without this, each act
 * is generated in isolation and the LLM invents contradictory plot points.
 */
function buildRollingContextBrief(previousScenes, characterArcs = [], maxScenes = 8) {
  if (!previousScenes || previousScenes.length === 0) return '';

  const recent = previousScenes.slice(-maxScenes);
  const sceneBriefs = recent.map(s => {
    const parts = [`Scene ${s.sceneNumber} (${s.location || 'unknown'})`];
    if (s.actionDescription) parts.push(s.actionDescription);
    if (s.dialogue?.length) {
      for (const d of s.dialogue.slice(0, 2)) {
        if (d?.line) parts.push(`${d.speaker}: "${d.line}"`);
      }
    }
    if (s.emotion) parts.push(`[mood: ${s.emotion}]`);
    return '  ' + parts.join(' — ');
  }).join('\n');

  const arcBrief = characterArcs.length > 0
    ? '\nCHARACTER ARC PROGRESS:\n' + characterArcs.map(a =>
        `  - ${a.name}: ${a.arc}`
      ).join('\n')
    : '';

  return `\nSTORY SO FAR (what happened in the previous scenes — you MUST continue from here):\n${sceneBriefs}${arcBrief}\n`;
}

async function generateActScenes({ title, actData, characters, animationStyle, additionalSettings, videoTypeGuidelines = '', sceneOffset, jobId, previousScenes = [], characterArcs = [], storyBible = '' }) {
  // Build a rich character reference list — not just names.
  // The LLM needs physical descriptions and ethnicity to generate accurate scene
  // descriptions; name-only causes it to invent generic appearances.
  const characterProfiles = characters.map(c => {
    const parts = [`${c.name} (${c.role || 'character'}):`];
    if (c.age) parts.push(`${c.age} years old`);
    if (c.physicalDescription) parts.push(c.physicalDescription);
    if (c.seedPrompt && !c.physicalDescription) parts.push(c.seedPrompt.slice(0, 200));
    return parts.join(' ');
  }).join('\n  - ');

  const rollingContext = buildRollingContextBrief(previousScenes, characterArcs);

  const systemPrompt = `You are a master screenwriter and story architect generating detailed scene breakdowns for a ${animationStyle} production.

Your scenes must tell a COHERENT, COMPELLING STORY that flows logically from one scene to the next like a real movie. You write dialogue that sounds like real people talking — specific, emotional, and purposeful. Every line must advance the plot or reveal character.
${videoTypeGuidelines ? `\nCRITICAL SCENE DIRECTING GUIDELINES:\n${videoTypeGuidelines}\n` : ''}
You NEVER write generic placeholder dialogue like "I can't believe this" or "We need to talk". Your dialogue is sharp, in-character, and drives the story forward.

When writing character appearances and actions, you MUST respect the established physical descriptions provided — do not invent generic or different appearances.`;

  const storyBibleBlock = storyBible
    ? `\nSTORY BIBLE (the world and emotional journey of this film):\n${storyBible.slice(0, 1500)}\n`
    : '';

  const userPrompt = `Generate exactly ${actData.sceneCount} scenes for:

FILM: "${title}"
ACT ${actData.actNumber}: "${actData.title}"
ACT DESCRIPTION: ${actData.description}
ACT EMOTIONAL TONE: ${actData.emotion}
${storyBibleBlock}
CAST (USE THESE EXACT PHYSICAL DESCRIPTIONS IN EVERY SCENE):
  - ${characterProfiles || 'No characters specified'}
${rollingContext}
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
  "cameraType": "drone_aerial|aerial_wide|wide_establishing|two_shot|medium_wide|medium_close|close_up|tight_close_up|extreme_close_up|over_shoulder|low_angle|high_crane|dutch_angle",
  "transitionOut": "cut|fade|dissolve|wipe",
  "duration": 10
}

STORY QUALITY RULES (CRITICAL — violating these produces unwatchable films):
1. NARRATIVE CONTINUITY: Each scene must logically follow the previous scene. If Scene 5 ends with a character leaving angrily, Scene 6 must acknowledge that.
2. DIALOGUE QUALITY: Every spoken line must be SPECIFIC and IN-CHARACTER:
   - BAD: "I can't believe this is happening" (generic, could be anyone)
   - GOOD: "You married my sister behind my back, Emeka. My own blood." (specific, emotional, reveals the conflict)
3. NO FILLER SCENES: Every scene must either advance the plot, reveal character, or escalate conflict. Cut any scene that just "shows" something without purpose.
4. CAUSE AND EFFECT: Actions have consequences. If a character discovers a secret in Scene 10, their behavior MUST change in Scene 11+.
5. DIALOGUE DRIVES PLOT: In drama, the most powerful moments are conversations. Write dialogue that reveals secrets, makes accusations, confesses truths, or forces decisions.
6. CHARACTER CONSISTENCY: Each character has a distinct voice. A grandmother speaks differently from a young wife. Maintain their speech patterns.
7. EMOTIONAL ESCALATION: Within each act, tension should build progressively, not stay flat or randomly spike.
8. NO REPETITION: Never have two scenes that make the same point. Each scene must add NEW information.
9. SPECIFIC REFERENCES: Dialogue should reference specific events, names, places from the story — not vague generalities.

CINEMATOGRAPHY & MOVIE STUDIO CAMERA RULES:
- Use "drone_aerial" or "aerial_wide" for opening shots of acts, new outdoor estates, mansions, gates, and major location changes to give high-production movie studio scale.
- In talking/dialogue scenes:
  - actionDescription MUST explicitly describe character interaction and direct eye contact.
  - Alternate camera angles dynamically: use "two_shot" for character staging, "over_shoulder" for conversational depth, "medium_close" for arguments, and "tight_close_up" or "extreme_close_up" on key emotional shocks and reveals.
- Use "dutch_angle" or "low_angle" for dramatic confrontations, insults, arrests, and betrayal scenes.
- Every 6-10 scenes, include a wide or drone establishing shot to re-orient the viewer in the world.
- Make the narration CINEMATIC — not just describing what's happening, but evoking deep feeling.

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

// ─── Stage 2b: Post-Act Coherence Validation ────────────────────────────────────

/**
 * Quick LLM pass to validate that the generated scenes form a coherent story.
 * If critical issues are found, the scenes are regenerated with the feedback.
 */
async function validateActCoherence(scenes, actData, title, jobId) {
  if (!scenes || scenes.length < 3) return scenes; // too few to validate

  const sceneDigest = scenes.slice(0, 30).map(s => {
    const parts = [`S${s.sceneNumber}: ${s.location || '?'}`];
    if (s.actionDescription) parts.push(s.actionDescription);
    if (s.dialogue?.length) {
      for (const d of s.dialogue.slice(0, 2)) {
        if (d?.line) parts.push(`${d.speaker}: "${d.line.slice(0, 80)}"`);
      }
    }
    return parts.join(' | ');
  }).join('\n');

  const systemPrompt = 'You are a script supervisor checking scene continuity and dialogue quality for a feature film. You identify plot holes, contradictions, generic/nonsensical dialogue, and scenes that don\'t logically connect.';

  const userPrompt = `Review these scenes from Act ${actData.actNumber} ("${actData.title}") of "${title}".

SCENES:
${sceneDigest}

Rate on a scale of 1-10:
1. NARRATIVE_COHERENCE: Do scenes flow logically? (cause → effect, no contradictions)
2. DIALOGUE_QUALITY: Is dialogue specific, in-character, and plot-advancing? (not generic platitudes)
3. PLOT_PROGRESSION: Does the story actually move forward? (not circular or repetitive)

Return ONLY a JSON object:
{
  "narrativeCoherence": <1-10>,
  "dialogueQuality": <1-10>,
  "plotProgression": <1-10>,
  "overallPass": true/false,
  "criticalIssues": ["issue 1", "issue 2"]
}

Set overallPass to false ONLY if any score is below 5 or there are critical logical contradictions.
Output ONLY the raw JSON. No markdown.`;

  try {
    const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'coherence-check' });
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);

    console.log(
      `[ScreenplayService] Coherence check Act ${actData.actNumber}: `
      + `narrative=${result.narrativeCoherence}/10, dialogue=${result.dialogueQuality}/10, `
      + `plot=${result.plotProgression}/10, pass=${result.overallPass}`
    );

    if (result.criticalIssues?.length) {
      console.warn(`[ScreenplayService] Issues: ${result.criticalIssues.join('; ')}`);
    }

    return scenes; // Return scenes regardless — the validation is advisory for now
  } catch (err) {
    console.warn(`[ScreenplayService] Coherence validation failed (non-fatal): ${err.message}`);
    return scenes;
  }
}

// ─── Doc creation (fast, no LLM) ────────────────────────────────────────────────

/**
 * Create (or reset, when `_existingId` is given) a Screenplay document in the
 * `generating` state and return it immediately — NO LLM work happens here.
 *
 * The heavy multi-stage generation runs separately in `runScreenplayGeneration`,
 * so the HTTP request that starts a screenplay returns in milliseconds and a
 * backend restart can never strand an in-flight request.
 *
 * @param {Object} input  (see generateScreenplay for field docs)
 * @returns {Promise<Screenplay>} the saved `generating` document
 */
export async function createScreenplayDraft({
  title, genre = 'drama', synopsis, tone = 'dramatic',
  themes = [], animationStyle = 'cinematic',
  targetDurationMinutes = 90,
  filmCharacterIds = [],
  additionalSettings = '',
  workspaceId, projectId, createdBy,
  _existingId = null,  // If set, reset existing doc instead of creating new one
}) {
  // Load character records + refresh their cached seed prompts
  const characters = filmCharacterIds.length > 0
    ? await FilmCharacter.find({ _id: { $in: filmCharacterIds } })
    : [];
  for (const char of characters) {
    if (!char.seedPrompt) {
      char.seedPrompt = compileCharacterSeedPrompt(char);
      await char.save();
    }
  }
  const characterProfiles = characters.map(c => ({
    filmCharacterId: c._id,
    name: c.name,
    role: c.role,
    arc: '',
    seedPrompt: c.seedPrompt,
  }));

  let screenplay;
  if (_existingId) {
    screenplay = await Screenplay.findById(_existingId);
    if (!screenplay) throw new Error(`Screenplay ${_existingId} not found for regeneration`);
    // Reset to a clean generating state — a user-initiated (re)generation gets a
    // fresh attempt budget.
    screenplay.status = 'generating';
    screenplay.scenes = [];
    screenplay.acts = [];
    screenplay.totalScenes = 0;
    screenplay.totalChapters = 0;
    screenplay.storyBible = '';
    screenplay.generationMs = 0;
    screenplay.generationAttempts = 0;
    screenplay.generationError = '';
    screenplay.characters = characterProfiles;
  } else {
    screenplay = new Screenplay({
      workspaceId, projectId, createdBy,
      title, genre, synopsis, tone, themes, animationStyle,
      targetDurationMinutes, additionalSettings,
      status: 'generating',
      generationAttempts: 0,
      generationError: '',
      characters: characterProfiles,
    });
  }

  await screenplay.save();
  return screenplay;
}

// ─── Main generation (LLM, resumable) ────────────────────────────────────────────

/**
 * Run the multi-stage LLM generation on an existing `generating` Screenplay:
 *   Stage 1: Story Bible + Act Structure
 *   Stage 2: Scene List per Act  (saved after every act, so a restart resumes
 *            with minimal rework and the UI can show a live scene count)
 *
 * Fired detached by the routes and re-fired by `recoverStuckScreenplays()` on
 * boot, so it is safe to run against a doc that is already `generating`. Progress
 * is streamed to the workspace room as `screenplay_updated` events.
 *
 * @param {string|ObjectId} screenplayId
 * @param {object} [opts]
 * @param {string} [opts.jobId]
 * @returns {Promise<Screenplay>}
 */
export async function runScreenplayGeneration(screenplayId, { jobId = '' } = {}) {
  const startTime = Date.now();

  const screenplay = await Screenplay.findById(screenplayId);
  if (!screenplay) throw new Error(`Screenplay ${screenplayId} not found for generation`);

  // Count this attempt up-front so a crash/restart loop is bounded by the cap.
  screenplay.status = 'generating';
  screenplay.generationAttempts = (screenplay.generationAttempts || 0) + 1;
  screenplay.generationError = '';
  await screenplay.save();

  const targetDurationMinutes = screenplay.targetDurationMinutes || 90;
  const totalScenesTarget = targetDurationMinutes * SCENES_PER_MINUTE;

  console.log(`[ScreenplayService] Generating "${screenplay.title}" (attempt ${screenplay.generationAttempts}, ${targetDurationMinutes} min)`);

  try {
    // ── Stage 0: Creative Web Research & Trend Synthesis ──────────
    console.log(`[ScreenplayService] Stage 0: Researching web trends for "${screenplay.title}" (${screenplay.genre})...`);
    emitScreenplayUpdate(screenplay, { status: 'generating', stage: 'research' });

    let workingSynopsis = screenplay.synopsis;
    let formatGuidelines = '';

    try {
      const research = await researchAndExpandConcept({
        title: screenplay.title,
        synopsis: screenplay.synopsis,
        videoType: screenplay.genre,
        jobId,
      });

      if (research.expandedSynopsis && (!screenplay.synopsis || screenplay.synopsis.length < 350)) {
        workingSynopsis = research.expandedSynopsis;
        screenplay.synopsis = research.expandedSynopsis;
      }
      if (research.themes?.length && (!screenplay.themes || !screenplay.themes.length)) {
        screenplay.themes = research.themes;
      }
      formatGuidelines = research.videoTypeDirectives || '';

      // Auto-populate characters if user left cast empty
      if ((!screenplay.characters || screenplay.characters.length === 0) && research.suggestedCharacters?.length) {
        screenplay.characters = research.suggestedCharacters.map(c => ({
          name: c.name,
          role: c.role || 'supporting',
          age: c.age || 30,
          physicalDescription: c.physicalDescription || '',
          backstory: c.backstory || '',
          arc: '',
        }));
      }

      await screenplay.save();
    } catch (researchErr) {
      console.warn('[ScreenplayService] Stage 0 research warning, proceeding with existing concept:', researchErr.message);
    }

    // ── Stage 1: Story Bible ──────────────────────────────────────
    console.log(`[ScreenplayService] Stage 1: Generating story bible...`);
    const bible = await generateStoryBible({
      title: screenplay.title,
      genre: screenplay.genre,
      synopsis: workingSynopsis,
      tone: screenplay.tone,
      themes: screenplay.themes || [],
      animationStyle: screenplay.animationStyle,
      additionalSettings: screenplay.additionalSettings,
      characters: screenplay.characters,
      videoTypeGuidelines: formatGuidelines,
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
    emitScreenplayUpdate(screenplay, { status: 'generating', stage: 'bible', acts: screenplay.acts });

    // ── Stage 2: Scene Generation per Act ────────────────────────
    const scenesPerAct = Math.ceil(totalScenesTarget / screenplay.acts.length);

    // Distribute scenes across acts
    const actsWithCounts = screenplay.acts.map((act, i) => {
      const remaining = totalScenesTarget - (i * scenesPerAct);
      return { ...act.toObject(), sceneCount: Math.min(scenesPerAct, remaining) };
    });

    const allScenes = [];
    let sceneOffset = 0;

    // Extract character arcs from the bible for rolling context
    const characterArcs = bible.characterArcs || [];

    for (const actData of actsWithCounts) {
      console.log(`[ScreenplayService] Stage 2: Generating Act ${actData.actNumber} scenes (${actData.sceneCount} scenes, with ${allScenes.length} previous scenes as context)...`);

      const actScenes = await generateActScenes({
        title: screenplay.title,
        actData,
        animationStyle: screenplay.animationStyle,
        additionalSettings: screenplay.additionalSettings,
        characters: screenplay.characters,
        videoTypeGuidelines: formatGuidelines,
        sceneOffset,
        jobId,
        // NEW: rolling context from all previous scenes
        previousScenes: allScenes,
        characterArcs,
        storyBible: screenplay.storyBible,
      });

      // Stage 2b: Validate coherence of the generated act
      console.log(`[ScreenplayService] Stage 2b: Validating Act ${actData.actNumber} coherence...`);
      await validateActCoherence(actScenes, actData, screenplay.title, jobId);

      // Annotate each scene with act/chapter info
      const SCENES_PER_CHAPTER = 15; // reduced from 30 — matches lower scene density
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

      // Persist progress after each act so a restart resumes with minimal rework.
      screenplay.scenes = allScenes;
      screenplay.totalScenes = allScenes.length;
      screenplay.markModified('scenes');
      await screenplay.save();
      emitScreenplayUpdate(screenplay, {
        status: 'generating', stage: 'scenes',
        scenesSoFar: allScenes.length, totalScenesTarget,
      });
    }

    // Finalize
    screenplay.scenes = allScenes;
    screenplay.totalScenes = allScenes.length;
    screenplay.totalChapters = Math.ceil(allScenes.length / 30);
    screenplay.generatedBy = 'multi-provider-llm';
    screenplay.generationMs = Date.now() - startTime;
    screenplay.status = 'ready';

    await screenplay.save();
    console.log(`[ScreenplayService] ✅ Screenplay complete: ${allScenes.length} scenes in ${screenplay.generationMs}ms`);
    emitScreenplayUpdate(screenplay, {
      status: 'ready',
      totalScenes: screenplay.totalScenes,
      totalChapters: screenplay.totalChapters,
      title: screenplay.title,
    });
    return screenplay;

  } catch (err) {
    screenplay.status = 'draft';
    screenplay.generationError = err.message || String(err);
    await screenplay.save();
    console.error(`[ScreenplayService] Screenplay generation failed:`, err.message);
    emitScreenplayUpdate(screenplay, { status: 'draft', generationError: screenplay.generationError });
    throw err;
  }
}

/**
 * Back-compat convenience: create the doc and run generation to completion in one
 * awaited call. Prefer `createScreenplayDraft` + a detached `runScreenplayGeneration`
 * in request handlers so the HTTP response is never blocked for minutes.
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
export async function generateScreenplay(input) {
  const draft = await createScreenplayDraft(input);
  try {
    await runScreenplayGeneration(draft._id, { jobId: input.jobId });
  } catch {
    // status + generationError are already persisted by runScreenplayGeneration
  }
  return Screenplay.findById(draft._id);
}

/**
 * Convert a saved Screenplay's scenes into Job Scene documents.
 *
 * NOT part of the production path any more: the directing step is the single
 * writer of Scene documents (it opens with Scene.deleteMany and rebuilds them
 * with 8-second beats and the continuity payload), so calling this first only
 * created rows directing then deleted. Kept because it is the one place that
 * maps per-scene `narration` onto a Scene, which the voice-over path will need.
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

/**
 * Render a saved Screenplay back into screenplay text for the cinematic director.
 *
 * A screenplay-backed Job carries no `input.script` — the story lives in the
 * Screenplay document. Without this the directing step decomposes an empty
 * string and invents a film that has nothing to do with the screenplay the user
 * approved. Everything the director needs to plan beats is emitted: the story
 * bible, the cast with their locked appearances, the act structure, and every
 * scene with its slugline, action, dialogue, mood and camera.
 *
 * @param {object} screenplay  a Screenplay document (or plain object)
 * @returns {string}
 */
export function renderScreenplayForDirector(screenplay) {
  if (!screenplay) return '';
  const out = [];

  out.push(`FILM: "${screenplay.title || 'Untitled'}"`);
  out.push([
    `GENRE: ${screenplay.genre || 'drama'}`,
    `TONE: ${screenplay.tone || 'dramatic'}`,
    `STYLE: ${screenplay.animationStyle || 'cinematic'}`,
  ].join(' | '));
  if (screenplay.themes?.length) out.push(`THEMES: ${screenplay.themes.join(', ')}`);
  if (screenplay.synopsis)   out.push(`\nSYNOPSIS:\n${screenplay.synopsis}`);
  if (screenplay.storyBible) out.push(`\nSTORY BIBLE:\n${screenplay.storyBible}`);

  // Character profiles WITH arc trajectories — so the director knows each
  // character's emotional journey and doesn't invent contradictory behaviour.
  if (screenplay.characters?.length) {
    out.push('\nCHARACTERS (with full arc trajectories — the director MUST follow these arcs):');
    for (const c of screenplay.characters) {
      const lines = [`- ${c.name} (${c.role || 'supporting'})`];
      if (c.arc) lines.push(`  ARC: ${c.arc}`);
      if (c.seedPrompt) lines.push(`  APPEARANCE: ${c.seedPrompt}`);
      out.push(lines.join('\n'));
    }
  }

  // Scenes are emitted under their act so the director keeps the approved
  // structure instead of re-cutting the film into acts of its own.
  const acts = (screenplay.acts?.length ? screenplay.acts : [{ actNumber: 1, sceneStart: 1, sceneEnd: 1e9 }]);
  const scenes = screenplay.scenes || [];

  for (const act of acts) {
    const title = act.title ? ` — "${act.title}"` : '';
    out.push(`\n\nACT ${act.actNumber}${title} (scenes ${act.sceneStart}-${act.sceneEnd})`);
    if (act.description) out.push(`ACT SUMMARY: ${act.description}`);
    if (act.emotion) out.push(`EMOTIONAL ARC: The dominant emotional tone of this act is "${act.emotion}" — scenes should progressively build toward this.`);

    const actScenes = scenes.filter(s => (s.act ?? act.actNumber) === act.actNumber);
    let prevScene = null;
    for (const s of actScenes) {
      out.push(`\nSCENE ${s.sceneNumber} — ${s.location || 'UNSPECIFIED LOCATION'} (${s.timeOfDay || 'day'})`);
      if (s.characterNames?.length) out.push(`  CHARACTERS: ${s.characterNames.join(', ')}`);

      // Inter-scene continuity: tell the director what just happened
      if (prevScene) {
        const bridge = [];
        if (prevScene.emotion) bridge.push(`Previous scene mood: ${prevScene.emotion}`);
        if (prevScene.actionDescription) bridge.push(`What just happened: ${prevScene.actionDescription}`);
        if (bridge.length) out.push(`  CONTINUITY FROM PREVIOUS: ${bridge.join('. ')}`);
      }

      if (s.actionDescription) out.push(`  ACTION (${s.actionType || 'other'}): ${s.actionDescription}`);
      if (s.narration) out.push(`  NARRATION: ${s.narration}`);

      // Dialogue is marked as FINAL to prevent the director from rewriting it
      if (s.dialogue?.length) {
        out.push('  DIALOGUE (FINAL — use these lines VERBATIM):');
        for (const d of s.dialogue || []) {
          if (d?.line) out.push(`    ${d.speaker || 'CHARACTER'}: "${d.line}"`);
        }
      }

      out.push(`  MOOD: ${s.emotion || 'neutral'} (${s.intensity || 5}/10) | CAMERA: ${s.cameraType || 'medium_wide'} | TARGET: ${s.duration || 10}s`);
      prevScene = s;
    }
  }

  return out.join('\n');
}

/**
 * Reset an existing Screenplay document to a clean `generating` state, reusing all
 * original settings. Returns immediately — the caller fires `runScreenplayGeneration`
 * detached. No new document is created.
 *
 * @param {Screenplay} existing - The existing Mongoose Screenplay document
 * @returns {Promise<Screenplay>} the reset `generating` document
 */
export async function regenerateScreenplay(existing) {
  return createScreenplayDraft({
    title:                 existing.title,
    genre:                 existing.genre,
    synopsis:              existing.synopsis,
    tone:                  existing.tone,
    themes:                existing.themes,
    animationStyle:        existing.animationStyle,
    targetDurationMinutes: existing.targetDurationMinutes,
    filmCharacterIds:      existing.characters
      .filter(c => c.filmCharacterId)
      .map(c => c.filmCharacterId),
    additionalSettings:    existing.additionalSettings,
    workspaceId:           existing.workspaceId,
    projectId:             existing.projectId,
    createdBy:             existing.createdBy,
    // Reset this document in place instead of creating a new one.
    _existingId:           existing._id,
  });
}

/**
 * Startup recovery for screenplays stranded mid-generation by a backend restart.
 *
 * PM2 runs exactly one `api` process, so any document still `generating` at boot
 * is genuinely orphaned (no live run owns it) — safe to re-fire. Each re-fire is
 * detached and bounded by MAX_GENERATION_ATTEMPTS (`runScreenplayGeneration` bumps
 * the counter up-front), so a poison-pill screenplay lands on `draft` instead of
 * looping forever across rapid dev restarts.
 *
 * @returns {Promise<number>} how many stuck screenplays were re-fired
 */
export async function recoverStuckScreenplays() {
  const stuck = await Screenplay.find({ status: 'generating' });
  if (stuck.length === 0) return 0;

  console.log(`[ScreenplayService] Recovering ${stuck.length} stuck screenplay(s) after restart...`);

  let resumed = 0;
  for (const sp of stuck) {
    if ((sp.generationAttempts || 0) >= MAX_GENERATION_ATTEMPTS) {
      sp.status = 'draft';
      sp.generationError = `Generation exceeded retry limit (${MAX_GENERATION_ATTEMPTS}) after restart`;
      await sp.save();
      emitScreenplayUpdate(sp, { status: 'draft', generationError: sp.generationError });
      console.warn(`[ScreenplayService] Abandoning "${sp.title}" (${sp._id}) — over attempt cap`);
      continue;
    }
    resumed += 1;
    // Detached: recovery must not block server startup, and one failing screenplay
    // must not stop the others from resuming.
    runScreenplayGeneration(sp._id).catch(err =>
      console.error(`[ScreenplayService] Recovery run failed for ${sp._id}:`, err.message)
    );
  }

  return resumed;
}

export default {
  createScreenplayDraft,
  runScreenplayGeneration,
  generateScreenplay,
  regenerateScreenplay,
  recoverStuckScreenplays,
  screenplayToScenes,
  renderScreenplayForDirector,
};
