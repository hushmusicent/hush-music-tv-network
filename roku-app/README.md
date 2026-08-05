# Hush Music TV — Roku Channel

Native BrightScript channel for Roku. Reads channels from the same backend
API as the web app (https://broadcaster.emergent.host).

## What's in this folder
```
roku-app/
├── manifest              — Roku app metadata (name, version, icons)
├── source/
│   ├── main.brs          — Entry point
│   └── util.brs          — HTTP + schedule logic
├── components/
│   ├── HomeScene.xml     — Grid of channels
│   ├── ChannelTile.xml   — Individual channel card
│   └── LivePlayer.xml    — Video player screen
└── images/               — Icons + splash screens (all sizes)
```

## Step 1 — Get a free Roku developer account
1. Go to https://developer.roku.com
2. Sign up (free)
3. Enable developer mode on your Roku:
   - On your Roku remote, press: **Home 3× → Up 2× → Right → Left → Right → Left → Right**
   - The Developer Settings screen appears
   - Note your Roku's IP address (e.g. `192.168.1.42`)
   - Set a dev-mode username + password (you'll use these below)
   - Reboot when prompted

## Step 2 — Sideload the channel onto your Roku
1. **Zip this folder** into `roku-app.zip`:
   - On your computer: right-click `/app/roku-app/` → Compress / Send To → ZIP
   - Or terminal: `cd /app/roku-app && zip -r ../roku-app.zip .`
2. Open a browser and go to `http://<YOUR-ROKU-IP>` (the IP you noted above)
3. Log in with the dev-mode credentials you set
4. Click **Upload → Install** → select `roku-app.zip` → wait ~10 seconds
5. The channel launches automatically on your Roku screen

**Every time you make code changes**, just re-zip and re-upload — that dev slot on your Roku accepts overwrites.

## Step 3 — Test it
On your Roku, you should see:
- The Hush Music TV splash screen (~1.5s)
- A grid of all channels (loaded from your production API)
- Pressing OK on any channel starts synchronized live playback
- Up/Down arrows show the overlay with channel/video info (auto-hides after 4s)
- Back returns to the channel grid; Back again exits

## Step 4 — Publish to the Roku Channel Store
Once you're happy with how it works:

1. Log in at https://developer.roku.com → **Manage My Channels → Add Public Channel**
2. Fill in:
   - **Channel name**: `Hush Music TV`
   - **Category**: Entertainment
   - **Package**: upload the same `roku-app.zip`
   - **Description**: same copy you used for Play Store (see `/app/play-store-assets/CHECKLIST.md`)
   - **Screenshots** (min 3, 1920×1080 PNG): take from your Roku itself or from the running channel
   - **Content classification**: Choose based on your content mix (usually "General Audience" or "Guidance Suggested")
   - **Icon/splash**: already generated in `images/`
3. Submit for certification
4. Roku review takes typically 1-4 weeks. They test on real hardware.

## Common submission issues (things Roku rejects for)
- Slow startup (>10s) → your app is fine (~1.5s splash)
- Videos that don't play or infinite spin
- No back-button handling → your app handles this
- Missing metadata (channel name, description)
- Content that violates their guidelines (adult content, hate speech, etc.)

## Local development tips
- Roku has no browser dev tools. Use the **debugger** at `telnet <ROKU-IP> 8085` to see runtime logs (`print` statements from BrightScript appear here)
- To hot-reload, just re-upload the zip
- Emulator: none officially supported. Test on a real $30 Roku Express — cheapest way

## Known limitations of this v1
- **YouTube-sourced channels** stream via yt-dlp (your backend already exposes `/api/youtube/stream-info/{id}`). Those plays **do not count** toward the YouTube channel's public view count.
- **No TV Guide screen yet** (grid-only for now). Add later if you want the horizontal schedule UI.
- **No search** (channel grid only). Roku users don't typically need this on a 59-channel network.
- **No favorites** (would need per-device local storage).
