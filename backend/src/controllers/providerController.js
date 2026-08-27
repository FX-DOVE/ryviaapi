/**
 * providerController.js — REST controllers for AI connection status.
 *
 *   GET  /api/providers/status      — what each model role is pointed at
 *   POST /api/providers/test        — probe every endpoint
 *   POST /api/providers/:type/test  — probe one of reasoning | video | image
 *
 * There are four endpoints behind three roles: the reasoning transport, the LTX
 * video endpoint, and *two* Qwen endpoints (text2image and edit are deployed
 * separately because both pipelines resident at fp8 will not fit on a 48 GB
 * card). The edit endpoint is the one continuity depends on, so it is reported
 * on its own rather than folded into a single "image" boolean.
 *
 * Endpoint ids are shown unmasked: they are not secrets, and a stale id that
 * answers HTTP 404 while the API key is valid is the most common failure here.
 */

import { testProviderConnection, getAIConfig } from '../providers/reasoningProvider.js';
import { LtxVideoProvider } from '../providers/video/LtxVideoProvider.js';
import { QwenImageProvider } from '../providers/image/QwenImageProvider.js';
import { health } from '../providers/runpodClient.js';

// ─── GET /api/providers/status ────────────────────────────────────────────────

export async function listProviders(req, res, next) {
  try {
    const config = getAIConfig();

    res.json({
      providers: [
        {
          name: 'AI Reasoning',
          type: 'reasoning',
          model: config.reasoning.model || 'Not configured',
          endpoint: maskEndpoint(config.reasoning.endpoint),
          configured: config.reasoning.configured,
          icon: '🧠',
          description: 'Script analysis, directing, prompt building',
          // Fallback chain, in the order it is tried.
          fallbacks: config.reasoning.transports.map((t) => `${t.id} (${t.model})`),
        },
        {
          name: 'LTX-2.5 Video',
          type: 'video',
          model: config.video.model,
          endpoint: config.video.endpoint,
          configured: config.video.configured,
          icon: '🎬',
          description: `Image→video and frame→frame with native audio, ${config.video.resolution}`,
        },
        {
          name: 'Qwen-Image',
          type: 'image',
          model: config.image.model,
          endpoint: config.image.endpoint,
          editEndpoint: config.image.editEndpoint,
          configured: config.image.configured,
          icon: '🖼️',
          description: 'Lock sheets, anchor keyframes, and edit-based continuity frames',
        },
      ],
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/providers/test ─────────────────────────────────────────────────

export async function testAllProviders(req, res, next) {
  try {
    const ltx = new LtxVideoProvider();
    const qwen = new QwenImageProvider();

    const [reasoning, video, imageT2i, imageEdit] = await Promise.all([
      testProviderConnection(),
      probe(ltx.endpointId, 'LTX-2.5'),
      probe(qwen.t2iEndpoint, 'Qwen-Image text2image'),
      probe(qwen.editEndpoint, 'Qwen-Image edit'),
    ]);

    res.json({
      reasoning,
      video,
      // `image` stays a single object so existing callers keep working; the edit
      // endpoint is reported alongside it because continuity needs both.
      image: imageT2i,
      imageEdit,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/providers/:type/test ───────────────────────────────────────────

export async function testProvider(req, res, next) {
  try {
    const { type } = req.params;

    switch (type) {
      case 'reasoning':
        return res.json(await testProviderConnection());
      case 'video': {
        const ltx = new LtxVideoProvider();
        return res.json(await probe(ltx.endpointId, 'LTX-2.5'));
      }
      case 'image': {
        const qwen = new QwenImageProvider();
        const [t2i, edit] = await Promise.all([
          probe(qwen.t2iEndpoint, 'Qwen-Image text2image'),
          probe(qwen.editEndpoint, 'Qwen-Image edit'),
        ]);
        return res.json({ ...t2i, edit });
      }
      default:
        return res.status(400).json({ error: `Unknown provider type: ${type}` });
    }
  } catch (err) {
    next(err);
  }
}

// Stub methods to keep routes working (these features are simplified now)
export async function createProvider(req, res) {
  res.status(400).json({ error: 'Custom providers removed. Configure endpoints in .env file.' });
}
export async function reorderProviders(req, res) {
  res.status(400).json({ error: 'Provider reordering removed. Single endpoint configured via .env.' });
}
export async function updateProvider(req, res) {
  res.status(400).json({ error: 'Provider updates removed. Configure endpoints in .env file.' });
}
export async function deleteProvider(req, res) {
  res.status(400).json({ error: 'Provider deletion removed. Configure endpoints in .env file.' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Runpod's /health call is free and needs no worker, so it distinguishes "not
 * configured" from "wrong id" from "no capacity" without paying a cold start.
 */
async function probe(endpointId, model) {
  const endpoint = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : '';
  const h = await health(endpointId);

  if (!h) {
    return {
      connected: false,
      error: 'RUNPOD_API_KEY or the endpoint id is not configured',
      endpoint,
      model,
    };
  }
  if (!h.ok) {
    return { connected: false, error: h.error, httpStatus: h.httpStatus, endpoint, model };
  }

  const w = h.workers || {};
  const j = h.jobs || {};
  return {
    connected: true,
    error: '',
    endpoint,
    model,
    workers: w,
    jobs: j,
    // Surfaced because a queued job with no ready worker means a 7-11 min cold
    // start, and `throttled` means the GPU tier has no capacity in this region.
    note: [
      `${w.ready || 0} ready / ${w.running || 0} running / ${w.idle || 0} idle`,
      w.throttled ? `${w.throttled} throttled — no GPU capacity in region` : '',
      j.inQueue ? `${j.inQueue} queued` : '',
    ].filter(Boolean).join(', '),
  };
}

function maskEndpoint(url) {
  if (!url) return 'Not configured';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/...`;
  } catch {
    return url.slice(0, 30) + '...';
  }
}

export default {
  listProviders,
  testAllProviders,
  testProvider,
  createProvider,
  reorderProviders,
  updateProvider,
  deleteProvider,
};
