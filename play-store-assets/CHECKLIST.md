# Google Play Store Submission Checklist — Hush Music TV

## ✅ Already prepared for you

| Item | Location |
|---|---|
| App manifest.json (PWA metadata) | `/app/frontend/public/manifest.json` |
| Full icon set 72–512px | `/app/frontend/public/icons/` |
| favicon.ico | `/app/frontend/public/favicon.ico` |
| apple-touch-icon | `/app/frontend/public/apple-touch-icon.png` |
| Feature graphic 1024×500 | `/app/play-store-assets/feature-graphic.png` |
| Promo 512×512 | `/app/play-store-assets/promo-512.png` |
| Fire TV banner 1280×720 | `/app/amazon-app/assets/small-banner.png` |
| Privacy Policy page | `https://broadcaster.emergent.host/privacy` (after redeploy) |
| assetlinks.json (domain verify) | `/app/frontend/public/.well-known/assetlinks.json` |

## 🔨 Still to do (by you)

### 1. Google Play Console ($25 one-time)
Sign up: https://play.google.com/console
Verification: 24-48h waiting period.

### 2. Generate the Android app (TWA wrapper)

The Android build config lives at **`/app/android-app/twa-manifest.json`**
and is pinned to **Android 16 (API 36)** — `targetSdkVersion` and
`compileSdkVersion` are both `36`, `minSdkVersion` is `21`.

Use PWABuilder — zero code, 5 minutes:
1. https://pwabuilder.com → enter `https://broadcaster.emergent.host`
2. Click **Package for Stores → Android**
3. Package ID: `com.hushmusictv.app`
4. App name: `Hush Music TV`
5. Version code: `1`
6. Version name: `1.0.0`
7. In **Advanced**: set **Target SDK: 36** and **Compile SDK: 36**
8. Download the ZIP → contains signed `.aab` (Android App Bundle)

Alternatively, use Bubblewrap CLI locally with the manifest already in
`/app/android-app/twa-manifest.json` (see `/app/android-app/README.md`).

### 3. Update assetlinks.json with your SHA-256
The PWABuilder ZIP contains a text file with your signing cert's SHA-256.
Copy that value into `/app/frontend/public/.well-known/assetlinks.json`
replacing `REPLACE_WITH_YOUR_SIGNING_CERT_SHA256`.
Then **redeploy** so it's live at `https://broadcaster.emergent.host/.well-known/assetlinks.json`.

### 4. Take screenshots (min 2 phone, 2 tablet if targeting tablets)
On your phone with the PWA installed OR in Chrome DevTools device mode:
- Home page (channel grid)
- Live TV player mid-playback with channel selector visible
- TV Guide (`/schedule`)
- Analytics or Channel Creator (if showing admin features)

Save as 1080×1920 (phone portrait) or 1920×1080 (landscape).

### 5. Store Listing Copy

**App name (30 char max)**: Hush Music TV Network

**Short description (80 char max)**:
24/7 live TV network — music, comedy, movies, cartoons, news & more

**Full description (4000 char)**:
```
Hush Music TV Network is a 24/7 live TV network app with 59+ synchronized channels playing everywhere at the same time — like real broadcast TV.

📺 CHANNELS
• Live DJ, Rap Battles, Hip-Hop, R&B — music you love
• Live Concerts, Podcast Channel, Word on the Streets
• Stand-Up Comedy, Sketch Comedy, AI Comedy
• Law & Order, Court TV, Crime Case, Protect and Serve
• Saturday Morning Cartoons, 70s/80s/90s/00s Cartoons
• Disney Kids, Teen, Family Movies, Horror Movies
• 24/7 Spanish, French, Italian, Chinese language channels
• Yahoo! Sports Live, ABC News Live, Historical & Spiritual channels
• And many more — 59+ synchronized channels in total

🎬 FEATURES
• 24-hour synchronized schedule — everyone watching the same channel sees the same thing at the same time
• TV Guide with 24h zoom to plan what to watch
• Auto-generated daily schedules with smart randomization
• D-pad remote support for Fire TV & Roku (spatial navigation)
• Full-screen immersive playback with auto-hiding controls
• Loudness-normalized audio — no more surprise volume jumps between videos
• Zero ads for viewers (commercials between videos are curated)

🚀 ALWAYS ON
Just open the app. You're already tuned in. Change channels at any time and pick up where the network is — never behind.

📱 WORKS ON
• Android phones & tablets
• Fire TV / Amazon Appstore
• Roku (via web app)
• Any modern web browser

Hush Music TV Network — always on, always synced.
```

### 6. Content Rating (Play Console questionnaire)
Answer honestly. Your app has:
- Some content with strong language (rap, stand-up comedy)
- No violence beyond typical TV shows
- No user-to-user interaction
- Suggested rating: **T (Teen)** or **M (Mature 17+)** depending on channel mix

### 7. Data Safety Form (mandatory as of 2022)
Fill in Play Console → App content → Data safety:
- ✅ Approximate location — collected, not shared, not for advertising
- ❌ Personal info — not collected (viewer accounts optional)
- ✅ App activity — collected (channel views/timestamps) for analytics only
- No third-party sharing except embedded YouTube (declare it)

### 8. App category
Category: **Entertainment**
Tags: `TV, Live TV, Streaming, Music, Comedy, Cartoons, 24/7`

### 9. Countries
Start with **US, Canada, UK, Australia** to keep support scope small,
then expand once stable.

### 10. Pricing
**Free**. No in-app purchases initially. (Ads/subscription can come in v2.)

---

## 🎯 After first submission
- Review time: **usually 1-3 days** for new apps (can be up to 7)
- Google may reject for missing privacy policy or bad screenshots — easy fixes
- Once approved, listing goes live within hours

## 🔁 For each new version
- Update `manifest.json` version field
- Bump PWABuilder → generate new signed AAB
- Upload new AAB → Play Console → Release → Production
- Update "What's new" text (max 500 chars)
