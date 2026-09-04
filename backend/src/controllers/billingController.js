import crypto from 'crypto';
import Payment from '../models/Payment.js';
import Job from '../models/Job.js';
import JobCost from '../models/JobCost.js';
import {
  CREDIT_PACKAGES,
  MIN_CREDIT_USD,
  MAX_CREDIT_USD,
  chargeUsdForCredit,
  creditFromPaymentUsd,
  usdToCents,
  roundUsd,
} from '../config/billing.js';
import { recordTransaction, getAuditLogs } from '../services/ledgerService.js';
import { getWallet, estimateJobBilledUsdFromInput, estimateScreenplayBilledUsd } from '../services/walletService.js';
import { publicCostView } from '../services/costTracker.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

function paystackSecret() {
  return process.env.PAYSTACK_SECRET_KEY || '';
}

function paystackCurrency() {
  return (process.env.PAYSTACK_CURRENCY || 'NGN').toUpperCase();
}

function usdToProviderAmount(chargeUsd) {
  const currency = paystackCurrency();
  if (currency === 'USD') {
    return { currency, amount: usdToCents(chargeUsd) };
  }
  const rate = Number(process.env.PAYSTACK_USD_NGN_RATE) || 1600;
  return { currency: 'NGN', amount: Math.round(chargeUsd * rate * 100) };
}

function frontendUrl(req) {
  return process.env.FRONTEND_URL
    || req.headers.origin
    || 'https://app.reyvia.voiceforgeai.site';
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  const secret = paystackSecret();
  if (!secret) {
    const err = new Error('Paystack is not configured. Set PAYSTACK_SECRET_KEY.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || `Paystack request failed (${res.status})`);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    throw err;
  }
  return data;
}

function publicPackages() {
  return CREDIT_PACKAGES.map((p) => ({
    id: p.id,
    label: p.label,
    creditUsd: p.creditUsd,
    chargeUsd: chargeUsdForCredit(p.creditUsd),
    popular: p.popular,
  }));
}

export async function getWalletSummary(req, res, next) {
  try {
    const wallet = await getWallet(req.workspaceId);
    res.json({
      balanceUsd: wallet.balanceUsd,
      currency: 'USD',
      packages: publicPackages(),
      minCreditUsd: MIN_CREDIT_USD,
      maxCreditUsd: MAX_CREDIT_USD,
    });
  } catch (err) {
    next(err);
  }
}

export async function getLedger(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const { logs, total } = await getAuditLogs(req.workspaceId, limit, page);
    res.json({
      logs: logs.map((log) => ({
        _id: log._id,
        type: log.type,
        amountUsd: roundUsd((log.credits || 0) / 100),
        reason: log.reason,
        jobId: log.jobId,
        createdAt: log.createdAt,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
}

export async function estimateProduction(req, res, next) {
  try {
    const {
      targetDurationMinutes,
      sceneCount,
      characterCount,
      environmentCount,
      hasScriptStep,
      kind = 'production',
    } = req.body || {};

    const estimatedUsd = kind === 'screenplay'
      ? estimateScreenplayBilledUsd(targetDurationMinutes)
      : estimateJobBilledUsdFromInput({
        targetDurationMinutes,
        sceneCount,
        characterCount,
        environmentCount,
        hasScriptStep,
      });

    const wallet = await getWallet(req.workspaceId);
    res.json({
      estimatedUsd,
      balanceUsd: wallet.balanceUsd,
      canAfford: wallet.balanceUsd + 1e-9 >= estimatedUsd,
      shortfallUsd: roundUsd(Math.max(0, estimatedUsd - wallet.balanceUsd)),
    });
  } catch (err) {
    next(err);
  }
}

export async function initializeTopup(req, res, next) {
  try {
    const { packageId, creditUsd: rawCredit } = req.body || {};
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    let creditUsd = pkg ? pkg.creditUsd : Number(rawCredit);

    if (!Number.isFinite(creditUsd) || creditUsd < MIN_CREDIT_USD) {
      return res.status(400).json({ error: `Minimum top-up is $${MIN_CREDIT_USD}` });
    }
    if (creditUsd > MAX_CREDIT_USD) {
      return res.status(400).json({ error: `Maximum top-up is $${MAX_CREDIT_USD}` });
    }
    creditUsd = roundUsd(creditUsd);
    const chargeUsd = chargeUsdForCredit(creditUsd);
    const { currency, amount } = usdToProviderAmount(chargeUsd);

    const reference = `rv_${req.workspaceId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const callbackUrl = `${frontendUrl(req).replace(/\/+$/, '')}/app/billing?reference=${encodeURIComponent(reference)}`;

    const init = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: {
        email: req.user.email,
        amount,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          workspaceId: String(req.workspaceId),
          userId: String(req.user._id),
          creditUsd,
          chargeUsd,
        },
      },
    });

    const payment = await Payment.create({
      workspaceId: req.workspaceId,
      userId: req.user._id,
      reference,
      paystackReference: init.data?.reference || reference,
      status: 'initialized',
      chargeUsd,
      creditUsd,
      currency,
      providerAmount: amount,
      authorizationUrl: init.data?.authorization_url || '',
    });

    res.json({
      authorizationUrl: payment.authorizationUrl,
      reference: payment.reference,
      chargeUsd,
      creditUsd,
      accessCode: init.data?.access_code || null,
    });
  } catch (err) {
    next(err);
  }
}

async function creditPaymentIfNeeded(payment, raw = null) {
  if (payment.status === 'success') {
    const wallet = await getWallet(payment.workspaceId);
    return { alreadyCredited: true, balanceUsd: wallet.balanceUsd, creditUsd: payment.creditUsd };
  }

  const creditUsd = roundUsd(payment.creditUsd || creditFromPaymentUsd(payment.chargeUsd));
  await recordTransaction({
    workspaceId: payment.workspaceId,
    userId: payment.userId,
    type: 'addition',
    credits: usdToCents(creditUsd),
    reason: `Account top-up`,
    adminNotes: `Paystack ${payment.reference}`,
  });

  payment.status = 'success';
  payment.creditUsd = creditUsd;
  payment.paidAt = new Date();
  if (raw) payment.raw = raw;
  await payment.save();

  const wallet = await getWallet(payment.workspaceId);
  return { alreadyCredited: false, balanceUsd: wallet.balanceUsd, creditUsd };
}

export async function verifyTopup(req, res, next) {
  try {
    const reference = req.query.reference || req.body?.reference;
    if (!reference) return res.status(400).json({ error: 'Payment reference is required' });

    const payment = await Payment.findOne({
      $or: [{ reference }, { paystackReference: reference }],
      workspaceId: req.workspaceId,
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const verified = await paystackFetch(`/transaction/verify/${encodeURIComponent(payment.paystackReference || payment.reference)}`);
    const data = verified.data || {};
    if (String(data.status).toLowerCase() !== 'success') {
      payment.status = data.status === 'failed' ? 'failed' : 'abandoned';
      payment.raw = data;
      await payment.save();
      return res.status(400).json({ error: 'Payment was not successful', status: data.status });
    }

    const result = await creditPaymentIfNeeded(payment, data);
    res.json({
      status: 'success',
      creditUsd: result.creditUsd,
      balanceUsd: result.balanceUsd,
    });
  } catch (err) {
    next(err);
  }
}

export async function paystackWebhook(req, res) {
  try {
    const secret = paystackSecret();
    if (!secret) return res.status(503).send('unconfigured');

    const signature = req.headers['x-paystack-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    if (!signature || hash !== signature) {
      return res.status(401).send('invalid signature');
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    if (event.event !== 'charge.success') {
      return res.status(200).json({ received: true });
    }

    const data = event.data || {};
    const reference = data.reference;
    const payment = await Payment.findOne({
      $or: [{ reference }, { paystackReference: reference }],
    });
    if (!payment) {
      return res.status(200).json({ received: true, ignored: true });
    }

    await creditPaymentIfNeeded(payment, data);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Paystack webhook]', err.message);
    return res.status(200).json({ received: true });
  }
}

export async function getJobCostPublic(req, res, next) {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user._id });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const cost = await JobCost.findOne({ jobId: job._id }).lean();
    res.json(publicCostView(job, cost));
  } catch (err) {
    next(err);
  }
}

export default {
  getWalletSummary,
  getLedger,
  estimateProduction,
  initializeTopup,
  verifyTopup,
  paystackWebhook,
  getJobCostPublic,
};
