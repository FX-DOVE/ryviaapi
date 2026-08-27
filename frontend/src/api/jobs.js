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
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);


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

export const getVideoStreamUrl    = (id) => `/api/jobs/${id}/stream`;
export const getThumbnailUrl      = (id) => `/api/jobs/${id}/thumbnail`;
export const getSceneImageUrl     = (jobId, sceneId) => `/api/jobs/${jobId}/scenes/${sceneId}/image`;
export const getSceneVideoUrl     = (jobId, sceneId) => `/api/jobs/${jobId}/scenes/${sceneId}/video`;
export const getCharacterLockImageUrl = (jobId, charName) => `/api/jobs/${jobId}/characters/${encodeURIComponent(charName)}/image`;
export const getEnvironmentLockImageUrl = (jobId, locId) => `/api/jobs/${jobId}/environments/${encodeURIComponent(locId)}/image`;

// ─── USER ─────────────────────────────────────────────────────────────────
export const getMe = () => api.get('/users/me');

// ─── SYSTEM ───────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/system/health');

export default api;
