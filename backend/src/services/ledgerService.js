import mongoose from 'mongoose';
import CreditLedger from '../models/CreditLedger.js';
import Workspace from '../models/Workspace.js';

/**
 * Record a new credit transaction in the ledger.
 * Reconciles the workspace's cached balance in the database.
 */
export async function recordTransaction({
  workspaceId,
  userId,
  type,
  credits,
  reason,
  jobId = null,
  adminNotes = ''
}) {
  const transaction = new CreditLedger({
    workspaceId,
    userId,
    type,
    credits: Math.abs(credits),
    reason,
    jobId,
    adminNotes
  });
  await transaction.save();

  // Reconcile and cache balance
  const balance = await reconcileWorkspaceBalance(workspaceId);
  return { transaction, balance };
}

/**
 * Sums all ledger transactions to calculate the real balance.
 */
export async function getDerivedBalance(workspaceId) {
  const wsObjectId = typeof workspaceId === 'string' ? new mongoose.Types.ObjectId(workspaceId) : workspaceId;

  const stats = await CreditLedger.aggregate([
    { $match: { workspaceId: wsObjectId } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [
              { $in: ['$type', ['addition', 'refund']] },
              '$credits',
              { $multiply: ['$credits', -1] }
            ]
          }
        }
      }
    }
  ]);

  return stats[0]?.total || 0;
}

/**
 * Recalculates the ledger sum and updates the cached credits count on the Workspace document.
 */
export async function reconcileWorkspaceBalance(workspaceId) {
  const derived = await getDerivedBalance(workspaceId);
  await Workspace.findByIdAndUpdate(workspaceId, { credits: derived });
  return derived;
}

/**
 * Retrieves the paginated transaction ledger audit history for a workspace.
 */
export async function getAuditLogs(workspaceId, limit = 50, page = 1) {
  const wsObjectId = typeof workspaceId === 'string' ? new mongoose.Types.ObjectId(workspaceId) : workspaceId;

  const [logs, total] = await Promise.all([
    CreditLedger.find({ workspaceId: wsObjectId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('userId', 'name email')
      .lean(),
    CreditLedger.countDocuments({ workspaceId: wsObjectId })
  ]);

  return { logs, total, page, limit };
}

export default {
  recordTransaction,
  getDerivedBalance,
  reconcileWorkspaceBalance,
  getAuditLogs
};
