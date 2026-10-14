"""Applies the 2026-10-13 TV Network audit fixes to backend/server.py.
Run from the repo root:  python3 patch-server.py
Each edit is verified to match exactly once; the script aborts on any mismatch.
Safe to re-run: already-applied patches are detected and skipped.
"""
import sys

PATCHES = []
PATCHES.append(("featured lite+cache", "async def get_featured_channels():\n    channels = await db.channels.find(\n        {\"is_public\": True},\n        {\"_id\": 0}\n    ).sort(\"favorites_count\", -1).limit(6).to_list(6)\n    return serialize_doc(channels)", "async def get_featured_channels(lite: bool = Query(True)):\n    \"\"\"Top 6 public channels by favorites.\n\n    `lite=true` (default) projects out the huge embedded `videos[]` array and\n    attaches a computed `videos_count` instead, mirroring GET /channels.\n    Result is cached for 30 s.\n    \"\"\"\n    cache_key = f\"channels:featured:{lite}\"\n    cached = _cache_get(cache_key)\n    if cached is not None:\n        return cached\n\n    projection: dict = {\"_id\": 0}\n    if lite:\n        projection.update({\n            \"id\": 1, \"name\": 1, \"thumbnail\": 1, \"category\": 1,\n            \"description\": 1, \"sort_order\": 1, \"is_public\": 1,\n            \"is_24_7\": 1, \"random_play\": 1, \"use_schedule\": 1,\n            \"is_live_stream\": 1, \"live_stream_youtube_id\": 1,\n            \"favorites_count\": 1,\n            \"owner_id\": 1, \"owner_username\": 1, \"created_at\": 1,\n        })\n\n    channels = await db.channels.find(\n        {\"is_public\": True},\n        projection\n    ).sort(\"favorites_count\", -1).limit(6).to_list(6)\n\n    if lite:\n        # Attach a videos_count so the UI can show \"N videos\" without the\n        # full array. Uses a lightweight aggregation on the same query.\n        for ch in channels:\n            # `videos` was projected out; set a stub so ChannelResponse\n            # (which requires `videos: []`) still validates.\n            ch[\"videos\"] = []\n            ch.setdefault(\"videos_count\", 0)\n        ids = [c[\"id\"] for c in channels if c.get(\"id\")]\n        if ids:\n            pipeline = [\n                {\"$match\": {\"id\": {\"$in\": ids}}},\n                {\"$project\": {\"id\": 1, \"count\": {\"$size\": {\"$ifNull\": [\"$videos\", []]}}}},\n            ]\n            counts = {r[\"id\"]: r[\"count\"] async for r in db.channels.aggregate(pipeline)}\n            for ch in channels:\n                ch[\"videos_count\"] = counts.get(ch[\"id\"], 0)\n\n    result = serialize_doc(channels)\n    _cache_set(cache_key, result, ttl=30)\n    return result"))
PATCHES.append(("upload_video admin gate", "    \"\"\"Upload a video file to cloud storage - all video formats, auto-converts to MP4, max 2GB\"\"\"\n    # Validate file type", "    \"\"\"Upload a video file to cloud storage - all video formats, auto-converts to MP4, max 2GB\"\"\"\n    if not user.get(\"is_admin\", False):\n        raise HTTPException(status_code=403, detail=\"Admin access required\")\n    # Validate file type"))
PATCHES.append(("upload_image admin gate", "    \"\"\"Upload an image file to cloud storage - JPEG, PNG, WebP, GIF only, max 10MB\"\"\"\n    # Validate file type", "    \"\"\"Upload an image file to cloud storage - JPEG, PNG, WebP, GIF only, max 10MB\"\"\"\n    if not user.get(\"is_admin\", False):\n        raise HTTPException(status_code=403, detail=\"Admin access required\")\n    # Validate file type"))
PATCHES.append(("commercial global-flip guard", "    # If global or no valid channels resolved, treat as global\n    is_global = assignment.is_global or len(valid_channel_ids) == 0", "    # If the caller explicitly assigned channels but none of them exist, fail\n    # loudly instead of silently broadcasting the commercial to every channel.\n    if assignment.channel_ids and not assignment.is_global and len(valid_channel_ids) == 0:\n        raise HTTPException(status_code=400, detail=\"None of the provided channel IDs exist\")\n\n    # If global, or no channels were provided at all, treat as global\n    is_global = assignment.is_global or (len(valid_channel_ids) == 0 and not assignment.channel_ids)"))
PATCHES.append(("delete endpoint auth", "async def delete_video_by_youtube_id(data: DeleteVideoByYoutubeId):\n    \"\"\"Delete a video from a channel by its YouTube ID (for auto-cleanup of unplayable videos)\"\"\"", "async def delete_video_by_youtube_id(data: DeleteVideoByYoutubeId, user: dict = Depends(require_user)):\n    \"\"\"Delete a video from a channel by its YouTube ID (for auto-cleanup of unplayable videos)\"\"\"\n    if not user.get(\"is_admin\", False):\n        raise HTTPException(status_code=403, detail=\"Admin access required\")"))

def main():
    path = "backend/server.py"
    try:
        with open(path) as f:
            src = f.read()
    except FileNotFoundError:
        print(f"ERROR: {path} not found. Run this from the repo root.")
        sys.exit(1)
    changed = 0
    for name, old, new in PATCHES:
        if new in src and old not in src:
            print(f"SKIP (already applied): {name}")
            continue
        count = src.count(old)
        if count != 1:
            print(f"ERROR: anchor for '{name}' matched {count} times (expected 1). Aborting, no changes written.")
            sys.exit(1)
        src = src.replace(old, new, 1)
        changed += 1
        print(f"OK: {name}")
    if changed:
        with open(path, "w") as f:
            f.write(src)
        print(f"\nDone. {changed} patch(es) applied to {path}.")
    else:
        print("\nNothing to do - all patches already applied.")


PATCHES.append(("video normalize cfr",
    """        # If already H.264, just remux with faststart
        if video_codec in ('h264', 'hevc', 'h265'):
            logger.info("Video is H.264/HEVC - remuxing with faststart")
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', input_path, '-c', 'copy', '-movflags', '+faststart', output_path],
                capture_output=True, timeout=600
            )""",
    """        # Check for VFR and resolution issues that cause freeze/desync
        needs_reencode = False
        try:
            probe2 = subprocess.run(
                ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=avg_frame_rate,r_frame_rate,height',
                 '-of', 'csv=p=0', input_path],
                capture_output=True, text=True, timeout=30
            )
            parts = probe2.stdout.strip().split(',')
            if len(parts) >= 3:
                afr, rfr, h = parts[0], parts[1], parts[2]
                # VFR detection: avg != real frame rate
                if afr != rfr:
                    logger.info(f"VFR detected ({afr} vs {rfr}) - will normalize")
                    needs_reencode = True
                try:
                    if int(h) > 1080:
                        logger.info(f"Resolution {h}p > 1080p - will downscale")
                        needs_reencode = True
                except ValueError:
                    pass
        except Exception as e:
            logger.warning(f"VFR check failed: {e}")

        # If already H.264 and no issues, just remux with faststart
        if video_codec in ('h264', 'hevc', 'h265') and not needs_reencode:
            logger.info("Video is H.264/HEVC - remuxing with faststart")
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', input_path, '-c', 'copy', '-movflags', '+faststart', output_path],
                capture_output=True, timeout=600
            )"""
))

if __name__ == "__main__":
    main()
