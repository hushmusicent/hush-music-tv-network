import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// Channels API
export const channelsAPI = {
  getAll: (params) => api.get('/channels', { params }),
  getFeatured: () => api.get('/channels/featured'),
  getMy: () => api.get('/channels/my'),
  getById: (id) => api.get(`/channels/${id}`),
  create: (data) => api.post('/channels', data),
  update: (id, data) => api.put(`/channels/${id}`, data),
  delete: (id) => api.delete(`/channels/${id}`),
  
  // Videos
  addVideo: (channelId, data) => api.post(`/channels/${channelId}/videos`, data),
  removeVideo: (channelId, videoId) => api.delete(`/channels/${channelId}/videos/${videoId}`),
  updateVideo: (channelId, videoId, data) => api.put(`/channels/${channelId}/videos/${videoId}`, data),
  reorderVideos: (channelId, videoIds) => api.put(`/channels/${channelId}/videos/reorder`, videoIds),
  
  // Schedule
  addSchedule: (channelId, data) => api.post(`/channels/${channelId}/schedule`, data),
  removeSchedule: (channelId, slotId) => api.delete(`/channels/${channelId}/schedule/${slotId}`),
};

// Favorites API
export const favoritesAPI = {
  getAll: () => api.get('/favorites'),
  add: (channelId) => api.post(`/favorites/${channelId}`),
  remove: (channelId) => api.delete(`/favorites/${channelId}`),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get('/categories'),
};

// TV Guide API
export const tvGuideAPI = {
  get: () => api.get('/tv-guide'),
};

// Seed data
export const seedAPI = {
  seed: () => api.post('/seed'),
};

// Video Upload API
export const uploadAPI = {
  uploadVideo: (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return api.post('/upload/video', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },
  listVideos: () => api.get('/upload/videos'),
  deleteVideo: (videoId) => api.delete(`/upload/video/${videoId}`),
  updateDuration: (videoId, duration) => api.put(`/upload/video/${videoId}/duration`, null, { params: { duration } }),
  
  // Image upload
  uploadImage: (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return api.post('/upload/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },
  listImages: () => api.get('/upload/images'),
  deleteImage: (imageId) => api.delete(`/upload/image/${imageId}`),
};

// Analytics API
export const analyticsAPI = {
  recordView: (channelId, viewerId) => api.post('/analytics/view', { channel_id: channelId, viewer_id: viewerId }),
  getStats: () => api.get('/analytics/stats'),
};

// Video Cleanup API
export const videoCleanupAPI = {
  // Auto-delete a video by YouTube ID (called when video fails to play)
  deleteByYoutubeId: (youtubeId, channelId) => 
    api.post('/videos/delete-by-youtube-id', { youtube_id: youtubeId, channel_id: channelId }),
  
  // Get list of auto-deleted videos
  getDeletedVideos: () => api.get('/videos/deleted'),
  
  // Clear deleted videos log
  clearDeletedLog: () => api.delete('/videos/deleted/clear'),
  
  // Check status of all videos (without deleting)
  checkStatus: () => api.get('/videos/check-status'),
  
  // Run cleanup - delete all unplayable videos
  runCleanup: () => api.post('/videos/cleanup'),
};

export default api;
