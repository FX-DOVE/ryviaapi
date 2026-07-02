import { cosineSimilarity } from '../src/services/assetReuseService.js';

describe('Asset Reuse Engine Cosine Similarity', () => {
  it('should return 1.0 for identical vectors', () => {
    const vecA = [1, 0, -1, 0.5];
    const vecB = [1, 0, -1, 0.5];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('should correctly compute intermediate similarities', () => {
    const vecA = [3, 4];
    const vecB = [4, 3];
    // dot product = 3*4 + 4*3 = 24
    // norm A = sqrt(9+16) = 5
    // norm B = sqrt(16+9) = 5
    // sim = 24 / 25 = 0.96
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.96, 5);
  });

  it('should gracefully handle empty or mismatched dimensions', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});
