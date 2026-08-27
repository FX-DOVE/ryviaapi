/**
 * reasoningService.js - Unified AI reasoning interface.
 *
 * Provider priority:
 *   1. Google Gemini (primary)            GEMINI_API_KEY + GEMINI_MODEL
 *   2. OpenAI GPT-5.6 Luna                OPENAI_API_KEY
 *   3. Alibaba Qwen3.5 Flash              QWEN_API_KEY
 */

import { listTransports, getAIConfig } from './reasoningProvider.js';

const GEMINI_BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '');
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

const QWEN_BASE = (process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const QWEN_KEY = process.env.QWEN_API_KEY || '';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen3.5-flash';

const HTTP_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function jsonHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function callOpenAiCompatible(baseUrl, apiKey, model, messages, { maxTokens, temperature }) {
  if (!apiKey) throw new Error(`no API key for ${baseUrl}`);
  if (!model) throw new Error(`no model configured for ${baseUrl}`);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
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
    || data?.choices?.[0]?.text?.trim() || '';
  if (!text) throw new Error(`empty completion from ${model}`);
  return text;
}

function buildProviders() {
  const providers = [];

  if (GEMINI_KEY) {
    providers.push({
      id: 'gemini',
      model: GEMINI_MODEL,
      endpoint: `${GEMINI_BASE}/chat/completions`,
      run: (messages, opts) => callOpenAiCompatible(GEMINI_BASE, GEMINI_KEY, GEMINI_MODEL, messages, opts),
    });
  }

  if (OPENAI_KEY) {
    providers.push({
      id: 'openai',
      model: OPENAI_MODEL,
      endpoint: `${OPENAI_BASE}/chat/completions`,
      run: (messages, opts) => callOpenAiCompatible(OPENAI_BASE, OPENAI_KEY, OPENAI_MODEL, messages, opts),
    });
  }

  if (QWEN_KEY) {
    providers.push({
      id: 'qwen',
      model: QWEN_MODEL,
      endpoint: `${QWEN_BASE}/chat/completions`,
      run: (messages, opts) => callOpenAiCompatible(QWEN_BASE, QWEN_KEY, QWEN_MODEL, messages, opts),
    });
  }

  const legacy = listTransports().filter(t => !providers.some(p => p.id === t.id));
  providers.push(...legacy);

  return providers;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function reason(options = {}) {
  const {
    systemPrompt = '',
    userPrompt = '',
    jobId = '',
    purpose = 'generation',
    preferredProviderId = '',
    maxTokens = Number(process.env.AI_MAX_TOKENS) || 8192,
    temperature = Number(process.env.AI_TEMPERATURE) || 0.7,
    maxRetries = MAX_RETRIES,
  } = options;

  if (!userPrompt) {
    throw new Error('[ReasoningService] reason() called without a userPrompt');
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  let providers = buildProviders();
  if (providers.length === 0) {
    throw new Error(
      '[ReasoningService] no AI provider configured - set GEMINI_API_KEY (primary), '
      + 'OPENAI_API_KEY, or QWEN_API_KEY',
    );
  }

  if (preferredProviderId) {
    const first = providers.filter(p => p.id === preferredProviderId);
    if (first.length) {
      providers = [...first, ...providers.filter(p => p.id !== preferredProviderId)];
    }
  }

  const failures = [];

  for (const provider of providers) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const started = Date.now();
      const elapsed = () => Math.round((Date.now() - started) / 1000);

      try {
        console.log(
          `[ReasoningService] ${purpose}${jobId ? ` (job ${jobId})` : ''} -> `
          + `${provider.id} / ${provider.model} (attempt ${attempt})`,
        );
        const text = await provider.run(messages, { maxTokens, temperature });
        if (!text) throw new Error('returned an empty completion');
        console.log(`[ReasoningService] ${provider.id} ok in ${elapsed()}s, ${text.length} chars`);
        return { text, providerUsed: provider.id, model: provider.model };
      } catch (err) {
        const isRateLimit = err.status === 429;
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        const isServerError = err.status >= 500;
        const isRetryable = isRateLimit || isTimeout || isServerError;

        const detail = isTimeout ? `timed out after ${elapsed()}s` : err.message;
        console.warn(`[ReasoningService] ${provider.id} attempt ${attempt} failed - ${detail}`);

        if (isRetryable && attempt <= maxRetries) {
          const delay = isRateLimit ? RETRY_DELAY_MS * attempt * 2 : RETRY_DELAY_MS * attempt;
          console.log(`[ReasoningService] retrying ${provider.id} in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        failures.push(`${provider.id}: ${detail}`);
        break;
      }
    }
  }

  throw new Error(
    `[ReasoningService] all ${providers.length} provider(s) failed for ${purpose} - `
    + failures.join(' | '),
  );
}

export function parseJsonResponse(text) {
  if (!text) throw new Error('empty response - cannot parse JSON');
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[{[]/);
    if (start >= 0) {
      const sub = cleaned.slice(start);
      try { return JSON.parse(sub); } catch { /* fall through */ }
    }
    throw new Error(`invalid JSON in LLM response: ${cleaned.slice(0, 200)}...`);
  }
}

export async function reasonJson(options = {}) {
  const maxJsonRetries = options.maxJsonRetries ?? 1;
  let lastError = null;
  for (let i = 0; i <= maxJsonRetries; i++) {
    const result = await reason({
      ...options,
      ...(i > 0 && {
        userPrompt: options.userPrompt
          + '\n\nIMPORTANT: Your previous response was not valid JSON. '
          + 'Respond ONLY with a valid JSON object, no markdown, no explanation.',
      }),
    });
    try {
      const parsed = parseJsonResponse(result.text);
      return { ...result, parsed };
    } catch (err) {
      lastError = err;
      console.warn(`[ReasoningService] JSON parse failed (attempt ${i + 1}): ${err.message}`);
    }
  }
  throw lastError;
}

export function getReasoningConfig() {
  const providers = buildProviders();
  const legacy = getAIConfig();
  return {
    providers: providers.map(p => ({ id: p.id, model: p.model, endpoint: p.endpoint })),
    primary: providers[0] ? { id: providers[0].id, model: providers[0].model } : null,
    fallback: providers[1] ? { id: providers[1].id, model: providers[1].model } : null,
    ...legacy,
  };
}

export async function testReasoningConnection() {
  const providers = buildProviders();
  if (providers.length === 0) {
    return { connected: false, error: 'No AI provider configured', providers: [] };
  }
  const results = [];
  for (const provider of providers) {
    try {
      const text = await provider.run(
        [{ role: 'user', content: 'Reply with the single word: ok' }],
        { maxTokens: 16, temperature: 0 },
      );
      results.push({ id: provider.id, model: provider.model, connected: true, reply: String(text).slice(0, 60) });
    } catch (err) {
      results.push({ id: provider.id, model: provider.model, connected: false, error: err.message });
    }
  }
  return { connected: results.some(r => r.connected), providers: results };
}

export default { reason, reasonJson, parseJsonResponse, getReasoningConfig, testReasoningConnection };