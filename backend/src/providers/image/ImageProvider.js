import { QwenImageProvider } from './QwenImageProvider.js';

const _instance = new QwenImageProvider();

export class ImageProvider {
  /**
   * Get the image generation adapter (Qwen-Image on Runpod).
   *
   * `edit` is the continuity primitive: it takes up to 3 reference images
   * (previous frame, character lock sheet, environment lock sheet) and applies
   * an instruction, inheriting the source dimensions.
   *
   * @returns {{ generate: Function, imageToImage: Function, edit: Function }}
   */
  static getAdapter() {
    return {
      generate: async (prompt, outputPath, options = {}) =>
        _instance.generateImage(prompt, outputPath, options),
      imageToImage: async (referenceImagePath, prompt, outputPath, options = {}) =>
        _instance.imageToImage(referenceImagePath, prompt, outputPath, options),
      edit: async (references, prompt, outputPath, options = {}) =>
        _instance.editImage(references, prompt, outputPath, options),
    };
  }

  /** Get the raw QwenImageProvider instance for direct access. */
  static getInstance() {
    return _instance;
  }
}

export default ImageProvider;
