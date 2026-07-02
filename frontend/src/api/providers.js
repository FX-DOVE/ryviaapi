import api from './jobs.js'; // reuse the same configured axios instance

// ─── PROVIDERS ────────────────────────────────────────────────────────────────

/** List all providers (built-in + custom), keys masked. */
export const getProviders = () => api.get('/providers');

/**
 * Add a new custom provider.
 * Backend will test-connect first — rejects with 400 if the test fails.
 * @param {{ name: string, endpoint: string, apiKey: string, model: string }} data
 */
export const createProvider = (data) => api.post('/providers', data);

/**
 * Trigger a live connection test for an existing provider.
 * @returns {{ connected: boolean, error: string }}
 */
export const testProvider = (id) => api.post(`/providers/${id}/test`);

/**
 * Bulk-update the priority order.
 * @param {Array<{ id: string, priority: number }>} items
 */
export const reorderProviders = (items) => api.put('/providers/reorder', items);

/**
 * Toggle enabled, update name, model, or API key for an existing provider.
 * @param {string} id
 * @param {{ enabled?: boolean, name?: string, model?: string, apiKey?: string }} updates
 */
export const updateProvider = (id, updates) => api.patch(`/providers/${id}`, updates);

/** Delete a custom provider (built-ins are rejected by the backend). */
export const deleteProvider = (id) => api.delete(`/providers/${id}`);
