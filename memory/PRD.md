# Hush Music TV Network - Product Requirements Document

## Original Problem Statement
Build a TV network app named "Hush Music TV Network" with admin-only channel/video management, 24-hour video schedules, Live TV experience, YouTube live stream support, analytics, embedding, and PWA capabilities.

## Core Requirements
- Admin-only system for managing channels and videos (including reordering)
- 24-hour synchronized video schedules ("Go Live" feature)
- Live TV with channel changer, OSD, play/pause, auto-hiding controls
- Commercials system (Uploaded / Vimeo / YouTube) playing BETWEEN videos
- Analytics dashboard, Roku app, Amazon Fire TV package, Android TWA
- Mobile responsive design

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, react-youtube, Vimeo Player SDK
- **Backend**: FastAPI, MongoDB (motor), Python, BackgroundTasks, in-memory caching
- **Cloud Storage**: Cloudflare R2 (via boto3)
- **Video Processing**: yt-dlp, ffprobe/ffmpeg
- **TV Platforms**: Roku BrightScript, Amazon Fire TV (Bubblewrap/TWA)

## Admin credentials
- hushmusicent419@gmail.com / $Stisdd419 (see /app/memory/test_credentials.md)

## Completed (Feb 2026 — current fork)
- **Full production → preview migration** (Feb 2026)
  - 89 channels upserted (2 stale preview-only channels removed: Mr T's Kitchen, Blacksmith Girl Channel)
  - 5,872 uploaded_videos upserted (uploaded_videos collection now 8,932 total)
  - 100 commercials upserted (commercials collection now 238 total)
  - 28 stale `/api/videos/{fn}` URLs rewritten to R2 in 7 channels
  - 0 stale slot URLs remaining in schedules
  - Total 10,395 videos assigned to channels: 4,675 YouTube · 5,677 Uploaded/R2 · 0 stale
  - Schedules regenerated for all 89 channels for date 2026-09-27

## Previous fork history — see prior sections of this file
(For full history of Roku, Fire TV, Vimeo commercials, Analytics, upload optimizations,
LUFS auto-normalize, LiveTV timeout fixes, and >6,500-line server.py evolution, refer to
prior handoff summaries and CHANGELOG snapshots below.)

## Prioritized Backlog
### P0
- **Roku sideload "Compilation Failed. LivePlayer"** — awaiting user feedback on the 30-line diagnostic `LivePlayer.xml` build.

### P1
- YouTube-to-R2 bulk migration (yt-dlp → R2) so 71 YouTube-only channels play on Roku.
- Refactor `server.py` (>6,500 lines) into modular routers.
- Refactor `LiveTV.jsx` (>2,200 lines) into smaller components/hooks.

### P2
- Infinite scroll for LiveTV channel drawer via `/api/channels?lite=true&limit=20&skip=N`.
- 1-Click "Sync from Production" Admin UI button (wraps `migrate_full.py`).
- Add `VIMEO_ACCESS_TOKEN` to `.env` to unlock domain-locked Vimeo videos on Roku.

### P3
- Multi-format uploads (MKV/AVI → MP4) — deferred due to `static-ffmpeg` deploy timeouts.
- yt-dlp residential proxy for true geo-restrictions.
