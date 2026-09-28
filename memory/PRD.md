# Hush Music TV Network - Product Requirements Document

## Original Problem Statement
Build a TV network app named "Hush Music TV Network" with admin-only channel/video management, 24-hour video schedules, Live TV experience, YouTube live stream support, analytics, embedding, and PWA capabilities.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI, react-youtube, Vimeo Player SDK
- **Backend**: FastAPI, MongoDB (motor), Python, BackgroundTasks, in-memory caching
- **Cloud Storage**: Cloudflare R2 (via boto3)
- **TV Platforms**: Amazon Fire TV (Bubblewrap/TWA), Android PWA/TWA. Roku dropped (no native YouTube support).

## Admin credentials
- See `/app/memory/test_credentials.md`

## Completed (Feb 2026 — current fork)
- **Full production → preview migration** — 89 channels, 5,872 uploaded_videos, 100 commercials; 28 stale `/api/videos/` URLs rewritten to R2; schedules regenerated for all 89 channels for 2026-09-27.
- **Roku dropped from roadmap** (no native YouTube).
- **Fire TV / Silk memory-leak fix on channel switch** (Feb 28)
  - Root cause: the YouTube player `useEffect` in `LiveTV.jsx` did `if (!videoId || isUploadedVideo) return;` — an **early-return without destroying the previous player**. Every YT → non-YT channel switch orphaned the previous iframe + its `postMessage` window listeners, which is exactly what surfaced as "memory warning after switching a few channels" in Silk on Fire TV Stick.
  - Fix: extracted `destroyPlayer()` helper (pause → stop → destroy → wipe `#youtube-player.innerHTML`) and call it (a) in the early-return path, (b) at the start of every new player creation, and (c) in the effect's cleanup so it always fires on channel change or LiveTV unmount.
  - Same pattern applied defensively to the primary Vimeo player (new `destroyVimeoPlayer` helper) and to the commercial YT / Vimeo player cleanups (they now also clear their container `innerHTML` so orphaned iframes can't linger).
  - Uploaded-video `<video>` element cleanup now issues `pause() + removeAttribute('src') + load()` on every channel/video switch — the browser-standard incantation to release the hardware decoder + demuxer buffer. Same teardown wired into the proxy-video path.
  - Verified via headless Chrome: switched through 5 channels; total DOM `iframe` count never exceeded 1 and total `<video>` count never exceeded 1 (was previously growing unboundedly on Silk).
- **Low-memory optimization for Fire TV Stick / Amazon Silk** (Feb 2026 — earlier)
  1. **Full player teardown on unmount / channel switch**
     - New master unmount effect in `LiveTV.jsx` destroys YouTube, Vimeo, commercial YT, and commercial Vimeo player instances, pauses + `removeAttribute('src')` + `.load()` on every `<video>` element (main, proxy, commercial), and clears every OSD/channel-input timeout.
     - Added `key={video_id-or-url}` on the uploaded, proxy, and commercial-MP4 `<video>` tags so React fully unmounts/remounts the element between videos — the browser then reliably releases the previous media buffer instead of holding both in memory on constrained devices.
  2. **Virtualized channel list (LiveTV sidebar)**
     - New lightweight `useVirtualList` hook in `/app/frontend/src/hooks/useVirtualList.js` (no new dependencies).
     - Only ~20-25 channel buttons ever exist in the DOM instead of 89. Thumbnails additionally use `loading="lazy" decoding="async"`.
  3. **Virtualized TV Guide rows (`/schedule`)**
     - `Schedule.jsx` now virtualizes its channel-row list against the window scroll using the same hook (`useWindow: true` mode).
     - Only 20-25 rows are mounted at once. Fixes DOM node explosion caused by 89 × (thumbnail + N timeline blocks).
  4. **Background prefetch pause during playback**
     - `/app/frontend/src/lib/prefetch.js` gets `pauseBackgroundFetches` / `resumeBackgroundFetches` helpers. `LiveTV.jsx` pauses prefetches on mount and resumes on unmount.
     - Explicit `getPrefetchedLiveSchedule()` calls still work — they temporarily bypass the pause flag so the LiveTV page itself is never blocked.
  - **Verified**: LiveTV mounts 25/89 channels, `/schedule` mounts 22/89 rows (`schedule-rows-container.style.height = 6408px = 89 × 72px`). Scrolling on `/schedule` re-hydrates row indices without changing DOM node count.

## Prioritized Backlog
### P1
- Refactor `server.py` (>6,500 lines) into modular routers.
- Refactor `LiveTV.jsx` (>2,200 lines) into smaller components/hooks.
- Full Amazon Fire TV Bubblewrap AAB build (blocked on user running PWABuilder / Bubblewrap CLI locally).

### P2
- 1-Click "Sync from Production" Admin UI button (wraps `migrate_full.py`).
- Add `VIMEO_ACCESS_TOKEN` to `.env` to unlock domain-locked Vimeo videos.
- Progressive channel list load in LiveTV via `/api/channels?lite=true&limit=20&skip=N`.

### P3
- Multi-format uploads (MKV/AVI → MP4) — deferred due to `static-ffmpeg` deploy timeouts.
- yt-dlp residential proxy for true geo-restrictions.

## Previous fork history
For full history of Vimeo commercials, Analytics, upload optimizations, LUFS auto-normalize, LiveTV timeout fixes, and the >6,500-line server.py evolution, refer to prior handoff summaries.
