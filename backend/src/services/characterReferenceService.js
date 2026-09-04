/**
 * Shared character-reference + world-DNA loader.
 *
 * Uploaded photos are the identity source. Vision analysis extracts country,
 * location, architecture, and lighting so directing and locking share one world.
 */

import FilmCharacter from '../models/FilmCharacter.js';
import Screenplay from '../models/Screenplay.js';
import {
  analyzeCharacterReferenceImage,
  synthesizeWorldContinuity,
} from './characterVisionService.js';
import { getSignedUrl } from './storageService.js';

export async function loadWorkspaceCharactersForJob(job) {
  let dbCharacters = [];
  try {
    if (job.filmCharacterIds?.length > 0) {
      dbCharacters = await FilmCharacter.find({ _id: { $in: job.filmCharacterIds } });
    }
    if (!dbCharacters.length && job.screenplayId) {
      const screenplay = await Screenplay.findById(job.screenplayId);
      const charIds = (screenplay?.characters || []).map((c) => c.filmCharacterId).filter(Boolean);
      if (charIds.length) {
        dbCharacters = await FilmCharacter.find({ _id: { $in: charIds } });
      }
    }
    if (!dbCharacters.length && job.projectId) {
      dbCharacters = await FilmCharacter.find({ projectId: job.projectId });
    }
    if (!dbCharacters.length && job.workspaceId) {
      dbCharacters = await FilmCharacter.find({ workspaceId: job.workspaceId }).sort({ updatedAt: -1 });
    }
  } catch (err) {
    console.warn(`[CharacterReference] Could not load DB characters: ${err.message}`);
  }
  return dbCharacters;
}

export async function resolveCharacterImageSource(character) {
  let source = character.referenceImagePath
    || character.referenceImageUrl
    || character.avatar
    || null;

  if (character.referenceImageKey) {
    try {
      const freshUrl = await getSignedUrl(character.referenceImageKey, 7200);
      if (freshUrl) source = freshUrl;
    } catch (e) {
      console.warn(`[CharacterReference] signed URL failed: ${e.message}`);
    }
  }
  return source;
}

export async function analyzeAndAttachCharacter(character) {
  const source = await resolveCharacterImageSource(character);
  if (!source) return { character, analysis: character.visualAnalysis || null, hasPhoto: false };

  if (character.visualAnalysis?.world_and_setting_dna) {
    return { character, analysis: character.visualAnalysis, hasPhoto: true, imageSource: source };
  }

  try {
    const analysis = await analyzeCharacterReferenceImage({
      imagePathOrUrl: source,
      characterName: character.name,
      role: character.role,
      physicalDescription: character.physicalDescription,
      backstory: character.backstory,
    });
    character.visualAnalysis = analysis;
    if (character._id && typeof character.save === 'function') {
      try {
        character.markModified?.('visualAnalysis');
        await character.save();
      } catch { /* job-plan characters are plain objects */ }
    }
    return { character, analysis, hasPhoto: true, imageSource: source };
  } catch (err) {
    console.warn(`[CharacterReference] vision failed for "${character.name}": ${err.message}`);
    return { character, analysis: null, hasPhoto: true, imageSource: source };
  }
}

export function formatWorldDnaForDirector(worldDna) {
  if (!worldDna) return '';
  return [
    'WORLD & SETTING LOCK — extracted from the uploaded character reference photograph. Obey this exactly.',
    `Country / region: ${worldDna.country_or_region}`,
    `Socio-economic setting: ${worldDna.socio_economic_setting}`,
    `Architecture & environment: ${worldDna.architectural_and_environment_style}`,
    `Lighting: ${worldDna.lighting_style}`,
    `Color palette: ${worldDna.color_palette}`,
    `Optics: ${worldDna.camera_lens_and_depth}`,
    `Film look: ${worldDna.film_stock_look}`,
    'All locations, extras, wardrobe, vehicles, signage, vegetation, and lighting MUST belong to this photographed world.',
    'Do not invent a generic Hollywood backlot, a different country, or studio-flat lighting.',
  ].join('\n');
}

export async function buildWorldDnaForJob(job, extraCharacters = []) {
  const dbCharacters = await loadWorkspaceCharactersForJob(job);
  const analyzed = [];

  for (const dbC of dbCharacters) {
    const { analysis } = await analyzeAndAttachCharacter(dbC);
    if (analysis) {
      analyzed.push({ name: dbC.name, role: dbC.role, ...analysis });
    }
  }

  for (const char of extraCharacters) {
    if (char.visualAnalysis) {
      analyzed.push({ name: char.name, role: char.role, ...char.visualAnalysis });
    }
  }

  const worldDna = synthesizeWorldContinuity(analyzed);
  return { worldDna, dbCharacters, analyzed };
}

export default {
  loadWorkspaceCharactersForJob,
  resolveCharacterImageSource,
  analyzeAndAttachCharacter,
  formatWorldDnaForDirector,
  buildWorldDnaForJob,
};
