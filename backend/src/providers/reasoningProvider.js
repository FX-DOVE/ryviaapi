/**
 * reasoningProvider.js — LLM reasoning for script analysis, directing and planning.
 *
 * Google Gemini (via OpenAI-compatible endpoint) is the primary reasoning engine:
 *   - GEMINI_API_KEY
 *   - GEMINI_BASE_URL (defaults to https://generativelanguage.googleapis.com/v1beta/openai/)
 *   - GEMINI_MODEL (defaults to gemini-3.5-flash-lite)
 *
 * Optional escape hatch:
 *   - AI_API_ENDPOINT + AI_API_KEY (+ AI_MODEL)
 */

import { LtxVideoProvider } from './video/LtxVideoProvider.js';
import { QwenImageProvider } from './image/QwenImageProvider.js';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const HTTP_TIMEOUT_MS = 300_000;

function jsonHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function trimEnd(url) {
  return String(url || '').replace(/\/+$/, '');
}

/**
 * Ordered list of usable transports. Empty means nothing is configured, which
 * is reported as a configuration error rather than a generation failure.
 */
export function listTransports() {
  const transports = [];

  // Google Gemini (Primary reasoning provider)
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiBase = trimEnd(process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/');
  const geminiModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (geminiKey && geminiBase) {
    transports.push(openAiTransport('gemini', geminiBase, geminiKey, geminiModel));
  }

  // Opt-in override: an explicit OpenAI-compatible endpoint.
  const explicitBase = trimEnd(process.env.AI_API_ENDPOINT);
  const explicitKey = process.env.AI_API_KEY;
  if (explicitBase && explicitKey) {
    transports.push(openAiTransport('ai-api', explicitBase, explicitKey, process.env.AI_MODEL || geminiModel));
  }

  // Groq (Ultra-fast reasoning fallback)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    transports.push(openAiTransport('groq', 'https://api.groq.com/openai/v1', groqKey, groqModel));
  }

  return transports;
}

function openAiTransport(id, base, apiKey, model) {
  return {
    id,
    model: model || '(model not configured)',
    endpoint: `${base}/chat/completions`,
    run: (messages, opts) => runViaOpenAiCompatible(base, apiKey, model, messages, opts),
  };
}

// ─── OpenAI-compatible /chat/completions ─────────────────────────────────────

async function runViaOpenAiCompatible(base, apiKey, model, messages, { maxTokens, temperature }) {
  if (!model) throw new Error('no model configured for this endpoint');

  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${trimEnd(base)}/chat/completions`, {
        method: 'POST',
        headers: jsonHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim()
        || data?.choices?.[0]?.text?.trim()
        || '';
      if (!text) {
        throw new Error(`empty completion: ${JSON.stringify(data).slice(0, 300)}`);
      }
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = attempt * 1500;
        console.warn(`[ReasoningProvider] attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Kept for API compatibility — there is no cached client to clear. */
export function invalidateProviderCache() {}

/**
 * Generate text, trying every configured transport in order.
 *
 * Accepts the object form used throughout this codebase *and* a positional form,
 * because ScriptProvider called it positionally against an object-destructuring
 * signature — which silently made every field `undefined`.
 *
 * @param {object|string} options  { systemPrompt, userPrompt, jobId, purpose,
 *                                   preferredProviderId, maxTokens, temperature }
 * @returns {Promise<{ text: string, providerUsed: string, model: string }>}
 */
export async function generateWithFallback(options = {}, ...rest) {
  const args = typeof options === 'string'
    ? { systemPrompt: options, userPrompt: rest[0], purpose: rest[1], preferredProviderId: rest[2] }
    : options;

  const {
    systemPrompt = '',
    userPrompt = '',
    jobId = '',
    purpose = 'generation',
    preferredProviderId = '',
    maxTokens = Number(process.env.AI_MAX_TOKENS) || 32768,
    temperature = Number(process.env.AI_TEMPERATURE) || 0.7,
  } = args;

  if (!userPrompt) {
    throw new Error('[ReasoningProvider] generateWithFallback called without a userPrompt');
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  let transports = listTransports();
  if (transports.length === 0) {
    throw new Error(
      '[ReasoningProvider] no LLM transport configured — set GEMINI_API_KEY '
      + '(and optional GEMINI_MODEL / GEMINI_BASE_URL), or AI_API_ENDPOINT + AI_API_KEY',
    );
  }

  // A preference reorders the list; it never truncates it.
  if (preferredProviderId) {
    const first = transports.filter((t) => t.id === preferredProviderId);
    if (first.length) {
      transports = [...first, ...transports.filter((t) => t.id !== preferredProviderId)];
    }
  }

  const failures = [];
  for (const transport of transports) {
    const started = Date.now();
    const elapsed = () => Math.round((Date.now() - started) / 1000);
    try {
      console.log(
        `[ReasoningProvider] ${purpose}${jobId ? ` (job ${jobId})` : ''} → `
        + `${transport.id} / ${transport.model}`,
      );
      const text = await transport.run(messages, { maxTokens, temperature });
      if (!text) throw new Error('returned an empty completion');
      console.log(
        `[ReasoningProvider] ${transport.id} ok in ${elapsed()}s, ${text.length} chars`,
      );
      return { text, providerUsed: transport.id, model: transport.model };
    } catch (err) {
      const detail = err.name === 'TimeoutError' || err.name === 'AbortError'
        ? `timed out after ${elapsed()}s`
        : err.message;
      console.warn(`[ReasoningProvider] ${transport.id} failed — ${detail}`);
      failures.push(`${transport.id}: ${detail}`);
    }
  }

  throw new Error(
    `[ReasoningProvider] all ${transports.length} transport(s) failed for ${purpose} — `
    + failures.join(' | '),
  );
}

/**
 * Liveness probe for the admin UI: a 16-token completion on the first transport
 * that answers. Reports which one, so a silent fallback is visible rather than
 * looking like the primary is healthy.
 */
export async function testProviderConnection() {
  const transports = listTransports();
  if (transports.length === 0) {
    return { connected: false, error: 'No LLM transport configured', endpoint: '', model: '' };
  }

  const failures = [];
  for (const transport of transports) {
    try {
      const text = await transport.run(
        [{ role: 'user', content: 'Reply with the single word: ok' }],
        { maxTokens: 16, temperature: 0 },
      );
      return {
        connected: true,
        error: '',
        endpoint: transport.endpoint,
        model: transport.model,
        providerUsed: transport.id,
        reply: String(text).slice(0, 60),
      };
    } catch (err) {
      failures.push(`${transport.id}: ${err.message}`);
    }
  }

  return {
    connected: false,
    error: failures.join(' | '),
    endpoint: transports[0].endpoint,
    model: transports[0].model,
  };
}

/**
 * Snapshot of what the three model roles are pointed at, for GET /api/providers/status.
 *
 * The endpoint ids are read off live provider instances rather than re-derived
 * from env here, so an override in .env cannot make this report disagree with
 * what the pipeline actually calls.
 */
export function getAIConfig() {
  const transports = listTransports();
  const primary = transports[0] || null;
  const ltx = new LtxVideoProvider();
  const qwen = new QwenImageProvider();
  const RUNPOD_BASE = 'https://api.runpod.ai/v2';

  return {
    reasoning: {
      model: primary?.model || '',
      endpoint: primary?.endpoint || '',
      configured: transports.length > 0,
      // Every transport, so a fallback chain is visible in the UI.
      transports: transports.map((t) => ({ id: t.id, model: t.model, endpoint: t.endpoint })),
    },
    video: {
      model: 'LTX-2.5',
      endpoint: `${RUNPOD_BASE}/${ltx.endpointId}`,
      configured: ltx.configured(),
      resolution: ltx.resolution,
    },
    image: {
      model: 'Qwen-Image',
      endpoint: `${RUNPOD_BASE}/${qwen.t2iEndpoint}`,
      editEndpoint: `${RUNPOD_BASE}/${qwen.editEndpoint}`,
      configured: qwen.configured(),
    },
  };
}

export default {
  generateWithFallback,
  testProviderConnection,
  invalidateProviderCache,
  getAIConfig,
  listTransports,
};
