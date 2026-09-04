import api from './jobs.js';

export const getWallet = () => api.get('/billing/wallet');
export const getLedger = (params = {}) => api.get('/billing/ledger', { params });
export const estimateProduction = (data) => api.post('/billing/estimate', data);
export const initializeTopup = (data) => api.post('/billing/initialize', data);
export const verifyTopup = (reference) => api.get('/billing/verify', { params: { reference } });
export const getJobCost = (id) => api.get(`/billing/jobs/${id}/cost`);

export function formatUsd(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function isInsufficientFunds(err) {
  return err?.response?.status === 402 || err?.response?.data?.code === 'INSUFFICIENT_FUNDS';
}

export function fundsError(err) {
  const data = err?.response?.data || {};
  return {
    requiredUsd: data.requiredUsd || 0,
    balanceUsd: data.balanceUsd || 0,
    shortfallUsd: data.shortfallUsd || 0,
    message: data.error || 'Fund your account to continue.',
  };
}
