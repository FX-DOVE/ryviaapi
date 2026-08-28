/**
 * runpodClient.js
 *
 * Shared transport for this account's Runpod Serverless endpoints.
 *
 * Every Runpod serverless endpoint speaks the same job API:
 *   POST /v2/{endpointId}/run           { input: {...} }  -> { id, status }
 *   GET  /v2/{endpointId}/status/{id}   -> { status, output, delayTime, executionTime }
 *   POST /v2/{endpointId}/cancel/{id}
 *   GET  /v2/{endpointId}/health        -> { jobs, workers }
 *
 * Statuses: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED | CANCELLED | TIMED_OUT.
 *
 * Cold starts on this account measure 445-685 s (image pull, then ~54 GiB read
 * off the network volume, then fp8 quantization) so `delayTime` is logged apart
 * from `executionTime`: a slow first job is not a slow model.
 *
 * Both handlers (Qwen-Image, LTX-2.5) answer with a Pydantic body shaped
 * { status: 'success' | 'error', ... }. A handler-level error rides *inside* a
 * COMPLETED job, so it is unwrapped here instead of at every call site.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

export const RUNPOD_BASE = (process.env.RUNPOD_API_BASE || 'https://api.runpod.ai/v2')
  .replace(/\/$/, '');

const TERMINAL_FAIL = ['FAILED', 'CANCELLED', 'TIMED_OUT'];

/** Account API key — loaded from backend/.env by backend/env.js. */
export function runpodApiKey() {
  return process.env.RUNPOD_API_KEY || '';
}

/** True when both the account key and this endpoint id are configured. */
export function hasRunpod(endpointId) {
  return Boolean(runpodApiKey() && endpointId);
}

function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey || runpodApiKey()}`,
    'Content-Type': 'application/json',
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error that carries the handler's `retryable` flag, so BullMQ can tell a bad
 * payload (never retry) from a lost worker (worth another cold start).
 */
export class RunpodError extends Error {
  constructor(message, { retryable = false, status = null, jobId = null } = {}) {
    super(message);
    this.name = 'RunpodError';
    this.retryable = retryable;
    this.runpodStatus = status;
    this.jobId = jobId;
  }
}

/**
 * GET /v2/{id}/health — worker and job counts.
 * Never throws: returns null when unreachable so a preflight can report
 * "unknown" instead of failing the caller.
 *
 * @returns {Promise<{ok: boolean, httpStatus: number|null, jobs?: object, workers?: object, error?: string}|null>}
 */
export async function health(endpointId, { apiKey, timeoutMs = 15000 } = {}) {
  if (!hasRunpod(endpointId)) return null;
  try {
    const res = await axios.get(`${RUNPOD_BASE}/${endpointId}/health`, {
      headers: authHeaders(apiKey),
      timeout: timeoutMs,
    });
    return {
      ok: true,
      httpStatus: res.status,
      jobs: res.data?.jobs || {},
      workers: res.data?.workers || {},
    };
  } catch (err) {
    const code = err?.response?.status ?? null;
    return {
      ok: false,
      httpStatus: code,
      error: code === 401 ? 'unauthorized — the key does not own this endpoint'
        : code === 404 ? 'endpoint id not found on this account'
        : err?.message || 'unreachable',
    };
  }
}

/**
 * Submit one job and poll it to completion.
 *
 * @param {string} endpointId
 * @param {object} input                     becomes the request body `{ input }`
 * @param {object} [opts]
 * @param {string} [opts.apiKey]
 * @param {number} [opts.maxWaitMs]          default 20 min — cold start alone is 7-11
 * @param {number} [opts.pollMs]             default 5 s
 * @param {string} [opts.label]              log prefix
 * @param {boolean} [opts.cancelOnTimeout]   default true, so a stuck job stops billing
 * @returns {Promise<object>} the handler's `output` body (already unwrapped)
 */
export async function runJob(endpointId, input, opts = {}) {
  const {
    apiKey,
    maxWaitMs = Number(process.env.RUNPOD_MAX_WAIT_MS || 2 * 60 * 60 * 1000), // default 2 hours to allow cold workers to boot & process
    pollMs = Number(process.env.RUNPOD_POLL_INTERVAL_MS || 5000),
    label = 'runpod',
    cancelOnTimeout = false,
  } = opts;

  if (!runpodApiKey()) {
    throw new RunpodError(`[${label}] RUNPOD_API_KEY is not set in backend/.env`);
  }
  if (!endpointId) {
    throw new RunpodError(`[${label}] endpoint id is not configured`);
  }

  const jobId = await submitJob(endpointId, input, { apiKey, label });
  return pollJob(endpointId, jobId, { apiKey, maxWaitMs, pollMs, label, cancelOnTimeout });
}

async function submitJob(endpointId, input, { apiKey, label }) {
  let res;
  try {
    res = await axios.post(`${RUNPOD_BASE}/${endpointId}/run`, { input }, {
      headers: authHeaders(apiKey),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) {
    throw new RunpodError(`[${label}] submit failed: ${describeHttpError(err)}`, {
      retryable: !err?.response?.status || err.response.status >= 500,
      status: err?.response?.status ? String(err.response.status) : null,
    });
  }

  const jobId = res.data?.id;
  if (!jobId) {
    throw new RunpodError(
      `[${label}] submit returned no job id: ${JSON.stringify(res.data).slice(0, 300)}`,
    );
  }
  console.log(`[${label}] job ${jobId} queued on ${endpointId} — waiting for GPU worker`);
  return jobId;
}

async function pollJob(endpointId, jobId, { apiKey, maxWaitMs, pollMs, label, cancelOnTimeout }) {
  const startTime = Date.now();
  const deadline = startTime + maxWaitMs;
  let lastStatus = '';
  let pollFailures = 0;
  let lastHeartbeatLog = startTime;

  while (Date.now() < deadline) {
    await sleep(pollMs);

    let data;
    try {
      const res = await axios.get(`${RUNPOD_BASE}/${endpointId}/status/${jobId}`, {
        headers: authHeaders(apiKey),
        timeout: 30000,
      });
      data = res.data;
      pollFailures = 0;
    } catch (err) {
      pollFailures++;
      // Transient 404 or network hiccup while RunPod spins up pods
      if (pollFailures % 6 === 1) {
        console.warn(`[${label}] polling ${jobId} (${err?.response?.status || err?.message}) — waiting for GPU worker...`);
      }
      continue;
    }

    const status = String(data?.status || '').toUpperCase();
    if (status && status !== lastStatus) {
      lastStatus = status;
      console.log(`[${label}] job ${jobId} ${status}${formatTimings(data)}`);
    } else if (Date.now() - lastHeartbeatLog > 30000) {
      // Log periodic status every 30s while queued or in progress
      lastHeartbeatLog = Date.now();
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[${label}] job ${jobId} ${status || 'QUEUED'} — waiting for GPU worker (${elapsed}s elapsed)...`);
    }

    if (status === 'COMPLETED') {
      const delay = Math.round((data.delayTime || 0) / 1000);
      const exec = Math.round((data.executionTime || 0) / 1000);
      console.log(`[${label}] job ${jobId} COMPLETED — queue/worker startup ${delay}s, execution ${exec}s. Downloading output...`);
      return unwrapOutput(data.output, { label, jobId });
    }

    if (TERMINAL_FAIL.includes(status)) {
      throw new RunpodError(`[${label}] job ${jobId} ${status}: ${describeFailure(data)}`, {
        retryable: status !== 'FAILED',
        status,
        jobId,
      });
    }
  }

  if (cancelOnTimeout) await cancelJob(endpointId, jobId, { apiKey, label });
  throw new RunpodError(
    `[${label}] job ${jobId} exceeded ${Math.round(maxWaitMs / 1000)}s `
    + `(last status ${lastStatus || 'unknown'})`,
    { retryable: true, status: 'TIMED_OUT', jobId },
  );
}

/** POST /v2/{id}/cancel/{jobId}. Never throws — cancelling is best-effort. */
export async function cancelJob(endpointId, jobId, { apiKey, label = 'runpod' } = {}) {
  try {
    await axios.post(`${RUNPOD_BASE}/${endpointId}/cancel/${jobId}`, {}, {
      headers: authHeaders(apiKey),
      timeout: 20000,
    });
    console.warn(`[${label}] cancelled job ${jobId} so it stops holding a worker`);
    return true;
  } catch (err) {
    console.warn(`[${label}] could not cancel job ${jobId}: ${err?.message}`);
    return false;
  }
}

/**
 * Both handlers answer { status: 'success' | 'error', ... }. An 'error' body
 * arrives inside a COMPLETED job, so it has to be raised here or the caller
 * would treat a failure as a result.
 */
function unwrapOutput(output, { label, jobId }) {
  if (output == null) {
    throw new RunpodError(`[${label}] job ${jobId} completed with an empty output`, {
      retryable: true,
      jobId,
    });
  }

  const body = Array.isArray(output) ? output[0] : output;

  if (body && typeof body === 'object' && body.status === 'error') {
    throw new RunpodError(
      `[${label}] job ${jobId} handler error: ${body.error || 'unknown'}`
      + `${body.message ? ` — ${body.message}` : ''}`,
      { retryable: Boolean(body.retryable), status: 'HANDLER_ERROR', jobId },
    );
  }

  return body;
}

function formatTimings(data) {
  const parts = [];
  if (data?.delayTime != null) parts.push(`delay=${Math.round(data.delayTime / 1000)}s`);
  if (data?.executionTime != null) parts.push(`exec=${Math.round(data.executionTime / 1000)}s`);
  return parts.length ? ` (${parts.join(' ')})` : '';
}

function describeHttpError(err) {
  const code = err?.response?.status;
  const body = err?.response?.data;
  const detail = typeof body === 'string'
    ? body.slice(0, 300)
    : JSON.stringify(body || {}).slice(0, 300);
  const hint = code === 401 ? ' (this key does not own the endpoint)'
    : code === 404 ? ' (endpoint id not found on this account)'
    : code === 429 ? ' (rate limited)'
    : '';
  return `HTTP ${code ?? '?'}${hint} ${detail || err?.message || ''}`.trim();
}

function describeFailure(data) {
  const out = data?.output;
  if (out && typeof out === 'object' && (out.error || out.message)) {
    return `${out.error || ''}${out.message ? ` — ${out.message}` : ''}`.trim().slice(0, 400);
  }
  if (typeof data?.error === 'string') return data.error.slice(0, 400);
  return JSON.stringify(data?.error ?? data ?? {}).slice(0, 400);
}

// Bare base64 has no scheme to match on, so it is detected by shape.
const BASE64_SHAPE = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

/** http(s) URL, data: URL, or a long bare base64 payload. */
export function looksLikeMedia(value) {
  if (typeof value !== 'string' || value.length < 8) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith('data:')) return true;
  return value.length > 256 && BASE64_SHAPE.test(value.slice(0, 512));
}

/**
 * First usable media value in a handler output, searched by key.
 *
 * Unlike the generic providers this replaces, bare base64 counts as media:
 * both handlers fall back to base64 delivery whenever S3 is unconfigured, and
 * a URL-only test silently drops the result.
 */
export function findMedia(output, keys = []) {
  if (output == null) return null;
  if (typeof output === 'string') return looksLikeMedia(output) ? output : null;

  if (Array.isArray(output)) {
    for (const item of output) {
      const hit = findMedia(item, keys);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof output !== 'object') return null;

  for (const key of keys) {
    const val = output[key];
    if (typeof val === 'string' && looksLikeMedia(val)) return val;
    if (Array.isArray(val)) {
      const hit = findMedia(val, keys);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Write a URL / data-URL / bare-base64 payload to disk.
 *
 * @returns {Promise<number>} bytes written
 */
export async function saveMedia(media, outputPath, { timeoutMs = 300000 } = {}) {
  if (!media) throw new RunpodError(`nothing to save to ${outputPath}`);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  if (/^https?:\/\//i.test(media)) {
    const res = await axios.get(media, { responseType: 'stream', timeout: timeoutMs });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      res.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      res.data.on('error', reject);
    });
  } else {
    const base64 = media.startsWith('data:') ? media.slice(media.indexOf(',') + 1) : media;
    await fs.promises.writeFile(outputPath, Buffer.from(base64, 'base64'));
  }

  const { size } = await fs.promises.stat(outputPath);
  if (!size) throw new RunpodError(`wrote 0 bytes to ${outputPath}`, { retryable: true });
  return size;
}

/** Read a local image and return it as a data: URL. */
export async function encodeImageFile(imagePath) {
  const buffer = await fs.promises.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Normalise a conditioning-image reference for a handler payload: data: URLs
 * pass through directly; https:// URLs are ALWAYS downloaded and re-encoded as
 * base64 because Runpod workers cannot reach private R2/S3 buckets (even with
 * a presigned URL — the network route is blocked). Local paths are read off disk.
 */
export async function toImagePayload(ref) {
  if (!ref) return null;

  // data: URL — already embedded, pass through
  if (ref.startsWith('data:')) return ref;

  // https:// URL — download now and convert to base64.
  // NEVER pass an R2/S3 presigned URL raw to Runpod: the worker network cannot
  // reach the private bucket so the download would 403 and the edit would silently
  // fall through to text-to-image.
  if (/^https?:\/\//i.test(ref)) {
    try {
      console.log(`[toImagePayload] Downloading reference image: ${ref.slice(0, 80)}...`);
      const response = await axios.get(ref, { responseType: 'arraybuffer', timeout: 90000 });
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const mime = contentType.split(';')[0].trim() || 'image/jpeg';
      const b64 = Buffer.from(response.data).toString('base64');
      const sizeKb = Math.round(b64.length * 0.75 / 1024);
      console.log(
        `[toImagePayload] ✅ Downloaded and encoded ${sizeKb} KB reference image `
        + `(${mime}) from: ${ref.slice(0, 60)} → base64 data URI ready for Runpod`,
      );
      return `data:${mime};base64,${b64}`;
    } catch (err) {
      console.error(
        `[toImagePayload] ❌ Failed to download reference image: ${err.message} `
        + `(URL: ${ref.slice(0, 80)})`,
      );
      return null;
    }
  }

  // Local file path — read and encode
  return encodeImageFile(ref);
}

export default {
  RUNPOD_BASE,
  RunpodError,
  runpodApiKey,
  hasRunpod,
  health,
  runJob,
  cancelJob,
  findMedia,
  looksLikeMedia,
  saveMedia,
  encodeImageFile,
  toImagePayload,
  sleep,
};
