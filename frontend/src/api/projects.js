import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

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

// Projects
export const listProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Workspace Characters
export const getCharacters = () => api.get('/projects/workspace/characters');
export const addCharacter = (formData) => api.post('/projects/workspace/characters', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const updateCharacter = (charId, formData) => api.put(`/projects/workspace/characters/${charId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const deleteCharacter = (charId) => api.delete(`/projects/workspace/characters/${charId}`);

// Workspace Environments
export const getEnvironments = () => api.get('/projects/workspace/environments');
export const addEnvironment = (formData) => api.post('/projects/workspace/environments', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const updateEnvironment = (envId, formData) => api.put(`/projects/workspace/environments/${envId}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const deleteEnvironment = (envId) => api.delete(`/projects/workspace/environments/${envId}`);

// Creative Profiles
export const getCreativeProfiles = () => api.get('/projects/workspace/creative-profiles');
export const createCreativeProfile = (data) => api.post('/projects/workspace/creative-profiles', data);
export const updateCreativeProfile = (id, data) => api.put(`/projects/workspace/creative-profiles/${id}`, data);
export const deleteCreativeProfile = (id) => api.delete(`/projects/workspace/creative-profiles/${id}`);

// Brand Kits
export const getBrandKits = () => api.get('/projects/workspace/brand-kits');
export const createBrandKit = (formData) => api.post('/projects/workspace/brand-kits', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const updateBrandKit = (id, formData) => api.put(`/projects/workspace/brand-kits/${id}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const deleteBrandKit = (id) => api.delete(`/projects/workspace/brand-kits/${id}`);

// Project reference images pool & director notes
export const uploadReferences = (id, formData) => api.post(`/projects/${id}/references`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const deleteReference = (id, key) => api.delete(`/projects/${id}/references/${encodeURIComponent(key)}`);
export const updateDirectorNotes = (jobId, notes) => api.put(`/projects/${jobId}/director-notes`, notes);
export const applyStyleToJob = (jobId, style) => api.post(`/projects/${jobId}/apply-style`, style);

export default {
  listProjects, getProject, createProject, updateProject, deleteProject,
  getCharacters, addCharacter, updateCharacter, deleteCharacter,
  getEnvironments, addEnvironment, updateEnvironment, deleteEnvironment,
  getCreativeProfiles, createCreativeProfile, updateCreativeProfile, deleteCreativeProfile,
  getBrandKits, createBrandKit, updateBrandKit, deleteBrandKit,
  uploadReferences, deleteReference, updateDirectorNotes, applyStyleToJob
};
