/**
 * reasoningProvider.js — Shared multi-provider reasoning/generation module.
 *
 * Provides a single `generateWithFallback()` function used by both:
 *   - Scene-prompt building   (purpose: 'scene-prompt-building')
 *   - Script generation       (purpose: 'script-generation')
 *   - Script analysis         (any future AI classification tasks)
 *
 * Fallback chain (ordered by `priority` field in ProviderConfig collection):
 *   Default seeding:
 *     100  Grok CLI
 *     200  Custom user-added providers (in user-defined sub-order)
 *     300  Gemini 2.5 Flash
 *     400  Groq (llama-3.3-70b-versatile)
 *     500  OpenRouter (deepseek/deepseek-v4-flash:free)
 *     600  GitHub Models (deepseek/deepseek-r1)
 *
 * Error handling:
 *   - Missing API key / env var  → skip immediately (logged as config issue)
 *   - HTTP 429 / quota           → log and fall through (expected, not alarming)
 *   - HTTP 401 / 403             → log and fall through (auth problem)
 *   - Other errors               → log full detail and fall through
 *   - ALL providers fail         → throw once, never retry-loop
 */

import { spawn, exec }    from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import axios from 'axios';
import ProviderConfig from '../models/ProviderConfig.js';
import { decrypt } from '../services/encryptionService.js';
import { GROK_CMD } from '../config/constants.js';

const execAsync = promisify(exec);

// ─── Provider cache ────────────────────────────────────────────────────────────
// Avoids hitting MongoDB on every single scene-prompt call within a job loop.
let _providerCache = null;
let _cacheExpiry   = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export function invalidateProviderCache() {
  _providerCache = null;
  _cacheExpiry   = 0;
}

async function getOrderedProviders() {
  const now = Date.now();
  if (_providerCache && now < _cacheExpiry) return _providerCache;

  const providers = await ProviderConfig.find({ enabled: true })
    .sort({ priority: 1 })
    .lean();

  _providerCache = providers;
  _cacheExpiry   = now + CACHE_TTL_MS;
  return providers;
}

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(err) {
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.response?.status;

  if (status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
    return 'rate-limited';
  }
  if (status === 401 || status === 403 || msg.includes('unauthorized') || msg.includes('api key') || msg.includes('authentication')) {
    return 'auth-failure';
  }
  if (msg.includes('not set') || msg.includes('missing') || msg.includes('is required')) {
    return 'config-missing';
  }
  return 'unexpected-error';
}

// ─── ANSI strip (same helper as grokProvider.js) ─────────────────────────────
const ANSI_RE = /[\u001b\u009b](?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

// ─── Provider adapters ────────────────────────────────────────────────────────

/**
 * Grok CLI adapter.
 * Uses spawn() with --single as a separate argument (NOT shell-interpolated).
 * This is the headless mode — no TUI, exits with code 0 on success.
 * Matches the battle-tested pattern in grokProvider.js.
 */
async function callGrokCli(systemPrompt, userPrompt) {
  if (!GROK_CMD) throw new Error('GROK_CMD is not configured');

  const combined = [systemPrompt, userPrompt].filter(Boolean).join('\n\n');
  const TIMEOUT_MS = 3600_000; // 1 hour timeout instead of 3 minutes

  return new Promise((resolve, reject) => {
    let stdout = '';
    let timedOut = false;

    const ac    = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, TIMEOUT_MS);

    const proc = spawn(
      GROK_CMD,
      [
        '--single',          combined,
        '--output-format',   'plain',
        '--always-approve',
        '--permission-mode', 'dontAsk',
        '--no-plan',
        '--no-subagents',
      ],
      {
        signal: ac.signal,
        env:    { ...process.env },
      },
    );

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', () => {});  // suppress stderr noise

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ABORT_ERR' || err.name === 'AbortError') {
        return reject(new Error(`Grok CLI timed out after ${TIMEOUT_MS / 1000}s`));
      }
      reject(new Error(`Grok CLI spawn failed: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut || signal) {
        return reject(new Error(`Grok CLI killed (${timedOut ? 'timeout' : signal})`));
      }
      if (code !== 0) {
        return reject(new Error(`Grok CLI exited with code ${code}`));
      }
      const result = stripAnsi(stdout).trim();
      if (!result) return reject(new Error('Grok CLI returned empty output'));
      resolve(result);
    });
  });
}

/**
 * Ollama local adapter.
 * Uses native fetch to send a POST request to the local API.
 */
async function callOllama(provider, systemPrompt, userPrompt) {
  if (!provider.endpoint) throw new Error('Ollama endpoint is not configured');

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  if (userPrompt)   messages.push({ role: 'user',   content: userPrompt });
  if (messages.length === 0) throw new Error('No prompt content provided');

  let data;
  try {
    const response = await axios.post(`${provider.endpoint.replace(/\/$/, '')}/api/chat`, {
      model: provider.model || 'qwen3:1.7b',
      messages,
      stream: false,
    }, {
      timeout: 0, // Wait indefinitely for slow local generation
    });
    data = response.data;
  } catch (err) {
    if (err.response) {
      throw new Error(`Ollama failed with status ${err.response.status} ${err.response.statusText}`);
    }
    throw new Error(`Ollama connection error: ${err.message}`);
  }

  const text = data.message?.content?.trim() || '';
  if (!text) throw new Error('Ollama returned empty completion');
  return text;
}

/**
 * Gemini adapter — uses @google/generative-ai SDK.
 * Combines system + user prompt since the basic generateContent API
 * takes a single prompt string (system instructions go in the same text).
 */
async function callGemini(systemPrompt, userPrompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set — skipping Gemini');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
  });

  const combined = [systemPrompt, userPrompt].filter(Boolean).join('\n\n');
  const result   = await model.generateContent(combined);
  const text     = result.response.text().trim();
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

/**
 * Shared adapter for OpenAI-compatible APIs (Groq, OpenRouter, GitHub Models, custom).
 * Uses the openai npm package with a custom baseURL.
 */
async function callOpenAICompatible({ baseURL, apiKey, model, defaultHeaders = {} }, systemPrompt, userPrompt) {
  if (!apiKey) throw new Error(`API key not configured for ${baseURL}`);

  const client = new OpenAI({
    baseURL,
    apiKey,
    defaultHeaders,
    timeout: 3600_000, // 1 hour timeout instead of 60 seconds
  });

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  if (userPrompt)   messages.push({ role: 'user',   content: userPrompt });
  if (messages.length === 0) throw new Error('No prompt content provided');

  const completion = await client.chat.completions.create({
    model,
    messages,
    max_tokens:  2048,
    temperature: 0.7,
  });

  const text = completion.choices[0]?.message?.content?.trim() || '';
  if (!text) throw new Error(`${baseURL} returned empty completion`);
  return text;
}

/** Groq built-in adapter */
async function callGroq(systemPrompt, userPrompt) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set — skipping Groq');
  }
  return callOpenAICompatible(
    {
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey:  process.env.GROQ_API_KEY,
      model:   'llama-3.3-70b-versatile',  // Best free-tier reasoning model on Groq as of 2026
    },
    systemPrompt,
    userPrompt,
  );
}

/** OpenRouter built-in adapter */
async function callOpenRouter(systemPrompt, userPrompt) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set — skipping OpenRouter');
  }
  return callOpenAICompatible(
    {
      baseURL:        'https://openrouter.ai/api/v1',
      apiKey:         process.env.OPENROUTER_API_KEY,
      model:          'openrouter/free',  // Auto-routes to best available free model
      defaultHeaders: {
        'HTTP-Referer': 'https://ai-video-factory',
        'X-Title':      'AI Video Factory',
      },
    },
    systemPrompt,
    userPrompt,
  );
}

/** GitHub Models built-in adapter */
async function callGitHubModels(systemPrompt, userPrompt) {
  if (!process.env.GITHUB_MODELS_TOKEN) {
    throw new Error('GITHUB_MODELS_TOKEN is not set — skipping GitHub Models');
  }
  return callOpenAICompatible(
    {
      // NOTE: The old endpoint (models.inference.ai.azure.com) is deprecated.
      // New endpoint as of late 2025: https://models.github.ai/
      baseURL: 'https://models.github.ai/inference',
      apiKey:  process.env.GITHUB_MODELS_TOKEN,
      // meta/llama-3.3-70b-instruct — high rate limit tier, text-only, excellent reasoning
      model:   'meta/llama-3.3-70b-instruct',
    },
    systemPrompt,
    userPrompt,
  );
}

/** Custom provider adapter — decrypts stored key and calls the configured endpoint */
async function callCustomProvider(provider, systemPrompt, userPrompt) {
  if (!provider.endpoint) {
    throw new Error(`Custom provider "${provider.name}" has no endpoint configured`);
  }

  let apiKey = '';
  if (provider.encryptedApiKey) {
    try {
      apiKey = decrypt(provider.encryptedApiKey);
    } catch (decryptErr) {
      throw new Error(`Failed to decrypt API key for "${provider.name}": ${decryptErr.message}`);
    }
  }

  return callOpenAICompatible(
    {
      baseURL: provider.endpoint,
      apiKey,
      model:   provider.model || 'gpt-3.5-turbo',
    },
    systemPrompt,
    userPrompt,
  );
}

/** Dispatch to the correct adapter based on provider config */
async function callProvider(provider, systemPrompt, userPrompt) {
  switch (provider.builtinId) {
    case 'ollama':        return callOllama(provider, systemPrompt, userPrompt);
    case 'grok-cli':      return callGrokCli(systemPrompt, userPrompt);
    case 'gemini':        return callGemini(systemPrompt, userPrompt);
    case 'groq':          return callGroq(systemPrompt, userPrompt);
    case 'openrouter':    return callOpenRouter(systemPrompt, userPrompt);
    case 'github-models': return callGitHubModels(systemPrompt, userPrompt);
    default:              return callCustomProvider(provider, systemPrompt, userPrompt);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the multi-provider fallback chain.
 *
 * @param {object} options
 * @param {string} options.systemPrompt  Role/instruction part of the prompt
 * @param {string} options.userPrompt    Task-specific part of the prompt
 * @param {string} [options.jobId]       For log context only
 * @param {string} options.purpose       e.g. 'script-generation' or 'scene-prompt-building'
 * @returns {Promise<{ text: string, providerUsed: string }>}
 */
export async function generateWithFallback({ systemPrompt, userPrompt, jobId = '', purpose, preferredProviderId = null }) {
  const providers = await getOrderedProviders();

  if (providers.length === 0) {
    throw new Error('[ReasoningProvider] No providers configured. Run the seed or add a provider via the AI Providers page.');
  }

  // Sticky provider selection: move preferredProviderId to the very front of the providers list for this call
  let orderedProviders = [...providers];
  if (preferredProviderId) {
    const prefIndex = orderedProviders.findIndex(
      (p) => (p.builtinId || p.name) === preferredProviderId
    );
    if (prefIndex > -1) {
      const [pref] = orderedProviders.splice(prefIndex, 1);
      orderedProviders.unshift(pref);
    }
  }

  const errors = [];
  const logCtx = jobId ? `[job:${jobId}]` : '';

  for (const provider of orderedProviders) {
    const label = provider.name;
    try {
      const text = await callProvider(provider, systemPrompt, userPrompt);
      console.log(`[ReasoningProvider]${logCtx} [${purpose}] ✓ Success via "${label}" (priority ${provider.priority})`);
      return {
        text,
        providerUsed: provider.builtinId || provider.name,
      };
    } catch (err) {
      const errorType = classifyError(err);
      const message   = err.message || String(err);

      if (errorType === 'config-missing') {
        // Silent skip — missing key is expected in environments where that provider isn't configured
        console.log(`[ReasoningProvider]${logCtx} [${purpose}] Skipping "${label}" — not configured (${message})`);
      } else if (errorType === 'rate-limited') {
        console.warn(`[ReasoningProvider]${logCtx} [${purpose}] "${label}" rate limited — falling through to next provider`);
      } else if (errorType === 'auth-failure') {
        console.warn(`[ReasoningProvider]${logCtx} [${purpose}] "${label}" auth failed — falling through to next provider`);
      } else {
        console.error(`[ReasoningProvider]${logCtx} [${purpose}] "${label}" unexpected error — falling through. Detail: ${message}`);
      }

      errors.push(`${label} (${errorType}): ${message}`);
    }
  }

  // All providers exhausted — throw ONCE, never retry-loop
  throw new Error(
    `[ReasoningProvider] All ${providers.length} provider(s) failed for purpose="${purpose}".\n` +
    errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
  );
}

/**
 * Make a test-connection call to a specific provider using explicit credentials.
 * Used by the provider management API to validate a new or existing provider.
 *
 * @param {object} opts
 * @param {string|null} opts.builtinId   null for custom
 * @param {string}      opts.endpoint    API base URL (custom providers)
 * @param {string}      opts.apiKey      Plaintext API key to test
 * @param {string}      opts.model       Model identifier
 * @returns {Promise<{ connected: boolean, error: string }>}
 */
export async function testProviderConnection({ builtinId, endpoint, apiKey, model }) {
  const TEST_PROMPT = 'Reply with just the word OK and nothing else.';
  const TIMEOUT_MS  = 20_000;

  let timeoutId;
  try {
    let text;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Connection test timed out after 20s')), TIMEOUT_MS);
    });

    if (builtinId === 'grok-cli') {
      // Grok CLI can take 30s+ to spin up a local model. A fast --version check is
      // better for a UI status ping than forcing a full generation.
      if (!GROK_CMD) throw new Error('GROK_CMD is not configured');
      await execAsync(`"${GROK_CMD}" --version`, { timeout: 5000 });
      text = 'OK';
    } else if (builtinId === 'ollama') {
      const res = await Promise.race([
        fetch(`${endpoint.replace(/\/$/, '')}/api/tags`),
        timeoutPromise
      ]);
      if (!res.ok) throw new Error(`Ollama failed with status ${res.status}`);
      text = 'OK';
    } else if (builtinId === 'gemini') {
      text = await Promise.race([callGemini('', TEST_PROMPT), timeoutPromise]);
    } else if (builtinId === 'groq') {
      text = await Promise.race([callGroq('', TEST_PROMPT), timeoutPromise]);
    } else if (builtinId === 'openrouter') {
      text = await Promise.race([callOpenRouter('', TEST_PROMPT), timeoutPromise]);
    } else if (builtinId === 'github-models') {
      text = await Promise.race([callGitHubModels('', TEST_PROMPT), timeoutPromise]);
    } else {
      // Custom provider — use provided credentials directly
      text = await Promise.race([
        callOpenAICompatible({ baseURL: endpoint, apiKey, model: model || 'gpt-3.5-turbo' }, '', TEST_PROMPT),
        timeoutPromise,
      ]);
    }

    if (!text) throw new Error('Provider returned empty response to test prompt');
    return { connected: true, error: '' };
  } catch (err) {
    return { connected: false, error: err.message };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default { generateWithFallback, testProviderConnection, invalidateProviderCache };

