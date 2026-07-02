import { generateWithFallback } from '../reasoningProvider.js';

export class ScriptProvider {
  /**
   * Generate or analyze text using reasoning LLMs.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {string} [purpose]
   * @param {string} [forceProvider]
   * @returns {Promise<string>}
   */
  async generateText(systemPrompt, userPrompt, purpose = 'script-generation', forceProvider = null) {
    const { text } = await generateWithFallback(systemPrompt, userPrompt, purpose, forceProvider);
    return text;
  }
}

export default ScriptProvider;
