/**
 * providerController.js — REST controllers for AI provider management.
 *
 * Endpoints:
 *   GET    /api/providers              — list all providers (keys masked)
 *   POST   /api/providers              — add custom provider (test-connects first)
 *   POST   /api/providers/:id/test     — re-test an existing provider
 *   PUT    /api/providers/reorder      — bulk-update priorities
 *   PATCH  /api/providers/:id          — toggle enabled / update name
 *   DELETE /api/providers/:id          — remove custom provider (built-ins protected)
 */

import ProviderConfig from '../models/ProviderConfig.js';
import { encrypt, maskKey, decrypt } from '../services/encryptionService.js';
import { testProviderConnection, invalidateProviderCache } from '../providers/reasoningProvider.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a provider document for API response.
 * Masks the API key so the frontend never receives plaintext credentials.
 */
function formatProvider(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };

  // Derive masked key for display
  let maskedKey = '';
  if (obj.encryptedApiKey) {
    try {
      maskedKey = maskKey(decrypt(obj.encryptedApiKey));
    } catch {
      maskedKey = '••••(decrypt error)';
    }
  }

  // Built-in providers: show a hint that the key comes from env
  if (obj.type === 'builtin') {
    maskedKey = getBuiltinKeyHint(obj.builtinId);
  }

  return {
    _id:           obj._id,
    name:          obj.name,
    type:          obj.type,
    builtinId:     obj.builtinId,
    endpoint:      obj.endpoint,
    model:         obj.model,
    maskedKey,                    // ← never plaintext
    priority:      obj.priority,
    enabled:       obj.enabled,
    connected:     obj.connected,
    // 'configured' = key is actually present in env (built-ins) or stored (custom)
    // Allows the UI to distinguish gray "not configured" from red "connection failed"
    configured:    obj.type === 'builtin' ? isBuiltinConfigured(obj.builtinId) : Boolean(obj.encryptedApiKey),
    lastCheckedAt: obj.lastCheckedAt,
    lastError:     obj.lastError,
    createdAt:     obj.createdAt,
  };
}

function getBuiltinKeyHint(builtinId) {
  if (builtinId === 'ollama') return 'Local endpoint (no key needed)';

  const ENV_MAP = {
    'grok-cli':       'GROK_CMD (CLI binary)',
    'gemini':         'GEMINI_API_KEY env var',
    'groq':           'GROQ_API_KEY env var',
    'openrouter':     'OPENROUTER_API_KEY env var',
    'github-models':  'GITHUB_MODELS_TOKEN env var',
  };
  const envVar = ENV_MAP[builtinId];
  if (!envVar) return '';
  // Check if the env var is actually set
  const KEY_ENV = {
    'grok-cli':       process.env.GROK_CMD,
    'gemini':         process.env.GEMINI_API_KEY,
    'groq':           process.env.GROQ_API_KEY,
    'openrouter':     process.env.OPENROUTER_API_KEY,
    'github-models':  process.env.GITHUB_MODELS_TOKEN,
  };
  return KEY_ENV[builtinId] ? `Set (${envVar})` : `Not set (${envVar})`;
}

/** True when the env var for a built-in is actually configured */
function isBuiltinConfigured(builtinId) {
  if (builtinId === 'ollama') return true;

  const KEY_ENV = {
    'grok-cli':       process.env.GROK_CMD,
    'gemini':         process.env.GEMINI_API_KEY,
    'groq':           process.env.GROQ_API_KEY,
    'openrouter':     process.env.OPENROUTER_API_KEY,
    'github-models':  process.env.GITHUB_MODELS_TOKEN,
  };
  return Boolean(KEY_ENV[builtinId]);
}

// ─── GET /api/providers ───────────────────────────────────────────────────────

export async function listProviders(req, res, next) {
  try {
    const providers = await ProviderConfig.find().sort({ priority: 1 });
    res.json(providers.map(formatProvider));
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/providers ─────────────────────────────────────────────────────

export async function createProvider(req, res, next) {
  try {
    const { name, endpoint, apiKey, model } = req.body;

    if (!name?.trim())     return res.status(400).json({ error: 'Provider name is required' });
    if (!endpoint?.trim()) return res.status(400).json({ error: 'Endpoint URL is required' });
    if (!model?.trim())    return res.status(400).json({ error: 'Model name is required' });

    // Test connection BEFORE saving
    const { connected, error: testError } = await testProviderConnection({
      builtinId: null,
      endpoint:  endpoint.trim(),
      apiKey:    apiKey || '',
      model:     model.trim(),
    });

    if (!connected) {
      return res.status(400).json({
        error: `Connection test failed: ${testError}`,
        connected: false,
      });
    }

    // Encrypt the API key
    const encryptedApiKey = apiKey ? encrypt(apiKey) : '';

    // Find the highest current custom priority and add 10
    const lastCustom = await ProviderConfig.findOne({ type: 'custom' }).sort({ priority: -1 });
    const priority   = lastCustom ? lastCustom.priority + 10 : 210;

    const provider = await ProviderConfig.create({
      name:     name.trim(),
      type:     'custom',
      builtinId: null,
      endpoint:  endpoint.trim(),
      encryptedApiKey,
      model:    model.trim(),
      priority,
      enabled:  true,
      connected: true,
      lastCheckedAt: new Date(),
      lastError: '',
    });

    invalidateProviderCache();
    res.status(201).json(formatProvider(provider));
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/providers/:id/test ────────────────────────────────────────────

export async function testProvider(req, res, next) {
  try {
    const provider = await ProviderConfig.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    let apiKey = '';
    if (provider.type === 'custom' && provider.encryptedApiKey) {
      try {
        apiKey = decrypt(provider.encryptedApiKey);
      } catch (e) {
        return res.status(500).json({ error: `Cannot decrypt stored API key: ${e.message}` });
      }
    }

    const { connected, error: testError } = await testProviderConnection({
      builtinId: provider.builtinId,
      endpoint:  provider.endpoint,
      apiKey,
      model:     provider.model,
    });

    await ProviderConfig.findByIdAndUpdate(req.params.id, {
      connected,
      lastCheckedAt: new Date(),
      lastError: testError || '',
    });

    invalidateProviderCache();
    res.json({ connected, error: testError });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/providers/reorder ──────────────────────────────────────────────

/**
 * Accept a full reordered list and update all priorities atomically.
 * Body: [{ id: "...", priority: 100 }, ...]
 */
export async function reorderProviders(req, res, next) {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty array of { id, priority }' });
    }

    await Promise.all(
      items.map(({ id, priority }) =>
        ProviderConfig.findByIdAndUpdate(id, { priority: Number(priority) })
      )
    );

    invalidateProviderCache();
    const updated = await ProviderConfig.find().sort({ priority: 1 });
    res.json(updated.map(formatProvider));
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/providers/:id ─────────────────────────────────────────────────

export async function updateProvider(req, res, next) {
  try {
    const provider = await ProviderConfig.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { enabled, name, model, apiKey } = req.body;

    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (name  !== undefined) updates.name  = name.trim();
    if (model !== undefined) updates.model = model.trim();
    if (apiKey !== undefined && provider.type === 'custom') {
      updates.encryptedApiKey = apiKey ? encrypt(apiKey) : '';
    }

    const updated = await ProviderConfig.findByIdAndUpdate(req.params.id, updates, { new: true });
    invalidateProviderCache();
    res.json(formatProvider(updated));
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/providers/:id ────────────────────────────────────────────────

export async function deleteProvider(req, res, next) {
  try {
    const provider = await ProviderConfig.findById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    if (provider.type === 'builtin') {
      return res.status(403).json({
        error: 'Built-in providers cannot be deleted. You can disable them instead.',
      });
    }

    await ProviderConfig.deleteOne({ _id: req.params.id });
    invalidateProviderCache();
    res.json({ message: 'Provider removed successfully' });
  } catch (err) {
    next(err);
  }
}

export default {
  listProviders,
  createProvider,
  testProvider,
  reorderProviders,
  updateProvider,
  deleteProvider,
};
