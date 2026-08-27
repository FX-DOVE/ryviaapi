import { LtxVideoProvider } from './LtxVideoProvider.js';

const _instance = new LtxVideoProvider();

export class VideoProvider {
  /**
   * Get the LTX-2.5 video generation adapter.
   * Supports: textToVideo, imageToVideo, frameToFrame, generateVideo (legacy).
   * @returns {LtxVideoProvider}
   */
  static getAdapter() {
    return {
      generate: async (imagePath, outputPath, options = {}) =>
        _instance.generateVideo(imagePath, outputPath, options),
      textToVideo: (prompt, outputPath, options) =>
        _instance.textToVideo(prompt, outputPath, options),
      imageToVideo: (imagePath, prompt, outputPath, options) =>
        _instance.imageToVideo(imagePath, prompt, outputPath, options),
      frameToFrame: (startFrame, endFrame, prompt, outputPath, options) =>
        _instance.frameToFrame(startFrame, endFrame, prompt, outputPath, options),
    };
  }

  /** Get the raw LtxVideoProvider instance for direct access. */
  static getInstance() {
    return _instance;
  }
}

export default VideoProvider;
