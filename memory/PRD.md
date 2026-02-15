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

### Implemented Features (Feb 14, 2026)

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
- [x] **Random Play feature** - channels can play videos in shuffled order

#### Frontend
- [x] Home page with hero section and featured channels
- [x] Browse page with search and category filters
- [x] Watch page with YouTube/uploaded video player
- [x] **TV Guide with dynamic schedule based on actual video durations**:
  - 24-hour timeline with videos positioned at correct start times
  - Supports random play channels (consistent shuffle across viewers)
  - "Now Playing" indicator matches Live TV page
  - "Now" button scrolls to current time position
- [x] **Admin Dashboard with full management**:
  - Stats overview (Channels, Videos, Viewers, Favorites)
  - Expandable channel list showing all videos
  - Inline editing (name, description, category, thumbnail, toggles)
  - **Thumbnail upload** - upload images from local drive for channel preview
  - **Random Play toggle** for shuffle mode
  - **SHUFFLE badge** on channels with random play enabled
  - Remove videos from channels
  - Copy embed codes per channel
- [x] **Channel Creator/Editor** with YouTube and Upload tabs
  - **Random Play toggle** with "Shuffle video order daily" description
- [x] Video upload UI with progress indicator
- [x] Favorites page
- [x] Admin-only Login page
- [x] **Home page** (visitor-facing):
  - Hero section with featured channel
  - "Watch Now" and "Live TV" buttons (no Create Channel for visitors)
  - Categories section
  - Featured channels grid
  - CTA section with "Watch Live TV" button
- [x] **Live TV page with synchronized playback**:
  - Channel sidebar with switching
  - **Shuffle icon** next to channel names with random play enabled
  - **Live sync** - calculates video position based on current time
  - **Seeded shuffle** - all viewers see same shuffled order on same day
  - All viewers see same content at same moment
  - Schedule bar showing current/upcoming with NOW indicator
  - Admin Panel sidebar (toggle with 'A' key or button)
  - Edit channel button in player overlay
  - Keyboard controls (↑↓ channels, M mute, G guide, A admin)
- [x] Embeddable player for single channel
- [x] Embeddable network player
- [x] Top navigation bar on all pages
- [x] Scrollbars on all pages

#### Video & Image Support
- [x] YouTube video embeds
- [x] Local MP4 file uploads (max 2GB)
- [x] VideoPlayer component handles both video types
- [x] Live sync for both YouTube and uploaded videos
- [x] **Image uploads** for channel thumbnails (JPEG, PNG, WebP, GIF - max 10MB)

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn UI components
- **Backend**: FastAPI with MongoDB
- **Authentication**: JWT-based auth (admin-only)
- **Video Playback**: YouTube iframe embeds + HTML5 video for uploads
- **File Storage**: Local uploads directory with static file serving

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

### Videos
- POST /api/channels/:id/videos - Add video to channel
- DELETE /api/channels/:id/videos/:videoId - Remove video
- PUT /api/channels/:id/videos/reorder - Reorder videos

### Upload
- POST /api/upload/video - Upload video file (MP4, max 2GB)
- GET /api/upload/videos - List uploaded videos
- DELETE /api/upload/video/:id - Delete uploaded video

### Other
- GET /api/categories - List categories
- GET /api/tv-guide - Get TV guide data
- POST /api/seed - Seed initial data

## Admin Credentials
- Email: Hushmusicent419@gmail.com
- Password: sstisdd419

## Prioritized Backlog

### P1 (High Priority)
- [ ] YouTube API integration for auto-fetching video metadata
- [ ] Real-time viewer count updates
- [ ] Video thumbnail generation for uploaded videos

### P2 (Medium Priority)
- [ ] Drag-and-drop video reordering
- [ ] Advanced scheduling with calendar
- [ ] Channel analytics dashboard
- [ ] Social sharing features

### P3 (Nice to Have)
- [ ] Chat/comments on channels
- [ ] Channel subscriptions/notifications
- [ ] Mobile app version

## Known Issues
- Some channel thumbnails may show as broken if using invalid URLs
- Duplicate channels issue has been fixed (cleanup script applied)
- User requested to delete first 7 channels but only 1 channel existed in database (no action needed)
- TV Guide may appear dense with many short-duration videos (cosmetic only)

## Testing
- Backend: 39/39 tests passed (pytest in /app/backend/tests/)
- Frontend: All features tested and working
- Test report: /app/test_reports/iteration_11.json (latest)

## Recent Changes (Feb 15, 2026)
- Fixed TV Guide schedule to use actual video durations instead of hardcoded 30-minute slots
- Added `random_play` field to `/api/tv-guide` endpoint for consistent shuffle display
- TV Guide now syncs perfectly with Live TV page schedules
