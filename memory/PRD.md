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

## Completed (Feb 20, 2026 — Roku UI parity rebuild)
- **Rebuilt the Roku BrightScript app to match the production web / Fire TV design** using the same MongoDB-backed channels, categories, live schedule, and Roku stream resolver.
  - **HomeScene**: LIVE NOW hero band (auto-updates as user scrubs the featured grid) with channel thumbnail, red LIVE badge, category label, title, description, and Watch Now / Live TV buttons. Horizontal Categories pill row (All / Entertainment / Music / …) auto-built from `/api/channels` categories. Featured Channels row below the pills with 16:9 tiles, "N videos" meta line, purple focus ring. Star opens TV Guide.
  - **LivePlayer**: Left slide-in Channels drawer (screenshot-matching layout: thumb + name + N videos + channel number, purple LIVE header, "Playlist: <date>"). Top-right Now Playing card (● LIVE, live clock, channel + video title + duration). Bottom-right channel pager (▲ N ▼ "of M"). Remote: UP/DOWN change channel · LEFT open drawer · RIGHT close drawer · OK play/pause · BACK exit. Overlay auto-hides after 5s. All existing playback + "Tuning in…" splash preserved for the yt-dlp resolve delay.
  - **TVGuideScene**: 24-Hour Schedule header with today's date + "Now" indicator. Per-channel rows show logo + name + "Now: <title>" + a currently-airing color-cycled program block with start-time · duration and a red ● LIVE badge. UP/DOWN scroll · OK tunes in · BACK closes guide. Data sourced from `/api/schedule/live` for synchronized playback.
  - **New components**: `CategoryPill.xml`, `DrawerRow.xml`, `GuideRow.xml` for reusable focusable rows.
  - **Repackaged**: `/app/frontend/public/downloads/hush-music-tv-roku.zip` (450 KB). Served at `/downloads/hush-music-tv-roku.zip` (200 OK verified). **Requires Deploy** for production `broadcaster.emergent.host` serving.

## Completed (Feb 6, 2026)
- **Roku LivePlayer loading UI**: Added a full-screen branded "Tuning in..." panel with the Hush Music TV wordmark, channel name, animated dots and a marquee-style pulse-bar animation shown during the ~7.5s `yt-dlp` YouTube stream resolution. Auto-hides once the video's `state == "playing"`, and on any playback/network error. BACK button remains responsive during the loading state (stops video, closes the LivePlayer). Fixes the "frozen splash" impression when tuning into YouTube-sourced channels on Roku.
- Repackaged `/app/frontend/public/downloads/hush-music-tv-roku.zip` (444 KB). User must click Deploy for the new zip to be served on `broadcaster.emergent.host`.


## Completed (Feb 19, 2026)
- **Made video titles & durations visible on every surface (channel videos)**
  - Backfilled metadata via existing endpoints: 5 YouTube videos got refreshed titles/durations via YouTube Data API; 29 remaining are deleted on YouTube (unrecoverable — kept as-is with "Video N" placeholder so admin can rename or remove via Channel Editor).
  - `LiveTV.jsx` info OSD now shows current video **duration on mobile** too (previously hidden below md breakpoint).
  - `Schedule.jsx` timeline blocks now show `HH:MM · MM:SS` (start time · duration) so each block carries the duration at a glance.
  - Channel Editor (`ChannelCreator.jsx`), TV Guide (`TVGuide.jsx`), and Schedule already rendered titles + durations; data is now fully populated for 6,869 of 6,898 channel videos.
  - Installed `ffmpeg` in preview so future uploaded-video duration probes work locally; production image likely already has it via the same path that handled prior uploads.

- **Fixed video freeze / A-V desync on uploaded MP4s during random playback**
  - Symptom: R2-hosted MP4s would occasionally freeze mid-playback while audio kept going (across all devices). Classic decoder stall on a keyframe gap with no automatic recovery.
  - Fix: Added a stall watchdog `useEffect` in `LiveTV.jsx` that ticks once per second. If the video's `currentTime` fails to advance >0.05s for 3 consecutive ticks while the player is supposed to be playing, it nudges `currentTime += 0.1` and re-issues `.play()` to force the hardware decoder to re-sync from the next keyframe. Rate-limited to one nudge per 6s. Only activates for uploaded (R2) videos, not YouTube.
  - Pre-existing `seek-then-play` start fix is preserved.
  - **Requires Deploy** to take effect on production.

- **Fixed Commercials Manager save/upload failures**
  - Root cause: `assign_commercial_to_channels` and `register_commercial` in `server.py` strictly validated every channel_id and raised 404 if any was stale. Many legacy commercials had stale channel_ids from channels that were since deleted, so opening Edit → Save returned `404 Channel <id> not found` and the user perceived it as both "won't save" and "won't upload new".
  - Fix (server.py): both endpoints now query existing channels in one $in lookup, keep only existing IDs, log dropped IDs as warnings, and fall back to `is_global=true` when no valid channels remain.
  - DB cleanup: ran one-time script that cleaned 17 commercials with 17 stale channel references.
  - Verified end-to-end by testing agent: 6/6 backend tests + full frontend Edit modal flow pass. Pytest at `/app/backend/tests/test_commercials_assign.py`.


## Completed (Feb 28, 2026 — Vimeo commercials)
- **Vimeo video support for commercials** — same 3-way choice available for ads
  - Backend: `CommercialResponse` model now includes `vimeo_id` + `type` (`"uploaded" | "vimeo"`). New `POST /api/commercials/vimeo` endpoint accepts `{url, channel_ids, is_global}`, extracts the Vimeo ID via the shared `extract_vimeo_id()` helper, fetches title/duration/thumbnail via public oEmbed (no API key), and persists a full commercial doc.
  - Admin Commercials page: added a "Or add a Vimeo commercial" input + `Add Vimeo` button beneath the existing MP4 upload. Reuses the same channel-selection state (`is_global` / `selectedChannelIds`), so the same commercial can be scoped globally or to specific channels regardless of upload source. Vimeo commercials render a poster thumbnail (or a placeholder with the Film icon) in the grid, with a sky-blue "Vimeo" badge in the top-left.
  - LiveTV commercial-break player: now branches — if the current commercial has a `vimeo_id`, it renders `#commercial-vimeo-player` and the Vimeo Player SDK constructs an inline iframe (`controls:false, title:false, byline:false, portrait:false, responsive, dnt:true`) with `setVolume(0.6)` matching the MP4 branch's quieter audio. `ended` and `error` events wire straight to the existing `handleCommercialEnded` so the break progression is identical to MP4 ads. MP4 commercials keep the original `<video>` element path.
  - Verified: `POST /api/commercials/vimeo {"url":"https://vimeo.com/76979871"}` → returns full doc with `vimeo_id: "76979871"`, `type: "vimeo"`, `is_global: true`; Mongo shows the record persisted correctly.

## Completed (Feb 28, 2026 — later)
- **Vimeo video support (Channel Creator + LiveTV player)**
  - Backend: added `vimeo_id` to `VideoItem` / `VideoCreate`, type union now `youtube | uploaded | vimeo`. Auto-detects type when `vimeo_id` is provided. Dedup check includes vimeo_id. Added `POST /api/videos/vimeo/metadata` that extracts a Vimeo ID from URL variants (`vimeo.com/12345`, `vimeo.com/channels/…/12345`, `vimeo.com/groups/…/videos/12345`, `player.vimeo.com/video/12345`, or a raw numeric ID) and fetches title/duration/thumbnail via Vimeo's public oEmbed endpoint (no API key needed).
  - Channel Creator: playlist section now has 3 tabs (YouTube / Vimeo / Upload). Vimeo tab accepts URL or embed link, calls the metadata endpoint, and adds the video with `type: 'vimeo'`. Playlist thumbnails and "Vimeo" badge render on each Vimeo item.
  - LiveTV player: dynamically loads the Vimeo Player SDK once, and when the current video is a Vimeo clip it constructs `new Vimeo.Player('vimeo-player', {id, autoplay, muted, controls:false, responsive, title:false, byline:false, portrait:false, dnt:true})`. Wires `ended → playNextVideo`, `error → skipToNextVideo`, and syncs the app-level mute toggle. Click overlay toggles play/pause; double-click toggles fullscreen. Rendered inline with `w-full h-full` so it looks clean on both mobile and TV.
  - `isUploadedVideo` derived state now excludes Vimeo videos so the existing YouTube/Upload branches don't collide with the Vimeo branch.
  - The existing YouTube URL and MP4 upload flows are unchanged — broadcasters can still choose any of the three.

## Completed (Feb 28, 2026)
- **On-upload LUFS auto-normalize hook**
  - New module `/app/backend/audio_normalize_hook.py` exposing `normalize_upload_audio(db, collection_name, doc_id, url, r2_key)` — same target LUFS (−16), same ≥3 LUFS threshold, same filter chain (highpass 60Hz + static gain + peak limiter, `-c:v copy`) as the batch script.
  - Wired into every upload completion path in `server.py` via `asyncio.create_task(...)`:
    1. Presigned direct R2 upload (`/api/upload/video/direct-url` completion) — line ~910
    2. Background R2 upload completion inside `background_r2_upload` — line ~1092
    3. Small chunked video upload synchronous R2 path — line ~1294
    4. Direct `upload_video` presigned path — line ~1410
    5. Non-chunked commercial upload — line ~1585
    6. Chunked commercial upload completion — line ~1825
  - Fully idempotent: writes `lufs` / `audio_normalized` flags to Mongo and exits early if `audio_normalized: true` is already set. Safe to invoke multiple times per doc.
  - 5-second delay before measuring so R2 has time to replicate the new object.
  - No more batch runs needed for future uploads — new videos and commercials self-normalize within ~30-60 s of upload.

## Completed (Feb 27, 2026 — later)
- **Pinned Android build target to API 36 (Android 16)**
  - Reality check: this project has no `app.json` / `app.config.js` (those are Expo — we're not Expo). The Android app is a **TWA** generated by PWABuilder / Bubblewrap. The correct config file for `targetSdkVersion` / `compileSdkVersion` is `twa-manifest.json`.
  - Created `/app/android-app/twa-manifest.json` with `minSdkVersion: 21`, `targetSdkVersion: 36`, `compileSdkVersion: 36`, `buildToolsVersion: 36.0.0`. Package ID `com.hushmusictv.app`, host `broadcaster.emergent.host`, start URL `/`, all icons/shortcuts wired to the existing PWA manifest.
  - Created `/app/android-app/README.md` documenting both build paths (PWABuilder web / Bubblewrap CLI) and where to paste the signing SHA-256 into `assetlinks.json`.
  - Updated `/app/play-store-assets/CHECKLIST.md` step 2 to reference the new manifest and remind the user to set Target SDK / Compile SDK to 36 in PWABuilder's Advanced panel.
  - **Cannot generate the AAB from this pod** — no Java, no Android SDK, no signing keystore. User must run PWABuilder ( <https://pwabuilder.com> → package for Android, 5 minutes) or Bubblewrap CLI locally (Java 17 + Android SDK required).

## Completed (Feb 27, 2026)
- **Fixed Amazon Fire TV rejection: "installs but fails to present an interactive UI on launch"**
  - Root cause: `LiveTV.jsx` (the Fire TV `start_url`) rendered a full-page "Loading Live TV…" spinner with **zero interactive elements** while awaiting `/api/schedule/live`. Combined with the 30s axios timeout in `prefetch.js`, the Amazon automated reviewer landed on a permanently non-interactive screen if the fetch was slow or failed.
  - Fixes (all preserve existing playback logic):
    - `LiveTV.jsx`: replaced the blocking full-page loader with an interactive shell — HUSH MUSIC TV header, Home button, "Tuning in…" panel, and a **Retry** button — all clickable from the first frame. Added a `loadError` state that renders a dedicated error screen with **Retry** + **Back to Home** buttons when the fetch fails, so the UI is never dead.
    - `prefetch.js`: reduced axios timeout from 30s → 8s so failures surface to the UI (and the retry button) instead of hanging.
    - `AuthContext.js`: token verification is now fire-and-forget (no `await`) so `loading` clears on the same tick — nothing at app boot blocks the first paint on a network call.
  - Verified in headless Chrome at 500ms after DOMContentLoaded: `live-tv-loading` shell visible, `live-tv-loading-home-btn` and `live-tv-loading-retry-btn` both present and clickable. Full LiveTV page renders once `/api/schedule/live` resolves.
  - **Requires Deploy** for production.

## Completed (Feb 26, 2026)
- **Fixed Analytics Overview/Time Analysis showing all zeros on production**
  - Root cause: `/api/analytics/stats` and `/api/analytics/commercials` used `db.views.find({}).to_list(50000)` with no sort. On production (60,600+ views) MongoDB returned the OLDEST 50k documents in natural order, so the in-Python 24h/7d/30d filters found nothing and every recent metric rendered as 0. "All Time Views" stayed correct because it was already using `count_documents`.
  - Fix (`/app/backend/server.py`):
    - `/api/analytics/stats` now queries `db.views.find({"timestamp": {"$gte": last_30d_iso}})` for time-window aggregations (indexed on `timestamp`, no cap).
    - Monthly distribution + yearly-unique now use a single `$group` aggregation pipeline over the year slice.
    - Demographics (age/gender/country/region/city) now use per-field `$group` aggregation pipelines — no document loading.
    - `/api/analytics/commercials` mirrored: 30-day slice query + per-commercial `$group` pipeline for all-time totals + demographics via aggregation.
    - `/api/analytics/channel/{channel_id}` filtered by `timestamp: {$gte: last_7d_iso}`.
    - Added `db.commercial_analytics.create_index("timestamp")` in startup warmup.
  - Verified on preview: 24h views changed from 0 → 4, weekly 37, monthly 1221, yearly 1221; countries: `{United States: 238}`; commercial stats: 24h=1, all_time=2. **Requires Deploy** for production Analytics to render correctly.

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


## Completed (Feb 24, 2026)
- **Fullscreen Auto-Hide Channel Tab**: Entering/exiting fullscreen now briefly reveals the Now-Playing OSD (channel + video title) and the channel changer via the existing `controlsVisible` timer, then auto-fades after 3s — matching the channel-changer overlay behavior. Implemented in `/app/frontend/src/pages/LiveTV.jsx` by exposing `showAndStartTimer` via `showControlsTriggerRef` and calling it from the `fullscreenchange` handler. Added `pointer-events-none` to the OSD when hidden so it doesn't block clicks.

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
