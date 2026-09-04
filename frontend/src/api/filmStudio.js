import api from './jobs.js'; // reuse the same axios instance

const BASE = '/v1';

export const filmCharactersApi = {
  list: (params = {}) =>
    api.get(`${BASE}/film-characters`, { params }),

  get: (id) =>
    api.get(`${BASE}/film-characters/${id}`),

  create: (data) =>
    api.post(`${BASE}/film-characters`, data),

  update: (id, data) =>
    api.patch(`${BASE}/film-characters/${id}`, data),

  delete: (id) =>
    api.delete(`${BASE}/film-characters/${id}`),

  uploadReferenceImage: (id, formData) =>
    api.post(`${BASE}/film-characters/${id}/reference-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export const screenplaysApi = {
  list: (params = {}) =>
    api.get(`${BASE}/screenplays`, { params }),

  get: (id) =>
    api.get(`${BASE}/screenplays/${id}`),

  getScenes: (id, page = 1, limit = 50) =>
    api.get(`${BASE}/screenplays/${id}/scenes`, { params: { page, limit } }),

  generate: (data) =>
    api.post(`${BASE}/screenplays/generate`, data),

  researchExpand: (data) =>
    api.post(`${BASE}/screenplays/research-expand`, data),

  /** Description-mode A/B/C concept cards.
   *  Body: { title, synopsis, videoType|genre }
   *  → { options: [{ id, title, tone, logline, lookSummary, motifs[], expandedSynopsis?, lookBible?, suggestedCharacters? }] }
   */
  conceptOptions: (data) =>
    api.post(`${BASE}/screenplays/concept-options`, data),

  updateScene: (id, sceneNumber, data) =>
    api.patch(`${BASE}/screenplays/${id}/scenes/${sceneNumber}`, data),

  produce: (id, data = {}) =>
    api.post(`${BASE}/screenplays/${id}/produce`, data),

  regenerate: (id) =>
    api.post(`${BASE}/screenplays/${id}/regenerate`, {}),

  patch: (id, data) =>
    api.patch(`${BASE}/screenplays/${id}`, data),

  delete: (id) =>
    api.delete(`${BASE}/screenplays/${id}`),
};
