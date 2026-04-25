"""Reconcile uploaded_videos collection with R2 bucket + channel references.
Adds DB records for every R2 file, pulling title/duration from channel refs when available.
"""
import asyncio
import os
import json
import uuid
import subprocess
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
R2_PUBLIC_URL = os.environ['R2_PUBLIC_URL'].rstrip('/')


def probe_duration(url):
    try:
        out = subprocess.check_output(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', url],
            timeout=45, stderr=subprocess.DEVNULL,
        )
        return int(float(json.loads(out)['format']['duration']))
    except Exception:
        return None


async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]

    with open('/tmp/r2_videos.json') as f:
        r2_objects = json.load(f)
    r2_map = {obj['key'].replace('videos/', ''): obj for obj in r2_objects}
    print(f'R2 video files: {len(r2_map)}')

    existing_by_fn = {}
    async for v in c.uploaded_videos.find({}, {'_id': 0}):
        if v.get('filename'):
            existing_by_fn[v['filename']] = v
    print(f'Existing uploaded_videos rows: {len(existing_by_fn)}')

    fn_to_meta = {}
    async for ch in c.channels.find({}, {'_id': 0, 'videos': 1}):
        for v in ch.get('videos', []):
            url = v.get('video_url') or ''
            if 'videos/' in url and url.endswith('.mp4'):
                fn = url.split('/')[-1]
                if fn in r2_map and fn not in fn_to_meta:
                    fn_to_meta[fn] = {
                        'title': v.get('title'),
                        'duration': v.get('duration'),
                        'thumbnail': v.get('thumbnail'),
                    }
    print(f'R2 files with channel metadata: {len(fn_to_meta)}')

    inserted = 0
    updated = 0
    orphan_probed = 0
    skipped = 0

    for fn, r2obj in r2_map.items():
        url = f'{R2_PUBLIC_URL}/videos/{fn}'
        meta = fn_to_meta.get(fn, {})
        existing = existing_by_fn.get(fn)

        if existing:
            patch = {}
            if not existing.get('url') or '/api/videos/' in (existing.get('url') or ''):
                patch['url'] = url
            if not existing.get('storage_type') or existing['storage_type'] != 'r2':
                patch['storage_type'] = 'r2'
            if existing.get('r2_pending'):
                patch['r2_pending'] = False
            if not existing.get('size'):
                patch['size'] = r2obj.get('size')
            if not existing.get('duration') and meta.get('duration'):
                patch['duration'] = meta['duration']
            if not existing.get('original_name'):
                patch['original_name'] = meta.get('title') or fn
            if patch:
                await c.uploaded_videos.update_one({'id': existing['id']}, {'$set': patch})
                updated += 1
            else:
                skipped += 1
            continue

        duration = meta.get('duration')
        if not duration:
            duration = probe_duration(url) or 0
            if duration:
                orphan_probed += 1

        doc = {
            'id': str(uuid.uuid4()),
            'filename': fn,
            'original_name': meta.get('title') or fn,
            'url': url,
            'size': r2obj.get('size', 0),
            'duration': duration or 0,
            'thumbnail': meta.get('thumbnail'),
            'owner_id': None,
            'storage_type': 'r2',
            'r2_pending': False,
            'created_at': r2obj.get('last_modified') or datetime.now(timezone.utc).isoformat(),
        }
        await c.uploaded_videos.insert_one(doc)
        inserted += 1
        if inserted % 100 == 0:
            print(f'  inserted {inserted}...')

    print(f'\nInserted new: {inserted}')
    print(f'Updated existing: {updated}')
    print(f'Orphans probed for duration: {orphan_probed}')
    print(f'Already complete (no change): {skipped}')

    total = await c.uploaded_videos.count_documents({})
    print(f'uploaded_videos total now: {total}')


asyncio.run(main())
