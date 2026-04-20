# Amazon Fire TV / Appstore Deployment Guide

## Hush Music TV - Amazon App Wrapper

### Prerequisites
- Amazon Developer Account (https://developer.amazon.com)
- Your deployed web app URL: https://broadcaster.emergent.host

---

## Option A: Fire TV Web App (Recommended - Fastest)

### Step 1: Test Your Web App on Fire TV
1. On your Fire TV, go to **Settings > Applications > Appstore > Install unknown apps**
2. Download "Amazon Web App Tester" from Amazon Appstore
3. Enter your URL: `https://broadcaster.emergent.host`
4. Test navigation with Fire TV remote

### Step 2: Create Web App Package
Use the files in `/app/amazon-app/` directory:
- `webapp.json` - App configuration
- `assets/` - Icons and splash screens

### Step 3: Submit to Amazon
1. Go to Amazon Developer Console
2. Create New App > Web App
3. Upload your `webapp.json` and assets
4. Fill in app details, descriptions, screenshots
5. Submit for review

---

## Option B: Hybrid Wrapper with Cordova (More Control)

### Install Cordova
```bash
npm install -g cordova
cordova create hush-music-tv com.hushmusicent.tv "Hush Music TV"
cd hush-music-tv
cordova platform add amazon-fireos
```

### Configure for Fire TV
Edit `config.xml` to point to your web app URL.

---

## Fire TV Remote Navigation Tips

Your app should support:
- **D-pad navigation** (up/down/left/right)
- **Select button** (enter/click)
- **Back button** (go back/exit)
- **Play/Pause button** (media control)

The current LiveTV.jsx already supports keyboard navigation!

---

## Required Assets

### Icons (create these)
- 114x114 - Small icon
- 512x512 - Large icon
- 1920x1080 - Fire TV banner
- 1280x720 - Tablet banner

### Screenshots
- Fire TV: 1920x1080
- Tablet: 1920x1200 or 2560x1600

---

## App Store Listing Tips

**Title:** Hush Music TV
**Short Description:** 24/7 Hip-Hop, R&B, and Music Videos
**Category:** Music & Audio or Entertainment
**Content Rating:** Teen or Mature (depending on content)

---

## Testing Checklist

- [ ] App loads on Fire TV
- [ ] Remote navigation works (D-pad)
- [ ] Videos play correctly
- [ ] Channel switching works
- [ ] Back button exits gracefully
- [ ] App remembers last channel
- [ ] Works on Fire Tablet
