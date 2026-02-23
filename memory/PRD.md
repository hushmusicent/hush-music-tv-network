# Hush Music TV Network - Product Requirements Document

## Original Problem Statement
Build a TV network app like Strimm for Hush Music TV Network with:
- Admin-only system (single admin user)
- YouTube videos as content source
- Local video file uploads (MP4, max 2GB)
- Custom channels with scheduled programming
- 24/7 continuous playback with live sync
- Multiple channels with different themes/genres
- Guest viewing + admin account for management
- Dark theme (Netflix-style)
- TV guide, scheduling, channel categories
- Embeddable players for channels and full network
- Random play option for channels (shuffle video order)
- Dynamic "Live Schedule" mode for any channel

## User Personas
1. **Admin/Content Curator**: The single administrator who manages all channels, uploads videos, and controls content
2. **Casual Viewer**: Browses and watches channels without an account

## Core Requirements

### Implemented Features

#### Backend
- [x] User auth (admin-only login, JWT tokens)
- [x] Channel management (CRUD, videos, schedule)
- [x] Categories with counts (10 categories)
- [x] Favorites system
- [x] TV Guide API
- [x] Video upload endpoint (MP4 only, max 2GB)
- [x] Uploaded videos management (list, delete)
- [x] Static file serving for uploaded videos
- [x] Seed data with sample channels
- [x] Random Play feature - channels can play videos in shuffled order
- [x] **YouTube Proxy System for Age-Restricted Videos**
- [x] **Dynamic Use Schedule Flag** - Any channel can be switched to synchronized 24-hour schedule mode

#### Frontend
- [x] Home page with hero section and featured channels
- [x] Browse page with search and category filters
- [x] Watch page with YouTube/uploaded video player
- [x] **24-Hour TV Guide Feature** - Classic TV Guide style schedule page
- [x] **Admin Dashboard with full management**
- [x] **YouTube Settings Page** - Manage cookies for age-restricted content
- [x] **Live TV page with synchronized playback**
- [x] **Auto-proxy fallback** - Automatically uses proxy for age-restricted videos
- [x] **Progressive Web App (PWA)** - Installable app with offline support
- [x] Embeddable player for single channel
- [x] Embeddable network player
- [x] Top navigation bar on all pages
- [x] **Dynamic "Live Schedule" Toggle** - Admin can enable/disable synchronized schedule per channel

#### Dynamic Use Schedule Feature (Feb 23, 2026) - COMPLETED
- [x] **Backend API**: `use_schedule` boolean field on channel model
- [x] **PUT /api/channels/{id}**: Saves use_schedule flag to database
- [x] **GET /api/schedule/live**: Returns use_schedule flag for each channel
- [x] **Dashboard Toggle**: "Live Schedule" switch in channel edit form
- [x] **Dashboard Badge**: "LIVE" badge shows for channels with use_schedule=true
- [x] **Live TV Indicator**: Shows "LIVE" (red) for scheduled channels, "PLAYING" (green) for non-scheduled

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn UI components
- **Backend**: FastAPI with MongoDB
- **Authentication**: JWT-based auth (admin-only)
- **Video Playback**: YouTube iframe embeds + HTML5 video for uploads/proxy
- **File Storage**: Local uploads directory with static file serving
- **Age-Restriction Bypass**: yt-dlp with cookie authentication

## API Endpoints

### Auth
- POST /api/auth/login - Admin login
- GET /api/auth/me - Get current user

### Channels
- GET /api/channels - List all public channels (includes use_schedule)
- GET /api/channels/featured - Get featured channels
- GET /api/channels/my - Get admin's channels
- GET /api/channels/:id - Get channel by ID
- POST /api/channels - Create channel (with use_schedule support)
- PUT /api/channels/:id - Update channel (toggle use_schedule)
- DELETE /api/channels/:id - Delete channel
- PUT /api/channels/reorder - Reorder channels (admin)

### Videos
- POST /api/channels/:id/videos - Add video to channel
- DELETE /api/channels/:id/videos/:videoId - Remove video
- PUT /api/channels/:id/videos/reorder - Reorder videos

### YouTube Proxy
- GET /api/youtube/check/:videoId - Check if video is playable/age-restricted
- GET /api/youtube/stream/:videoId - Get direct stream URL (redirects)
- GET /api/youtube/stream-info/:videoId - Get stream URL info
- POST /api/youtube/cookies - Upload cookies file (admin)
- GET /api/youtube/cookies/status - Check cookies status (admin)
- DELETE /api/youtube/cookies - Delete cookies (admin)
- GET /api/youtube/bulk-check - Full health check all videos (admin)
- GET /api/youtube/quick-check - Quick sample check (admin)

### Upload
- POST /api/upload/video - Upload video file (MP4, max 2GB)
- GET /api/upload/videos - List uploaded videos
- DELETE /api/upload/video/:id - Delete uploaded video

### Schedule
- GET /api/schedule/live - Get 24-hour schedules for all channels (includes use_schedule)
- GET /api/schedule/channel/:id - Get schedule for specific channel
- POST /api/schedule/regenerate/:id - Regenerate schedule with random order

## Admin Credentials
- Email: hushmusicent419@gmail.com
- Password: $Stisdd419

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] **Dynamic "Use Schedule" Toggle** - Allow any channel to switch to synchronized 24-hour schedule mode

### P1 (High Priority)
- [ ] Embedding feature - Allow embedding channels/network on external sites
- [ ] Analytics Page - Viewer statistics dashboard

### P2 (Medium Priority)
- [ ] Video Reordering - Drag-and-drop to reorder videos within a channel
- [ ] Advanced scheduling with calendar
- [ ] Social sharing features

### P3 (Nice to Have)
- [ ] Chat/comments on channels
- [ ] Channel subscriptions/notifications
- [ ] Mobile app version

## Recent Changes

### Dynamic "Use Schedule" Feature (Feb 23, 2026) - LATEST
- **Backend**: Added `use_schedule` boolean field to channel model (defaults to false)
- **Backend**: Channel creation now includes use_schedule field
- **Backend**: PUT /api/channels/{id} correctly saves use_schedule flag
- **Backend**: GET /api/schedule/live returns use_schedule for each channel
- **Frontend Dashboard**: Added "Live Schedule" toggle in channel edit form
- **Frontend Dashboard**: Shows "LIVE" badge for channels with use_schedule=true
- **Frontend LiveTV**: Fixed variable shadowing bug (isScheduledChannel -> isCurrentChannelScheduled)
- **Frontend LiveTV**: Shows "LIVE" indicator (red) for scheduled channels
- **Frontend LiveTV**: Shows "PLAYING" indicator (green) for non-scheduled channels

### How It Works:
1. Admin opens Dashboard and expands a channel
2. Clicks Edit to open the edit form
3. Toggles the "Live Schedule" switch ON
4. Clicks Save - the use_schedule flag is saved to database
5. Channel now shows "LIVE" badge in Dashboard
6. On Live TV page, that channel shows "LIVE" indicator instead of "PLAYING"
7. All viewers of that channel are synchronized to the same schedule

## Data Stats
- **22 Channels** total
- **2070+ Videos** total
- **"Hush Music Radio"** has use_schedule=true (synchronized 24-hour schedule)

## Testing
- Backend API endpoints verified via curl and pytest
- Frontend features tested via Playwright automation
- All "Use Schedule" feature tests passed (100% success rate)

## Files Modified for Use Schedule Feature
- `/app/backend/server.py` - Added use_schedule to channel model and creation
- `/app/frontend/src/pages/Dashboard.jsx` - Added Live Schedule toggle
- `/app/frontend/src/pages/LiveTV.jsx` - Fixed badge display logic
