import { GrokProvider }    from './grokProvider.js';
import { LocalGpuProvider } from './localGpuProvider.js';

const registry = {
  'grok':      () => new GrokProvider(),
  'local-gpu': () => new LocalGpuProvider(),
};

/**
 * Get a provider instance by name.
 * @param {string} name  'grok' | 'local-gpu'
 * @returns {import('./BaseProvider.js').BaseProvider}
 */
export function getProvider(name = 'grok') {
  const factory = registry[name];
  if (!factory) {
    throw new Error(
      `[ProviderFactory] Unknown provider: "${name}". ` +
      `Available: ${Object.keys(registry).join(', ')}`,
    );
  }
  return factory();
}

/** List all registered provider names. */
export function listProviders() {
  return Object.keys(registry);
}

export default getProvider;
