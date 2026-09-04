/**
 * characterVisionService.js
 *
 * Multimodal Vision Intelligence for Character & World Continuity.
 *
 * When a character reference image is uploaded:
 * 1. Analyzes the image using multimodal Gemini (reasoning LLM with vision).
 * 2. Extracts granular physical appearance (face, skin, hair, eyes, build).
 * 3. Extracts cultural, regional, and setting DNA (country, socio-economic setting, architecture).
 * 4. Extracts cinematography DNA (lighting, color palette, camera lens, film stock).
 * 5. Builds an optimal instruction prompt for Image-to-Image editing (Qwen-Image-Edit).
 * 6. Synthesizes a Master World & Setting DNA so non-uploaded characters and environments
 *    inherit the exact same country, atmosphere, and visual realism.
 */

import fs from 'fs';
import path from 'path';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_BASE_URL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');

/**
 * Resolve any image source (local path, /mock-storage, or remote URL) into a base64 data URI.
 *
 * @param {string} imagePathOrUrl
 * @returns {Promise<{ base64DataUri: string, mimeType: string, buffer: Buffer }>}
 */
export async function persistImageToPath(imagePathOrUrl, destPath) {
  const { buffer } = await resolveImageBufferAndDataUri(imagePathOrUrl);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, buffer);
  return destPath;
}

export async function resolveImageBufferAndDataUri(imagePathOrUrl) {
  if (!imagePathOrUrl) throw new Error('No image path or URL provided');

  let buffer;
  let mimeType = 'image/jpeg';

  // 1. If already a data URI
  if (typeof imagePathOrUrl === 'string' && imagePathOrUrl.startsWith('data:')) {
    const match = imagePathOrUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      buffer = Buffer.from(match[2], 'base64');
      return { base64DataUri: imagePathOrUrl, mimeType, buffer };
    }
  }

  // 2. If a local mock-storage path
  if (typeof imagePathOrUrl === 'string' && imagePathOrUrl.startsWith('/mock-storage')) {
    const localMock = path.join(process.cwd(), 'storage', 'public', imagePathOrUrl.replace(/^\/?mock-storage\//, 'mock-storage/'));
    if (fs.existsSync(localMock)) {
      buffer = await fs.promises.readFile(localMock);
      const ext = path.extname(localMock).toLowerCase();
      mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return {
        base64DataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
        mimeType,
        buffer,
      };
    }
  }

  // 3. If a local filesystem path
  if (typeof imagePathOrUrl === 'string' && !/^https?:\/\//i.test(imagePathOrUrl) && fs.existsSync(imagePathOrUrl)) {
    buffer = await fs.promises.readFile(imagePathOrUrl);
    const ext = path.extname(imagePathOrUrl).toLowerCase();
    mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      base64DataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      buffer,
    };
  }

  // 4. If remote HTTP(S) URL
  if (typeof imagePathOrUrl === 'string' && /^https?:\/\//i.test(imagePathOrUrl)) {
    const res = await fetch(imagePathOrUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      throw new Error(`Failed to download image from URL (HTTP ${res.status}): ${imagePathOrUrl.slice(0, 100)}`);
    }
    const arrayBuf = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
    const headerType = res.headers.get('content-type');
    if (headerType && headerType.startsWith('image/')) {
      mimeType = headerType;
    }
    return {
      base64DataUri: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      buffer,
    };
  }

  throw new Error(`Could not resolve image from path/url: ${String(imagePathOrUrl).slice(0, 100)}`);
}

/**
 * Perform deep multimodal visual analysis of a character's reference image using Gemini.
 *
 * @param {object} params
 * @param {string} params.imagePathOrUrl - local file, mock-storage, or remote URL
 * @param {string} params.characterName
 * @param {string} [params.role]
 * @param {string} [params.physicalDescription]
 * @param {string} [params.backstory]
 * @returns {Promise<object>} Structured analysis including appearance, world DNA, and edit prompt
 */
export async function analyzeCharacterReferenceImage({
  imagePathOrUrl,
  characterName = 'Character',
  role = 'protagonist',
  physicalDescription = '',
  backstory = '',
}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn('[CharacterVision] GEMINI_API_KEY missing — falling back to text heuristics');
    return getFallbackAnalysis(characterName, role, physicalDescription);
  }

  try {
    console.log(`[CharacterVision] 👁️ Analyzing reference image with multimodal Gemini for "${characterName}"...`);
    const { base64DataUri } = await resolveImageBufferAndDataUri(imagePathOrUrl);

    const promptText = `You are a master Hollywood visual director and director of photography.
Analyze this character reference photo for the character "${characterName}" (${role || 'lead character'}).
Context notes: "${physicalDescription || ''} ${backstory || ''}".
Examine the face, skin, hair, eyes, body, wardrobe, jewelry, lighting, background, architecture, and overall world in granular detail.

Provide your analysis in STRICT JSON format with the following keys:
{
  "character_appearance": {
    "ethnicity": "Precise ethnicity, heritage, skin tone and undertone",
    "facial_structure": "Jawline, cheekbones, nose shape, lips, facial hair, distinct facial features",
    "eyes": "Eye color, shape, expression",
    "hair": "Hair texture, style, haircut/fade, color, hairline",
    "age": "Estimated age",
    "body_build": "Body frame, build, posture"
  },
  "wardrobe_aesthetic": {
    "outfit_style": "Style category (e.g. Modern luxury smart-casual, urban streetwear, formal, etc.)",
    "garments": ["Specific item 1", "Specific item 2"],
    "accessories": ["Jewelry, glasses, watch, etc."]
  },
  "world_and_setting_dna": {
    "country_or_region": "Specific geographic country or regional cultural world depicted (e.g., Miami/Los Angeles upscale enclave, Lagos Nigeria contemporary urban, Tokyo Japan modern metropolis, etc.)",
    "socio_economic_setting": "Atmosphere and socio-economic tier of the environment",
    "architectural_and_environment_style": "Architecture, building styles, materials, and props that define this world"
  },
  "cinematography_dna": {
    "lighting_style": "Lighting setup (e.g. soft natural golden-hour daylight, moody low-key cinematic shadows, etc.)",
    "color_palette": "Dominant colors, tone contrasts, and accents",
    "camera_lens_and_depth": "Lens choice and depth of field (e.g. 85mm portrait telephoto lens, shallow depth of field, creamy bokeh)",
    "film_stock_look": "Photographic medium (e.g. 35mm motion picture film, Kodak Portra 400 grain, real human skin pores)"
  },
  "edit_locking_prompt": "A 1-paragraph hyper-detailed instruction prompt to feed directly into Qwen-Image-Edit (Image-to-Image) to generate a high-fidelity cinematic master lock portrait preserving this exact person, face, skin texture with real pores, attire, and lighting."
}`;

    const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${geminiKey}`,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: base64DataUri } },
            ],
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini vision request failed (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    const cleanJson = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    console.log(`[CharacterVision] ✅ Visual DNA extracted for "${characterName}": Country/Region: ${parsed.world_and_setting_dna?.country_or_region || 'Detected'}`);
    try {
      const { recordLlmCall } = await import('./costTracker.js');
      await recordLlmCall({
        purpose: 'character-vision',
        charCount: promptText.length + rawContent.length,
        provider: 'gemini-vision',
      });
    } catch { /* no billing context outside a job */ }
    return parsed;
  } catch (err) {
    console.error(`[CharacterVision] Warning: Gemini vision analysis failed for "${characterName}": ${err.message}`);
    return getFallbackAnalysis(characterName, role, physicalDescription);
  }
}

/**
 * Synthesize master world & setting DNA across all analyzed characters.
 *
 * @param {object[]} analyzedCharacters
 * @returns {object} World & setting DNA
 */
export function synthesizeWorldContinuity(analyzedCharacters = []) {
  if (!analyzedCharacters.length) return null;

  // Use the primary / protagonist analysis, or first analyzed character
  const primary = analyzedCharacters.find(c => c.role === 'protagonist') || analyzedCharacters[0];
  const world = primary?.world_and_setting_dna || {};
  const cinema = primary?.cinematography_dna || {};

  return {
    country_or_region: world.country_or_region || 'Cinematic on-location world',
    socio_economic_setting: world.socio_economic_setting || 'Authentic contemporary setting',
    architectural_and_environment_style: world.architectural_and_environment_style || 'Realistic architecture, natural practical textures',
    lighting_style: cinema.lighting_style || 'Natural ambient lighting, soft practical daylight',
    color_palette: cinema.color_palette || 'Natural skin tones, rich dynamic range, true-to-life colors',
    camera_lens_and_depth: cinema.camera_lens_and_depth || '85mm portrait telephoto lens, shallow depth of field',
    film_stock_look: cinema.film_stock_look || '35mm motion picture film, Kodak Portra 400 grain, real human skin pores',
    sourceCharacterName: primary?.name || 'Reference Character',
  };
}

/**
 * Build a text-to-image prompt for a character WITHOUT an uploaded reference photo,
 * ensuring they match the exact world, country, setting, and cinematography established by the reference character.
 */
export function buildPromptForCharacterWithoutReference({
  character,
  worldDna,
  animationStyle = 'cinematic',
}) {
  const parts = [
    '35mm film photograph, Kodak Portra 400. Cinematic character portrait still',
    `${character.name}: ${character.role ? `${character.role}.` : ''}`,
    character.physicalDescription || '',
    character.clothingDefault ? `Wearing: ${character.clothingDefault}.` : '',
  ];

  if (worldDna) {
    parts.push(`Cultural and regional world: living in ${worldDna.country_or_region}, ${worldDna.socio_economic_setting}`);
    parts.push(`Lighting: ${worldDna.lighting_style}`);
    parts.push(`Colors: ${worldDna.color_palette}`);
    parts.push(`Optics & Film: ${worldDna.camera_lens_and_depth}, ${worldDna.film_stock_look}`);
  } else {
    parts.push('Natural ambient room lighting, realistic depth of field, 35mm motion picture film still');
  }

  parts.push('Authentic real human being with natural skin texture, visible pores, fine lines, subtle facial imperfections, authentic human complexion, unretouched, candid cinema documentary still');

  return parts.filter(Boolean).join('. ') + '.';
}

/**
 * Build an environment lock prompt that inherits the world and setting DNA.
 */
export function buildEnvironmentPromptWithWorldDna({
  environment,
  worldDna,
  animationStyle = 'cinematic',
}) {
  const parts = [
    '35mm film photograph, Kodak Portra 400, on-location cinematic film production still',
    environment.name ? `Setting: ${environment.name}` : '',
    environment.description || '',
    'Wide establishing view showing the full physical space',
  ];

  if (worldDna) {
    parts.push(`Location in ${worldDna.country_or_region}`);
    parts.push(`Architectural details & props: ${worldDna.architectural_and_environment_style}`);
    parts.push(`Lighting: ${worldDna.lighting_style}`);
    parts.push(`Colors: ${worldDna.color_palette}`);
    parts.push(`Film texture: ${worldDna.film_stock_look}`);
  } else {
    parts.push('Realistic architecture, authentic practical textures, natural lighting, subtle film grain');
  }

  parts.push('No people, empty location, natural dynamic range, unretouched, true-to-life colors');

  return parts.filter(Boolean).join('. ') + '.';
}

/**
 * Fallback analysis when API key is missing or offline.
 */
function getFallbackAnalysis(characterName, role, physicalDescription) {
  return {
    character_appearance: {
      facial_structure: 'Authentic real human facial features, defined jawline and natural skin texture',
      skin_tone: 'Natural complexion with visible pores and fine lines',
      age: 'Adult',
    },
    wardrobe_aesthetic: {
      outfit_style: 'Authentic contemporary smart-casual attire',
    },
    world_and_setting_dna: {
      country_or_region: 'Contemporary cinematic environment',
      socio_economic_setting: 'Authentic lived-in world',
      architectural_and_environment_style: 'Realistic architecture with practical textures',
    },
    cinematography_dna: {
      lighting_style: 'Natural ambient lighting with soft practical highlights',
      color_palette: 'True-to-life color grading, subtle film grain',
      camera_lens_and_depth: '35mm motion picture lens, realistic depth of field',
      film_stock_look: 'Kodak Portra 400 35mm film still, unretouched human skin',
    },
    edit_locking_prompt: `Keep this exact person from the reference photo — identical face, facial structure, skin tone, hair, eyes, and body build. Render as an authentic 35mm film photograph with real human skin pores, fine lines, natural complexion, and natural ambient lighting. Do NOT airbrush, do NOT smooth skin.`,
  };
}

export default {
  resolveImageBufferAndDataUri,
  persistImageToPath,
  analyzeCharacterReferenceImage,
  synthesizeWorldContinuity,
  buildPromptForCharacterWithoutReference,
  buildEnvironmentPromptWithWorldDna,
};
