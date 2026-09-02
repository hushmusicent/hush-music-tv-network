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

// Handle auth errors and network timeouts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle auth errors
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    
    // Handle Cloudflare timeout (524) and other network errors
    if (error.response?.status === 524) {
      error.message = 'Request timed out. The file may be too large or the server is busy. Please try again.';
    } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.message = 'Request timed out. Please try again with a smaller file or check your connection.';
    } else if (!error.response && error.message === 'Network Error') {
      error.message = 'Network error. Please check your connection and try again.';
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
  // Direct R2 upload for large files (500MB+) - bypasses Cloudflare proxy
  uploadVideoDirect: async (file, onProgress) => {
    try {
      // Step 1: Get presigned URL
      if (onProgress) onProgress(5);
      const urlResp = await api.post('/upload/video/get-presigned-url', null, {
        params: { filename: file.name, file_size: file.size },
        timeout: 30000,
      });
      
      const { video_id, upload_url, public_url } = urlResp.data;
      console.log('Got presigned URL for direct upload:', video_id);
      
      // Step 2: Upload directly to R2 (bypasses Cloudflare proxy)
      if (onProgress) onProgress(10);
      
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'video/mp4',
        },
      }).then(response => {
        if (!response.ok) {
          throw new Error(`Direct upload failed: ${response.status} ${response.statusText}`);
        }
      });
      
      if (onProgress) onProgress(90);
      
      // Step 3: Register the video in database
      const registerResp = await api.post('/upload/video/register-direct', {
        video_id,
        filename: file.name,
        public_url,
        file_size: file.size,
        duration: 0, // Duration will be extracted later or manually set
      });
      
      if (onProgress) onProgress(100);
      return registerResp;
    } catch (err) {
      console.error('Direct upload failed:', err);
      throw err;
    }
  },

  uploadVideo: async (file, onProgress) => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // For very large files (500MB+), use direct R2 upload
    if (file.size > 500 * 1024 * 1024) {
      console.log('Large file detected, using direct R2 upload...');
      return uploadAPI.uploadVideoDirect(file, onProgress);
    }
    
    // Regular chunked upload for files 8MB - 500MB
    if (file.size > 8 * 1024 * 1024) {
      try {
        // Step 1: Initialize chunked upload
        const initResp = await api.post('/upload/video/init-chunked', null, {
          params: { filename: file.name, total_size: file.size, total_chunks: totalChunks },
          timeout: 30000, // 30 second timeout for init
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
          
          // Retry up to 5 times per chunk with exponential backoff
          let retries = 0;
          const maxRetries = 5;
          let lastError = null;
          
          while (retries < maxRetries) {
            try {
              await api.post('/upload/video/chunk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 180000, // 3 minutes per chunk
              });
              break; // Success, exit retry loop
            } catch (chunkErr) {
              lastError = chunkErr;
              retries++;
              console.log(`Chunk ${i + 1}/${totalChunks} failed (attempt ${retries}/${maxRetries}):`, chunkErr.message);
              
              if (retries >= maxRetries) {
                const errorMsg = lastError?.response?.data?.detail || lastError?.message || 'Unknown error';
                throw new Error(`Failed to upload chunk ${i + 1}/${totalChunks} after ${maxRetries} attempts: ${errorMsg}`);
              }
              // Exponential backoff: 2s, 4s, 8s, 16s
              await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retries - 1)));
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
// Uses `/track/*` paths (ad-blocker safe). Backend also aliases `/analytics/*`.
export const analyticsAPI = {
  recordView: (channelId, viewerId, videoId, videoTitle, eventType = 'view', demographics = {}) => 
    api.post('/track/view', { 
      channel_id: channelId, 
      viewer_id: viewerId, 
      video_id: videoId, 
      video_title: videoTitle, 
      event_type: eventType,
      ...demographics
    }).catch((err) => {
      // Log but don't throw — analytics failures shouldn't break playback
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] recordView failed:', err?.message || err);
      }
    }),
  recordCommercial: (commercialId, channelId, viewerId, eventType = 'play', demographics = {}) =>
    api.post('/track/commercial', {
      commercial_id: commercialId,
      channel_id: channelId,
      viewer_id: viewerId,
      event_type: eventType,
      ...demographics
    }).catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] recordCommercial failed:', err?.message || err);
      }
    }),
  getStats: () => api.get('/analytics/stats'),
  getCommercialStats: () => api.get('/analytics/commercials'),
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
