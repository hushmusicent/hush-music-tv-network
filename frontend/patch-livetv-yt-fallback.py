"""YouTube videos never play when the IFrame API never loads (onn. stick).

Root cause (frontend/src/pages/LiveTV.jsx): `whenYTReady()` waits forever
for the YouTube IFrame API script (`onYouTubeIframeAPIReady` / 50ms poll)
with no timeout. On the onn. stick's TV browser the API script never
loads or runs, so the promise never resolves, no player is ever created,
and the 10s/12s fallback timers (which only exist inside the .then) never
exist either. The YouTube slot sits black forever. Uploaded videos play
fine because they use a plain <video> element with no YouTube dependency.

Fix (LiveTV.jsx only):
  1. `whenYTReady()` now resolves true on success, or false after an 8s
     timeout (poll cleared, cached promise reset so the next video
     re-checks in case the API loaded late).
  2. `createPlayer`'s .then now checks the result: if the API never came
     up, it calls the existing `tryProxyFallback()` straight away, which
     plays the video through the proxy player -- a plain <video>, the
     same element type as uploaded videos, which do play on the stick.
Idempotent: re-running skips sections already applied. Section 2 is only
applied when section 1 is in place (in this run or an earlier one), so a
partial run can never send working embeds to the proxy by mistake.
Run from /app in the Emergent terminal. Marker: YT_PROXY_FALLBACK_OK
"""

PATH = "frontend/src/pages/LiveTV.jsx"
MARKER = "YT_PROXY_FALLBACK_OK"

with open(PATH, encoding="utf-8") as f:
    src = f.read()

notes = []

# --- 1. whenYTReady: 8s timeout + boolean result ---
S1_MARK = "YouTube IFrame API not ready after 8s"
OLD_WHEN = """  if (!_ytReadyPromise) {
    _ytReadyPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { prev && prev(); } catch (_) {}
        resolve();
      };
      // Belt-and-braces: the API may have already loaded before we had a
      // chance to register the callback. Poll briefly (50ms) just in case.
      const t = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(t);
          resolve();
        }
      }, 50);
    });
  }
  return _ytReadyPromise;"""
NEW_WHEN = """  if (!_ytReadyPromise) {
    _ytReadyPromise = new Promise((resolve) => {
      let settled = false;
      let t = null;
      let to = null;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (t) clearInterval(t);
        if (to) clearTimeout(to);
        if (!ok) _ytReadyPromise = null;
        resolve(ok);
      };
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { prev && prev(); } catch (_) {}
        done(true);
      };
      // Belt-and-braces: the API may have already loaded before we had a
      // chance to register the callback. Poll briefly (50ms) just in case.
      t = setInterval(() => {
        if (window.YT && window.YT.Player) {
          done(true);
        }
      }, 50);
      // Some TV browsers (e.g. the onn. stick's TV Bro WebView) never load
      // or run the IFrame API script, so this promise used to hang forever
      // and no player was ever created. After 8s, give up and report
      // failure so the caller can fall back to the proxy player.
      to = setTimeout(() => {
        console.warn('[LiveTV] YouTube IFrame API not ready after 8s, using proxy fallback');
        done(false);
      }, 8000);
    });
  }
  return _ytReadyPromise;"""

if S1_MARK in src:
    notes.append("WHENYT_TIMEOUT_ALREADY_PRESENT")
    s1_done = True
elif OLD_WHEN in src:
    src = src.replace(OLD_WHEN, NEW_WHEN, 1)
    # Early returns resolve true (API already loaded / no window).
    src = src.replace(
        "  if (typeof window === 'undefined') return Promise.resolve();\n  if (window.YT && window.YT.Player) return Promise.resolve();",
        "  if (typeof window === 'undefined') return Promise.resolve(true);\n  if (window.YT && window.YT.Player) return Promise.resolve(true);",
        1,
    )
    notes.append("WHENYT_TIMEOUT_ADDED")
    s1_done = True
else:
    notes.append("WHENYT_ANCHOR_MISSING")
    s1_done = False

# --- 2. createPlayer .then: fall back to proxy when the API never came up ---
OLD_THEN = """      whenYTReady().then(() => {
        if (!currentVideo || currentVideo.youtube_id !== videoId) return;"""
NEW_THEN = """      whenYTReady().then((apiReady) => {
        if (!currentVideo || currentVideo.youtube_id !== videoId) return;
        if (!apiReady) {
          // IFrame API never came up on this device (seen on the onn.
          // stick's TV browser). Skip the embed entirely and play the
          // video through the proxy player (plain <video>, same as
          // uploaded videos, which do play there).
          tryProxyFallback();
          return;
        }"""

if not s1_done:
    notes.append("THEN_SKIPPED_NO_WHENYT")
elif "if (!apiReady)" in src:
    notes.append("THEN_GUARD_ALREADY_PRESENT")
elif OLD_THEN in src:
    src = src.replace(OLD_THEN, NEW_THEN, 1)
    notes.append("THEN_GUARD_ADDED")
else:
    notes.append("THEN_ANCHOR_MISSING")

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

print(" | ".join(notes))
print(MARKER)
