import { execFile } from 'child_process';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';
import Asset from '../models/Asset.js';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function resolvePython() {
  if (process.env.LOCAL_WHISPER_PYTHON) {
    return process.env.LOCAL_WHISPER_PYTHON;
  }
  const relPath =
    process.platform === 'win32'
      ? path.join('whisper-env', 'Scripts', 'python.exe')
      : path.join('whisper-env', 'bin', 'python');
  return path.resolve(BACKEND_ROOT, relPath);
}

export async function getEmbedding(text) {
  if (!text || !text.trim()) return [];
  const pythonPath = resolvePython();
  const scriptPath = path.resolve(BACKEND_ROOT, 'scripts', 'embedding.py');

  try {
    const { stdout } = await execFilePromise(pythonPath, [scriptPath, text], { timeout: 15000 });
    const result = JSON.parse(stdout.trim());
    if (result.error) throw new Error(result.error);
    return result;
  } catch (err) {
    console.warn(`[AssetReuseService] Embedding generation failed, falling back to mock vector: ${err.message}`);
    return Array.from({ length: 384 }, () => Math.random());
  }
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA > 0 && normB > 0 ? (dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))) : 0;
}

/**
 * Perform a multi-modal and metadata similarity comparison.
 */
export async function findReusableAsset(sceneRequirements, threshold = 0.65) {
  const { 
    prompt, 
    emotion = 'neutral', 
    characters = [], 
    visualTags = [], 
    cameraMovement = null,
    dominantColors = [],
    lighting = 'daylight'
  } = sceneRequirements;
  
  if (!prompt || !prompt.trim()) return null;

  // 1. Get query text embedding
  const queryVec = await getEmbedding(prompt);
  if (!queryVec.length) return null;

  // 2. Fetch candidates with embeddings
  const candidates = await Asset.find({ 
    type: { $in: ['video', 'image'] },
    'embedding.0': { $exists: true } 
  }).lean();

  let bestMatch = null;
  let bestScore = -1;
  let bestExplanation = '';

  for (const asset of candidates) {
    // A. Vector Semantic Cosine Similarity
    const simScore = cosineSimilarity(queryVec, asset.embedding);
    
    // B. Metadata matching boosts
    let metadataBoost = 0;
    const matchedFactors = [];

    // Emotion matching
    if (asset.metadata?.emotion && asset.metadata.emotion === emotion) {
      metadataBoost += 0.05;
      matchedFactors.push(`matching emotion (${emotion})`);
    }

    // Visual tags overlap
    if (asset.metadata?.visualTags && visualTags.length) {
      const intersect = asset.metadata.visualTags.filter(t => visualTags.includes(t));
      if (intersect.length) {
        metadataBoost += (intersect.length / visualTags.length) * 0.15;
        matchedFactors.push(`matched tags: [${intersect.join(', ')}]`);
      }
    }

    // Characters overlap
    if (asset.metadata?.characters && characters.length) {
      const intersect = asset.metadata.characters.filter(c => characters.includes(c));
      if (intersect.length) {
        metadataBoost += (intersect.length / characters.length) * 0.15;
        matchedFactors.push(`matched characters: [${intersect.join(', ')}]`);
      }
    }

    // Camera movement matches
    if (cameraMovement && asset.metadata?.cameraMovement === cameraMovement) {
      metadataBoost += 0.05;
      matchedFactors.push(`matched camera movement (${cameraMovement})`);
    }

    // Dominant colors similarity
    if (dominantColors.length && asset.metadata?.dominantColors?.length) {
      const colorIntersect = asset.metadata.dominantColors.filter(c => dominantColors.includes(c));
      if (colorIntersect.length) {
        metadataBoost += 0.05;
        matchedFactors.push(`matching dominant colors`);
      }
    }

    const finalScore = simScore + metadataBoost;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMatch = asset;
      bestExplanation = `Semantic text similarity of ${simScore.toFixed(3)}. Matched components: ${
        matchedFactors.length ? matchedFactors.join('; ') : 'none'
      }`;
    }
  }

  const configuredThreshold = parseFloat(process.env.REUSE_THRESHOLD || String(threshold));
  if (bestMatch && bestScore >= configuredThreshold) {
    console.log(`[AssetReuseService] Multi-Modal Match: score=${bestScore.toFixed(4)}, explanation="${bestExplanation}"`);
    return {
      asset:      bestMatch,
      confidence: bestScore,
      explanation: bestExplanation
    };
  }

  return null;
}

export default { getEmbedding, cosineSimilarity, findReusableAsset };
