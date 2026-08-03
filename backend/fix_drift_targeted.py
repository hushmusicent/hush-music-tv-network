#!/usr/bin/env python3
"""Targeted A/V drift audit + fix for specific videos (Sanford & Son + Sketch Comedy).
Probes each R2 video for stream duration mismatch and truncates to the shorter stream.
"""
import asyncio
import json
import os
import sys
import subprocess
from urllib.parse import urlparse

# Force sync module resolution to server.py which lives in /app/backend
sys.path.insert(0, '/app/backend')
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
DRIFT_THRESHOLD = 0.5

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def probe(r2_url):
    """Return (video_dur, audio_dur, drift) or None on failure."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'ffprobe', '-v', 'error', '-show_streams', '-of', 'json', r2_url,
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


async def fix_drift(video_id, r2_url, object_key, target):
    """Download, truncate to target duration, re-upload."""
    import tempfile
    from r2_service import get_r2_client, R2_BUCKET_NAME
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, 'in.mp4')
        local_out = os.path.join(work, 'out.mp4')
        # Download
        dl = await asyncio.create_subprocess_exec(
            'curl', '-sSfL', '-o', local_in, r2_url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, derr = await asyncio.wait_for(dl.communicate(), timeout=600)
        if dl.returncode != 0:
            return False, f"download failed: {derr[:120]}"
        # Truncate
        ff = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-i', local_in, '-c', 'copy',
            '-t', f'{target:.3f}', '-movflags', '+faststart', local_out,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
        )
        _, ferr = await asyncio.wait_for(ff.communicate(), timeout=600)
        if ff.returncode != 0:
            return False, f"ffmpeg failed: {ferr[-120:]}"
        # Re-upload
        r2 = get_r2_client()
        with open(local_out, 'rb') as fh:
            r2.upload_fileobj(fh, R2_BUCKET_NAME, object_key,
                              ExtraArgs={'ContentType': 'video/mp4', 'CacheControl': 'public, max-age=3600'})
        # Update DB
        new_dur = int(target)
        await db.uploaded_videos.update_one(
            {'url': r2_url}, {'$set': {'duration': new_dur, 'av_synced': True}}
        )
        await db.channels.update_many(
            {'videos.video_url': r2_url},
            {'$set': {'videos.$[v].duration': new_dur}},
            array_filters=[{'v.video_url': r2_url}],
        )
        return True, f"fixed → {new_dur}s"


def extract_key(r2_url):
    """Extract object key from R2 URL"""
    path = urlparse(r2_url).path
    return path.lstrip('/')


async def collect_targets():
    """Return list of (label, video_url) tuples for Sanford & Sketch Comedy uploaded videos."""
    targets = []
    seen_urls = set()
    async for c in db.channels.find({}, {'name':1, 'videos':1}):
        cname = c['name']
        include_all = cname == 'Sketch Comedy Tv'
        for v in c.get('videos', []):
            url = v.get('video_url')
            if not url or url in seen_urls:
                continue
            title = str(v.get('title', '')).strip()
            if include_all:
                seen_urls.add(url)
                targets.append((f"[{cname}] {title[:60]}", url))
            elif 'sanford' in title.lower():
                seen_urls.add(url)
                targets.append((f"[{cname}] {title[:60]}", url))
    return targets


async def main():
    targets = await collect_targets()
    print(f"Total unique R2 videos to check: {len(targets)}")

    # Phase 1 — probe all (concurrent)
    sem = asyncio.Semaphore(12)
    async def check(label, url):
        async with sem:
            r = await probe(url)
            return label, url, r

    print("\nProbing streams...")
    probed = await asyncio.gather(*[check(l, u) for l, u in targets])

    ok = []
    drifted = []
    failed = []
    for label, url, res in probed:
        if res is None:
            failed.append((label, url))
        else:
            vd, ad, drift = res
            if drift >= DRIFT_THRESHOLD:
                drifted.append((label, url, vd, ad, drift))
            else:
                ok.append((label, url, drift))

    print(f"\nResults:")
    print(f"  ✅ In-sync (drift < {DRIFT_THRESHOLD}s): {len(ok)}")
    print(f"  ⚠️  Drifted: {len(drifted)}")
    print(f"  ❌ Probe failed: {len(failed)}")

    if drifted:
        print("\nDrifted videos (will be fixed):")
        for l, u, vd, ad, d in drifted[:30]:
            print(f"  {l}: video={vd:.1f}s audio={ad:.1f}s drift={d:.2f}s")
        if len(drifted) > 30:
            print(f"  ... and {len(drifted)-30} more")

    if failed:
        print("\nProbe failed (skipping):")
        for l, u in failed[:10]:
            print(f"  {l}: {u[:80]}")

    # Phase 2 — fix drifted
    print(f"\nFixing {len(drifted)} drifted videos...")
    fix_sem = asyncio.Semaphore(2)  # Limit concurrent ffmpeg
    async def do_fix(label, url, vd, ad, drift):
        async with fix_sem:
            target = min(vd, ad)
            key = extract_key(url)
            try:
                ok, msg = await fix_drift(url, url, key, target)
                return label, ok, msg
            except Exception as e:
                return label, False, str(e)[:120]

    results = await asyncio.gather(*[do_fix(*d) for d in drifted])
    fixed = sum(1 for _, ok, _ in results if ok)
    print(f"\n✅ Successfully fixed: {fixed} / {len(drifted)}")
    for label, ok, msg in results:
        icon = '✅' if ok else '❌'
        print(f"  {icon} {label}: {msg}")


if __name__ == '__main__':
    asyncio.run(main())
