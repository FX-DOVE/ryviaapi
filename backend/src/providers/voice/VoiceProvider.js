import { generateFullAudio, generateSceneAudio } from '../../services/voiceService.js';

export class VoiceProvider {
  /**
   * Generates TTS speech audio.
   * @param {string} text
   * @param {string} jobId
   * @param {string} [voiceId]
   * @returns {Promise<string>} Path to generated audio file
   */
  async generateSpeech(text, jobId, voiceId = null) {
    // Falls back to edge-tts or elevenlabs inside voiceService
    return generateFullAudio(jobId, text);
  }

  async generateSceneSpeech(text, jobId, sceneNumber) {
    return generateSceneAudio(jobId, sceneNumber, text);
  }
}

export default VoiceProvider;
