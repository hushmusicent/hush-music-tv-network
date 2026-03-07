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
  reorder: (channelIds) => api.put('/channels/reorder', { channel_ids: channelIds }),
  
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
  recordView: (channelId, viewerId, videoId, videoTitle, eventType = 'view') => 
    api.post('/analytics/view', { channel_id: channelId, viewer_id: viewerId, video_id: videoId, video_title: videoTitle, event_type: eventType }),
  getStats: () => api.get('/analytics/stats'),
  getChannelStats: (channelId) => api.get(`/analytics/channel/${channelId}`),
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
  
  // Update video durations from YouTube (batch)
  updateDurations: () => api.post('/videos/update-durations', null, { timeout: 300000 }),
  
  // Update a single video's duration (from frontend when video plays)
  updateSingleDuration: (channelId, youtubeId, duration) => 
    api.post(`/videos/update-duration?channel_id=${channelId}&youtube_id=${youtubeId}&duration=${duration}`),
  
  // Regenerate all schedules (use after updating durations)
  regenerateSchedules: () => api.post('/schedules/regenerate-all'),
  
  // Update durations for all uploaded (R2) videos using ffprobe
  updateUploadedDurations: () => api.post('/channels/update-all-uploaded-durations', null, { timeout: 300000 }),
  
  // Health check - fast categorization of all video playability
  healthCheck: (channelId) => api.post(`/youtube/health-check${channelId ? `?channel_id=${channelId}` : ''}`, null, { timeout: 300000 }),
};

// YouTube Proxy API (for age-restricted videos)
export const youtubeProxyAPI = {
  // Check if a video is playable and if it needs proxy
  checkVideo: (youtubeId) => api.get(`/youtube/check/${youtubeId}`),
  
  // Get stream URL (returns direct video URL)
  getStreamUrl: (youtubeId) => `${BACKEND_URL}/api/youtube/stream/${youtubeId}`,
  
  // Get stream info (URL + metadata)
  getStreamInfo: (youtubeId) => api.get(`/youtube/stream-info/${youtubeId}`),
  
  // Upload cookies file (admin only)
  uploadCookies: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/youtube/cookies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  // Get cookies status (admin only)
  getCookiesStatus: () => api.get('/youtube/cookies/status'),
  
  // Delete cookies (admin only)
  deleteCookies: () => api.delete('/youtube/cookies'),
  
  // Bulk check all videos (admin only) - can take a while
  bulkCheck: () => api.get('/youtube/bulk-check', { timeout: 300000 }), // 5 min timeout
  
  // Quick check sample videos (admin only)
  quickCheck: (sampleSize = 10) => api.get(`/youtube/quick-check?sample_size=${sampleSize}`),
};

export default api;
