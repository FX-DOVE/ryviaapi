/**
 * Internal billing constants.
 *
 * Wallet is stored as USD cents on Workspace.credits.
 * Top-up: deposit is credited 1:1 (pay $100 → $100 studio balance).
 * Jobs: billed = (infra × (1 + MARKUP_RATE)) × BILLING_MULTIPLIER.
 * Markup and multiplier are never exposed in public cost APIs or UI copy.
 */

export const USD_CENTS = 100;

/** Fraction of a Paystack payment credited to the workspace (1.0 = full amount). */
export const TOPUP_CREDIT_RATIO = 1;

/** Hidden production markup applied to infrastructure cost after the job finishes. */
export const JOB_MARKUP_RATE = 0.25;

/** Hidden post-markup multiplier applied to the user deduction (never shown in UI). */
export const JOB_BILLING_MULTIPLIER = 2;

export const MIN_CREDIT_USD = 5;
export const MAX_CREDIT_USD = 5000;

export const CREDIT_PACKAGES = [
  { id: 'spark',   label: 'Spark',   creditUsd: 25,  popular: false },
  { id: 'studio',  label: 'Studio',  creditUsd: 50,  popular: true  },
  { id: 'stage',   label: 'Stage',   creditUsd: 100, popular: false },
  { id: 'lot',     label: 'Lot',     creditUsd: 250, popular: false },
];

/** Fallback per-call infrastructure USD when GPU timings are missing. */
export const FALLBACK_INFRA_USD = {
  llm_script:    0.04,
  llm_direct:    0.12,
  llm_vision:    0.03,
  llm_generic:   0.02,
  gpu_image:     0.05,
  gpu_edit:      0.04,
  gpu_video:     0.18,
  render:        0.02,
  storage:       0.01,
};

/**
 * Estimate billed USD (markup already included — this is what we show and reserve).
 */
export function estimateProductionInfraUsd({
  targetDurationMinutes = 3,
  sceneCount = 0,
  characterCount = 1,
  environmentCount = 2,
  hasScriptStep = false,
} = {}) {
  const minutes = Math.max(0.5, Number(targetDurationMinutes) || 3);
  const scenes = Math.max(1, Number(sceneCount) || Math.ceil(minutes * 6));
  const beats = scenes; // ~one 8s beat per scene in the short-form planner
  const chars = Math.max(0, Number(characterCount) || 0);
  const envs = Math.max(1, Number(environmentCount) || 2);

  let infra = 0;
  if (hasScriptStep) infra += FALLBACK_INFRA_USD.llm_script;
  infra += FALLBACK_INFRA_USD.llm_direct;
  infra += FALLBACK_INFRA_USD.llm_vision * Math.max(1, chars);
  infra += FALLBACK_INFRA_USD.gpu_edit * chars;
  infra += FALLBACK_INFRA_USD.gpu_image * envs;
  infra += FALLBACK_INFRA_USD.gpu_image * beats;
  infra += FALLBACK_INFRA_USD.gpu_video * beats;
  infra += FALLBACK_INFRA_USD.render;
  infra += FALLBACK_INFRA_USD.storage;
  return infra;
}

export function applyMarkup(infraUsd) {
  const infra = Math.max(0, Number(infraUsd) || 0);
  const afterMarkup = infra * (1 + JOB_MARKUP_RATE);
  const markupUsd = afterMarkup - infra;
  const billed = afterMarkup * JOB_BILLING_MULTIPLIER;
  return {
    infraUsd: roundUsd(infra),
    markupUsd: roundUsd(markupUsd),
    // Internal only — sum of markup dollars + multiplier uplift vs infra
    multiplierUsd: roundUsd(billed - afterMarkup),
    billedUsd: roundUsd(billed),
  };
}

export function estimateBilledUsd(params) {
  return applyMarkup(estimateProductionInfraUsd(params)).billedUsd;
}

export function estimateScreenplayBilledUsd(targetDurationMinutes = 3) {
  const minutes = Math.max(0.5, Number(targetDurationMinutes) || 3);
  const infra = FALLBACK_INFRA_USD.llm_script + FALLBACK_INFRA_USD.llm_direct * Math.min(4, minutes / 2);
  return applyMarkup(infra).billedUsd;
}

export function creditFromPaymentUsd(paidUsd) {
  return roundUsd(Math.max(0, Number(paidUsd) || 0) * TOPUP_CREDIT_RATIO);
}

export function chargeUsdForCredit(creditUsd) {
  return roundUsd(Math.max(0, Number(creditUsd) || 0) / TOPUP_CREDIT_RATIO);
}

export function usdToCents(usd) {
  return Math.round((Number(usd) || 0) * USD_CENTS);
}

export function centsToUsd(cents) {
  return roundUsd((Number(cents) || 0) / USD_CENTS);
}

export function roundUsd(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function gpuHourlyUsd(kind = 'image') {
  if (kind === 'video') {
    return Number(process.env.GPU_L40S_USD_PER_HOUR) || 1.39;
  }
  return Number(process.env.GPU_ADA48_USD_PER_HOUR) || 1.19;
}

export function gpuCostUsdFromMs(executionTimeMs, kind = 'image') {
  const ms = Math.max(0, Number(executionTimeMs) || 0);
  if (!ms) return FALLBACK_INFRA_USD[kind === 'video' ? 'gpu_video' : kind === 'edit' ? 'gpu_edit' : 'gpu_image'];
  return (ms / 3_600_000) * gpuHourlyUsd(kind);
}

export function llmCostUsdFromChars(charCount, purpose = 'generation') {
  const chars = Math.max(0, Number(charCount) || 0);
  const tokens = Math.max(400, chars / 4);
  const per1k = Number(process.env.LLM_USD_PER_1K_TOKENS) || 0.0004;
  const computed = (tokens / 1000) * per1k;
  const floor = purpose.includes('direct')
    ? FALLBACK_INFRA_USD.llm_direct * 0.25
    : purpose.includes('vision')
      ? FALLBACK_INFRA_USD.llm_vision * 0.25
      : FALLBACK_INFRA_USD.llm_generic * 0.25;
  return Math.max(floor, computed);
}

export class InsufficientFundsError extends Error {
  constructor({ requiredUsd, balanceUsd, action = 'production' } = {}) {
    const required = roundUsd(requiredUsd);
    const balance = roundUsd(balanceUsd);
    super('Insufficient studio balance. Fund your account to continue.');
    this.name = 'InsufficientFundsError';
    this.status = 402;
    this.code = 'INSUFFICIENT_FUNDS';
    this.payload = {
      requiredUsd: required,
      balanceUsd: balance,
      shortfallUsd: roundUsd(Math.max(0, required - balance)),
      action,
    };
  }
}

export default {
  TOPUP_CREDIT_RATIO,
  JOB_MARKUP_RATE,
  JOB_BILLING_MULTIPLIER,
  CREDIT_PACKAGES,
  estimateBilledUsd,
  applyMarkup,
  creditFromPaymentUsd,
  chargeUsdForCredit,
  usdToCents,
  centsToUsd,
  InsufficientFundsError,
};
