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
- [x] **YouTube Proxy System for Age-Restricted Videos** (NEW - Feb 21, 2026)

#### Frontend
- [x] Home page with hero section and featured channels
- [x] Browse page with search and category filters
- [x] Watch page with YouTube/uploaded video player
- [x] **24-Hour TV Guide Feature** - Classic TV Guide style schedule page
- [x] **Admin Dashboard with full management**
- [x] **YouTube Settings Page** - Manage cookies for age-restricted content (NEW)
- [x] **Live TV page with synchronized playback**
- [x] **Auto-proxy fallback** - Automatically uses proxy for age-restricted videos (NEW)
- [x] Embeddable player for single channel
- [x] Embeddable network player
- [x] Top navigation bar on all pages

#### YouTube Age-Restriction Bypass (Feb 21, 2026)
- [x] **Backend proxy using yt-dlp** - Fetches direct video URLs for age-restricted content
- [x] **Cookie management** - Admin can upload YouTube cookies in Netscape format
- [x] **Auto-detection** - Frontend detects when video fails and tries proxy fallback
- [x] **Stream redirection** - Backend provides direct video stream URLs
- [x] **Test endpoint** - Check if any video is age-restricted before playback
- [x] **YouTube Settings UI** - Dedicated admin page for managing cookies

#### Video Health Check (Feb 21, 2026)
- [x] **Quick Check** - Sample videos from each channel for fast status overview
- [x] **Full Health Check** - Scan all videos across all channels  
- [x] **Detailed Results** - Shows playable, age-restricted, and unavailable counts
- [x] **Per-Channel Summary** - Breakdown of issues by channel
- [x] **Video Lists** - Expandable lists of problematic videos with YouTube links
- [x] **Cookie Status Integration** - Shows if age-restricted videos can be played

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
- GET /api/channels - List all public channels
- GET /api/channels/featured - Get featured channels
- GET /api/channels/my - Get admin's channels
- GET /api/channels/:id - Get channel by ID
- POST /api/channels - Create channel
- PUT /api/channels/:id - Update channel
- DELETE /api/channels/:id - Delete channel
- PUT /api/channels/reorder - Reorder channels (admin)

### Videos
- POST /api/channels/:id/videos - Add video to channel
- DELETE /api/channels/:id/videos/:videoId - Remove video
- PUT /api/channels/:id/videos/reorder - Reorder videos

### YouTube Proxy (NEW)
- GET /api/youtube/check/:videoId - Check if video is playable/age-restricted
- GET /api/youtube/stream/:videoId - Get direct stream URL (redirects)
- GET /api/youtube/stream-info/:videoId - Get stream URL info
- POST /api/youtube/cookies - Upload cookies file (admin)
- GET /api/youtube/cookies/status - Check cookies status (admin)
- DELETE /api/youtube/cookies - Delete cookies (admin)

### Upload
- POST /api/upload/video - Upload video file (MP4, max 2GB)
- GET /api/upload/videos - List uploaded videos
- DELETE /api/upload/video/:id - Delete uploaded video

### Schedule
- GET /api/schedule/live - Get 24-hour schedules for all channels
- GET /api/schedule/channel/:id - Get schedule for specific channel
- POST /api/schedule/regenerate/:id - Regenerate schedule with random order

## Admin Credentials
- Email: hushmusicent419@gmail.com
- Password: $Stisdd419

## Prioritized Backlog

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

## Recent Changes (Feb 21, 2026)

### YouTube Age-Restriction Bypass System (LATEST)
- **Backend Proxy**: Added yt-dlp integration to fetch direct video URLs
- **Cookie Management**: Admin can upload YouTube cookies to enable age-restricted playback
- **Auto-Fallback**: When a video fails to play in iframe, system automatically tries proxy
- **YouTube Settings Page**: New admin page at `/youtube-settings` for cookie management
- **Dashboard Integration**: "YT Cookies" button added to admin dashboard

### How It Works:
1. Videos first try to play via YouTube embed (normal flow)
2. If video fails (error 150/101 = age-restricted or embed-blocked), system tries proxy
3. Proxy uses yt-dlp with uploaded cookies to get direct video URL
4. Video plays via HTML5 video player instead of YouTube iframe
5. "Proxy Mode" badge indicates when proxy is being used

### How to Configure:
1. Go to Dashboard → YT Cookies button
2. Export cookies from logged-in YouTube account (using browser extension)
3. Upload the cookies.txt file
4. Test with an age-restricted video ID
5. Age-restricted videos will now play automatically

## Data Migration (Feb 16, 2026)
- Migrated all channels and videos from broadcaster.emergent.host
- **22 Channels** total
- **1361 Videos** total

## Testing
- Backend API endpoints verified via curl
- Frontend features tested via screenshot automation
- All core features working as expected
