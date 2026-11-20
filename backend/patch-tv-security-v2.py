#!/usr/bin/env python3
"""Lock down the public YouTube + duration endpoints in Hush Music TV.

These endpoints are public BY DESIGN (anonymous viewers use them), so they
cannot require a login. Instead this patch adds cheap guards:

1. GET /api/youtube/check/{id}, /api/youtube/stream/{id},
   /api/youtube/stream-info/{id} -- each call spawns yt-dlp (up to twice
   per call). Before: any string reached yt-dlp, unlimited calls per IP,
   so one caller could burn the server's CPU. After: the ID must be a
   real 11-char YouTube ID, and each IP gets 20 calls/minute per endpoint
   (past it: 429). Legit viewers never come close.
2. POST /api/videos/update-duration -- the player calls this when a video
   starts. Before: anyone could set ANY video's duration to ANY number
   (e.g. 99999999), corrupting schedules, and every big change fired a
   full schedule regeneration in the background. After: duration capped
   at 12 hours (43200 s, YouTube's max), ID validated, 10 calls/minute
   per IP. The player call is fire-and-forget (.catch(() => {})) so a
   429 never breaks playback.

No new dependencies: uses `re`, `Request` and `_time_mod`, all already
imported in server.py. Idempotent: re-running prints ALREADY_* for
sections already fixed. Always writes the file, ends with
TV_SECURITY_V2_OK.
Run from /app:  python3 backend/patch-tv-security-v2.py
"""
import py_compile
import sys

PATH = "backend/server.py"

HELPERS = '''
# ===================== PUBLIC-ENDPOINT ABUSE LIMITS =====================
# The YouTube lookup endpoints and the player duration endpoint are public
# by design (anonymous viewers use them), so they cannot require a login.
# Two cheap guards instead:
#   * YouTube IDs must be exactly 11 chars ([A-Za-z0-9_-]) -- junk never
#     reaches yt-dlp, and no crafted ID can smuggle anything into a command.
#   * Each caller IP gets a small budget per minute per endpoint; past it
#     the endpoint answers 429. In-memory only; each uvicorn worker keeps
#     its own counters, which is fine for abuse limiting. The real client
#     IP comes from X-Forwarded-For (the app sits behind a proxy), falling
#     back to the direct peer address.
_YT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_RATE_LIMITS: dict = {}
_RATE_LIMIT_WINDOW = 60.0


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _require_valid_youtube_id(youtube_id: str) -> None:
    if not youtube_id or not _YT_ID_RE.match(youtube_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID")


def _check_rate_limit(request: Request, tag: str, limit: int) -> None:
    now = _time_mod.time()
    key = (_client_ip(request), tag)
    hits = [t for t in _RATE_LIMITS.get(key, []) if now - t < _RATE_LIMIT_WINDOW]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests, slow down")
    hits.append(now)
    _RATE_LIMITS[key] = hits

'''


def _insert_helpers(src: str) -> tuple[str, str]:
    if "_RATE_LIMITS" in src:
        return src, "HELPERS_ALREADY_PRESENT"
    anchor = '@api_router.post("/videos/update-duration")'
    if anchor not in src:
        return src, "HELPERS_ANCHOR_MISSING"
    return src.replace(anchor, HELPERS + anchor, 1), "HELPERS_ADDED"


def _gate_endpoint(src: str, old_sig: str, new_sig: str, doc: str, tag: str,
                   limit: int, label: str) -> tuple[str, str]:
    if new_sig in src:
        return src, label + "_ALREADY_GATED"
    if old_sig not in src:
        return src, label + "_ANCHOR_MISSING"
    src = src.replace(old_sig, new_sig, 1)
    guard = (doc + "\n"
             f"    _check_rate_limit(request, \"{tag}\", {limit})\n"
             "    _require_valid_youtube_id(youtube_id)")
    if doc not in src:
        return src, label + "_DOC_MISSING"
    src = src.replace(doc, guard, 1)
    return src, label + "_GATED"


def main() -> int:
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()

    src, status = _insert_helpers(src)
    print(status)

    # 1. update-duration: add Request param, rate limit, ID check, 12h cap.
    old_sig = ("async def update_video_duration_by_youtube_id(\n"
               "    channel_id: str,\n"
               "    youtube_id: str,\n"
               "    duration: int,\n"
               "    background_tasks: BackgroundTasks,\n"
               "):")
    new_sig = ("async def update_video_duration_by_youtube_id(\n"
               "    request: Request,\n"
               "    channel_id: str,\n"
               "    youtube_id: str,\n"
               "    duration: int,\n"
               "    background_tasks: BackgroundTasks,\n"
               "):")
    if new_sig in src:
        print("DURATION_ALREADY_GATED")
    elif old_sig not in src:
        print("DURATION_ANCHOR_MISSING")
    else:
        src = src.replace(old_sig, new_sig, 1)
        old_cap = "    if duration <= 0:"
        if old_cap not in src:
            print("DURATION_CAP_ANCHOR_MISSING")
        else:
            src = src.replace(old_cap, "    if duration <= 0 or duration > 43200:", 1)
            # Insert the guard lines right after the docstring's closing line.
            doc_end = ("    never blocks the response.\n"
                       '    """')
            if doc_end not in src:
                print("DURATION_DOC_MISSING")
            else:
                src = src.replace(
                    doc_end,
                    doc_end + "\n    _check_rate_limit(request, \"update-duration\", 10)\n    _require_valid_youtube_id(youtube_id)",
                    1,
                )
                print("DURATION_GATED")

    # 2. youtube/check
    src, status = _gate_endpoint(
        src,
        "async def check_youtube_video(youtube_id: str):",
        "async def check_youtube_video(request: Request, youtube_id: str):",
        '    """Check if a YouTube video is playable and if it\'s age-restricted"""',
        "youtube-check", 20, "YT_CHECK")
    print(status)

    # 3. youtube/stream
    src, status = _gate_endpoint(
        src,
        "async def stream_youtube_video(youtube_id: str):",
        "async def stream_youtube_video(request: Request, youtube_id: str):",
        '    """Get direct stream URL for age-restricted videos (uses cookies)"""',
        "youtube-stream", 20, "YT_STREAM")
    print(status)

    # 4. youtube/stream-info
    src, status = _gate_endpoint(
        src,
        "async def get_stream_info(youtube_id: str):",
        "async def get_stream_info(request: Request, youtube_id: str):",
        '    """Get stream URL info for a YouTube video"""',
        "youtube-stream-info", 20, "YT_STREAM_INFO")
    print(status)

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(src)
    try:
        py_compile.compile(PATH, doraise=True)
        print("PY_COMPILE_OK")
    except py_compile.PyCompileError as e:
        print("PY_COMPILE_FAIL: " + str(e))
        return 1
    print("TV_SECURITY_V2_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
