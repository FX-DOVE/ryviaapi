import mongoose from 'mongoose';
import { getSystemHealth } from '../services/healthService.js';
import { getFleetMetrics, getFleetHealth } from '../services/gpuManager.js';
import { getRedisClient } from '../config/redis.js';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Job from '../models/Job.js';
import Screenplay from '../models/Screenplay.js';
import Project from '../models/Project.js';
import CreditLedger from '../models/CreditLedger.js';
import Coupon from '../models/Coupon.js';
import { recordTransaction } from '../services/ledgerService.js';
import { usdToCents, roundUsd } from '../config/billing.js';
import { sendAdminBulkEmail } from '../services/emailService.js';

export async function getHealth(req, res, next) {
  try {
    const health = await getSystemHealth();
    const fleet = await getFleetHealth();
    res.json({
      ...health,
      ...fleet
    });
  } catch (err) {
    next(err);
  }
}

export async function getMetrics(req, res, next) {
  try {
    const metrics = await getFleetMetrics();
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req, res, next) {
  try {
    const { limit = 50, page = 1, workspaceId } = req.query;
    let query = {};

    if (req.user.role === 'admin') {
      if (workspaceId) {
        query.workspaceId = workspaceId;
      }
    } else {
      const targetWs = workspaceId || req.workspaceId;
      if (!targetWs) {
        return res.status(400).json({ error: 'Workspace identifier required' });
      }
      query.workspaceId = targetWs;
    }

    let [logs, total] = await Promise.all([
      CreditLedger.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('userId', 'name email')
        .lean(),
      CreditLedger.countDocuments(query)
    ]);

    // If no transactions exist yet, surface opening balances without inventing free credits.
    if (total === 0) {
      const workspaces = await Workspace.find().populate('ownerId', 'name email').lean();
      for (const ws of workspaces) {
        if (ws.ownerId && (ws.credits || 0) > 0) {
          const entry = new CreditLedger({
            workspaceId: ws._id,
            userId: ws.ownerId._id,
            type: 'addition',
            credits: ws.credits || 0,
            reason: `Opening balance (${ws.name})`,
            createdAt: ws.createdAt || new Date()
          });
          await entry.save();
        }
      }
      [logs, total] = await Promise.all([
        CreditLedger.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(Number(limit))
          .populate('userId', 'name email')
          .lean(),
        CreditLedger.countDocuments(query)
      ]);
    }

    res.json({ logs, total, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function getStats(req, res, next) {
  try {
    const [activeUsers, totalJobs, failedJobs, totalScreenplays, totalProjects] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments(),
      Job.countDocuments({
        status: 'failed',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      Screenplay.countDocuments(),
      Project.countDocuments()
    ]);

    const workspaces = await Workspace.find({}, 'billingPlan credits');
    let mrr = 0;
    for (const ws of workspaces) {
      if (ws.billingPlan === 'pro') mrr += 49;
      else if (ws.billingPlan === 'enterprise') mrr += 499;
      else if (ws.billingPlan === 'starter' || ws.billingPlan === 'creator') mrr += 29;
    }

    const cumulativeProductions = Math.max(totalJobs, totalProjects, totalScreenplays);

    res.json({
      activeUsers,
      totalJobs: cumulativeProductions,
      failedJobs,
      revenue: `$${mrr.toLocaleString()}`
    });
  } catch (err) {
    next(err);
  }
}

export async function getUsers(req, res, next) {
  try {
    const users = await User.find({}, 'name email role createdAt activeWorkspaceId').sort({ createdAt: -1 }).lean();
    const workspaces = await Workspace.find({}, '_id name ownerId billingPlan credits').lean();
    const wsMap = new Map();
    for (const ws of workspaces) {
      wsMap.set(String(ws._id), ws);
    }

    const usersWithDetails = users.map(u => ({
      ...u,
      workspaceName: wsMap.get(String(u.activeWorkspaceId))?.name || 'Studio Workspace',
      billingPlan: wsMap.get(String(u.activeWorkspaceId))?.billingPlan || 'free',
      credits: wsMap.get(String(u.activeWorkspaceId))?.credits ?? 0,
    }));

    res.json({ users: usersWithDetails });
  } catch (err) {
    next(err);
  }
}

export async function promoteToAdmin(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ error: `User with email ${email} not found` });
    }
    user.role = 'admin';
    await user.save();
    res.json({ success: true, message: `Successfully promoted ${email} to admin.` });
  } catch (err) {
    next(err);
  }
}

export async function demoteUser(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ error: `User with email ${email} not found` });
    }
    user.role = 'user';
    await user.save();
    res.json({ success: true, message: `Successfully updated ${email} role to user.` });
  } catch (err) {
    next(err);
  }
}

export async function grantCredits(req, res, next) {
  try {
    const { email, userId, allUsers = false, amountUsd, reason } = req.body || {};
    const amount = roundUsd(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amountUsd must be a positive number' });
    }
    const creditCents = usdToCents(amount);
    const note = reason || 'Admin credit grant';

    let targets = [];
    if (allUsers) {
      targets = await User.find({ activeWorkspaceId: { $ne: null } }).select('_id email name activeWorkspaceId');
    } else if (userId) {
      const u = await User.findById(userId).select('_id email name activeWorkspaceId');
      if (!u) return res.status(404).json({ error: 'User not found' });
      targets = [u];
    } else if (email) {
      const u = await User.findOne({ email: String(email).toLowerCase().trim() }).select('_id email name activeWorkspaceId');
      if (!u) return res.status(404).json({ error: `User with email ${email} not found` });
      targets = [u];
    } else {
      return res.status(400).json({ error: 'Provide email, userId, or allUsers: true' });
    }

    const results = [];
    for (const user of targets) {
      if (!user.activeWorkspaceId) {
        results.push({ userId: user._id, email: user.email, skipped: true, reason: 'no_workspace' });
        continue;
      }
      await recordTransaction({
        workspaceId: user.activeWorkspaceId,
        userId: user._id,
        type: 'addition',
        credits: creditCents,
        reason: note,
        adminNotes: `Granted by ${req.user.email}`,
      });
      results.push({ userId: user._id, email: user.email, creditedUsd: amount });
    }

    res.json({
      success: true,
      grantedUsd: amount,
      count: results.filter((r) => !r.skipped).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function sendBulkEmail(req, res, next) {
  try {
    const { subject, html, text, userIds } = req.body || {};
    if (!subject || (!html && !text)) {
      return res.status(400).json({ error: 'subject and html or text are required' });
    }

    let users;
    if (Array.isArray(userIds) && userIds.length > 0) {
      users = await User.find({ _id: { $in: userIds } }).select('email name');
    } else {
      users = await User.find({}).select('email name');
    }

    const results = await sendAdminBulkEmail({ subject, html, text, users });
    const sent = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    res.json({
      success: true,
      recipients: users.length,
      sent,
      skipped,
    });
  } catch (err) {
    next(err);
  }
}

export async function createCoupon(req, res, next) {
  try {
    const {
      code,
      percentOff,
      fixedCreditCents,
      fixedCreditUsd,
      maxRedemptions,
      expiresAt,
      active = true,
    } = req.body || {};

    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }

    let cents = fixedCreditCents != null ? Number(fixedCreditCents) : null;
    if ((cents == null || !Number.isFinite(cents)) && fixedCreditUsd != null) {
      cents = usdToCents(fixedCreditUsd);
    }
    const pct = percentOff != null ? Number(percentOff) : null;

    if ((pct == null || !Number.isFinite(pct)) && (cents == null || !Number.isFinite(cents) || cents <= 0)) {
      return res.status(400).json({ error: 'Provide percentOff or fixedCreditUsd / fixedCreditCents' });
    }

    const coupon = await Coupon.create({
      code: String(code).trim().toUpperCase(),
      percentOff: pct != null && Number.isFinite(pct) ? pct : null,
      fixedCreditCents: cents != null && Number.isFinite(cents) && cents > 0 ? Math.round(cents) : null,
      maxRedemptions: maxRedemptions != null ? Number(maxRedemptions) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      active: Boolean(active),
      createdBy: req.user._id,
    });

    res.status(201).json({ coupon });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }
    next(err);
  }
}

export async function listCoupons(req, res, next) {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
    res.json({ coupons });
  } catch (err) {
    next(err);
  }
}

export async function disableCoupon(req, res, next) {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    coupon.active = false;
    await coupon.save();
    res.json({ success: true, coupon });
  } catch (err) {
    next(err);
  }
}

export async function getReady(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    const redisClient = getRedisClient();
    const isRedisConnected = redisClient.status === 'ready';

    if (isDbConnected && isRedisConnected) {
      res.json({ status: 'ready', database: 'connected', redis: 'connected' });
    } else {
      res.status(503).json({
        status: 'unready',
        database: isDbConnected ? 'connected' : 'disconnected',
        redis: isRedisConnected ? 'connected' : 'disconnected'
      });
    }
  } catch (err) {
    res.status(503).json({ status: 'unready', error: err.message });
  }
}

export function getLive(req, res) {
  res.json({ live: true, status: 'alive', ts: Date.now() });
}

export function getVersion(req, res) {
  res.json({ version: '2.0.0', stage: 'production-enterprise' });
}

export default {
  getHealth, getMetrics, getLedger, getStats, getUsers,
  promoteToAdmin, demoteUser, grantCredits, sendBulkEmail,
  createCoupon, listCoupons, disableCoupon,
  getReady, getLive, getVersion,
};
