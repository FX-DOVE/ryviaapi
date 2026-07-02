/**
 * BaseProvider — abstract interface all media providers must implement.
 * This ensures swapping Grok → GPU → API is a one-file change.
 */
export class BaseProvider {
  /**
   * Generate an image from a text prompt and save it to outputPath.
   * @param {string} prompt
   * @param {string} outputPath  Absolute path to save the image (.jpg / .png)
   * @returns {Promise<string>}  Resolved path of the saved image
   */
  async generateImage(prompt, outputPath) {
    throw new Error(`${this.constructor.name}.generateImage() not implemented`);
  }

  /**
   * Animate an image into a short video clip and save it to outputPath.
   * @param {string} imagePath   Absolute path of source image
   * @param {string} outputPath  Absolute path to save the video (.mp4)
   * @returns {Promise<string>}  Resolved path of the saved video
   */
  async generateVideo(imagePath, outputPath) {
    throw new Error(`${this.constructor.name}.generateVideo() not implemented`);
  }

  /**
   * Generate a thumbnail from a video.
   * Default implementation uses FFmpeg — providers may override.
   * @param {string} videoPath     Source video
   * @param {string} outputPath    Destination image path (.jpg)
   * @returns {Promise<string>}
   */
  async generateThumbnail(videoPath, outputPath) {
    throw new Error(`${this.constructor.name}.generateThumbnail() not implemented`);
  }

  /** Human-readable name used in logs and DB. */
  get name() {
    return this.constructor.name;
  }
}

export default BaseProvider;
