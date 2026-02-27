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

## What's Been Implemented
- Full channel/video CRUD with admin auth
- Cloudflare R2 integration for persistent file storage
- Video duration detection (ffprobe for uploads, YouTube Data API for YT videos)
- 24-hour synchronized schedules with Eastern timezone
- Live TV page with channel list, OSD, keyboard controls
- Age-restricted video handling (proxy + skip mechanism)
- Schedule Editor with auto-generation and save
- Data migration from production environment
- YouTube Live Stream channel support (is_live_stream flag)
- Schedule time parsing fix (HH:MM:SS string to seconds)
- PWA support
- Admin credentials: hushmusicent419@gmail.com / $Stisdd419

## Completed (Feb 27, 2026)
- Fixed schedule time parsing bug (backend HH:MM:SS vs frontend numeric seconds)
- Added YouTube Live Stream channel support (is_live_stream, live_stream_youtube_id fields)
- Created "Hush Music Live" channel with YouTube live stream yfG9FPgFoLM
- Confirmed "Movies 4 Everyone" runtime error is resolved (schedule has valid data)
- Fixed uploaded video durations: all 127 drive-uploaded videos now have real durations (was defaulting to 5min)
- Added parallel ffprobe-based duration detection endpoint (POST /api/channels/update-all-uploaded-durations)
- Added "Uploaded Durations" button in admin dashboard
- Regenerated all 30 channel schedules with correct durations
- Implemented yt-dlp geo-restricted video handling (3 strategies):
  - Strategy 1: Smarter embed retry (youtube-nocookie.com -> youtube.com -> proxy)
  - Strategy 2: Multi-strategy yt-dlp proxy (default, --xff US, android client, geo-bypass)
  - Strategy 3: Admin health check tool (fast oEmbed + yt-dlp categorization)
- Fixed embed player to support uploaded R2 videos and live stream channels
- Fixed EmbedNetwork to include live stream channels
- Hardened video reorder endpoint (ignores invalid IDs instead of rejecting entire request)
- Verified Analytics page works with real data (119 views, 22 channels tracked)

## Prioritized Backlog
### P3
- yt-dlp: True geo-restrictions from datacenter IPs need residential proxy (paid service)
- Refactor server.py into separate routers (2900+ lines)
- Refactor LiveTV.jsx into smaller components
