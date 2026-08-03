"""Resumable full-library audio normalization + denoise.

Phase 1 (measure): For every uploaded_video without a stored `lufs`, probes
integrated LUFS (~5-8s per video, no download).
Phase 2 (fix): For every video >3 LUFS off target (-16 LUFS), downloads,
applies loudnorm + light denoise, re-uploads to R2 with `-c:v copy`
(audio-only re-encode, fast).

Idempotent — writes {lufs, audio_normalized:true} into DB so re-runs skip
completed items. Safe to kill and restart.
"""
import asyncio, os, re, sys, json, tempfile, time
from urllib.parse import urlparse

os.environ['PATH'] = '/root/.venv/lib/python3.11/site-packages/static_ffmpeg/bin/linux_arm64:' + os.environ.get('PATH', '')
sys.path.insert(0, '/app/backend')

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

TARGET_LUFS = -16.0
OFF_THRESHOLD = 3.0          # ≥3 LUFS off target ⇒ re-encode
SCAN_CONCURRENCY = 10
FIX_CONCURRENCY = 5


async def measure_lufs(url):
    """Sample-based LUFS measurement — reads 90s of audio, no download."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'ffmpeg', '-nostdin', '-ss', '30', '-t', '90', '-i', url,
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
            '-f', 'null', '-',
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, err = await asyncio.wait_for(proc.communicate(), timeout=60)
        m = re.search(
            r'\{[^{}]*"input_i"\s*:\s*"(-?[\d.]+)"[^{}]*"input_tp"\s*:\s*"(-?[\d.]+)"',
            err.decode('utf-8', 'ignore'), re.DOTALL
        )
        if not m:
            return None
        return float(m.group(1)), float(m.group(2))
    except Exception:
        return None


async def apply_loudnorm_and_denoise(url, target_lufs=-16.0, current_lufs=None, current_peak=None):
    """Fast normalization: pre-computed static gain + peak limiter.
    ~10x faster than dynamic loudnorm+afftdn. Uses the LUFS we already measured
    to compute exact gain needed, then applies gain + alimiter to prevent clipping.
    """
    from r2_service import get_r2_client, R2_BUCKET_NAME
    if current_lufs is None:
        return False, 'missing lufs measurement'
    gain_db = target_lufs - current_lufs  # e.g. -25 → -16 = +9 dB gain
    # Cap gain to avoid noise amplification on already-clipping content
    gain_db = max(-12.0, min(gain_db, 18.0))
    key = urlparse(url).path.lstrip('/')
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, 'in.mp4')
        local_out = os.path.join(work, 'out.mp4')
        # Download
        dl = await asyncio.create_subprocess_exec(
            'curl', '-sSfL', '-o', local_in, url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, derr = await asyncio.wait_for(dl.communicate(), timeout=900)
        if dl.returncode != 0:
            return False, 'download failed'
        # Fast filter chain: highpass (60Hz rumble cut) + gain + alimiter (peak safety)
        # No dynamic loudnorm, no FFT denoise → ~10x speedup
        filter_str = f'highpass=f=60,volume={gain_db:.2f}dB,alimiter=limit=0.891:release=200'
        ff = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-i', local_in,
            '-af', filter_str,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
            '-movflags', '+faststart', local_out,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, ferr = await asyncio.wait_for(ff.communicate(), timeout=1800)
        if ff.returncode != 0:
            return False, f'ffmpeg: {ferr[-120:]}'
        # Re-upload
        r2 = get_r2_client()
        with open(local_out, 'rb') as fh:
            r2.upload_fileobj(fh, R2_BUCKET_NAME, key,
                              ExtraArgs={'ContentType': 'video/mp4',
                                         'CacheControl': 'public, max-age=3600'})
        return True, f'gain={gain_db:+.1f}dB'


# ────────────────────────── phase 1 ──────────────────────────
async def scan_phase():
    print(f"\n=== Phase 1: Scan library ===")
    # Only measure videos that don't already have `lufs` recorded
    query = {'url': {'$regex': '^https://'}, 'lufs': {'$exists': False}}
    total = await db.uploaded_videos.count_documents(query)
    if total == 0:
        print(f"  All videos already scanned (found lufs on all). Skipping.")
        return
    print(f"  {total} videos to scan (~{total*1.2/60:.0f} min at 10 parallel)")
    sem = asyncio.Semaphore(SCAN_CONCURRENCY)
    processed = 0
    start = time.time()

    async def work(doc):
        nonlocal processed
        async with sem:
            r = await measure_lufs(doc['url'])
            update = {}
            if r:
                lufs, peak = r
                update = {'lufs': lufs, 'peak_dbtp': peak}
            else:
                update = {'lufs_measure_failed': True}
            await db.uploaded_videos.update_one({'_id': doc['_id']}, {'$set': update})
            processed += 1
            if processed % 25 == 0:
                elapsed = time.time() - start
                rate = processed / elapsed
                eta = (total - processed) / max(rate, 0.1)
                print(f"  scan progress: {processed}/{total}  ({rate:.1f}/s, ETA {eta/60:.1f}m)")

    cursor = db.uploaded_videos.find(query, {'url': 1})
    tasks = []
    async for doc in cursor:
        tasks.append(asyncio.create_task(work(doc)))
    await asyncio.gather(*tasks)
    print(f"  scan complete in {(time.time()-start)/60:.1f}m")


# ────────────────────────── phase 2 ──────────────────────────
async def fix_phase():
    print(f"\n=== Phase 2: Fix outliers (>|{OFF_THRESHOLD}| LUFS off {TARGET_LUFS}) ===")
    # Outliers: lufs set, not already normalized, and off target
    query = {
        'lufs': {'$exists': True},
        'audio_normalized': {'$ne': True},
        '$expr': {
            '$gt': [{'$abs': {'$subtract': ['$lufs', TARGET_LUFS]}}, OFF_THRESHOLD]
        }
    }
    total = await db.uploaded_videos.count_documents(query)
    if total == 0:
        print("  No outliers to fix.")
        return
    print(f"  {total} outlier videos to normalize (~{total*30/3600:.1f} hours at 2 parallel)")
    sem = asyncio.Semaphore(FIX_CONCURRENCY)
    done = 0
    ok_count = 0
    start = time.time()

    async def work(doc):
        nonlocal done, ok_count
        async with sem:
            ok, msg = await apply_loudnorm_and_denoise(
                doc['url'],
                current_lufs=doc.get('lufs'),
                current_peak=doc.get('peak_dbtp'),
            )
            if ok:
                await db.uploaded_videos.update_one(
                    {'_id': doc['_id']},
                    {'$set': {'audio_normalized': True, 'audio_normalized_at': time.time()}}
                )
                ok_count += 1
            else:
                await db.uploaded_videos.update_one(
                    {'_id': doc['_id']},
                    {'$set': {'audio_normalize_failed': msg}}
                )
            done += 1
            if done % 10 == 0 or done <= 5:
                elapsed = time.time() - start
                rate = done / max(elapsed, 1)
                eta_h = (total - done) / max(rate, 0.001) / 3600
                print(f"  fix progress: {done}/{total} (ok={ok_count}) — ETA {eta_h:.1f}h")

    cursor = db.uploaded_videos.find(query, {'url': 1, 'lufs': 1, 'peak_dbtp': 1})
    tasks = []
    async for doc in cursor:
        tasks.append(asyncio.create_task(work(doc)))
    await asyncio.gather(*tasks)
    print(f"\n  fix complete: {ok_count}/{total} normalized in {(time.time()-start)/60:.1f}m")


async def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode in ('scan', 'all'):
        await scan_phase()
    if mode in ('fix', 'all'):
        await fix_phase()


if __name__ == '__main__':
    asyncio.run(main())
