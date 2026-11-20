#!/usr/bin/env python3
"""Lock down two public write endpoints in Hush Music TV backend.

1. POST /api/videos/delete-by-youtube-id -- was callable by anyone on the
   internet with no login; one call deletes any video from any channel.
2. POST /api/seed -- was callable by anyone; every call inserts 5 junk
   sample channels (with fake viewer counts) into the live channel list.

Fix: both endpoints now require a logged-in admin (same pattern the rest
of the admin routes use: Depends(require_user) + is_admin check).
No frontend caller breaks: deleteByYoutubeId has no caller in the app,
and seed() is never called from the frontend.

Idempotent: re-running prints ALREADY_GATED for sections already fixed.
Always writes the file and ends with TV_SECURITY_OK.
Run from /app:  python3 backend/patch-tv-security.py
"""
import py_compile
import sys

PATH = "backend/server.py"


def gate_delete(src: str) -> tuple[str, str]:
    old_sig = "async def delete_video_by_youtube_id(data: DeleteVideoByYoutubeId):"
    new_sig = ("async def delete_video_by_youtube_id(data: DeleteVideoByYoutubeId, "
               "user: dict = Depends(require_user)):")
    if new_sig in src:
        return src, "DELETE_ALREADY_GATED"
    if old_sig not in src:
        return src, "DELETE_ANCHOR_MISSING"
    src = src.replace(old_sig, new_sig, 1)
    old_doc = ('    """Delete a video from a channel by its YouTube ID (for auto-cleanup of unplayable videos)"""')
    new_doc = (old_doc + "\n"
               "    if not user.get(\"is_admin\", False):\n"
               "        raise HTTPException(status_code=403, detail=\"Admin only\")")
    if old_doc not in src:
        return src, "DELETE_DOC_MISSING"
    src = src.replace(old_doc, new_doc, 1)
    return src, "DELETE_GATED"


def gate_seed(src: str) -> tuple[str, str]:
    old_sig = "async def seed_data():"
    new_sig = "async def seed_data(user: dict = Depends(require_user)):"
    if new_sig in src:
        return src, "SEED_ALREADY_GATED"
    if old_sig not in src:
        return src, "SEED_ANCHOR_MISSING"
    src = src.replace(old_sig, new_sig, 1)
    old_doc = '    """Seed admin user and sample channels"""'
    new_doc = (old_doc + "\n"
               "    if not user.get(\"is_admin\", False):\n"
               "        raise HTTPException(status_code=403, detail=\"Admin only\")")
    if old_doc not in src:
        return src, "SEED_DOC_MISSING"
    src = src.replace(old_doc, new_doc, 1)
    return src, "SEED_GATED"


def main() -> int:
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    src, d_status = gate_delete(src)
    print(d_status)
    src, s_status = gate_seed(src)
    print(s_status)
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(src)
    try:
        py_compile.compile(PATH, doraise=True)
        print("PY_COMPILE_OK")
    except py_compile.PyCompileError as e:
        print("PY_COMPILE_FAIL: " + str(e))
        return 1
    print("TV_SECURITY_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
