import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

// Request Interceptor: Attach access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Redirect on session expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register') && !window.location.pathname.includes('/verify-email')) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

function withAuthToken(url) {
  const token = localStorage.getItem('accessToken');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

// ─── JOBS ─────────────────────────────────────────────────────────────────
export const createJob = (formData) =>
  api.post('/jobs', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const getHistory = (params = {}) =>
  api.get('/jobs', { params });

export const getJobDetail = (id)  => api.get(`/jobs/${id}`);
export const getJobStatus  = (id) => api.get(`/jobs/${id}/status`);
export const getJobLogs    = (id) => api.get(`/jobs/${id}/logs`);
export const getJobScenes  = (id) => api.get(`/jobs/${id}/scenes`);
export const deleteJob     = (id) => api.delete(`/jobs/${id}`);
export const stopJob       = (id) => api.post(`/jobs/${id}/stop`);
export const resumeJob     = (id) => api.post(`/jobs/${id}/resume`);
export const retryJob      = (id) => api.post(`/jobs/${id}/retry`);
export const retryScene    = (id, sceneId) => api.post(`/jobs/${id}/scenes/${sceneId}/retry`);

export const regenerateCharacterLock = (jobId, characterName) =>
  api.post(`/jobs/${jobId}/characters/${encodeURIComponent(characterName)}/regenerate`);

export const regenerateEnvironmentLock = (jobId, locationId) =>
  api.post(`/jobs/${jobId}/environments/${encodeURIComponent(locationId)}/regenerate`);

export const getVideoStreamUrl    = (id) => withAuthToken(`/api/jobs/${id}/stream`);
export const getThumbnailUrl      = (id) => withAuthToken(`/api/jobs/${id}/thumbnail`);
export const getSceneImageUrl     = (jobId, sceneId) => withAuthToken(`/api/jobs/${jobId}/scenes/${sceneId}/image`);
export const getSceneVideoUrl     = (jobId, sceneId) => withAuthToken(`/api/jobs/${jobId}/scenes/${sceneId}/video`);
export const getCharacterLockImageUrl = (jobId, charName) =>
  withAuthToken(`/api/jobs/${jobId}/characters/${encodeURIComponent(charName)}/image`);
export const getEnvironmentLockImageUrl = (jobId, locId) =>
  withAuthToken(`/api/jobs/${jobId}/environments/${encodeURIComponent(locId)}/image`);

// ─── USER ─────────────────────────────────────────────────────────────────
export const getMe = () => api.get('/users/me');

// ─── SYSTEM ───────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/system/health');

export default api;
