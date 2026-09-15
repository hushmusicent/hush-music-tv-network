# Hush Music TV — Android Build (TWA)

The Android app is a **Trusted Web Activity (TWA)** wrapper around
`https://broadcaster.emergent.host`. It is built by
[Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) (the same
tool PWABuilder runs under the hood).

The source of truth for the build is `twa-manifest.json` in this folder.

## SDK targets

As of the current build the app targets **Android 16 (API 36)**:

| Setting            | Value |
|--------------------|-------|
| `minSdkVersion`    | 21    |
| `targetSdkVersion` | 36    |
| `compileSdkVersion`| 36    |
| `buildToolsVersion`| 36.0.0|

> Google Play now **requires** apps to target API 35 (Android 15) as of
> August 31 2025 for new submissions, and API 36 (Android 16) becomes
> required from August 31 2026 for all app updates.
> Targeting 36 now is forward-compatible and satisfies the current policy.

## Generating a new signed AAB

Two supported paths — pick one.

### Path A — PWABuilder (web, no local tools)

1. Go to <https://pwabuilder.com> and enter
   `https://broadcaster.emergent.host`.
2. Click **Package for stores → Android**.
3. In the **Advanced** panel, set:
   - Package ID: `com.hushmusictv.app`
   - App name: `Hush Music TV Network`
   - Launcher name: `Hush Music TV`
   - App version code: bump by 1 each release (start at `1`)
   - App version name: `1.0.0`
   - **Target SDK / Compile SDK: `36`**
   - Min SDK: `21`
4. Download the ZIP. It contains:
   - `app-release-signed.aab`  ← upload to Play Console
   - `assetlinks.json`        ← copy the `sha256_cert_fingerprints` value
     into `/app/frontend/public/.well-known/assetlinks.json` and redeploy.

### Path B — Bubblewrap CLI (local, reproducible)

Requires Node 18+, Java 17 and the Android SDK.

```bash
npm install -g @bubblewrap/cli
cd /app/android-app
bubblewrap init --manifest ./twa-manifest.json
bubblewrap build
# → outputs app-release-signed.aab in the same folder
```

Bubblewrap reads `twa-manifest.json` directly, so
`targetSdkVersion: 36` / `compileSdkVersion: 36` will be applied to the
generated `build.gradle` automatically.

## Digital Asset Links

The APK is bound to `broadcaster.emergent.host` via
`/.well-known/assetlinks.json` on the server.
After the first build, paste the signing cert SHA-256 into
`/app/frontend/public/.well-known/assetlinks.json` and redeploy.

## Play Console upload

1. Console → App content → **Data safety** and **Content rating** must be
   completed.
2. Release → Production → **Create new release** → drop the `.aab`.
3. "What's new" text (max 500 chars).
4. Submit for review.
