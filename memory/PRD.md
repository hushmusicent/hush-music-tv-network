# Hush Music TV Network - Product Requirements Document

## Original Problem Statement
Build a TV network app named "Hush Music TV Network" with admin-only channel/video management, 24-hour video schedules, Live TV experience, YouTube live stream support, analytics, embedding, and PWA capabilities.

## Core Requirements
- Admin-only system for managing channels and videos (including reordering)
- Migrate channels/videos from existing application
- 24-hour synchronized video schedules ("Go Live" feature)
- Live TV with channel changer, OSD, play/pause, auto-hiding controls
- Handle age-restricted YouTube videos via yt-dlp proxy + cookies
- Admin dashboard: bulk thumbnails, video cleanup, health-check tools
- Channel/network embedding, Installable PWA
- YouTube Live Stream channel support, Analytics page
- **Mobile responsive design ("Cellphone Mode")**

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, react-youtube, @dnd-kit/core
- **Backend**: FastAPI, MongoDB (motor), Python
- **Cloud Storage**: Cloudflare R2 (via boto3)
- **Video Processing**: yt-dlp (proxy), ffprobe/ffmpeg (duration + remux)
- **3rd Party APIs**: YouTube Data API v3, YouTube IFrame API

## Key API Endpoints
- `POST /api/upload/video/init-chunked` - Initialize chunked upload session
- `POST /api/upload/video/chunk` - Upload a single 5MB chunk
- `POST /api/upload/video/complete-chunked` - Assemble chunks + store in R2
- `POST /api/admin/fix-all-video-metadata` - Fix titles & durations (YT API + ffprobe)
- `POST /api/admin/remux-uploaded-videos` - De-fragment all uploaded MP4s
- `POST /api/videos/update-durations` - Batch YouTube duration + title fix
- `POST /api/channels/update-all-uploaded-durations` - Fix uploaded video durations
- `POST /api/schedules/regenerate-all` - Regenerate all 24h schedules
- Admin credentials: hushmusicent419@gmail.com / $Stisdd419

## Completed (Apr 24, 2026)
- **Fixed black-screen for uploaded videos on Gen Z / YouTv / Scary TV channels**
  - Root cause: 183 uploaded videos across 3 channels had stale `/api/videos/{filename}` local paths in `channels.videos[]` and `schedules.videos[]` instead of the Cloudflare R2 public URL. Local files no longer existed (migrated to R2), causing 404 → `MEDIA_ERR_SRC_NOT_SUPPORTED` → infinite skip loop → black screen.
  - DB migration: rewrote `/api/videos/{fn}` → `https://pub-49c62121e99b4925aa056a6df47d707e.r2.dev/videos/{fn}` in `channels` (3 channels, 183 videos) and `schedules` (7 schedules, 90 slots). All 183 filenames verified present in R2.
  - Prevention: `background_r2_upload()` in `server.py` now automatically rewrites any channel video entries pointing to the temporary `/api/videos/{filename}` URL to the final R2 URL after the background upload completes.
  - Verified in real Chrome (headless): Gen Z → Reba_2001_2 plays (1280x720, readyState=4, duration=1234s, paused=false).

## Completed (Apr 3, 2026)
- **Enhanced Analytics Dashboard**:
  - **Overview Tab**: Current viewers, 24h views, unique viewers, all-time views, channel performance
  - **Time Analysis Tab**: Hourly/Daily/Weekly/Monthly distribution charts with selectors
  - **Demographics Tab**: Age groups, gender distribution, geographic data (countries, regions, cities)
  - **Commercials Tab**: Commercial plays tracking, completion rates, per-commercial performance stats
  - Backend: `POST /api/analytics/view` with demographics (age_group, gender, country, region, city)
  - Backend: `POST /api/analytics/commercial` for commercial play/complete/skip events
  - Backend: `GET /api/analytics/stats` returns comprehensive time-based and demographic data
  - Backend: `GET /api/analytics/commercials` returns commercial-specific analytics
  - Frontend: Complete rewrite of Analytics.jsx with 4 tabs and interactive charts

## Completed (Mar 31, 2026)
- **Commercial System**:
  - New "Commercial Manager" page accessible from Dashboard
  - Per-channel commercial uploads (MP4 only)
  - **Commercials play BETWEEN videos** (after one video ends, before next starts)
  - Up to 3 random commercials play between each video transition
  - Commercial overlay shows "COMMERCIAL 1 of 3" indicator
  - Backend: `/api/commercials/*` endpoints for CRUD operations
  - Frontend: LiveTV.jsx handles commercial breaks between videos

## Completed (Mar 30, 2026)
- **Video Upload Improvements**:
  - Auto-converts MPEG-4 Part 2 codec to H.264 during upload
  - Chunked upload retry logic (3 attempts per chunk)
  - Increased timeouts for large files
- **Full Data Migration** from production (44 channels, 2806 videos, 25 uploaded videos)

## Completed (Mar 15, 2026)
- **Mobile Responsive Design ("Cellphone Mode")**:
  - Live TV: Channel sidebar as slide-in overlay with backdrop on mobile
  - Live TV: Auto-close sidebar after channel selection on mobile
  - Live TV: Scaled-down channel changer remote and OSD on mobile
  - Live TV: Mobile top bar with "Channels" button
  - Dashboard: Horizontally scrollable action buttons on mobile
  - Dashboard: 2-column stats grid on mobile (4-column on desktop)
  - Added CSS for scrollbar-hide and slide-in animations

## Completed (Mar 12, 2026)
- **Chunked Video Upload**: Files split into 5MB chunks to bypass Kubernetes proxy limits. Tested with 120MB file successfully. Duration auto-detected on assembly.
- **Python MP4 Duration Fallback**: Pure Python moov/mvhd parser for environments without ffprobe binary
- **Batch YouTube API**: Duration endpoint now uses batch API (200 videos per call) and also fixes generic titles
- **Frontend timeout**: Increased to 5 minutes for long-running admin operations

## Previous Completions
- P0 Playback Bug Fix (React re-render loop)
- Full Data Migration from production
- Silent Video Skipping (removed proxy error toasts)
- Video Metadata Fix (824 titles, 478 durations)
- De-fragmented uploaded videos for instant playback
- Per-Channel Analytics, Embedding, YouTube Live Stream support

## Prioritized Backlog
### P1 - Deferred
- **Multi-format video uploads (MKV/AVI → MP4)**: Removed due to `static-ffmpeg` causing deployment timeouts. Requires alternative approach (client-side conversion or background worker).

### P3
- Refactor server.py into separate routers
- Refactor LiveTV.jsx into smaller components/hooks
- Clean up missing R2 videos from database
- yt-dlp residential proxy for true geo-restrictions
