import { getProvider } from '../providerFactory.js';

export class VideoProvider {
  /**
   * Factory method to load a video generation adapter.
   * Supports 'grok', 'local-gpu', 'luma', 'runway', etc.
   * @param {string} providerName  The adapter name
   * @param {string} [version]     Version identifier (e.g. 'v1', 'v2')
   */
  static getAdapter(providerName = 'grok', version = 'v1') {
    const base = getProvider(providerName);
    return {
      generate: async (imagePath, outputPath, options = {}) => {
        console.log(`[VideoProvider] Generating video clip via ${providerName} (${version})...`);
        return base.generateVideo(imagePath, outputPath);
      }
    };
  }
}

export default VideoProvider;
