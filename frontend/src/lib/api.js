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
  uploadVideo: async (file, onProgress) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // Try chunked upload for files > 8MB, single upload for smaller files
    if (file.size > 8 * 1024 * 1024) {
      try {
        // Step 1: Initialize chunked upload
        const initResp = await api.post('/upload/video/init-chunked', null, {
          params: { filename: file.name, total_size: file.size, total_chunks: totalChunks }
        });
        const { upload_id } = initResp.data;
        
        // Step 2: Upload chunks with retry logic
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          
          const formData = new FormData();
          formData.append('upload_id', upload_id);
          formData.append('chunk_index', i.toString());
          formData.append('file', chunk, `chunk_${i}`);
          
          // Retry up to 3 times per chunk
          let retries = 0;
          const maxRetries = 3;
          while (retries < maxRetries) {
            try {
              await api.post('/upload/video/chunk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 120000, // 2 minutes per chunk
              });
              break; // Success, exit retry loop
            } catch (chunkErr) {
              retries++;
              if (retries >= maxRetries) {
                throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${maxRetries} attempts`);
              }
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
          }
          
          if (onProgress) {
            const percent = Math.round(((i + 1) / totalChunks) * 90);
            onProgress(percent);
          }
        }
        
        // Step 3: Complete - assemble and store
        if (onProgress) onProgress(95);
        const completeResp = await api.post('/upload/video/complete-chunked', null, {
          params: { upload_id, filename: file.name, total_chunks: totalChunks },
          timeout: 600000, // 10 minutes for assembly and R2 upload
        });
        
        if (onProgress) onProgress(100);
        return completeResp;
      } catch (err) {
        console.error('Chunked upload failed:', err.message);
        throw err; // Don't fall back - throw the error
      }
    }
    
    // Single-request upload (for small files only)
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
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
