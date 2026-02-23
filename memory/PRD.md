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
- Video reordering within channels
- Advanced calendar scheduling with import/export

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
- [x] YouTube Proxy System for Age-Restricted Videos
- [x] Dynamic Use Schedule Flag - Any channel can be switched to synchronized 24-hour schedule mode
- [x] **Video Reordering API** - PUT /api/channels/{id}/videos/reorder
- [x] **Custom Schedule Save API** - POST /api/schedule/save
- [x] **Channel Schedule API** - GET /api/schedule/channel/{id}

#### Frontend
- [x] Home page with hero section and featured channels
- [x] Browse page with search and category filters
- [x] Watch page with YouTube/uploaded video player
- [x] 24-Hour TV Guide Feature - Classic TV Guide style schedule page
- [x] Admin Dashboard with full management
- [x] YouTube Settings Page - Manage cookies for age-restricted content
- [x] Live TV page with synchronized playback
- [x] Auto-proxy fallback - Automatically uses proxy for age-restricted videos
- [x] Progressive Web App (PWA) - Installable app with offline support
- [x] Embeddable player for single channel
- [x] Embeddable network player
- [x] Top navigation bar on all pages
- [x] Dynamic "Live Schedule" Toggle - Admin can enable/disable synchronized schedule per channel
- [x] **Video Reordering in Dashboard** - Drag-and-drop to reorder videos within a channel
- [x] **Schedule Editor Page** - Advanced calendar scheduling with manual time slots

## P2 Features Completed (Feb 23, 2026)

### Video Reordering within Channels
- **Dashboard Integration**: "Reorder" button in expanded channel video list
- **Drag-and-Drop UI**: Videos can be dragged using grip handle
- **Visual Feedback**: Yellow instruction banner, Save Order/Cancel buttons
- **Backend Validation**: Validates all video IDs before reordering
- **Safety**: Preserves videos not included in reorder request

### Advanced Calendar Scheduling
- **New Page**: `/schedule-editor/:channelId`
- **Schedule Timeline**: Visual list of all scheduled videos with time slots
- **Manual Time Editing**: Click on time slot to manually adjust start time
- **Auto-Generate**: Creates 24-hour schedule from channel videos
- **Drag-and-Drop**: Reorder scheduled items, times auto-recalculate
- **Import/Export**: 
  - Export schedule as JSON file
  - Import schedule from JSON file
  - Copy JSON template to clipboard
- **Available Videos Panel**: Shows channel videos with search filter
- **Save to Backend**: Saves custom schedule to database

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn UI components
- **Backend**: FastAPI with MongoDB
- **Authentication**: JWT-based auth (admin-only)
- **Video Playback**: YouTube iframe embeds + HTML5 video for uploads/proxy
- **File Storage**: Local uploads directory with static file serving
- **Age-Restriction Bypass**: yt-dlp with cookie authentication

## API Endpoints

### Schedule (New)
- POST /api/schedule/save - Save custom schedule (admin)
- GET /api/schedule/channel/:id - Get channel schedule

### Videos
- PUT /api/channels/:id/videos/reorder - Reorder videos in channel (admin)

## Admin Credentials
- Email: hushmusicent419@gmail.com
- Password: $Stisdd419

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Dynamic "Use Schedule" Toggle

### P1 (High Priority)
- [ ] Embedding feature - Allow embedding channels/network on external sites
- [ ] Analytics Page - Viewer statistics dashboard

### P2 (Medium Priority) - COMPLETED
- [x] **Video Reordering** - Drag-and-drop to reorder videos within a channel
- [x] **Advanced Calendar Scheduling** - Manual time slots, auto-generate, import/export

### P3 (Nice to Have)
- [ ] Chat/comments on channels
- [ ] Channel subscriptions/notifications
- [ ] Mobile app version

### Go Live Feature (Feb 23, 2026)
- **Dashboard**: Added prominent "Go Live" / "LIVE" toggle button on each channel row
- **One-Click Toggle**: Click "Go Live" to make channel follow TV Guide schedule
- **Visual Feedback**: 
  - Green outline "Go Live" = Offline (videos play randomly)
  - Solid green "LIVE" = Live (videos follow TV Guide schedule)
- **Toast Notifications**: Confirms when channel goes live or offline
- **Live TV Behavior**:
  - LIVE channels show red "LIVE" indicator, follow synchronized schedule
  - Offline channels show green "PLAYING" indicator, play videos randomly

## Recent Changes (Feb 23, 2026)

### Data Migration from Old Build (Completed)
- **Migration Endpoint**: Created `POST /api/migrate-data` for one-time data sync
- **Restored "Hush Music Radio"**: 155 videos restored (was 0 due to previous bug)
- **Total Videos**: 2070 videos across 22 active channels
- **Drive-Uploaded Videos**: Preserved `video_url` field for uploaded videos
- **Migration Logic**: Handles whitespace in channel names, merges without duplicates

### Video Reordering Feature
- Added `videoReorderMode` state to Dashboard
- Added `SortableVideoItem` component with drag-and-drop
- Added "Reorder" button (yellow with arrows icon)
- Added "Save Order" and "Cancel" buttons in reorder mode
- Backend validation to prevent accidental video deletion

### Schedule Editor Page
- Created new `ScheduleEditor.jsx` page
- Added route `/schedule-editor/:channelId` in App.js
- Features: timeline view, auto-generate, import/export, manual time editing
- Added green calendar icon button for channels with `use_schedule=true`

### Backend Fixes
- Fixed route ordering: `/videos/reorder` before `/videos/{video_id}`
- Added validation to reject invalid video IDs in reorder
- Added POST `/api/schedule/save` endpoint
- Added GET `/api/schedule/channel/:id` endpoint

## Data Stats
- **24 Channels** total
- **2070+ Videos** total

## Testing
- Backend API endpoints verified via pytest
- Frontend features tested via Playwright automation
- P2 features: 87.5% backend, 100% frontend success rate

## Files Modified
- `/app/backend/server.py` - Schedule save/get endpoints, video reorder validation
- `/app/frontend/src/pages/Dashboard.jsx` - Video reorder UI
- `/app/frontend/src/pages/ScheduleEditor.jsx` - New schedule editor page
- `/app/frontend/src/App.js` - Added schedule editor route
