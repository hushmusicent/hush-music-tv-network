# Hush Music TV — Amazon Fire TV Package

This folder contains the Bubblewrap manifest + Fire TV overrides needed to
produce an **APK that installs from the Amazon Appstore on Fire TV Stick,
Fire TV Cube, Fire TV Omni, Fire tablets and Fire phones** — same package,
one binary.

## What you're building

| Setting              | Value                        |
|----------------------|------------------------------|
| Package ID           | `com.hushmusictv.app`        |
| App version code     | `2`                          |
| App version name     | `1.1.0`                      |
| Target host          | `broadcaster.emergent.host`  |
| Start URL            | `/live`                      |
| Display mode         | `fullscreen`                 |
| Orientation          | `landscape`                  |
| `minSdkVersion`      | 21 (Android 5.0 — Fire OS 5) |
| `targetSdkVersion`   | **34** (Android 14)          |
| `compileSdkVersion`  | **34**                       |
| `buildToolsVersion`  | 34.0.0                       |
| Launcher category    | `LEANBACK_LAUNCHER` + `LAUNCHER` |
| Touchscreen required | `false`                      |
| Leanback required    | `false` (recommended)        |

`targetSdkVersion=34` matches Amazon's Fire OS 8 requirement for new
Appstore submissions from Q1 2026. `LEANBACK_LAUNCHER` puts the app on the
Fire TV home row; the additional `LAUNCHER` category means the same APK
also lands on Fire tablets and phones without a second listing.

## Files in this folder

| File                            | What it is                                               |
|---------------------------------|----------------------------------------------------------|
| `twa-manifest.json`             | Bubblewrap source of truth. Read by `bubblewrap init`.   |
| `AndroidManifest.override.xml`  | Fire TV intent filters + uses-feature stanzas to merge   |
|                                 | into the generated `AndroidManifest.xml`.                |
| `build.gradle.override`         | SDK / versionCode / packagingOptions to merge into the   |
|                                 | generated `app/build.gradle`.                            |

## Build steps

### 1. Prerequisites (one-time)

```bash
# Node 18+
node --version

# Java 17 (Bubblewrap needs it — Java 21 also works, Java 11 does not)
java -version

# Android SDK 34 + Build Tools 34.0.0
# On macOS/Linux the easiest path is Android Studio → SDK Manager
#   → Android 14.0 (API 34) → Android SDK Platform 34 + Sources
#   → Android SDK Build-Tools 34.0.0

npm install -g @bubblewrap/cli
```

### 2. Initialise from the manifest

```bash
cd /app/amazon-app-firetv
bubblewrap init --manifest ./twa-manifest.json
```

Bubblewrap will prompt for:
- **Signing key** — either point it at an existing keystore or let it create
  a new one. Save the passwords somewhere safe; they're needed for every
  future upload.
- **Digital Asset Links** — accept the default; Bubblewrap prints the SHA-256
  fingerprint you need for step 4.

### 3. Merge the Fire TV overrides

Bubblewrap generates a stock TWA that targets phones. To make it Fire TV
compliant you merge two files:

```bash
# a) Copy the intent-filter + <uses-feature> blocks from
#    AndroidManifest.override.xml into
#    app/src/main/AndroidManifest.xml
#    - Add BOTH  <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
#      and       <category android:name="android.intent.category.LAUNCHER" />
#      inside the main activity's <intent-filter>.
#    - Set android:screenOrientation="landscape" on the same activity.
#    - Add the two <uses-feature> stanzas at the top of <manifest>.

# b) Copy the compileSdk/targetSdk/versionCode block from
#    build.gradle.override into app/build.gradle
#    (Bubblewrap 1.20+ already reads targetSdkVersion from the manifest,
#     but the override guards against a stale Gradle cache.)
```

### 4. Build the release APK

```bash
bubblewrap build
# → app-release-signed.apk  (side-load / Amazon Appstore upload)
# → app-release-bundle.aab  (Google Play — same package)
```

If Bubblewrap can't find your SDK, run once:

```bash
bubblewrap doctor
```

It prints a checklist. Missing packages can be installed with
`sdkmanager --install "platforms;android-34" "build-tools;34.0.0"`.

### 5. Point Digital Asset Links at your production domain

```bash
# The SHA-256 fingerprint appears at the end of `bubblewrap build`.
# Copy it into /app/frontend/public/.well-known/assetlinks.json under
# "sha256_cert_fingerprints", then redeploy the frontend so
# https://broadcaster.emergent.host/.well-known/assetlinks.json returns it.
```

Without this file the TWA falls back to Chrome Custom Tabs — playable but
shows the URL bar; certification will fail.

### 6. Upload to the Amazon Appstore

1. Log in at <https://developer.amazon.com/apps-and-games/console>.
2. Open the existing **Hush Music TV** listing (Package ID
   `com.hushmusictv.app`) and add a new APK.
3. In the binary metadata:
   - **Distribution devices**: check **Fire TV** (all generations), **Fire
     tablet**, **Fire phone** (still available for legacy).
   - **Supported orientations**: **Landscape** only.
   - **Content rating**: reuse the existing rating.
4. Upload `app-release-signed.apk`.
5. Submit for review. Typical Fire TV review turnaround is 2-3 business
   days.

## D-pad / remote navigation

Fire TV remotes emit standard Android KeyEvents. The Chrome Custom Tabs
runtime that powers the TWA forwards every one of them to the loaded page,
so the existing keyboard handlers in `LiveTV.jsx` (up/down channel change,
OK to play/pause, back to exit, etc.) work out of the box. Amazon's
certification tests specifically require:

- **Every focusable element is reachable via D-pad only** — LiveTV does
  this via the sidebar toggle + channel drawer.
- **Focus rings are visible** — the app already renders purple focus rings
  on the channel tiles.
- **Back button exits gracefully** — the `LivePlayer` back handler stops
  video playback and closes the player without crashing.

To retest locally: install `adb`, connect to your Fire TV
(`adb connect <fire-tv-ip>:5555`), then `adb install
app-release-signed.apk` and drive the app with the remote. Amazon's
"Web App Tester" (from the Fire TV Appstore) is a faster iteration loop
during development.
