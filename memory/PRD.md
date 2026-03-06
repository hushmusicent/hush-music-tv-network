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
│   ├── server.py        # Monolithic FastAPI app (2700+ lines)
│   ├── r2_service.py    # Cloudflare R2 service
│   ├── youtube_api.py   # YouTube Data API service
│   └── .env             # All credentials
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LiveTV.jsx        # Main Live TV experience
│       │   ├── Dashboard.jsx     # Admin dashboard
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

## Completed (Feb 27, 2026)
- Fixed schedule time parsing bug (backend HH:MM:SS vs frontend numeric seconds)
- Added YouTube Live Stream channel support
- Fixed uploaded video durations (127 drive-uploaded videos)
- Implemented yt-dlp geo-restricted video handling (3 strategies)
- Fixed embed player for R2 videos and live stream channels
- Per-Channel Analytics with peak hours, daily views, most-watched videos

## Completed (Mar 2, 2026)
- **FIXED P0 Critical Playback Bug**: Videos restarting every 5 seconds due to React re-render loop
  - Root cause: `seekTime` and `isMuted` state in useEffect dependency arrays
  - Fix: Replaced with refs (`seekTimeRef`, `isMutedRef`)

## Completed (Mar 6, 2026)
- **Full Data Migration**: Synced 43 channels and 2,535 videos (273 uploaded) from production (broadcaster.emergent.host)
- **Silent Video Skipping**: Removed all alarming proxy/error toast messages - videos now skip silently when unavailable
- **Increased Playback Check Timeout**: From 5s to 12s to reduce false proxy attempts

## Prioritized Backlog
### P3
- yt-dlp: True geo-restrictions from datacenter IPs need residential proxy (paid service)
- Refactor server.py into separate routers (2900+ lines)
- Refactor LiveTV.jsx into smaller components/hooks
- Clean up missing R2 videos from database (some uploaded videos return 404)
