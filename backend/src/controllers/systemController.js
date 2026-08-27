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
    
    // For admins, retrieve ALL logs if workspaceId is not specified
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

    // If no transactions exist yet, auto-populate initial workspace allocations for visibility
    if (total === 0) {
      const workspaces = await Workspace.find().populate('ownerId', 'name email').lean();
      for (const ws of workspaces) {
        if (ws.ownerId) {
          const entry = new CreditLedger({
            workspaceId: ws._id,
            userId: ws.ownerId._id,
            type: 'addition',
            credits: ws.credits || 1000,
            reason: `Initial Workspace Grant (${ws.name})`,
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

    // Cumulative productions count (jobs + projects + screenplays)
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
      credits: wsMap.get(String(u.activeWorkspaceId))?.credits ?? 1000,
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

export default { getHealth, getMetrics, getLedger, getStats, getUsers, promoteToAdmin, demoteUser, getReady, getLive, getVersion };
