/**
 * providerSeedService.js
 *
 * Seeds the 5 built-in providers into the ProviderConfig collection on startup.
 * Uses upsert logic so re-starting the server never overwrites user-set
 * priority/enabled values — only missing documents are inserted.
 */

import ProviderConfig from '../models/ProviderConfig.js';

const BUILTIN_PROVIDERS = [
  {
    builtinId: 'ollama',
    name:      'Ollama Local',
    type:      'builtin',
    endpoint:  'http://127.0.0.1:11434',
    model:     'qwen3:1.7b',
    priority:  50,                // Local-first
    enabled:   true,
  },
  {
    builtinId: 'grok-cli',
    name:      'Grok CLI',
    type:      'builtin',
    endpoint:  'local-cli',
    model:     '',                // CLI — no model param
    priority:  100,               // First in chain
    enabled:   true,
  },
  {
    builtinId: 'gemini',
    name:      'Gemini 2.5 Flash',
    type:      'builtin',
    endpoint:  'https://generativelanguage.googleapis.com',
    model:     'gemini-2.5-flash',
    priority:  300,
    enabled:   true,
  },
  {
    builtinId: 'groq',
    name:      'Groq (Llama 3.3 70B)',
    type:      'builtin',
    endpoint:  'https://api.groq.com/openai/v1',
    model:     'llama-3.3-70b-versatile',
    priority:  400,
    enabled:   true,
  },
  {
    builtinId: 'openrouter',
    name:      'OpenRouter (Auto Free)',
    type:      'builtin',
    endpoint:  'https://openrouter.ai/api/v1',
    model:     'openrouter/free',
    priority:  500,
    enabled:   true,
  },
  {
    builtinId: 'github-models',
    name:      'GitHub Models (Llama 3.3 70B)',
    type:      'builtin',
    // NOTE: Old endpoint (models.inference.ai.azure.com) was deprecated in late 2025.
    endpoint:  'https://models.github.ai/inference',
    model:     'meta/llama-3.3-70b-instruct',  // high rate-limit tier
    priority:  600,
    enabled:   true,
  },
];

/**
 * Upserts built-in providers on startup.
 * Fields updated on each run: name, endpoint, model (keeps defaults current if we update them).
 * Fields NOT overwritten: priority, enabled, connected, lastError (user-set values preserved).
 */
export async function seedBuiltinProviders() {
  let seeded = 0;
  let existing = 0;

  for (const def of BUILTIN_PROVIDERS) {
    const result = await ProviderConfig.updateOne(
      { builtinId: def.builtinId },
      {
        $setOnInsert: {
          // These are only set on first insert — user changes are preserved on restart
          priority:        def.priority,
          enabled:         def.enabled,
          connected:       false,
          encryptedApiKey: '',
          lastError:       '',
          lastCheckedAt:   null,
        },
        $set: {
          // Always update these so we can ship fixes to names/endpoints/models
          name:     def.name,
          type:     def.type,
          endpoint: def.endpoint,
          model:    def.model,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      seeded++;
    } else {
      existing++;
    }
  }

  console.log(`[ProviderSeed] Built-in providers: ${seeded} seeded, ${existing} already existed.`);
}

export default { seedBuiltinProviders };
