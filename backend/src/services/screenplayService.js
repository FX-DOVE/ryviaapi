import mongoose from 'mongoose';
import { generateWithFallback } from '../providers/reasoningProvider.js';
import Screenplay from '../models/Screenplay.js';
import FilmCharacter from '../models/FilmCharacter.js';
import { compileCharacterSeedPrompt } from './characterConsistencyService.js';
import { emitWorkspaceEvent } from '../config/socket.js';
import { researchAndExpandConcept, getFormatDirective } from './webResearchService.js';
import { getDirectorBible, finalizeLookBible, formatLookBibleBlock } from './styleService.js';
import { formatCoverageDirective } from './coverageTemplates.js';
import { formatEmotionPictureHint, applyEmotionDefaults, getEmotionPicture } from './emotionPictureMap.js';

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
const COHERENCE_REWRITE_THRESHOLD = 7;  // dialogue/narrative below this triggers one rewrite
const MAX_ACT_REWRITE_RETRIES = 1;      // cap to avoid rewrite loops

/**
 * Strip junk tokens that sometimes leak from E2E/test titles into cast names
 * (e.g. "Mtn1axeh (\"Mina\")" → "Mina"). Keeps human names intact.
 */
function sanitizeCharacterName(raw, fallback = 'Character') {
  let name = String(raw || '').trim();
  if (!name) return fallback;
  // Prefer a quoted display name if present: Mtn1axeh ("Mina") → Mina
  const quoted = name.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1]?.trim()) name = quoted[1].trim();
  // Drop bare duration/job-ish tokens like mtn1axeh, mtn0f4nj
  if (/^mtn[0-9a-z]+$/i.test(name.replace(/\s+/g, ''))) return fallback;
  name = name.replace(/^mtn[0-9a-z]+\s*/i, '').trim();
  name = name.replace(/^["'(]+|[)"']+$/g, '').trim();
  return name || fallback;
}

function sanitizeCastList(characters = []) {
  return (characters || []).map((c, i) => {
    const role = c.role || 'supporting';
    const fallback = role === 'protagonist' ? 'Protagonist' : role === 'antagonist' ? 'Antagonist' : `Character ${i + 1}`;
    return { ...c, name: sanitizeCharacterName(c.name, fallback) };
  });
}


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


// ─── Description→Film pack helpers ─────────────────────────────────────────────

function formatMotifDirective(motifs = []) {
  const list = (motifs || []).filter(Boolean).slice(0, 3);
  if (!list.length) return '';
  return `VISUAL MOTIFS (recurring images — act openers/closers and the cold-open MUST reference at least one):\n${list.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}`;
}

function sceneMentionsMotif(scene, motifs = []) {
  const hay = `${scene?.actionDescription || ''} ${scene?.enrichedVisual || ''} ${scene?.narration || ''} ${(scene?.motifRefs || []).join(' ')}`.toLowerCase();
  return (motifs || []).some(m => {
    const token = String(m || '').toLowerCase();
    if (!token) return false;
    // loose match on first meaningful words
    const words = token.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
    return words.length ? words.some(w => hay.includes(w)) : hay.includes(token);
  });
}

function ensureMotifOnScene(scene, motifs = [], force = false) {
  if (!scene || !(motifs || []).length) return scene;
  if (!force && sceneMentionsMotif(scene, motifs)) {
    if (!scene.motifRefs?.length) {
      scene.motifRefs = motifs.filter(m => sceneMentionsMotif(scene, [m])).slice(0, 2);
    }
    return scene;
  }
  const motif = motifs[0];
  scene.motifRefs = Array.from(new Set([...(scene.motifRefs || []), motif])).slice(0, 3);
  const tip = `Motif visible: ${motif}`;
  scene.actionDescription = scene.actionDescription
    ? `${scene.actionDescription} (${tip})`
    : tip;
  return scene;
}

/**
 * Generate / finalize coldOpen from research seed + synopsis.
 * Used on description-only path so directing always starts with a hook.
 */
async function generateColdOpen({ title, synopsis, genre, motifs = [], seed = null, lookBible = null, jobId = '' }) {
  const motifHint = (motifs || []).slice(0, 2).join('; ');
  const systemPrompt = `You are a trailer editor and cold-open specialist. Create a 8-second cold open that hooks viewers before Act 1. Output ONLY raw JSON.`;
  const userPrompt = `FILM: "${title}"
GENRE: ${genre}
SYNOPSIS: ${String(synopsis || '').slice(0, 1200)}
MOTIFS TO ECHO: ${motifHint || 'derive one striking recurring image'}
LOOK: ${lookBible?.colorGrade || 'cinematic'} | ${lookBible?.lightingRecipe || 'motivated practicals'}
SEED: ${seed ? JSON.stringify(seed) : 'none'}

Return JSON:
{
  "hookLine": "One sentence promise",
  "coldOpenBeat": {
    "action": "What happens in the first ~8 seconds",
    "location": "INT./EXT. LOCATION - TIME",
    "cameraType": "extreme_close_up|close_up|dutch_angle|wide_establishing",
    "emotion": "emotion word",
    "visualPrompt": "Dense image prompt with practical light, texture, DoF"
  },
  "hookVisual": "Short opening-plate image prompt"
}`;

  try {
    const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'cold-open' });
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);
    const beat = result.coldOpenBeat || {};
    const coldOpen = {
      hookLine: String(result.hookLine || seed?.hookLine || `In "${title}", everything changes in a single breath.`).trim(),
      coldOpenBeat: {
        action: String(beat.action || seed?.action || 'A decisive visual revelation lands.').trim(),
        location: String(beat.location || seed?.location || 'EXT. CITY STREET - NIGHT').trim(),
        cameraType: String(beat.cameraType || seed?.cameraType || 'extreme_close_up').trim(),
        emotion: String(beat.emotion || seed?.emotion || 'tense').trim(),
        visualPrompt: String(beat.visualPrompt || seed?.hookVisual || '').trim(),
      },
      hookVisual: String(result.hookVisual || seed?.hookVisual || beat.visualPrompt || '').trim(),
    };
    if (motifs?.length && !`${coldOpen.coldOpenBeat.action} ${coldOpen.hookVisual}`.toLowerCase().includes(String(motifs[0]).toLowerCase().split(' ')[0])) {
      coldOpen.coldOpenBeat.action += ` Motif: ${motifs[0]}.`;
      coldOpen.hookVisual = coldOpen.hookVisual
        ? `${coldOpen.hookVisual}, featuring ${motifs[0]}`
        : `Cinematic opening plate featuring ${motifs[0]}`;
    }
    return coldOpen;
  } catch (err) {
    console.warn(`[ScreenplayService] Cold-open generation failed (fallback): ${err.message}`);
    const motif = motifs?.[0] || 'a single telling detail in close-up';
    return {
      hookLine: seed?.hookLine || `Before the story begins, ${title} shows you the wound.`,
      coldOpenBeat: {
        action: seed?.action || `We open on ${motif} — a promise of the conflict to come.`,
        location: seed?.location || 'EXT. UNKNOWN - NIGHT',
        cameraType: seed?.cameraType || 'extreme_close_up',
        emotion: seed?.emotion || 'tense',
        visualPrompt: seed?.hookVisual || `Cinematic ECU of ${motif}, motivated practical light, shallow DoF`,
      },
      hookVisual: seed?.hookVisual || `Opening plate: ${motif}, film still, dramatic practical lighting`,
    };
  }
}

function coldOpenToScene(coldOpen, motifs = []) {
  const beat = coldOpen?.coldOpenBeat || {};
  const emotion = beat.emotion || 'tense';
  const pic = getEmotionPicture(emotion);
  const scene = {
    sceneNumber: 0,
    act: 0,
    chapter: 1,
    location: beat.location || 'EXT. COLD OPEN - NIGHT',
    timeOfDay: /night/i.test(beat.location || '') ? 'night' : 'dusk',
    characterNames: [],
    actionType: 'establishing',
    actionDescription: beat.action || coldOpen?.hookLine || 'Cold open hook.',
    narration: coldOpen?.hookLine || '',
    dialogue: [],
    emotion,
    intensity: 8,
    cameraType: beat.cameraType || pic.camera || 'extreme_close_up',
    duration: 8,
    enrichedVisual: beat.visualPrompt || coldOpen?.hookVisual || '',
    beautyNotes: 'Cold-open plate — maximum hook density, practical lights, motif echo.',
    motifRefs: (motifs || []).slice(0, 1),
    isColdOpen: true,
    transitionOut: 'cut',
  };
  return ensureMotifOnScene(scene, motifs, true);
}

/**
 * Cheap LLM pass that ONLY upgrades visual language on scenes.
 */
async function beautifyVisualPrompts(scenes, { lookBible = null, motifs = [], genre = 'drama', jobId = '' } = {}) {
  if (!scenes?.length) return scenes;
  // Batch in chunks of 12 to stay cheap/context-safe
  const out = scenes.map(s => ({ ...s }));
  const chunkSize = 12;
  for (let i = 0; i < out.length; i += chunkSize) {
    const chunk = out.slice(i, i + chunkSize);
    const digest = chunk.map(s => ({
      sceneNumber: s.sceneNumber,
      location: s.location,
      emotion: s.emotion,
      actionDescription: s.actionDescription,
      cameraType: s.cameraType,
      isColdOpen: !!s.isColdOpen,
      motifRefs: s.motifRefs || [],
    }));
    const systemPrompt = `You beautify cinematic visual prompts. You MUST NOT change story, dialogue, plot, or character names. Only upgrade visual language: practical lights, wardrobe texture, weather, DoF, micro-expressions, material detail. Output ONLY raw JSON.`;
    const userPrompt = `LOOK BIBLE:
${formatLookBibleBlock(lookBible) || 'cinematic practical lighting'}
MOTIFS: ${(motifs || []).join(' | ') || 'none'}
GENRE: ${genre}

For each scene below, return enrichedVisual + beautyNotes.
${JSON.stringify(digest, null, 2)}

Return JSON:
{ "scenes": [ { "sceneNumber": 1, "enrichedVisual": "...", "beautyNotes": "..." } ] }`;

    try {
      const { text } = await generateWithFallback({
        systemPrompt, userPrompt, jobId, purpose: 'beautify-visuals', temperature: 0.4,
      });
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      const byNum = new Map((parsed.scenes || []).map(s => [Number(s.sceneNumber), s]));
      for (const scene of chunk) {
        const hit = byNum.get(Number(scene.sceneNumber));
        if (hit?.enrichedVisual) scene.enrichedVisual = String(hit.enrichedVisual).trim();
        if (hit?.beautyNotes) scene.beautyNotes = String(hit.beautyNotes).trim();
        // Emotion → picture modifiers always appended
        const emo = formatEmotionPictureHint(scene.emotion);
        if (!scene.beautyNotes?.includes('EMOTION→PICTURE')) {
          scene.beautyNotes = [scene.beautyNotes, emo].filter(Boolean).join(' | ');
        }
        if (!scene.enrichedVisual) {
          scene.enrichedVisual = [
            scene.actionDescription,
            lookBible?.lightingRecipe,
            lookBible?.filmStock,
            getEmotionPicture(scene.emotion).colorLighting,
          ].filter(Boolean).join(', ');
        }
        Object.assign(out.find(s => s.sceneNumber === scene.sceneNumber) || scene, scene);
      }
    } catch (err) {
      console.warn(`[ScreenplayService] Beauty pass chunk failed (non-fatal): ${err.message}`);
      for (const scene of chunk) {
        const idx = out.findIndex(s => s.sceneNumber === scene.sceneNumber);
        if (idx < 0) continue;
        out[idx].beautyNotes = formatEmotionPictureHint(scene.emotion);
        out[idx].enrichedVisual = [
          scene.actionDescription,
          lookBible?.lightingRecipe,
          lookBible?.colorGrade,
        ].filter(Boolean).join(', ');
      }
    }
  }
  return out;
}

/**
 * Build an audioSpine plan for future mix — music / silence / sfx cues by scene.
 */
async function generateAudioSpine({ scenes, acts, genre, title, jobId = '' }) {
  if (!scenes?.length) return [];
  const digest = scenes.slice(0, 60).map(s => ({
    sceneNumber: s.sceneNumber,
    act: s.act,
    emotion: s.emotion,
    intensity: s.intensity,
    actionType: s.actionType,
    isColdOpen: !!s.isColdOpen,
  }));
  const actMusic = (acts || []).map(a => `Act ${a.actNumber}: ${a.musicStyle || 'orchestral'} (${a.emotion || 'neutral'})`).join('; ');

  const systemPrompt = `You are a film music supervisor and sound designer. Plan an audio spine (music, silence, sfx) keyed to scene numbers. This spine is an UNDERSCORE mix layer ducked under LTX native dialogue — never plan score that competes with spoken lines. Silence = score dip, not muted dialogue. Output ONLY raw JSON.`;
  const userPrompt = `FILM: "${title}" GENRE: ${genre}
ACT MUSIC HINTS: ${actMusic || 'orchestral'}
SCENES: ${JSON.stringify(digest)}

Return JSON:
{
  "audioSpine": [
    { "atScene": 0, "type": "music|silence|sfx", "cue": "short cue description", "mood": "mood", "intensity": 1-10 }
  ]
}
Rules: include cold-open cue if scene 0 exists; silence before major reveals (silence = intentional SCORE DIP under preserved native dialogue — never delete dialogue/ambience); sfx for impacts; music cues are UNDERSCORE ONLY (no competing spoken words or lyric-like dialogue in the score layer); 8-20 cues total max.`;

  try {
    const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'audio-spine' });
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return (parsed.audioSpine || [])
      .filter(c => c && Number.isFinite(Number(c.atScene)))
      .map(c => ({
        atScene: Number(c.atScene),
        type: ['music', 'silence', 'sfx'].includes(c.type) ? c.type : 'music',
        cue: String(c.cue || '').trim(),
        mood: String(c.mood || '').trim(),
        intensity: Math.min(10, Math.max(1, Number(c.intensity) || 5)),
      }));
  } catch (err) {
    console.warn(`[ScreenplayService] Audio spine failed (fallback heuristic): ${err.message}`);
    const spine = [];
    if (scenes.some(s => s.isColdOpen || s.sceneNumber === 0)) {
      spine.push({ atScene: 0, type: 'music', cue: 'Cold-open pulse — sparse tension motif', mood: 'tense', intensity: 7 });
    }
    for (const act of acts || []) {
      spine.push({
        atScene: act.sceneStart || 1,
        type: 'music',
        cue: `${act.musicStyle || 'orchestral'} enter for ${act.title || `Act ${act.actNumber}`}`,
        mood: act.emotion || 'neutral',
        intensity: 6,
      });
      // Silence before act climax (last third)
      const mid = Math.floor(((act.sceneStart || 1) + (act.sceneEnd || 1)) / 2);
      spine.push({ atScene: mid, type: 'silence', cue: 'Breath before turn', mood: 'suspense', intensity: 3 });
    }
    return spine;
  }
}

/**
 * Rewrite weak dialogue/action only for an act (one shot).
 */
async function rewriteWeakActScenes(scenes, actData, title, issues = [], jobId = '') {
  const digest = scenes.map(s => ({
    sceneNumber: s.sceneNumber,
    location: s.location,
    characterNames: s.characterNames,
    actionDescription: s.actionDescription,
    dialogue: s.dialogue,
    emotion: s.emotion,
    intensity: s.intensity,
    cameraType: s.cameraType,
    actionType: s.actionType,
    timeOfDay: s.timeOfDay,
    narration: s.narration,
    duration: s.duration,
  }));
  const systemPrompt = `You are a script doctor. Rewrite ONLY dialogue and actionDescription to raise watchability. Keep scene numbers, locations, cast, and plot beats. No new scenes. Output ONLY a JSON array of scenes.`;
  const userPrompt = `FILM: "${title}" ACT ${actData.actNumber}: ${actData.title}
ISSUES TO FIX: ${(issues || []).join('; ') || 'generic dialogue / weak narrative flow'}

SCENES:
${JSON.stringify(digest)}

Return the full scene array with improved dialogue + actionDescription. Preserve all other fields.`;

  const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'act-dialogue-rewrite' });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let rewritten;
  try {
    rewritten = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) rewritten = JSON.parse(match[0]);
    else throw new Error('rewrite parse failed');
  }
  if (!Array.isArray(rewritten) || !rewritten.length) return scenes;

  const byNum = new Map(rewritten.map(s => [Number(s.sceneNumber), s]));
  return scenes.map(orig => {
    const hit = byNum.get(Number(orig.sceneNumber));
    if (!hit) return orig;
    return {
      ...orig,
      actionDescription: hit.actionDescription || orig.actionDescription,
      dialogue: Array.isArray(hit.dialogue) ? hit.dialogue : orig.dialogue,
      // keep narration unless rewrite improved it modestly
      narration: hit.narration || orig.narration,
    };
  });
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
- Character names must be natural human (or in-world) names — NEVER copy title codes, job ids, or tokens like "mtn1axeh" into a character name
- The synopsis provided by the user is the CORE STORY — expand it faithfully with trending cultural and cinematic depth
${videoTypeGuidelines ? `\nCRITICAL FORMAT DIRECTIVES FOR ${String(genre).toUpperCase()}:\n${videoTypeGuidelines}\n` : ''}
${getDirectorBible(genre)}
${getFormatDirective(genre)}`;

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

async function generateActScenes({ title, actData, characters, animationStyle, additionalSettings, videoTypeGuidelines = '', sceneOffset, jobId, previousScenes = [], characterArcs = [], storyBible = '', genre = 'drama', motifs = [], lookBible = null, isFirstAct = false, isLastAct = false }) {
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
${getDirectorBible(genre)}
You NEVER write generic placeholder dialogue like "I can't believe this" or "We need to talk". Your dialogue is sharp, in-character, and drives the story forward.

When writing character appearances and actions, you MUST respect the established physical descriptions provided — do not invent generic or different appearances. Lock wardrobe and signature accessories; reuse locations by name.

${formatCoverageDirective(genre)}
${formatLookBibleBlock(lookBible)}
${formatMotifDirective(motifs)}`;

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
   Speakers in dialogue MUST be exact cast names (or a clear short form of them). Never invent speakers outside the cast list.
7. EMOTIONAL ESCALATION: Within each act, tension should build progressively, not stay flat or randomly spike.
8. NO REPETITION: Never have two scenes that make the same point. Each scene must add NEW information.
9. SPECIFIC REFERENCES: Dialogue should reference specific events, names, places from the story — not vague generalities.
10. VISUAL MOTIFS: Act opener (first scene) and act closer (last scene) MUST visibly reference at least one motif from the MOTIFS list in actionDescription (prop, weather, or recurring image in frame).
${isFirstAct ? '11. This is Act 1 — the first scene after any cold-open should escalate from the hook, not restart the story.' : ''}
${isLastAct ? '11. This is the FINAL act — the closing scene should echo a motif and deliver emotional payoff.' : ''}

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
  const emptyScores = {
    narrativeCoherence: null,
    dialogueQuality: null,
    plotProgression: null,
    overallPass: true,
    criticalIssues: [],
  };
  if (!scenes || scenes.length < 3) {
    return { scenes, scores: emptyScores };
  }

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
  "criticalIssues": ["issue 1", "issue 2"],
  "weakSceneNumbers": [<scene numbers that need dialogue/action rewrite>]
}

Set overallPass to false if narrativeCoherence or dialogueQuality is below 7, or there are critical logical contradictions.
Output ONLY the raw JSON. No markdown.`;

  try {
    const { text } = await generateWithFallback({ systemPrompt, userPrompt, jobId, purpose: 'coherence-check' });
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned);

    const scores = {
      narrativeCoherence: Number(result.narrativeCoherence) || null,
      dialogueQuality: Number(result.dialogueQuality) || null,
      plotProgression: Number(result.plotProgression) || null,
      overallPass: result.overallPass !== false,
      criticalIssues: Array.isArray(result.criticalIssues) ? result.criticalIssues : [],
      weakSceneNumbers: Array.isArray(result.weakSceneNumbers) ? result.weakSceneNumbers : [],
    };

    console.log(
      `[ScreenplayService] Coherence check Act ${actData.actNumber}: `
      + `narrative=${scores.narrativeCoherence}/10, dialogue=${scores.dialogueQuality}/10, `
      + `plot=${scores.plotProgression}/10, pass=${scores.overallPass}`
    );

    if (scores.criticalIssues?.length) {
      console.warn(`[ScreenplayService] Issues: ${scores.criticalIssues.join('; ')}`);
    }

    return { scenes, scores };
  } catch (err) {
    console.warn(`[ScreenplayService] Coherence validation failed (non-fatal): ${err.message}`);
    return { scenes, scores: emptyScores };
  }
}

/**
 * Dialogue watchability gate: score act, rewrite once if dialogue/narrative < 7, re-score.
 */
async function enforceDialogueWatchability(scenes, actData, title, jobId) {
  let working = scenes;
  let { scenes: checked, scores } = await validateActCoherence(working, actData, title, jobId);
  working = checked;

  const needsRewrite = (
    (scores.dialogueQuality != null && scores.dialogueQuality < COHERENCE_REWRITE_THRESHOLD)
    || (scores.narrativeCoherence != null && scores.narrativeCoherence < COHERENCE_REWRITE_THRESHOLD)
  );

  let rewriteAttempted = false;
  if (needsRewrite && MAX_ACT_REWRITE_RETRIES > 0) {
    rewriteAttempted = true;
    console.log(
      `[ScreenplayService] Act ${actData.actNumber} below watchability gate `
      + `(dialogue=${scores.dialogueQuality}, narrative=${scores.narrativeCoherence}) — rewriting once...`
    );
    try {
      working = await rewriteWeakActScenes(working, actData, title, scores.criticalIssues, jobId);
      const second = await validateActCoherence(working, actData, title, jobId);
      working = second.scenes;
      scores = second.scores;
    } catch (err) {
      console.warn(`[ScreenplayService] Act rewrite failed (keeping original): ${err.message}`);
    }
  }

  return { scenes: working, scores, rewriteAttempted };
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
  selectedConceptId = '',
  lookBible = null,           // object (lookBibleSchema) or free-text seed from concept-options
  motifs = [],
  workspaceId, projectId, createdBy,
  _existingId = null,  // If set, reset existing doc instead of creating new one
}) {
  // Load character records + refresh their cached seed prompts
  const validCharIds = (filmCharacterIds || []).filter(id => id && mongoose.Types.ObjectId.isValid(id));
  const characters = validCharIds.length > 0
    ? await FilmCharacter.find({ _id: { $in: validCharIds } })
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
    screenplay.coldOpen = undefined;
    screenplay.lookBible = {};
    screenplay.motifs = [];
    screenplay.audioSpine = [];
    screenplay.qualityScores = {};
    screenplay.generationMs = 0;
    screenplay.generationAttempts = 0;
    screenplay.generationError = '';
    screenplay.characters = characterProfiles;
    if (selectedConceptId) screenplay.selectedConceptId = selectedConceptId;
    if (Array.isArray(motifs) && motifs.length) screenplay.motifs = motifs;
    if (lookBible && typeof lookBible === 'object') {
      screenplay.lookBible = lookBible;
    } else if (typeof lookBible === 'string' && lookBible.trim()) {
      screenplay.lookBible = {
        ...(screenplay.lookBible?.toObject?.() || screenplay.lookBible || {}),
        animationStyleNotes: lookBible.trim(),
      };
    }
  } else {
    const seededLook = (lookBible && typeof lookBible === 'object')
      ? lookBible
      : (typeof lookBible === 'string' && lookBible.trim()
          ? { animationStyleNotes: lookBible.trim() }
          : {});
    screenplay = new Screenplay({
      workspaceId, projectId, createdBy,
      title, genre, synopsis, tone, themes, animationStyle,
      targetDurationMinutes, additionalSettings,
      selectedConceptId: selectedConceptId || '',
      lookBible: seededLook,
      motifs: Array.isArray(motifs) ? motifs : [],
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
    let coldOpenSeed = null;

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

      // Motifs + look bible from research (description-only path priority)
      if (research.motifs?.length) {
        screenplay.motifs = research.motifs.slice(0, 3);
      }
      screenplay.lookBible = finalizeLookBible(
        research.lookBible,
        screenplay.genre,
        screenplay.animationStyle,
        workingSynopsis,
      );
      coldOpenSeed = research.coldOpenSeed || null;

      // Auto-populate characters if user left cast empty
      if ((!screenplay.characters || screenplay.characters.length === 0) && research.suggestedCharacters?.length) {
        screenplay.characters = sanitizeCastList(research.suggestedCharacters.map(c => ({
          name: c.name,
          role: c.role || 'supporting',
          age: c.age || 30,
          physicalDescription: c.physicalDescription || '',
          backstory: c.backstory || '',
          arc: '',
        })));
      }

      await screenplay.save();
    } catch (researchErr) {
      console.warn('[ScreenplayService] Stage 0 research warning, proceeding with existing concept:', researchErr.message);
    }

    screenplay.characters = sanitizeCastList(screenplay.characters || []);

    // Ensure look bible always exists even if research skipped/failed
    screenplay.lookBible = finalizeLookBible(
      screenplay.lookBible,
      screenplay.genre,
      screenplay.animationStyle,
      workingSynopsis,
    );
    if (!screenplay.motifs?.length) {
      // Lightweight motif fallback from themes/synopsis keywords
      const themeMotifs = (screenplay.themes || []).slice(0, 2).map(t => `a recurring image of ${t}`);
      screenplay.motifs = themeMotifs.length ? themeMotifs : ['a single telling object in close-up', 'weather as emotional weather'];
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

    // ── Stage 1b: Cold-open pack (description-only hook) ─────────
    // Always generate when we came from synopsis/research so directing starts with a hook.
    console.log(`[ScreenplayService] Stage 1b: Generating cold-open pack...`);
    try {
      screenplay.coldOpen = await generateColdOpen({
        title: screenplay.title,
        synopsis: workingSynopsis,
        genre: screenplay.genre,
        motifs: screenplay.motifs || [],
        seed: coldOpenSeed,
        lookBible: screenplay.lookBible,
        jobId,
      });
      await screenplay.save();
      emitScreenplayUpdate(screenplay, { status: 'generating', stage: 'coldOpen', hookLine: screenplay.coldOpen?.hookLine });
    } catch (coldErr) {
      console.warn(`[ScreenplayService] Cold-open skipped: ${coldErr.message}`);
    }

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

    for (let actIdx = 0; actIdx < actsWithCounts.length; actIdx++) {
      const actData = actsWithCounts[actIdx];
      console.log(`[ScreenplayService] Stage 2: Generating Act ${actData.actNumber} scenes (${actData.sceneCount} scenes, with ${allScenes.length} previous scenes as context)...`);

      let actScenes = await generateActScenes({
        title: screenplay.title,
        actData,
        animationStyle: screenplay.animationStyle,
        additionalSettings: screenplay.additionalSettings,
        characters: screenplay.characters,
        videoTypeGuidelines: formatGuidelines,
        sceneOffset,
        jobId,
        previousScenes: allScenes,
        characterArcs,
        storyBible: screenplay.storyBible,
        genre: screenplay.genre || 'drama',
        motifs: screenplay.motifs || [],
        lookBible: screenplay.lookBible,
        isFirstAct: actIdx === 0,
        isLastAct: actIdx === actsWithCounts.length - 1,
      });

      // Motif enforcement on act opener/closer
      if (actScenes.length) {
        ensureMotifOnScene(actScenes[0], screenplay.motifs, true);
        ensureMotifOnScene(actScenes[actScenes.length - 1], screenplay.motifs, true);
      }

      // Emotion → picture defaults
      actScenes = actScenes.map(s => applyEmotionDefaults(s));

      // Stage 2b: Dialogue watchability gate (score → optional one rewrite → re-score)
      console.log(`[ScreenplayService] Stage 2b: Validating Act ${actData.actNumber} coherence / watchability...`);
      const gate = await enforceDialogueWatchability(actScenes, actData, screenplay.title, jobId);
      actScenes = gate.scenes;

      // Annotate each scene with act/chapter info
      const SCENES_PER_CHAPTER = 15; // reduced from 30 — matches lower scene density
      for (const scene of actScenes) {
        scene.act = actData.actNumber;
        scene.chapter = Math.ceil((sceneOffset + (scene.sceneNumber - sceneOffset)) / SCENES_PER_CHAPTER);
      }

      // Update act scene range + persist coherence scores
      const actEntry = screenplay.acts.find(a => a.actNumber === actData.actNumber);
      if (actEntry) {
        actEntry.sceneStart = sceneOffset + 1;
        actEntry.sceneEnd = sceneOffset + actScenes.length;
        if (gate.scores) {
          actEntry.narrativeCoherence = gate.scores.narrativeCoherence;
          actEntry.dialogueQuality = gate.scores.dialogueQuality;
          actEntry.plotProgression = gate.scores.plotProgression;
          actEntry.coherenceIssues = gate.scores.criticalIssues || [];
          actEntry.rewriteAttempted = !!gate.rewriteAttempted;
        }
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

    // ── Stage 3: Prepend cold-open as scene 0 ────────────────────
    if (screenplay.coldOpen?.hookLine || screenplay.coldOpen?.coldOpenBeat) {
      const coldScene = coldOpenToScene(screenplay.coldOpen, screenplay.motifs || []);
      // Shift is unnecessary — cold open is sceneNumber 0, acts start at 1+
      allScenes.unshift(coldScene);
      console.log(`[ScreenplayService] Cold-open injected as scene 0: "${screenplay.coldOpen.hookLine}"`);
    }

    // ── Stage 4: Beauty pass on visual prompts ───────────────────
    console.log(`[ScreenplayService] Stage 4: Beauty pass on visual prompts...`);
    emitScreenplayUpdate(screenplay, { status: 'generating', stage: 'beauty' });
    try {
      const beautified = await beautifyVisualPrompts(allScenes, {
        lookBible: screenplay.lookBible,
        motifs: screenplay.motifs || [],
        genre: screenplay.genre,
        jobId,
      });
      allScenes.length = 0;
      allScenes.push(...beautified);
    } catch (beautyErr) {
      console.warn(`[ScreenplayService] Beauty pass skipped: ${beautyErr.message}`);
    }

    // ── Stage 5: Audio / silence / SFX spine ─────────────────────
    console.log(`[ScreenplayService] Stage 5: Generating audio spine...`);
    try {
      screenplay.audioSpine = await generateAudioSpine({
        scenes: allScenes,
        acts: screenplay.acts,
        genre: screenplay.genre,
        title: screenplay.title,
        jobId,
      });
    } catch (audioErr) {
      console.warn(`[ScreenplayService] Audio spine skipped: ${audioErr.message}`);
      screenplay.audioSpine = [];
    }

    // Aggregate quality scores across acts
    const scoredActs = (screenplay.acts || []).filter(a => a.dialogueQuality != null || a.narrativeCoherence != null);
    if (scoredActs.length) {
      const avg = (key) => {
        const vals = scoredActs.map(a => a[key]).filter(v => v != null);
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
      };
      screenplay.qualityScores = {
        narrativeCoherence: avg('narrativeCoherence'),
        dialogueQuality: avg('dialogueQuality'),
        plotProgression: avg('plotProgression'),
      };
    }

    // Finalize
    screenplay.scenes = allScenes;
    screenplay.totalScenes = allScenes.length;
    screenplay.totalChapters = Math.ceil(allScenes.filter(s => !s.isColdOpen).length / 30) || Math.ceil(allScenes.length / 30);
    screenplay.generatedBy = 'multi-provider-llm';
    screenplay.generationMs = Date.now() - startTime;
    screenplay.status = 'ready';
    screenplay.markModified('lookBible');
    screenplay.markModified('coldOpen');
    screenplay.markModified('audioSpine');
    screenplay.markModified('qualityScores');
    screenplay.markModified('acts');

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

  const lookBlock = formatLookBibleBlock(screenplay.lookBible);
  if (lookBlock) out.push(`\n${lookBlock}`);
  if (screenplay.motifs?.length) {
    out.push(`\nVISUAL MOTIFS (echo in act openers/closers and cold-open): ${screenplay.motifs.join(' | ')}`);
  }
  if (screenplay.coldOpen?.hookLine) {
    out.push(`\nCOLD OPEN HOOK: ${screenplay.coldOpen.hookLine}`);
    const b = screenplay.coldOpen.coldOpenBeat || {};
    out.push(`COLD OPEN BEAT: ${b.action || ''} @ ${b.location || ''} | cam ${b.cameraType || ''} | ${b.emotion || ''}`);
    if (screenplay.coldOpen.hookVisual) out.push(`HOOK VISUAL: ${screenplay.coldOpen.hookVisual}`);
  }
  if (screenplay.audioSpine?.length) {
    out.push(`\nAUDIO SPINE (music / silence / sfx plan for mix):`);
    for (const cue of screenplay.audioSpine.slice(0, 40)) {
      out.push(`  @scene ${cue.atScene}: [${cue.type}] ${cue.cue || ''} (mood=${cue.mood || 'n/a'}, intensity=${cue.intensity || 5})`);
    }
  }

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

  // Emit cold-open (act 0 / scene 0) before Act 1 so directing always starts with the hook
  const coldScenes = scenes.filter(s => s.isColdOpen || s.act === 0 || s.sceneNumber === 0);
  if (coldScenes.length) {
    out.push('\n\nCOLD OPEN (scene 0 — prepend before Act 1)');
    for (const s of coldScenes) {
      out.push(`\nSCENE ${s.sceneNumber} — ${s.location || 'COLD OPEN'} (${s.timeOfDay || 'night'})`);
      if (s.actionDescription) out.push(`  ACTION (${s.actionType || 'establishing'}): ${s.actionDescription}`);
      if (s.enrichedVisual) out.push(`  ENRICHED VISUAL: ${s.enrichedVisual}`);
      if (s.beautyNotes) out.push(`  BEAUTY NOTES: ${s.beautyNotes}`);
      if (s.narration) out.push(`  NARRATION: ${s.narration}`);
      out.push(`  MOOD: ${s.emotion || 'tense'} (${s.intensity || 8}/10) | CAMERA: ${s.cameraType || 'extreme_close_up'} | TARGET: ${s.duration || 8}s`);
    }
  }

  for (const act of acts) {
    const title = act.title ? ` — "${act.title}"` : '';
    out.push(`\n\nACT ${act.actNumber}${title} (scenes ${act.sceneStart}-${act.sceneEnd})`);
    if (act.description) out.push(`ACT SUMMARY: ${act.description}`);
    if (act.emotion) out.push(`EMOTIONAL ARC: The dominant emotional tone of this act is "${act.emotion}" — scenes should progressively build toward this.`);

    const actScenes = scenes.filter(s => !s.isColdOpen && s.act !== 0 && (s.act ?? act.actNumber) === act.actNumber);
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

      if (s.isColdOpen) out.push('  [COLD OPEN — SCENE 0 HOOK]');
      if (s.actionDescription) out.push(`  ACTION (${s.actionType || 'other'}): ${s.actionDescription}`);
      if (s.enrichedVisual) out.push(`  ENRICHED VISUAL: ${s.enrichedVisual}`);
      if (s.beautyNotes) out.push(`  BEAUTY NOTES: ${s.beautyNotes}`);
      if (s.motifRefs?.length) out.push(`  MOTIFS: ${s.motifRefs.join(' | ')}`);
      if (s.narration) out.push(`  NARRATION: ${s.narration}`);
      const audioAt = (screenplay.audioSpine || []).filter(c => Number(c.atScene) === Number(s.sceneNumber));
      for (const cue of audioAt) {
        out.push(`  AUDIO [${cue.type}]: ${cue.cue || ''} (${cue.mood || ''}, ${cue.intensity || 5}/10)`);
      }

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
    selectedConceptId:     existing.selectedConceptId || '',
    lookBible:             existing.lookBible || null,
    motifs:                existing.motifs || [],
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
