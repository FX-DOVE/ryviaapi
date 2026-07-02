/**
 * ProviderConfig.js — Mongoose model for AI reasoning provider configuration.
 *
 * Stores both built-in providers (Grok CLI, Gemini, Groq, OpenRouter, GitHub Models)
 * and user-added custom providers.  API keys are stored ENCRYPTED — see encryptionService.js.
 */

import mongoose from 'mongoose';

const providerConfigSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
    },

    type: {
      type:     String,
      enum:     ['builtin', 'custom'],
      required: true,
    },

    /**
     * Identifies built-in providers.  null for custom providers.
     * Used internally to select the correct adapter logic.
     */
    builtinId: {
      type:    String,
      enum:    ['ollama', 'grok-cli', 'gemini', 'groq', 'openrouter', 'github-models', null],
      default: null,
    },

    /**
     * API base URL.
     * For built-in providers: stored for display, actual URL is hardcoded in the adapter.
     * For custom providers: this is the actual endpoint used at call-time.
     */
    endpoint: {
      type:    String,
      default: '',
    },

    /**
     * AES-256-GCM encrypted API key.
     * Format: "<iv_hex>:<ciphertext_hex>:<tag_hex>"
     * For built-in providers that use env vars: blank — the adapter reads the env var directly.
     */
    encryptedApiKey: {
      type:    String,
      default: '',
    },

    /**
     * Model identifier to pass to the API (e.g. "llama-3.3-70b-versatile").
     * For Grok CLI (no model param): ignored.
     */
    model: {
      type:    String,
      default: '',
    },

    /**
     * Fallback priority order.  Lower number = tried first.
     * Default seeded values:
     *   grok-cli    → 100
     *   gemini      → 300
     *   groq        → 400
     *   openrouter  → 500
     *   github-models → 600
     * Custom providers default to 200 (slotted between Grok and Gemini).
     */
    priority: {
      type:    Number,
      default: 200,
    },

    /** Whether this provider is active in the fallback chain. */
    enabled: {
      type:    Boolean,
      default: true,
    },

    /** Result of the last test-connect call. */
    connected: {
      type:    Boolean,
      default: false,
    },

    lastCheckedAt: {
      type:    Date,
      default: null,
    },

    /** Most recent error from a test-connect or live call, for display in the UI. */
    lastError: {
      type:    String,
      default: '',
    },
  },
  { timestamps: true },
);

// Index for the sorted provider list query (primary query pattern)
providerConfigSchema.index({ enabled: 1, priority: 1 });

// Ensure each builtinId is unique (no duplicates of grok-cli, etc.)
providerConfigSchema.index(
  { builtinId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { builtinId: { $ne: null } } },
);

export default mongoose.model('ProviderConfig', providerConfigSchema);
