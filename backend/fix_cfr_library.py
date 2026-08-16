#!/usr/bin/env python3
"""Library-wide CFR re-encode for videos with fractional framerates.

Phase 1 — Probe: concurrent ffprobe across every uploaded R2 URL. Flag any
  file whose framerate is fractional (29.97, 23.976, 59.94, etc.) — these
  are the ones causing "picture freezes, audio keeps playing" symptoms
  in web browsers and Fire TV.

Phase 2 — Fix: re-encode each flagged file with:
  - libx264 CRF 22, veryfast preset
  - Constant framerate at the nearest integer (30, 25, 24, 60)
  - Regenerated PTS/DTS (`-fflags +genpts+igndts`)
  - AAC 128k 48kHz stereo audio
  - +faststart for streaming

Idempotent: files already marked `reencoded: true` in `uploaded_videos` are
skipped so this can safely resume after interruption.

Usage:
  python3 fix_cfr_library.py           # probe only (dry run)
  python3 fix_cfr_library.py fix       # probe AND re-encode
  python3 fix_cfr_library.py fix 4     # probe AND re-encode with 4 parallel workers
"""
import asyncio, json, os, signal, sys, tempfile, time
from urllib.parse import urlparse

sys.path.insert(0, '/app/backend')
os.environ['PATH'] = '/root/.venv/lib/python3.11/site-packages/static_ffmpeg/bin/linux_arm64:' + os.environ.get('PATH','')

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

DO_FIX = len(sys.argv) > 1 and sys.argv[1] == 'fix'
PARALLEL_FIX = int(sys.argv[2]) if len(sys.argv) > 2 else 2

# --- Pause switch: writing this file will halt new fixes ---
PAUSE_FILE = '/app/backend/logs/cfr_reencode.pause'
STOP = False
def _stop_handler(*_):
    global STOP; STOP = True
signal.signal(signal.SIGTERM, _stop_handler)
signal.signal(signal.SIGINT, _stop_handler)


def parse_fps(rate_str):
    """Return float FPS from an ffprobe rate string like '30000/1001' or '30/1'."""
    if not rate_str or rate_str == '0/0':
        return 0.0
    try:
        num, den = rate_str.split('/')
        return float(num) / float(den) if float(den) else 0.0
    except Exception:
        return 0.0


def is_fractional(fps):
    """True if the framerate looks like a broadcast NTSC fractional rate
    (29.97, 23.976, 59.94, 47.952) rather than a clean integer.
    """
    if fps <= 0:
        return False
    nearest = round(fps)
    # If we're within 0.05 of an integer, treat as clean
    if abs(fps - nearest) < 0.05:
        return False
    return True


def nearest_int_fps(fps):
    """Pick the target CFR for a fractional framerate."""
    n = round(fps)
    if n < 12: return 15
    if n <= 25: return 25 if abs(fps-25)<abs(fps-24) else 24
    if n <= 32: return 30
    if n <= 50: return 50
    return 60


async def probe(url):
    try:
        p = await asyncio.create_subprocess_exec(
            'ffprobe', '-v', 'error', '-show_streams', '-of', 'json', url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        out, _ = await asyncio.wait_for(p.communicate(), timeout=45)
        if p.returncode != 0 or not out:
            return None
        data = json.loads(out)
        v = next((s for s in data.get('streams', []) if s.get('codec_type')=='video'), None)
        a = next((s for s in data.get('streams', []) if s.get('codec_type')=='audio'), None)
        if not v:
            return None
        r = parse_fps(v.get('r_frame_rate'))
        avg = parse_fps(v.get('avg_frame_rate'))
        return {
            'r_fps': r,
            'avg_fps': avg,
            'v_codec': v.get('codec_name'),
            'a_codec': (a or {}).get('codec_name'),
            'v_dur': float(v.get('duration') or 0),
        }
    except Exception:
        return None


async def reencode(url, target_fps):
    """Download, re-encode, upload. Returns (ok, new_dur_seconds, msg)."""
    key = urlparse(url).path.lstrip('/')
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, 'in.mp4')
        local_out = os.path.join(work, 'out.mp4')
        dl = await asyncio.create_subprocess_exec(
            'curl', '-sSfL', '--connect-timeout', '30', '--max-time', '1200',
            '-o', local_in, url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, derr = await asyncio.wait_for(dl.communicate(), timeout=1250)
        if dl.returncode != 0:
            return False, 0, f'download fail: {derr[:100]!r}'
        cmd = [
            'ffmpeg', '-y',
            '-fflags', '+genpts+igndts',
            '-i', local_in,
            '-map', '0:v:0', '-map', '0:a:0?',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
            '-fps_mode', 'cfr', '-r', str(target_fps),
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
            '-async', '1',
            '-movflags', '+faststart',
            local_out,
        ]
        ff = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, ferr = await asyncio.wait_for(ff.communicate(), timeout=3600)
        if ff.returncode != 0:
            return False, 0, f'ffmpeg fail: {ferr[-120:]!r}'
        # New duration
        p = await asyncio.create_subprocess_exec(
            'ffprobe','-v','error','-show_format','-of','json', local_out,
            stdout=asyncio.subprocess.PIPE)
        out, _ = await p.communicate()
        try:
            new_dur = int(float(json.loads(out).get('format',{}).get('duration',0)))
        except Exception:
            new_dur = 0
        # Upload
        from r2_service import get_r2_client, R2_BUCKET_NAME
        r2 = get_r2_client()
        with open(local_out, 'rb') as fh:
            r2.upload_fileobj(fh, R2_BUCKET_NAME, key,
                              ExtraArgs={'ContentType':'video/mp4','CacheControl':'public, max-age=3600'})
        # DB update
        upd = {'reencoded': True, 'target_fps': target_fps}
        if new_dur > 0:
            upd['duration'] = new_dur
        await db.uploaded_videos.update_one({'url': url}, {'$set': upd})
        if new_dur > 0:
            await db.channels.update_many(
                {'videos.video_url': url},
                {'$set': {'videos.$[v].duration': new_dur}},
                array_filters=[{'v.video_url': url}]
            )
        return True, new_dur, 'ok'


async def collect_urls():
    """All R2 URLs not yet marked reencoded."""
    urls = set()
    async for v in db.uploaded_videos.find(
        {'reencoded': {'$ne': True}}, {'url': 1}
    ):
        u = v.get('url')
        if u:
            urls.add(u)
    async for c in db.channels.find({}, {'videos.video_url': 1}):
        for v in c.get('videos', []) or []:
            u = v.get('video_url')
            if u:
                urls.add(u)
    # Remove any already marked reencoded via uploaded_videos
    already = set()
    async for v in db.uploaded_videos.find(
        {'reencoded': True}, {'url':1}
    ):
        if v.get('url'):
            already.add(v['url'])
    return sorted(urls - already)


async def main():
    print(f"Mode: {'FIX' if DO_FIX else 'PROBE ONLY'}  |  Fix parallelism: {PARALLEL_FIX}")
    urls = await collect_urls()
    print(f"URLs to probe: {len(urls)}")
    if not urls:
        return

    # PHASE 1: probe
    t0 = time.time()
    sem = asyncio.Semaphore(12)
    done = 0
    lock = asyncio.Lock()

    async def do_probe(url):
        nonlocal done
        async with sem:
            r = await probe(url)
            async with lock:
                done += 1
                if done % 300 == 0:
                    rate = done / max(time.time()-t0, 0.1)
                    remaining = (len(urls)-done)/max(rate,0.1)
                    print(f'  probed {done}/{len(urls)}  ({rate:.1f}/s, ETA {remaining/60:.1f}m)')
            return url, r

    results = await asyncio.gather(*[do_probe(u) for u in urls])
    print(f'Probe complete in {(time.time()-t0)/60:.1f}m\n')

    frac = []
    clean = []
    failed = []
    for url, r in results:
        if r is None:
            failed.append(url)
            continue
        fps = r['r_fps'] or r['avg_fps']
        if is_fractional(fps):
            frac.append((url, fps, r))
        else:
            clean.append(url)

    print(f"Results:")
    print(f"  ✅ Clean framerate (integer): {len(clean)}")
    print(f"  ⚠️  Fractional framerate (needs re-encode): {len(frac)}")
    print(f"  ❌ Probe failed: {len(failed)}")

    # Framerate distribution
    from collections import Counter
    dist = Counter(round(f, 2) for _, f, _ in frac)
    print(f"\nFractional framerate distribution:")
    for fps, cnt in dist.most_common(10):
        print(f"  {fps} fps: {cnt} videos")

    if not DO_FIX:
        print("\n(dry run — re-run with `fix` to actually re-encode)")
        return

    # PHASE 2: fix
    print(f"\nRe-encoding {len(frac)} videos (parallel={PARALLEL_FIX})...")
    print(f"Create {PAUSE_FILE} to halt new fixes cleanly.\n")

    fix_sem = asyncio.Semaphore(PARALLEL_FIX)
    fx_start = time.time()
    fx_done = 0
    fx_ok = 0
    fx_lock = asyncio.Lock()

    async def do_fix(url, fps, r):
        nonlocal fx_done, fx_ok
        if STOP or os.path.exists(PAUSE_FILE):
            return url, False, 'paused'
        async with fix_sem:
            if STOP or os.path.exists(PAUSE_FILE):
                return url, False, 'paused'
            target = nearest_int_fps(fps)
            try:
                ok, new_dur, msg = await reencode(url, target)
            except Exception as e:
                ok, new_dur, msg = False, 0, f'exc: {str(e)[:100]}'
            async with fx_lock:
                fx_done += 1
                if ok:
                    fx_ok += 1
                elapsed = time.time() - fx_start
                rate = fx_done / max(elapsed, 0.1)
                remaining = (len(frac) - fx_done) / max(rate, 0.01)
                if fx_done % 10 == 0 or fx_done <= 5:
                    print(f"  fix progress: {fx_done}/{len(frac)}  ok={fx_ok}  ETA {remaining/60:.1f}m")
                if not ok:
                    print(f"    ❌ {urlparse(url).path[-40:]}: {msg}")
            return url, ok, msg

    await asyncio.gather(*[do_fix(u, f, r) for (u, f, r) in frac])
    print(f"\n✅ Complete: {fx_ok}/{len(frac)} re-encoded successfully.")


if __name__ == '__main__':
    asyncio.run(main())
