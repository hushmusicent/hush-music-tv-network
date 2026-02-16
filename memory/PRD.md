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
- [x] **24-Hour TV Guide Feature** - Classic TV Guide style schedule page:
  - Grid layout showing all channels with their 24-hour schedules
  - Time navigation with scroll controls
  - "Now" button to jump to current time
  - Individual channel shuffle/regenerate
  - Current time indicator
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

### Schedule
- GET /api/schedule/channels - Get 24-hour schedules for all channels
- GET /api/schedule/channel/:id - Get schedule for specific channel
- POST /api/schedule/regenerate/:id - Regenerate schedule with random order

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

## Channel Deletion
The admin dashboard includes a "Delete Channel" button for each channel. Users can delete unwanted channels via:
1. Go to Dashboard
2. Find the channel
3. Click the trash icon
4. Confirm deletion in the dialog

## Testing
- Backend: 47/47 tests passed (pytest in /app/backend/tests/)
- Frontend: All features tested and working
- Test report: /app/test_reports/iteration_12.json (latest)

## Data Migration (Feb 16, 2026)
- Migrated all channels and videos from broadcaster.emergent.host
- **16 Channels** total (6 new + 10 updated)
- **1215 Videos** total
- New channels added:
  - Movies 4 Everyone (100 videos)
  - Horror Channel (51 videos)
  - Action Movies (51 videos)
  - Romance Movies (52 videos)
  - Biography Channel (64 videos)
  - Spiritual Channel (157 videos)

## Recent Changes (Feb 16, 2026)
- **Schedule Synced with Live TV** - Schedule now persists and syncs across all viewers
  - Schedule is stored in database and resets only at midnight Eastern time
  - All viewers see the same video at the same time (synchronized playback)
  - When switching channels, video starts at correct position (no restart)
  - Both TV Guide and Live TV use the same stored schedule
  - New public endpoint `/api/schedule/live` for Live TV access
- **24-Hour TV Guide Feature Enhanced** - TV Guide with zoom and synchronized playback
  - **Zoom controls**: 3h, 6h, 12h, 24h view options with zoom in/out buttons
  - Classic TV Guide grid layout showing all channels with their 24-hour schedules
  - **Synchronized video playback**: Click any video to watch it at the correct position based on current time
  - **Video player modal**: Full-featured player with channel info, LIVE indicator, time slot display
  - **No restart on channel switch**: Videos play at the correct time position regardless of which one you click
  - Time navigation with left/right scroll buttons
  - "Now" button to jump to current time
  - Individual channel shuffle/regenerate buttons
  - Current time indicator (red line) showing "now"
  - Shows "Now: Video XX" for what's currently playing on each channel
  - Accessible from Dashboard via "TV Guide" button (cyan color)
  - All times displayed in Eastern time (ET)
- **New Backend Endpoints**:
  - `GET /api/schedule/live` - Public endpoint for Live TV (returns all channel schedules)
  - `GET /api/schedule/live/{channel_id}` - Public endpoint for single channel schedule
  - `GET /api/schedule/channels` - Returns 24-hour schedules for all channels (admin)
  - `POST /api/schedule/regenerate/{id}` - Regenerates schedule with random order (admin)

## Previous Changes (Feb 15, 2026)
- **Analytics page auth fix** - Fixed redirect bug where analytics page was redirecting logged-in admins to home page
- **Live sync restored** - Videos play at the current "live" position based on time of day
- **Auto-skip unavailable videos** - Uses YouTube IFrame API with timeout detection
- **Skip video feature removed** - Users can no longer skip to next video

## Analytics Feature (Implemented)
- **Backend**: `/api/analytics` and `/api/track-view` endpoints
- **Frontend**: `Analytics.jsx` page accessible from Dashboard
- Tracks: Current viewers (5 min window), 24h unique viewers, total views
- Channel performance with progress bars
