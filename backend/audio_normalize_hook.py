"""On-upload LUFS auto-normalize hook.

Triggered as `asyncio.create_task(normalize_upload_audio(...))` right after
a newly uploaded video or commercial finishes landing on R2. The hook:

  1. Waits a short delay so R2 has replicated the object.
  2. Measures integrated LUFS via ffmpeg (90 s window, no full download).
  3. If |LUFS − target| ≤ threshold, marks the doc `audio_normalized` and
     exits.
  4. Otherwise downloads, applies static gain + peak limiter, and re-uploads
     to the same R2 key.
  5. All state is written to Mongo so re-invocations are idempotent — the
     hook exits immediately if `audio_normalized: true` is already set.

Reuses the same target LUFS / threshold / filter chain as
`audio_normalize_library.py`, so on-upload runs and batch runs stay in sync.
"""
import asyncio
import logging
import os
import re
import tempfile
import time

logger = logging.getLogger(__name__)

TARGET_LUFS = -16.0
OFF_THRESHOLD = 3.0  # ≥3 LUFS off target ⇒ re-encode

# Ensure the bundled static ffmpeg binary is on PATH (matches
# audio_normalize_library.py). Idempotent per-process.
_FFMPEG_BIN_DIR = "/root/.venv/lib/python3.11/site-packages/static_ffmpeg/bin/linux_arm64"
if _FFMPEG_BIN_DIR not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _FFMPEG_BIN_DIR + ":" + os.environ.get("PATH", "")


async def _measure_lufs(url: str):
    """Return (integrated_lufs, peak_dbtp) for the remote video, or None."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-nostdin", "-ss", "30", "-t", "90", "-i", url,
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, err = await asyncio.wait_for(proc.communicate(), timeout=120)
        m = re.search(
            r'\{[^{}]*"input_i"\s*:\s*"(-?[\d.]+)"[^{}]*"input_tp"\s*:\s*"(-?[\d.]+)"',
            err.decode("utf-8", "ignore"),
            re.DOTALL,
        )
        if not m:
            return None
        return float(m.group(1)), float(m.group(2))
    except Exception as e:
        logger.warning(f"[audio-norm] LUFS measure failed for {url}: {e}")
        return None


async def _apply_gain_and_upload(url: str, r2_key: str, current_lufs: float):
    """Download, apply gain + limiter, re-upload to the same R2 key."""
    from r2_service import get_r2_client, R2_BUCKET_NAME

    gain_db = max(-12.0, min(TARGET_LUFS - current_lufs, 18.0))
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, "in.mp4")
        local_out = os.path.join(work, "out.mp4")

        dl = await asyncio.create_subprocess_exec(
            "curl", "-sSfL", "-o", local_in, url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, _ = await asyncio.wait_for(dl.communicate(), timeout=900)
        if dl.returncode != 0:
            return False, "download failed"

        # Fast filter chain: highpass 60Hz + static gain + peak limiter.
        # `-c:v copy` keeps video untouched (audio-only re-encode).
        filt = f"highpass=f=60,volume={gain_db:.2f}dB,alimiter=limit=0.891:release=200"
        ff = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", local_in, "-af", filt,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
            "-movflags", "+faststart", local_out,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, ferr = await asyncio.wait_for(ff.communicate(), timeout=1800)
        if ff.returncode != 0:
            return False, f"ffmpeg: {ferr[-120:]!r}"

        r2 = get_r2_client()
        with open(local_out, "rb") as fh:
            r2.upload_fileobj(
                fh, R2_BUCKET_NAME, r2_key,
                ExtraArgs={
                    "ContentType": "video/mp4",
                    "CacheControl": "public, max-age=3600",
                },
            )
        return True, f"gain={gain_db:+.1f}dB"


async def normalize_upload_audio(
    db,
    collection_name: str,
    doc_id: str,
    url: str,
    r2_key: str,
    delay_seconds: int = 5,
):
    """Background hook: measure LUFS, and normalize if the audio is off target.

    Called via `asyncio.create_task(...)` right after an upload finishes.
    Fully idempotent — safe to invoke multiple times for the same doc.
    """
    try:
        # Give R2 a beat to fully replicate the object before we hit it.
        await asyncio.sleep(delay_seconds)

        coll = db[collection_name]
        existing = await coll.find_one(
            {"id": doc_id},
            {"_id": 0, "audio_normalized": 1},
        )
        if not existing:
            logger.info(f"[audio-norm] {collection_name}/{doc_id} not found; skip")
            return
        if existing.get("audio_normalized") is True:
            logger.info(f"[audio-norm] {collection_name}/{doc_id} already normalized; skip")
            return

        measured = await _measure_lufs(url)
        if not measured:
            await coll.update_one(
                {"id": doc_id}, {"$set": {"lufs_measure_failed": True}}
            )
            return
        lufs, peak = measured
        await coll.update_one(
            {"id": doc_id},
            {"$set": {"lufs": lufs, "peak_dbtp": peak}},
        )

        if abs(lufs - TARGET_LUFS) <= OFF_THRESHOLD:
            await coll.update_one(
                {"id": doc_id},
                {"$set": {
                    "audio_normalized": True,
                    "audio_normalized_at": time.time(),
                    "audio_normalized_action": "on_target",
                }},
            )
            logger.info(
                f"[audio-norm] {collection_name}/{doc_id} within target "
                f"(LUFS={lufs:.1f}); no re-encode needed"
            )
            return

        ok, msg = await _apply_gain_and_upload(url, r2_key, lufs)
        if ok:
            await coll.update_one(
                {"id": doc_id},
                {"$set": {
                    "audio_normalized": True,
                    "audio_normalized_at": time.time(),
                    "audio_normalized_action": msg,
                }},
            )
            logger.info(
                f"[audio-norm] {collection_name}/{doc_id} normalized "
                f"({msg}, was LUFS={lufs:.1f})"
            )
        else:
            await coll.update_one(
                {"id": doc_id}, {"$set": {"audio_normalize_failed": msg}}
            )
            logger.warning(
                f"[audio-norm] {collection_name}/{doc_id} normalize failed: {msg}"
            )
    except Exception as e:
        logger.error(
            f"[audio-norm] hook crashed for {collection_name}/{doc_id}: {e}"
        )
