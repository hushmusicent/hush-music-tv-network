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

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, react-youtube, @dnd-kit/core
- **Backend**: FastAPI, MongoDB (motor), Python
- **Cloud Storage**: Cloudflare R2 (via boto3)
- **Video Processing**: yt-dlp (proxy), ffprobe/ffmpeg (duration + remux)
- **3rd Party APIs**: YouTube Data API v3, YouTube IFrame API

## Key API Endpoints
- `POST /api/admin/fix-all-video-metadata` - Fix titles & durations (YT API + ffprobe)
- `POST /api/admin/remux-uploaded-videos` - De-fragment all uploaded MP4s for instant playback
- `POST /api/schedules/regenerate-all` - Regenerate all 24h schedules
- Admin credentials: hushmusicent419@gmail.com / $Stisdd419

## Completed (Feb 27, 2026)
- Schedule time parsing, YouTube Live Stream, uploaded video durations
- yt-dlp geo-restricted video handling, Per-Channel Analytics

## Completed (Mar 2, 2026)
- FIXED P0 Playback Bug (React re-render loop - seekTime/isMuted refs)

## Completed (Mar 6, 2026)
- Full Data Migration: 43 channels, 2,535 videos from production
- Silent Video Skipping: Removed all proxy/error toast messages
- Fixed ALL video metadata: 824 YT titles, 392 YT durations, 86 uploaded durations
- **De-fragmented all uploaded videos**: Re-muxed 20 fragmented MP4 files in R2 (e.g. 78 fragments → 0). Non-fragmented MP4 plays instantly in browsers. Added `POST /api/admin/remux-uploaded-videos` endpoint.
- Player optimizations: `preload="auto"`, `loadedmetadata` seeking, buffering spinner

## Prioritized Backlog
### P3
- Refactor server.py into separate routers
- Refactor LiveTV.jsx into smaller components/hooks
- Clean up missing R2 videos from database
- yt-dlp residential proxy for true geo-restrictions
