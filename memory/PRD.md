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

## Architecture
```
/app/
├── backend/
│   ├── server.py        # Monolithic FastAPI app
│   ├── r2_service.py    # Cloudflare R2 service
│   ├── youtube_api.py   # YouTube Data API service
│   └── .env
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LiveTV.jsx
│       │   ├── Dashboard.jsx
│       │   ├── ScheduleEditor.jsx
│       │   └── ...
│       └── lib/api.js
└── memory/
    └── PRD.md
```

## Key DB Schema
- **channels**: `{ id, name, videos: [video_object], use_schedule: bool, is_live_stream: bool, live_stream_youtube_id: string?, sort_order: int }`
- **schedules**: `{ channel_id, schedule_date, videos: [{video_id, title, youtube_id, start_time, end_time, duration}] }`
- **video_object**: `{ id, videoId, title, duration, youtube_id?, video_url?, thumbnail }`
- Admin credentials: hushmusicent419@gmail.com / $Stisdd419

## Key API Endpoints
- `POST /api/admin/fix-all-video-metadata` - Fix titles & durations for ALL videos (YT API + ffprobe)
- `POST /api/schedules/regenerate-all` - Regenerate all 24h schedules
- `POST /api/admin/health-check/{channel_id}` - Check video playability
- `POST /api/channels/update-all-uploaded-durations` - Fix uploaded video durations

## Completed (Feb 27, 2026)
- Fixed schedule time parsing bug
- Added YouTube Live Stream channel support
- Fixed uploaded video durations (127 drive-uploaded videos)
- Implemented yt-dlp geo-restricted video handling (3 strategies)
- Per-Channel Analytics

## Completed (Mar 2, 2026)
- FIXED P0 Critical Playback Bug (React re-render loop)

## Completed (Mar 6, 2026)
- Full Data Migration: 43 channels, 2,535 videos (273 uploaded) from production
- Silent Video Skipping: Removed all alarming proxy/error toast messages
- Increased Playback Check Timeout from 5s to 12s
- **Fixed ALL video metadata**: 824 YouTube titles updated (from generic "Video 1" to real titles), 391+1 YouTube durations fixed, 86 uploaded video durations fixed via ffprobe
- New endpoint: `POST /api/admin/fix-all-video-metadata` for bulk metadata repair
- Regenerated all 43 schedules with corrected durations
- Final status: 2,535 videos, only 14 with default duration (11 are 24/7 live streams = expected)

## Prioritized Backlog
### P3
- Refactor server.py into separate routers
- Refactor LiveTV.jsx into smaller components/hooks
- Clean up missing R2 videos from database
- yt-dlp residential proxy for true geo-restrictions
