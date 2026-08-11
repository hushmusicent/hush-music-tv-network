#!/usr/bin/env python3
"""Full library A/V drift audit + fix.

Phase 1: Probe every uploaded MP4 in R2 for audio/video stream duration mismatch.
Phase 2: Truncate any drifted file to min(video_dur, audio_dur) and re-upload.
Phase 3: Report DB updates so channel schedules reflect the corrected duration.

Runs concurrently: 12 probes at once, 2 fixes at once.

Usage:
  python3 fix_drift_library.py           # dry run — probe + report only
  python3 fix_drift_library.py fix       # probe AND fix
"""
import asyncio
import json
import os
import sys
import time
from urllib.parse import urlparse

sys.path.insert(0, '/app/backend')
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
DRIFT_THRESHOLD = 0.5  # seconds

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

DO_FIX = len(sys.argv) > 1 and sys.argv[1] == 'fix'


async def probe(url):
    """Return (video_dur, audio_dur, drift) or None on failure."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'ffprobe', '-v', 'error', '-show_streams', '-of', 'json', url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=45)
        if proc.returncode != 0 or not stdout:
            return None
        data = json.loads(stdout)
        v = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
        a = next((s for s in data.get('streams', []) if s.get('codec_type') == 'audio'), None)
        if not v or not a:
            return None
        vd = float(v.get('duration') or 0)
        ad = float(a.get('duration') or 0)
        return (vd, ad, abs(vd - ad))
    except Exception:
        return None


async def fix_one(url, target):
    """Download, truncate to target duration, re-upload."""
    import tempfile
    from r2_service import get_r2_client, R2_BUCKET_NAME
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, 'in.mp4')
        local_out = os.path.join(work, 'out.mp4')
        dl = await asyncio.create_subprocess_exec(
            'curl', '-sSfL', '-o', local_in, url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, derr = await asyncio.wait_for(dl.communicate(), timeout=600)
        if dl.returncode != 0:
            return False, f"download failed: {derr[:120]!r}"
        ff = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-i', local_in, '-c', 'copy',
            '-t', f'{target:.3f}', '-movflags', '+faststart', local_out,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, ferr = await asyncio.wait_for(ff.communicate(), timeout=900)
        if ff.returncode != 0:
            return False, f"ffmpeg failed: {ferr[-120:]!r}"
        r2 = get_r2_client()
        key = urlparse(url).path.lstrip('/')
        with open(local_out, 'rb') as fh:
            r2.upload_fileobj(fh, R2_BUCKET_NAME, key,
                              ExtraArgs={'ContentType': 'video/mp4', 'CacheControl': 'public, max-age=3600'})
        new_dur = int(target)
        await db.uploaded_videos.update_one(
            {'url': url}, {'$set': {'duration': new_dur, 'av_synced': True}}
        )
        await db.channels.update_many(
            {'videos.video_url': url},
            {'$set': {'videos.$[v].duration': new_dur}},
            array_filters=[{'v.video_url': url}],
        )
        return True, f"fixed → {new_dur}s"


async def collect_urls():
    """Return sorted list of unique R2 URLs across uploaded_videos + channel videos.
    Excludes videos already marked av_synced or av_broken (unrecoverable).
    """
    urls = set()
    async for v in db.uploaded_videos.find(
        {'av_synced': {'$ne': True}, 'av_broken': {'$ne': True}},
        {'url': 1}
    ):
        u = v.get('url')
        if u:
            urls.add(u)
    # Also include channel videos with video_url not covered above
    async for c in db.channels.find({}, {'videos.video_url': 1}):
        for v in c.get('videos', []) or []:
            u = v.get('video_url')
            if u:
                urls.add(u)
    return sorted(urls)


async def main():
    print(f"Mode: {'FIX' if DO_FIX else 'DRY RUN'}  |  Drift threshold: {DRIFT_THRESHOLD}s")
    urls = await collect_urls()
    print(f"Unique R2 URLs to probe: {len(urls)}")
    if not urls:
        return

    start = time.time()
    sem = asyncio.Semaphore(12)
    completed = 0
    lock = asyncio.Lock()

    async def check(url):
        nonlocal completed
        async with sem:
            r = await probe(url)
            async with lock:
                completed += 1
                if completed % 200 == 0:
                    elapsed = time.time() - start
                    rate = completed / max(elapsed, 0.1)
                    remaining = (len(urls) - completed) / max(rate, 0.1)
                    print(f"  probed {completed}/{len(urls)}  ({rate:.1f}/s, ETA {remaining/60:.1f}m)")
            return url, r

    probed = await asyncio.gather(*[check(u) for u in urls])

    ok = []
    drifted = []
    failed = []
    for url, res in probed:
        if res is None:
            failed.append(url)
        else:
            vd, ad, drift = res
            if drift >= DRIFT_THRESHOLD:
                drifted.append((url, vd, ad, drift))
            else:
                ok.append(url)

    print(f"\nProbe complete in {(time.time()-start)/60:.1f}m")
    print(f"  ✅ In-sync (drift < {DRIFT_THRESHOLD}s): {len(ok)}")
    print(f"  ⚠️  Drifted: {len(drifted)}")
    print(f"  ❌ Probe failed (skipped): {len(failed)}")

    # Sort drifted by severity descending
    drifted.sort(key=lambda x: -x[3])
    print(f"\nTop 20 worst drifts:")
    for url, vd, ad, d in drifted[:20]:
        key = urlparse(url).path.lstrip('/')[:70]
        print(f"  drift={d:.2f}s video={vd:.1f}s audio={ad:.1f}s  {key}")

    if not DO_FIX:
        print("\n(dry run — re-run with `fix` to actually re-encode)")
        return

    # Phase 2 — fix in parallel (limit=2, ffmpeg is CPU heavy)
    print(f"\nFixing {len(drifted)} drifted videos (parallel=2)...")
    fix_sem = asyncio.Semaphore(2)
    fix_start = time.time()
    fixed_count = 0
    fix_lock = asyncio.Lock()

    async def do_fix(url, vd, ad, drift):
        nonlocal fixed_count
        async with fix_sem:
            target = min(vd, ad)
            try:
                ok_, msg = await fix_one(url, target)
            except Exception as e:
                ok_, msg = False, f"exception: {str(e)[:120]}"
            async with fix_lock:
                fixed_count += 1
                if fixed_count % 25 == 0 or fixed_count <= 5:
                    elapsed = time.time() - fix_start
                    rate = fixed_count / max(elapsed, 0.1)
                    remaining = (len(drifted) - fixed_count) / max(rate, 0.01)
                    print(f"  fix progress: {fixed_count}/{len(drifted)}  ETA {remaining/60:.1f}m")
            return url, ok_, msg

    results = await asyncio.gather(*[do_fix(u, vd, ad, d) for (u, vd, ad, d) in drifted])
    fixed = sum(1 for _, ok_, _ in results if ok_)
    print(f"\n✅ Successfully fixed: {fixed} / {len(drifted)}")
    for url, ok_, msg in results:
        if not ok_:
            key = urlparse(url).path.lstrip('/')[:70]
            print(f"  ❌ {key}: {msg}")


if __name__ == '__main__':
    asyncio.run(main())
