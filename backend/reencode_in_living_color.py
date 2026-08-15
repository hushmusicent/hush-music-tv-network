"""Diagnose + re-encode In Living Color episodes.
Fixes:
  - Regenerate PTS/DTS (broken timestamps → cause freeze/audio-continue)
  - Force constant framerate (VFR → mid-video jank)
  - Re-encode audio to AAC 128k for reliability
  - +faststart for streaming
"""
import asyncio, json, os, sys, tempfile
from urllib.parse import urlparse

sys.path.insert(0, '/app/backend')
os.environ['PATH'] = '/root/.venv/lib/python3.11/site-packages/static_ffmpeg/bin/linux_arm64:' + os.environ.get('PATH','')
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from r2_service import get_r2_client, R2_BUCKET_NAME

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def probe(url):
    p = await asyncio.create_subprocess_exec(
        'ffprobe', '-v', 'error', '-show_streams', '-show_format',
        '-of', 'json', url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, _ = await asyncio.wait_for(p.communicate(), timeout=60)
    return json.loads(out) if out else {}


async def reencode_one(title, url):
    print(f'\n=== {title} ===')
    key = urlparse(url).path.lstrip('/')
    with tempfile.TemporaryDirectory() as work:
        local_in = os.path.join(work, 'in.mp4')
        local_out = os.path.join(work, 'out.mp4')

        # Diagnose
        try:
            info = await probe(url)
            v = next((s for s in info.get('streams', []) if s.get('codec_type')=='video'), {})
            a = next((s for s in info.get('streams', []) if s.get('codec_type')=='audio'), {})
            print(f"  video: codec={v.get('codec_name')} r_frame_rate={v.get('r_frame_rate')} avg={v.get('avg_frame_rate')} dur={v.get('duration')}")
            print(f"  audio: codec={a.get('codec_name')} sr={a.get('sample_rate')} dur={a.get('duration')}")
        except Exception as e:
            print(f"  probe failed: {e}")

        # Download
        print('  downloading...')
        dl = await asyncio.create_subprocess_exec(
            'curl', '-sSfL', '-o', local_in, url,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
        _, err = await asyncio.wait_for(dl.communicate(), timeout=600)
        if dl.returncode != 0:
            print(f"  download FAIL: {err[:120]!r}")
            return False, 0

        size_mb = os.path.getsize(local_in) / (1024*1024)
        print(f"  downloaded {size_mb:.1f}MB")

        # Re-encode with CFR + regen timestamps + faststart
        print('  re-encoding (H.264 CRF 22, CFR 30, AAC 128k, +faststart)...')
        cmd = [
            'ffmpeg', '-y',
            '-fflags', '+genpts+igndts',
            '-i', local_in,
            '-map', '0:v:0', '-map', '0:a:0',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
            '-fps_mode', 'cfr', '-r', '30',
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
            print(f"  ffmpeg FAIL: {ferr[-200:]!r}")
            return False, 0

        # Get new duration
        p = await asyncio.create_subprocess_exec(
            'ffprobe','-v','error','-show_format','-of','json', local_out,
            stdout=asyncio.subprocess.PIPE)
        out, _ = await p.communicate()
        new_dur = int(float(json.loads(out).get('format',{}).get('duration',0)))
        out_mb = os.path.getsize(local_out) / (1024*1024)
        print(f"  encoded to {out_mb:.1f}MB, duration={new_dur}s")

        # Upload
        print('  uploading to R2...')
        r2 = get_r2_client()
        with open(local_out, 'rb') as fh:
            r2.upload_fileobj(fh, R2_BUCKET_NAME, key,
                              ExtraArgs={'ContentType':'video/mp4','CacheControl':'public, max-age=3600'})

        # Update DB
        await db.uploaded_videos.update_one(
            {'url': url},
            {'$set': {'duration': new_dur, 'av_synced': True, 'reencoded': True}}
        )
        await db.channels.update_many(
            {'videos.video_url': url},
            {'$set': {'videos.$[v].duration': new_dur}},
            array_filters=[{'v.video_url': url}]
        )
        print('  ✅ done')
        return True, new_dur


async def main():
    ch = await db.channels.find_one({'name':'Sketch Comedy Tv'}, {'_id':0, 'videos':1})
    ilc = [v for v in (ch.get('videos') or [])
           if 'iving' in str(v.get('title','')).lower() and 'olor' in str(v.get('title','')).lower()
           and v.get('video_url')]
    print(f'Re-encoding {len(ilc)} In Living Color episodes\n')

    # Serial to avoid overloading; you can bump to concurrent if needed
    ok = 0
    for v in ilc:
        try:
            success, _ = await reencode_one(v.get('title',''), v.get('video_url'))
            if success: ok += 1
        except Exception as e:
            print(f"  EXCEPTION: {e}")

    print(f'\nDone. {ok}/{len(ilc)} re-encoded.')


asyncio.run(main())
