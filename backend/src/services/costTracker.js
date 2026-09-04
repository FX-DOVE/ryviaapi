/**
 * Per-job infrastructure cost tracker.
 *
 * Records GPU + LLM line items internally, then settles billed amount
 * (infra × 1.25) against the workspace wallet. Markup is never returned
 * from public APIs.
 */

import { AsyncLocalStorage } from 'async_hooks';
import Job from '../models/Job.js';
import JobCost from '../models/JobCost.js';
import {
  applyMarkup,
  gpuCostUsdFromMs,
  llmCostUsdFromChars,
  usdToCents,
  centsToUsd,
  roundUsd,
  FALLBACK_INFRA_USD,
} from '../config/billing.js';
import { recordTransaction, getDerivedBalance } from './ledgerService.js';

const jobCostContext = new AsyncLocalStorage();

export function getJobBillingContext() {
  return jobCostContext.getStore() || null;
}

export async function runWithJobBilling(jobId, fn) {
  const job = await Job.findById(jobId).select('workspaceId userId').lean();
  const store = {
    jobId: String(jobId),
    workspaceId: job?.workspaceId ? String(job.workspaceId) : '',
    userId: job?.userId ? String(job.userId) : '',
  };
  return jobCostContext.run(store, fn);
}

async function ensureJobCost(jobId, workspaceId) {
  const filter = { jobId };
  const update = {
    $setOnInsert: {
      jobId,
      workspaceId,
      gpuTimeSec: 0,
      gpuCostUsd: 0,
      apiCostUsd: 0,
      storageCost: 0,
      totalCostUsd: 0,
      infraUsdCents: 0,
      markupUsdCents: 0,
      billedUsdCents: 0,
      settled: false,
      lineItems: [],
    },
  };
  return JobCost.findOneAndUpdate(filter, update, { upsert: true, new: true });
}

export async function recordLineItem({
  jobId,
  workspaceId,
  kind,
  label,
  infraUsd,
  meta = {},
}) {
  const ctx = getJobBillingContext();
  const resolvedJobId = jobId || ctx?.jobId;
  const resolvedWorkspaceId = workspaceId || ctx?.workspaceId;
  if (!resolvedJobId || !resolvedWorkspaceId) return null;

  const amount = roundUsd(Math.max(0, Number(infraUsd) || 0));
  if (amount <= 0) return null;

  const doc = await ensureJobCost(resolvedJobId, resolvedWorkspaceId);
  const cents = usdToCents(amount);

  const gpuKinds = ['gpu_image', 'gpu_edit', 'gpu_video'];
  const llmKinds = ['llm_script', 'llm_direct', 'llm_vision', 'llm_generic'];

  const $inc = { infraUsdCents: cents };
  if (gpuKinds.includes(kind)) {
    $inc.gpuCostUsd = amount;
    if (meta.executionTimeMs) $inc.gpuTimeSec = Math.round(meta.executionTimeMs / 1000);
  } else if (llmKinds.includes(kind)) {
    $inc.apiCostUsd = amount;
  } else if (kind === 'storage' || kind === 'render') {
    $inc.storageCost = amount;
  }

  await JobCost.updateOne(
    { _id: doc._id },
    {
      $inc,
      $push: {
        lineItems: {
          kind,
          label: label || kind,
          infraUsdCents: cents,
          meta,
          at: new Date(),
        },
      },
    },
  );

  return amount;
}

export async function recordRunpodCall({ label = 'runpod', executionTimeMs = 0, delayTimeMs = 0, endpointId = '' } = {}) {
  const ctx = getJobBillingContext();
  if (!ctx?.jobId) return;

  const ltxId = process.env.RUNPOD_LTX_ENDPOINT_ID || '';
  const editId = process.env.RUNPOD_QWEN_EDIT_ENDPOINT_ID || '';
  const isVideo = label.includes('ltx') || (ltxId && endpointId === ltxId);
  const isEdit = label.includes('edit') || (editId && endpointId === editId);
  const kind = isVideo ? 'gpu_video' : isEdit ? 'gpu_edit' : 'gpu_image';
  const gpuKind = isVideo ? 'video' : isEdit ? 'edit' : 'image';

  const infraUsd = gpuCostUsdFromMs(executionTimeMs, gpuKind);
  await recordLineItem({
    kind,
    label,
    infraUsd,
    meta: { executionTimeMs, delayTimeMs, endpointId },
  });
}

export async function recordLlmCall({ purpose = 'generation', charCount = 0, provider = '' } = {}) {
  const ctx = getJobBillingContext();
  if (!ctx?.jobId) return;

  const p = String(purpose || '');
  const kind = p.includes('direct')
    ? 'llm_direct'
    : p.includes('vision') || p.includes('character')
      ? 'llm_vision'
      : p.includes('script')
        ? 'llm_script'
        : 'llm_generic';

  await recordLineItem({
    kind,
    label: `${provider || 'llm'}:${purpose}`,
    infraUsd: llmCostUsdFromChars(charCount, purpose),
    meta: { purpose, charCount, provider },
  });
}

export async function recordFallbackCall(kind, label) {
  const infraUsd = FALLBACK_INFRA_USD[kind] || FALLBACK_INFRA_USD.llm_generic;
  return recordLineItem({ kind, label, infraUsd });
}

/**
 * Sum infrastructure, apply hidden markup, deduct billed amount from wallet.
 * Idempotent via JobCost.settled.
 */
export async function settleJobBilling(jobId) {
  const job = await Job.findById(jobId);
  if (!job) return null;

  const cost = await ensureJobCost(jobId, job.workspaceId);
  if (cost.settled) {
    return {
      billedUsd: centsToUsd(cost.billedUsdCents),
      alreadySettled: true,
    };
  }

  // Floor so a completed film always charges something if tracking missed calls.
  const infraUsd = Math.max(
    centsToUsd(cost.infraUsdCents),
    FALLBACK_INFRA_USD.render,
  );
  const { billedUsd, markupUsd } = applyMarkup(infraUsd);
  const billedCents = usdToCents(billedUsd);

  const balance = await getDerivedBalance(job.workspaceId);
  const deductCents = Math.min(billedCents, Math.max(0, balance));

  if (deductCents > 0) {
    await recordTransaction({
      workspaceId: job.workspaceId,
      userId: job.userId,
      type: 'deduction',
      credits: deductCents,
      reason: `Production charge · ${job.title || 'Untitled'}`,
      jobId: job._id,
    });
  }

  cost.gpuCostUsd = roundUsd(cost.gpuCostUsd);
  cost.apiCostUsd = roundUsd(cost.apiCostUsd);
  cost.storageCost = roundUsd(cost.storageCost);
  cost.infraUsdCents = usdToCents(infraUsd);
  cost.markupUsdCents = usdToCents(markupUsd);
  cost.billedUsdCents = billedCents;
  cost.totalCostUsd = billedUsd;
  cost.settled = true;
  await cost.save();

  job.actualCost = billedUsd;
  job.creditCost = billedUsd;
  job.analytics = {
    ...(job.analytics || {}),
    gpuTimeMs: (cost.gpuTimeSec || 0) * 1000,
    costCredits: billedUsd,
  };
  await job.save();

  return { billedUsd, alreadySettled: false };
}

export function publicCostView(job, costDoc) {
  const estimated = roundUsd(job?.estimatedCost || 0);
  const charged = roundUsd(
    costDoc?.settled
      ? centsToUsd(costDoc.billedUsdCents)
      : (job?.actualCost || 0),
  );
  return {
    estimatedUsd: estimated,
    chargedUsd: charged,
  };
}

export default {
  runWithJobBilling,
  getJobBillingContext,
  recordLineItem,
  recordRunpodCall,
  recordLlmCall,
  settleJobBilling,
  publicCostView,
};
