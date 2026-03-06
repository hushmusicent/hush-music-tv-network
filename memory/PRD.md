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
- Channel/network embedding
- Installable PWA
- YouTube Live Stream channel support
- Analytics page for viewer statistics

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, react-youtube, @dnd-kit/core
- **Backend**: FastAPI, MongoDB (motor), Python
- **Cloud Storage**: Cloudflare R2 (via boto3)
- **Video Processing**: yt-dlp (proxy), ffprobe (duration extraction)
- **3rd Party APIs**: YouTube Data API v3, YouTube IFrame API

## Key DB Schema
- **channels**: `{ id, name, videos: [video_object], use_schedule: bool, is_live_stream: bool, live_stream_youtube_id: string?, sort_order: int }`
- **schedules**: `{ channel_id, schedule_date, videos: [{video_id, title, youtube_id, start_time, end_time, duration}] }`
- **video_object**: `{ id, videoId, title, duration, youtube_id?, video_url?, thumbnail }`
- Admin credentials: hushmusicent419@gmail.com / $Stisdd419

## Key API Endpoints
- `POST /api/admin/fix-all-video-metadata` - Fix titles & durations for ALL videos (YT API + ffprobe)
- `POST /api/schedules/regenerate-all` - Regenerate all 24h schedules
- `POST /api/admin/health-check/{channel_id}` - Check video playability

## Completed (Feb 27, 2026)
- Fixed schedule time parsing, YouTube Live Stream, uploaded video durations
- yt-dlp geo-restricted video handling, Per-Channel Analytics

## Completed (Mar 2, 2026)
- FIXED P0 Critical Playback Bug (React re-render loop - seekTime/isMuted refs)

## Completed (Mar 6, 2026)
- Full Data Migration: 43 channels, 2,535 videos from production
- Silent Video Skipping: Removed all proxy/error toast messages
- Fixed ALL video metadata: 824 YT titles, 392 YT durations, 86 uploaded durations
- New endpoint: POST /api/admin/fix-all-video-metadata
- Uploaded video playback optimization:
  - Added `preload="auto"` for aggressive buffering
  - Use `loadedmetadata` event for faster seeking (instead of `canplay`)
  - Added buffering spinner (animate-spin) while videos load
  - Skip large seeks (>30s) on uploaded videos for instant playback start
  - Note: Fragmented MP4 files from yt-dlp are inherently slower to seek

## Prioritized Backlog
### P3
- Refactor server.py into separate routers
- Refactor LiveTV.jsx into smaller components/hooks
- Clean up missing R2 videos from database
- Re-mux uploaded videos as non-fragmented MP4 for better seek performance
- yt-dlp residential proxy for true geo-restrictions
