import Workspace from '../models/Workspace.js';
import {
  centsToUsd,
  usdToCents,
  roundUsd,
  estimateBilledUsd,
  estimateScreenplayBilledUsd,
  InsufficientFundsError,
} from '../config/billing.js';
import { getDerivedBalance, reconcileWorkspaceBalance } from './ledgerService.js';

export async function getWallet(workspaceId) {
  if (!workspaceId) {
    return { balanceCents: 0, balanceUsd: 0 };
  }
  const CreditLedger = (await import('../models/CreditLedger.js')).default;
  const ledgerCount = await CreditLedger.countDocuments({ workspaceId });
  let cents;
  if (ledgerCount === 0) {
    const ws = await Workspace.findById(workspaceId).select('credits').lean();
    cents = ws?.credits || 0;
  } else {
    cents = await getDerivedBalance(workspaceId);
  }
  return {
    balanceCents: cents,
    balanceUsd: centsToUsd(cents),
  };
}

export async function assertCanAfford(workspaceId, requiredUsd, action = 'production') {
  const required = roundUsd(requiredUsd);
  const { balanceUsd, balanceCents } = await getWallet(workspaceId);
  if (usdToCents(required) > balanceCents) {
    throw new InsufficientFundsError({ requiredUsd: required, balanceUsd, action });
  }
  return { requiredUsd: required, balanceUsd };
}

export function estimateJobBilledUsdFromInput({
  targetDurationMinutes,
  sceneCount,
  characterCount,
  environmentCount,
  hasScriptStep,
} = {}) {
  return estimateBilledUsd({
    targetDurationMinutes,
    sceneCount,
    characterCount,
    environmentCount,
    hasScriptStep,
  });
}

export { estimateScreenplayBilledUsd };

export async function reserveEstimateOnJob(job, estimatedUsd) {
  const billed = roundUsd(estimatedUsd);
  job.estimatedCost = billed;
  await job.save();
  return billed;
}

export default {
  getWallet,
  assertCanAfford,
  estimateJobBilledUsdFromInput,
  estimateScreenplayBilledUsd,
  reserveEstimateOnJob,
};
