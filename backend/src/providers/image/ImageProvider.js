import { getProvider } from '../providerFactory.js';

export class ImageProvider {
  /**
   * Factory method to load an image generation adapter.
   * Supports 'grok', 'local-gpu', 'flux', 'stable-diffusion', etc.
   * @param {string} providerName  The adapter name
   * @param {string} [version]     Version identifier (e.g. 'v1', 'v2', 'xl')
   */
  static getAdapter(providerName = 'grok', version = 'v1') {
    const base = getProvider(providerName);
    return {
      generate: async (prompt, outputPath, options = {}) => {
        console.log(`[ImageProvider] Generating image via ${providerName} (${version})...`);
        return base.generateImage(prompt, outputPath);
      }
    };
  }
}

export default ImageProvider;
