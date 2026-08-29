/**
 * cinematicDirectorEngine.js — AI-Powered Film Director
 *
 * Takes a raw script and produces a precise shot-by-shot production plan
 * optimized for 8-second video segments with visual consistency locks.
 *
 * Pipeline:
 *   Stage 1: Script Decomposition → Acts, Scenes, Beats
 *   Stage 2: Character Profiling → Physical descriptions, wardrobe per act
 *   Stage 3: Environment Mapping → Location descriptions, lighting, props
 *   Stage 4: Shot Planning → Strategy per 8s segment (anchor/continuation/angle/bridge/reaction)
 *   Stage 5: Prompt Engineering → Hyper-specific prompts per segment
 */

import { generateWithFallback } from '../providers/reasoningProvider.js';
import { SEGMENT_DURATION_SEC, MAX_SEGMENTS_PER_SCENE, GENERATION_STRATEGY, DIRECTOR_SCRIPT_CHAR_LIMIT } from '../config/constants.js';

export function parseAndRepairJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('[CinematicDirector] Empty text received for JSON parsing');
  }

  let text = rawText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch (e1) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch (e2) {
        // Fall through to auto-repair
      }
    }

    if (firstBrace !== -1) {
      let candidate = text.slice(firstBrace);
      candidate = candidate.replace(/,\s*$/, '').trim();

      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < candidate.length; i++) {
        const char = candidate[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      if (inString) candidate += '"';
      while (openBrackets > 0) { candidate += ']'; openBrackets--; }
      while (openBraces > 0) { candidate += '}'; openBraces--; }

      try {
        return JSON.parse(candidate);
      } catch (e3) {
        throw new Error(`[CinematicDirector] Failed to parse director plan JSON: ${e1.message}`);
      }
    }

    throw new Error(`[CinematicDirector] Failed to parse director plan JSON: ${e1.message}`);
  }
}

/**
 * Stage 1: Decompose a raw script into a structured Director Plan.
 *
 * @param {object} input
 * @param {string} input.rawScript - The full raw script text
 * @param {string} input.title - Film title
 * @param {string} input.genre - Genre (drama, action, etc.)
 * @param {string} input.animationStyle - Visual style
 * @param {string} [input.additionalNotes] - Director's notes
 * @param {string} [input.jobId]
 * @returns {Promise<object>} Director plan with acts, scenes, beats
 */
export async function decomposeScript({
  rawScript, title, genre = 'drama', animationStyle = 'cinematic',
  additionalNotes = '', jobId = '', screenplayScenes = null,
}) {
  console.log(`[CinematicDirector] Stage 1: Decomposing script for "${title}"...`);

  // Truncation loses whole acts, so it is reported rather than done quietly.
  const script = String(rawScript || '');
  const scriptForPrompt = script.slice(0, DIRECTOR_SCRIPT_CHAR_LIMIT);
  if (script.length > DIRECTOR_SCRIPT_CHAR_LIMIT) {
    console.warn(
      `[CinematicDirector] Script is ${script.length} chars — only the first `
      + `${DIRECTOR_SCRIPT_CHAR_LIMIT} will be directed. Raise `
      + `DIRECTOR_SCRIPT_CHAR_LIMIT or split the film into chapters.`,
    );
  }

  const systemPrompt = `You are an elite film director and script supervisor. Your job is to take a raw screenplay/script and break it down into a precise production plan. You understand acts, scenes, beats, character blocking, camera language, emotional arcs, and pacing. You plan for 8-second video segments — each scene requires multiple segments to complete.

CRITICAL DIRECTIVE — DIALOGUE FIDELITY:
When the script includes dialogue lines marked as FINAL or VERBATIM, you MUST preserve them EXACTLY as written. Do NOT paraphrase, rewrite, summarize, or invent new dialogue. The screenplay's dialogue has been approved by the writer. Your job is to DIRECT it (plan camera, blocking, beats), not REWRITE it.

If a scene has dialogue, each dialogue line should become its own beat. The beat's "dialogue" field must contain the EXACT original line from the script. The beat's "action" field describes the physical performance during that line.`;

  const userPrompt = `Analyze this raw script and decompose it into a detailed production plan.

FILM: "${title}"
GENRE: ${genre}
STYLE: ${animationStyle}
${additionalNotes ? `DIRECTOR'S NOTES: ${additionalNotes}` : ''}

RAW SCRIPT:
"""
${scriptForPrompt}
"""

DIALOGUE RULE: Any dialogue marked "FINAL" or "VERBATIM" in the script MUST appear word-for-word in the beat's "dialogue" field. Do NOT change, paraphrase, or invent new dialogue lines. If the script says a character says "You married my sister behind my back, Emeka", the beat must contain that EXACT line.

Produce a JSON object with this EXACT structure:
{
  "logline": "One powerful sentence describing the film",
  "totalEstimatedDuration": <seconds>,
  "acts": [
    {
      "actNumber": 1,
      "title": "Act title",
      "description": "What happens in this act",
      "emotion": "dominant emotional tone",
      "scenes": [
        {
          "sceneNumber": 1,
          "location": "INT./EXT. LOCATION - TIME",
          "locationId": "unique_location_key — MUST be one of environments[].locationId below",
          "timeOfDay": "day|night|dawn|dusk",
          "characters": ["Character Name"],
          "summary": "What happens in this scene (2-3 sentences)",
          "emotion": "tense|happy|sad|angry|fearful|neutral|romantic|epic|mysterious",
          "intensity": <1-10>,
          "estimatedDuration": <seconds>,
          "beats": [
            {
              "beatNumber": 1,
              "action": "Exact physical action happening",
              "dialogue": "Exact words spoken (empty string if none)",
              "speaker": "Character name (empty if no dialogue)",
              "gaze": "Direct eye contact and eyeline: who is looking at whom (e.g. 'Marcus is looking directly into Elena's eyes; Elena maintains direct eye contact with Marcus')",
              "expression": "facial expression (smiling, crying, stern, shocked, etc.)",
              "mood": "emotional undercurrent",
              "props": ["every object visible or handled in this shot"],
              "accessories": { "Character Name": "what this character wears or carries in THIS beat if it differs from their default outfit" },
              "characterState": { "Character Name": "physical state right now — sweating, bleeding, tear-stained, soaked, dust-covered, hair loose" },
              "continuityFromPrevious": "what must be unchanged from the previous beat (position, damage, held objects, light) — empty for the first beat of a scene",
              "cameraAngle": "wide|medium_wide|medium_close|close_up|extreme_close_up|over_shoulder|low_angle|aerial",
              "cameraMovement": "static|pan_left|pan_right|tilt_up|tilt_down|tracking|zoom_in|zoom_out|handheld",
              "duration": ${SEGMENT_DURATION_SEC}
            }
          ]
        }
      ]
    }
  ],
  "characters": [
    {
      "name": "Character Name",
      "role": "protagonist|antagonist|supporting|minor",
      "physicalDescription": "Detailed physical appearance (face, body, hair, skin, distinguishing features)",
      "personality": "Key personality traits",
      "clothingDefault": "Default outfit description",
      "clothingByAct": { "1": "Act 1 outfit", "2": "Act 2 outfit" },
      "voiceDescription": "Voice quality for dialogue generation"
    }
  ],
  "environments": [
    {
      "locationId": "unique_location_key",
      "name": "Location display name",
      "description": "Detailed physical description (architecture, furniture, plants, weather, lighting, colors, textures)",
      "timeVariants": {
        "day": "How it looks during day",
        "night": "How it looks at night"
      }
    }
  ]
}

Rules:
- Every scene MUST have at least 1 beat, and each beat is ${SEGMENT_DURATION_SEC} seconds
- A scene with dialogue should have beats for each line of dialogue
- In dialogue/two-character scenes, explicitly define "gaze" so characters look directly at each other during conversation. Characters speaking to each other MUST maintain direct, focused eye contact and eyeline, and must NOT look away, look outside, or stare into empty space unless explicitly required by the script.
- Action sequences need multiple beats for different moments
- Maximum ${MAX_SEGMENTS_PER_SCENE} beats per scene
- Physical descriptions must be EXTREMELY detailed (skin color, eye shape, hair texture, body build, exact clothing)
- Character descriptions must be consistent enough to regenerate the same face in every frame
- Every scene's "locationId" MUST exactly match one "locationId" in the environments array. Reuse the same locationId whenever two scenes happen in the same place — that is what lets the same room be regenerated identically.
- "props", "accessories" and "characterState" are continuity data, not decoration. Once an object is introduced, list it in EVERY later beat where it is still present. Once a state appears (a cut, wet clothes, a torn sleeve), carry it forward in every later beat until the story explicitly changes it. A prop or an injury that disappears between shots is the single most visible continuity error in the finished film.
- Use the exact character names from the characters array as the keys of "accessories" and "characterState".

Output ONLY the raw JSON. No markdown, no explanation.`;

  const { text } = await generateWithFallback({
    systemPrompt,
    userPrompt,
    jobId,
    purpose: 'script-decomposition',
    maxTokens: 32768,
  });

  const plan = parseAndRepairJson(text);

  // ── Post-decomposition: Reconcile dialogue with approved screenplay ──
  // When the source is a screenplay, the director sometimes paraphrases dialogue
  // despite being told not to. This walk replaces any invented dialogue in the
  // plan's beats with the exact approved lines from the original screenplay scenes.
  if (screenplayScenes?.length > 0) {
    reconcileDialogue(plan, screenplayScenes);
  }

  // Validate and number scenes/beats globally
  let globalScene = 0;
  let globalBeat = 0;
  const environments = plan.environments || [];
  for (const act of plan.acts || []) {
    for (const scene of act.scenes || []) {
      globalScene++;
      scene.globalSceneNumber = globalScene;
      scene.locationId = resolveLocationId(scene, environments);

      let carried = { props: [], accessories: {}, characterState: {} };
      for (const beat of scene.beats || []) {
        globalBeat++;
        beat.globalBeatNumber = globalBeat;
        beat.duration = beat.duration || SEGMENT_DURATION_SEC;
        carried = normalizeContinuityFields(beat, carried, globalBeat);
      }
    }
  }

  plan.totalScenes = globalScene;
  plan.totalBeats = globalBeat;

  console.log(`[CinematicDirector] ✅ Decomposed: ${plan.acts?.length || 0} acts, ${globalScene} scenes, ${globalBeat} beats`);
  return plan;
}

/**
 * Reconcile director-generated dialogue with approved screenplay dialogue.
 *
 * The director is instructed to use verbatim dialogue, but LLMs frequently
 * paraphrase. This function walks through each director-plan scene, matches it
 * to the closest screenplay scene (by scene number), and replaces any beat
 * dialogue that diverges from the approved lines.
 *
 * This is a HARD constraint: the screenplay dialogue is law.
 */
function reconcileDialogue(plan, screenplayScenes) {
  if (!plan?.acts || !screenplayScenes?.length) return;

  // Index screenplay scenes by sceneNumber for fast lookup
  const spByNumber = {};
  for (const sp of screenplayScenes) {
    spByNumber[sp.sceneNumber] = sp;
  }

  let reconciled = 0;
  let total = 0;

  for (const act of plan.acts) {
    for (const scene of act.scenes || []) {
      const sp = spByNumber[scene.globalSceneNumber || scene.sceneNumber];
      if (!sp?.dialogue?.length) continue;

      // Collect the approved dialogue lines in order
      const approvedLines = sp.dialogue
        .filter(d => d?.line)
        .map(d => ({ speaker: d.speaker || '', line: d.line }));

      if (approvedLines.length === 0) continue;

      // Walk beats with dialogue and replace with approved lines
      let approvedIdx = 0;
      for (const beat of scene.beats || []) {
        total++;
        if (!beat.dialogue && !beat.speaker) continue;
        if (approvedIdx >= approvedLines.length) continue;

        const approved = approvedLines[approvedIdx];

        // Check if the beat's dialogue matches the approved line
        const beatDialogue = String(beat.dialogue || '').trim();
        const approvedLine = String(approved.line || '').trim();

        if (beatDialogue && approvedLine && beatDialogue !== approvedLine) {
          // Director paraphrased — replace with the approved version
          beat.dialogue = approved.line;
          beat.speaker = approved.speaker || beat.speaker;
          reconciled++;
        }
        approvedIdx++;
      }
    }
  }

  if (reconciled > 0) {
    console.log(`[CinematicDirector] 🔄 Dialogue reconciliation: replaced ${reconciled} paraphrased lines with approved screenplay dialogue`);
  }
}

/**
 * Join a scene to its environment lock.
 *
 * The model is asked for a `locationId` that matches `environments[].locationId`,
 * but scenes are written as sluglines ("INT. KITCHEN - NIGHT") and the id is the
 * field most often dropped. Without a working join the environment lock silently
 * never applies, so fall back through display name, then a loose token match on
 * the slugline, before giving up.
 */
function resolveLocationId(scene, environments = []) {
  const ids = environments.map((e) => e.locationId).filter(Boolean);
  if (scene.locationId && ids.includes(scene.locationId)) return scene.locationId;

  const slug = String(scene.location || '').toLowerCase();
  const simplify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const byName = environments.find((e) => e.name && simplify(slug).includes(simplify(e.name)));
  if (byName?.locationId) return byName.locationId;

  const byId = environments.find((e) => {
    const words = simplify(e.locationId).split(' ').filter((w) => w.length > 2);
    return words.length > 0 && words.every((w) => simplify(slug).includes(w));
  });
  if (byId?.locationId) return byId.locationId;

  if (scene.locationId) {
    console.warn(
      `[CinematicDirector] scene ${scene.globalSceneNumber} locationId `
      + `"${scene.locationId}" matches no environment — environment lock will not apply`,
    );
  }
  return scene.locationId || '';
}

/**
 * Coerce the continuity fields to stable types and carry them forward.
 *
 * Props, accessories and states are what make consecutive shots read as the same
 * take. The prompt tells the model to repeat them in every beat; when it forgets,
 * inheriting the previous beat's values is far closer to correct than dropping a
 * held object or a wound between two shots one second apart.
 *
 * @returns {{props: string[], accessories: object, characterState: object}} values to carry on
 */
function normalizeContinuityFields(beat, carried, globalBeat) {
  const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String)
    : typeof v === 'string' && v.trim() ? [v.trim()] : []);
  const asMap = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  const props = asArray(beat.props);
  const accessories = asMap(beat.accessories);
  const characterState = asMap(beat.characterState);

  beat.props = props.length ? props : carried.props;
  beat.accessories = Object.keys(accessories).length ? accessories : carried.accessories;
  beat.characterState = Object.keys(characterState).length ? characterState : carried.characterState;
  beat.continuityFromPrevious = String(beat.continuityFromPrevious || '').trim();

  if (!props.length && carried.props.length) {
    console.log(`[CinematicDirector] beat ${globalBeat}: inherited ${carried.props.length} prop(s) from the previous beat`);
  }

  return {
    props: beat.props,
    accessories: beat.accessories,
    characterState: beat.characterState,
  };
}

/**
 * Stage 4: Plan generation strategy for each beat/segment.
 * Determines whether each segment should use anchor, continuation, angle change, etc.
 *
 * @param {object} directorPlan - Output from decomposeScript()
 * @returns {object} Plan with generation strategies assigned to each beat
 */
export function planGenerationStrategies(directorPlan) {
  console.log(`[CinematicDirector] Stage 4: Planning generation strategies...`);

  for (const act of directorPlan.acts || []) {
    for (const scene of act.scenes || []) {
      const beats = scene.beats || [];

      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        const prevBeat = i > 0 ? beats[i - 1] : null;

        if (i === 0) {
          // First beat of scene: always generate anchor keyframe
          beat.strategy = GENERATION_STRATEGY.ANCHOR;
        } else if (beat.cameraAngle !== prevBeat?.cameraAngle) {
          // Camera angle changed: generate new keyframe
          beat.strategy = GENERATION_STRATEGY.ANGLE_CHANGE;
        } else if (beat.expression && beat.expression !== prevBeat?.expression &&
                   ['close_up', 'extreme_close_up'].includes(beat.cameraAngle)) {
          // Reaction shot: close-up with expression change
          beat.strategy = GENERATION_STRATEGY.REACTION;
        } else {
          // Same camera, continuous action: use last frame as input
          beat.strategy = GENERATION_STRATEGY.CONTINUATION;
        }
      }
    }
  }

  return directorPlan;
}

/**
 * Stage 5: Build hyper-specific generation prompts for each beat.
 *
 * @param {object} beat - Single beat from the director plan
 * @param {object} scene - Parent scene
 * @param {object} act - Parent act
 * @param {object} characterLocks - Map of character name → lock prompt
 * @param {object} environmentLock - Environment lock prompt for this location
 * @param {string} animationStyle - Film's animation style
 * @returns {{ imagePrompt: string, videoPrompt: string }}
 */
export function buildBeatPrompts(beat, scene, act, characterLocks = {}, environmentLock = '', animationStyle = 'cinematic') {
  // Director-plan scenes carry `characters`; Scene documents carry `characterNames`.
  const beatCharacters = (scene.characters?.length ? scene.characters : scene.characterNames) || [];
  const charLockLines = beatCharacters
    .filter(name => characterLocks[name])
    .map(name => characterLocks[name]);

  const charBlock = charLockLines.length > 0
    ? `CHARACTERS (LOCKED — identical appearance in every frame):\n${charLockLines.join('\n')}`
    : '';

  const envBlock = environmentLock
    ? `ENVIRONMENT (LOCKED — identical location in every frame):\n${environmentLock}`
    : '';

  // Continuity payload: the objects, worn items and physical states that have to
  // survive from the previous shot into this one. Stated explicitly because the
  // image model has no memory of the last frame beyond the reference images.
  const props = Array.isArray(beat.props) ? beat.props.filter(Boolean) : [];
  const propBlock = props.length
    ? `PROPS PRESENT (all of them, unchanged): ${props.join(', ')}`
    : '';
  const accessoryBlock = mapBlock('WORN / CARRIED', beat.accessories);
  const stateBlock = mapBlock('PHYSICAL STATE RIGHT NOW', beat.characterState);
  const continuityBlock = beat.continuityFromPrevious
    ? `UNCHANGED FROM THE PREVIOUS SHOT: ${beat.continuityFromPrevious}`
    : '';

  // Eyeline and Gaze direction blocking
  let gazeBlock = '';
  if (beat.gaze) {
    gazeBlock = `Eyeline & Focus: ${beat.gaze}`;
  } else if (beat.speaker && beatCharacters.length > 1) {
    const listeners = beatCharacters.filter(n => n.trim().toLowerCase() !== String(beat.speaker).trim().toLowerCase());
    gazeBlock = `Eyeline & Gaze: ${beat.speaker} is facing and looking directly into the eyes of ${listeners.join(', ')} while speaking, maintaining natural direct eye contact. The listener looks back directly at ${beat.speaker}. Characters face each other and do NOT look away, do NOT look outside, and do NOT stare into empty space.`;
  } else if (beat.dialogue && beatCharacters.length > 1) {
    gazeBlock = `Eyeline & Gaze: Direct eye contact and focused gaze between speakers. Characters face and look directly at each other without looking away.`;
  }

  // Camera description
  const cameraDesc = [
    beat.cameraAngle?.replace(/_/g, ' '),
    beat.cameraMovement?.replace(/_/g, ' '),
  ].filter(Boolean).join(', ');

  // Image prompt — drives the anchor/keyframe (Qwen-Image, or Qwen-Image-Edit
  // when a previous frame is available to edit forward).
  // NEVER include: "8K", "ultra detailed", "concept art", "illustration", "render"
  // — these push the diffusion model into over-processed or cartoon space.
  const imagePrompt = [
    'RAW photo, shot on 35mm film, Kodak Portra, cinematic film still, natural skin tones, film grain',
    `Scene: ${scene.location || 'unspecified location'}`,
    envBlock,
    charBlock,
    `Action: ${beat.action}`,
    gazeBlock,
    beat.expression ? `Expression: ${beat.expression}` : '',
    stateBlock,
    accessoryBlock,
    propBlock,
    continuityBlock,
    `Camera: ${cameraDesc}`,
    `Mood: ${beat.mood || scene.emotion || 'neutral'}, intensity ${scene.intensity || 5}/10`,
    `Lighting: natural ${scene.timeOfDay || 'day'} lighting, practical light sources`,
    'CRITICAL: Match the exact character faces, skin tones, and clothing from reference images',
    'Realistic human skin texture, natural complexion, unretouched, no airbrushing',
  ].filter(Boolean).join('. ');

  // Video prompt — LTX-2.5.
  const videoPrompt = [
    `${animationStyle} film, cinematic motion, ${SEGMENT_DURATION_SEC} second clip, natural realistic`,
    `Action: ${beat.action}`,
    gazeBlock,
    beat.dialogue ? `[SPOKEN DIALOGUE by ${beat.speaker || 'character'}]: "${beat.dialogue}"` : '',
    beat.expression ? `Facial expression: ${beat.expression}` : '',
    stateBlock,
    propBlock,
    `Camera: ${cameraDesc}`,
    `Mood: ${beat.mood || scene.emotion || 'neutral'}`,
    charBlock,
    envBlock,
    'Smooth natural motion, consistent character appearance, realistic human movement, practical lighting, focused eyelines',
  ].filter(Boolean).join('. ');

  return { imagePrompt, videoPrompt };
}

/** Render a { name: value } continuity map as one prompt line, or '' when empty. */
function mapBlock(label, map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
  const lines = Object.entries(map)
    .filter(([, value]) => value && String(value).trim())
    .map(([name, value]) => `${name}: ${String(value).trim()}`);
  return lines.length ? `${label} — ${lines.join('; ')}` : '';
}

export default {
  decomposeScript,
  planGenerationStrategies,
  buildBeatPrompts,
};
