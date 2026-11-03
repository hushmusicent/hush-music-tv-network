#!/usr/bin/env python3
"""TV Player schedule + nav patch (Hush Music TV Network, EmbedPlayer.jsx).

Applies two changes to frontend/src/pages/EmbedPlayer.jsx:
  1. LIVE SEEK FOR UPLOADED VIDEOS: the player already picks the right show
     for the time of day (calculateLivePosition), but only YouTube got the
     live position (&start=). Uploaded <video> elements started at 0:00.
     This wires onLoadedMetadata -> currentTime = seekTime when liveSync
     is on, so an uploaded show starts where the schedule is right now.
  2. ?nav=0 HIDES PREV/NEXT: when the embed URL carries ?nav=0, the
     SkipBack / SkipForward buttons are not rendered. Website embeds
     (no param) are unchanged. The house TV in Street Legends uses ?nav=0.

Run from the TV project's root (Emergent terminal):
  python3 patch-tv-player-schedule-nav.py
Idempotent: re-running prints TV_PLAYER_SCHEDULE_NAV_ALREADY_APPLIED.
"""
import io
import os
import sys

PATH = os.path.join("frontend", "src", "pages", "EmbedPlayer.jsx")
MARKER = "// TV_PLAYER_SCHEDULE_NAV"


def main():
    if not os.path.exists(PATH):
        print("WARNING: EmbedPlayer.jsx not found at %s (run from the TV project root)" % PATH)
        print("TV_PLAYER_SCHEDULE_NAV_FAILED")
        return 1

    with io.open(PATH, encoding="utf-8") as f:
        src = f.read()

    if MARKER in src:
        print("TV_PLAYER_SCHEDULE_NAV_ALREADY_APPLIED")
        return 0

    ok = []
    warnings = []

    # Edit 1: nav param next to the other embed params.
    a1 = "  const autoplay = searchParams.get('autoplay') !== '0';"
    r1 = a1 + "\n  " + MARKER + ": live-seek for uploads + ?nav=0 hides prev/next\n  const hideNav = searchParams.get('nav') === '0';"
    if a1 in src and "hideNav" not in src:
        src = src.replace(a1, r1, 1)
        ok.append("nav-param")
    else:
        warnings.append("nav-param anchor missed")

    # Edit 2: seek handler, inserted before the loading return.
    a2 = "  if (loading) {"
    r2 = ("  const handleVideoMetadata = (e) => {\n"
          "    if (liveSync && seekTime > 0) {\n"
          "      const v = e.target;\n"
          "      if (v.duration && seekTime < v.duration) {\n"
          "        v.currentTime = seekTime;\n"
          "      }\n"
          "    }\n"
          "  };\n\n" + a2)
    if a2 in src and "handleVideoMetadata" not in src:
        src = src.replace(a2, r2, 1)
        ok.append("seek-handler")
    else:
        warnings.append("seek-handler anchor missed")

    # Edit 3: wire the handler into the uploaded <video> element.
    a3 = "          onEnded={nextVideo}\n          playsInline"
    r3 = "          onEnded={nextVideo}\n          onLoadedMetadata={handleVideoMetadata}\n          playsInline"
    if a3 in src and "onLoadedMetadata={handleVideoMetadata}" not in src:
        src = src.replace(a3, r3, 1)
        ok.append("video-seek-wire")
    else:
        warnings.append("video-seek-wire anchor missed")

    # Edit 4a: hide the previous button when ?nav=0.
    a4a = "            {channel.videos.length > 1 && (\n              <button\n                onClick={prevVideo}"
    r4a = "            {!hideNav && channel.videos.length > 1 && (\n              <button\n                onClick={prevVideo}"
    if a4a in src:
        src = src.replace(a4a, r4a, 1)
        ok.append("hide-prev")
    else:
        warnings.append("hide-prev anchor missed")

    # Edit 4b: hide the next button when ?nav=0.
    a4b = "            {channel.videos.length > 1 && (\n              <button\n                onClick={nextVideo}"
    r4b = "            {!hideNav && channel.videos.length > 1 && (\n              <button\n                onClick={nextVideo}"
    if a4b in src:
        src = src.replace(a4b, r4b, 1)
        ok.append("hide-next")
    else:
        warnings.append("hide-next anchor missed")

    for w in warnings:
        print("WARNING: " + w)

    if warnings:
        print("TV_PLAYER_SCHEDULE_NAV_FAILED (%d/5 edits applied: %s)" % (len(ok), ", ".join(ok)))
        return 1

    with io.open(PATH, "w", encoding="utf-8") as f:
        f.write(src)
    print("Applied: " + ", ".join(ok))
    print("TV_PLAYER_SCHEDULE_NAV_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
