import api from './jobs.js';

export const getEditor = (jobId) => api.get(`/jobs/${jobId}/editor`);
export const saveEditor = (jobId, timeline) => api.put(`/jobs/${jobId}/editor`, { timeline });
export const bootstrapEditor = (jobId) => api.post(`/jobs/${jobId}/editor/bootstrap`);
export const exportEditor = (jobId, timeline) => api.post(`/jobs/${jobId}/editor/export`, { timeline });
export const uploadEditorAudio = (jobId, file) => {
  const fd = new FormData();
  fd.append('audio', file);
  return api.post(`/jobs/${jobId}/editor/audio`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const getEditorStreamUrl = (jobId) => `/api/jobs/${jobId}/editor/stream`;

export default {
  getEditor,
  saveEditor,
  bootstrapEditor,
  exportEditor,
  uploadEditorAudio,
  getEditorStreamUrl,
};
