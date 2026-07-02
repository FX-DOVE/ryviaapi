import { generateWithFallback } from '../reasoningProvider.js';

export class RankingProvider {
  /**
   * Scores and ranks visual assets for a given prompt.
   * @param {string} prompt            Target visual prompt
   * @param {Array<Object>} candidates Candidate assets
   * @returns {Promise<Array<Object>>} Sorted candidates with score fields
   */
  async rankAssets(prompt, candidates) {
    if (!candidates || candidates.length === 0) return [];

    console.log(`[RankingProvider] Ranking ${candidates.length} assets for prompt: "${prompt}"`);

    // Basic scoring based on tag intersections and cosine similarity if available
    const scored = candidates.map(c => {
      let score = 0;

      // Tag match overlap
      if (c.metadata?.visualTags) {
        const matchingTags = c.metadata.visualTags.filter(tag => 
          prompt.toLowerCase().includes(tag.toLowerCase())
        );
        score += matchingTags.length * 0.15;
      }

      // Exact word matching in path or description
      const words = prompt.toLowerCase().split(/\s+/);
      const filename = (c.path || '').toLowerCase();
      words.forEach(w => {
        if (w.length > 3 && filename.includes(w)) {
          score += 0.05;
        }
      });

      return { ...c, rankingScore: Math.min(1.0, score) };
    });

    // Sort descending by score
    return scored.sort((a, b) => b.rankingScore - a.rankingScore);
  }
}

export default RankingProvider;
