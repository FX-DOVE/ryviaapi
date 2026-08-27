import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/clips'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const clipsApi = {
  getClips: (projectId, params) => api.get(`/project/${projectId}`, { params }).then(res => res.data),
  getClip: (id) => api.get(`/${id}`).then(res => res.data),
  updateClip: (id, updates) => api.patch(`/${id}`, updates).then(res => res.data),
  deleteClip: (id) => api.delete(`/${id}`).then(res => res.data),

  // AI-Assisted Actions
  generatePrompts: (id, promptInput) => api.post(`/${id}/generate-prompts`, { input: promptInput }).then(res => res.data),

  // Approval Workflow
  approveClip: (id) => api.post(`/${id}/approve`).then(res => res.data),
  approveScene: (sceneId) => api.post(`/scene/${sceneId}/approve`).then(res => res.data),

  // Regenerate Specific Asset
  regenerateImage: (id) => api.post(`/${id}/regenerate-image`).then(res => res.data),
  regenerateVideo: (id) => api.post(`/${id}/regenerate-video`).then(res => res.data),
};
