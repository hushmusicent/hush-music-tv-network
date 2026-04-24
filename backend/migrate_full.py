#!/usr/bin/env python3
"""Full migration from production to preview - channels, uploaded videos, commercials.
Preserves channel sort_order, reconciles uploaded_videos from channel refs (bypasses 100-limit).
"""
import asyncio
import httpx
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

PRODUCTION_URL = "https://broadcaster.emergent.host/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

ADMIN_EMAIL = "Hushmusicent419@gmail.com"
ADMIN_PASSWORD = "sstisdd419"


async def login(client):
    r = await client.post(f"{PRODUCTION_URL}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


async def main():
    print("=" * 60)
    print("Full Production → Preview Migration")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=90.0) as http:
        token = await login(http)
        auth = {"Authorization": f"Bearer {token}"}
        print("Logged in as admin.")

        print("\nFetching channels...")
        channels = (await http.get(f"{PRODUCTION_URL}/channels")).json()
        print(f"  {len(channels)} channels")

        print("Fetching uploaded videos (admin)...")
        uploaded_videos = (await http.get(f"{PRODUCTION_URL}/upload/videos", headers=auth)).json()
        if not isinstance(uploaded_videos, list):
            print(f"  WARN: unexpected response: {uploaded_videos}")
            uploaded_videos = []
        print(f"  {len(uploaded_videos)} uploaded videos (server-side limit applies)")

        print("Fetching commercials...")
        commercials = (await http.get(f"{PRODUCTION_URL}/commercials", headers=auth)).json()
        if not isinstance(commercials, list):
            commercials = []
        print(f"  {len(commercials)} commercials")

    # --- Apply to preview DB ---
    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]

    print("\nApplying channels (replace-by-id, preserves sort_order)...")
    ch_up = 0
    for ch in channels:
        cid = ch.get("id")
        if not cid:
            continue
        ch.pop("_id", None)
        await db.channels.replace_one({"id": cid}, ch, upsert=True)
        ch_up += 1
    print(f"  upserted {ch_up} channels")

    # Remove any extra preview-only channels not in production
    prod_ids = {c.get("id") for c in channels if c.get("id")}
    removed = 0
    async for existing in db.channels.find({}, {"_id": 0, "id": 1, "name": 1}):
        if existing.get("id") not in prod_ids:
            await db.channels.delete_one({"id": existing["id"]})
            print(f"  removed stale channel: {existing.get('name')} ({existing.get('id')})")
            removed += 1
    print(f"  removed {removed} stale channels")

    print("\nApplying uploaded_videos...")
    uv_up = 0
    for v in uploaded_videos:
        vid = v.get("id")
        if not vid:
            continue
        v.pop("_id", None)
        await db.uploaded_videos.replace_one({"id": vid}, v, upsert=True)
        uv_up += 1
    print(f"  upserted {uv_up} uploaded_videos")

    print("\nApplying commercials...")
    c_up = 0
    for c in commercials:
        cid = c.get("id")
        if not cid:
            continue
        c.pop("_id", None)
        await db.commercials.replace_one({"id": cid}, c, upsert=True)
        c_up += 1
    print(f"  upserted {c_up} commercials")

    # --- Fix any /api/videos/ URLs inside channel videos (copy of earlier fix) ---
    print("\nRewriting stale /api/videos/ URLs to R2...")
    channels_fixed = 0
    videos_fixed = 0
    async for ch in db.channels.find({}, {"_id": 0}):
        changed = False
        for v in ch.get("videos", []):
            url = v.get("video_url") or ""
            if url.startswith("/api/videos/"):
                fn = url.replace("/api/videos/", "")
                v["video_url"] = f"{R2_PUBLIC_URL}/videos/{fn}"
                if not v.get("type"):
                    v["type"] = "uploaded"
                videos_fixed += 1
                changed = True
        if changed:
            await db.channels.update_one({"id": ch["id"]}, {"$set": {"videos": ch["videos"]}})
            channels_fixed += 1
    print(f"  rewrote {videos_fixed} video URLs in {channels_fixed} channels")

    # Also in schedules
    sched_fixed = 0
    slots_fixed = 0
    async for s in db.schedules.find({}):
        changed = False
        for v in s.get("videos", []):
            url = v.get("video_url") or ""
            if url.startswith("/api/videos/"):
                fn = url.replace("/api/videos/", "")
                v["video_url"] = f"{R2_PUBLIC_URL}/videos/{fn}"
                if not v.get("type"):
                    v["type"] = "uploaded"
                slots_fixed += 1
                changed = True
        if changed:
            await db.schedules.update_one({"_id": s["_id"]}, {"$set": {"videos": s["videos"]}})
            sched_fixed += 1
    print(f"  rewrote {slots_fixed} slot URLs in {sched_fixed} schedules")

    # --- Verification ---
    print("\n" + "=" * 60)
    print("Verification")
    print("=" * 60)

    total_channels = await db.channels.count_documents({})
    total_videos_in_channels = 0
    total_bad_urls = 0
    total_uploaded_refs = 0
    total_youtube_refs = 0
    async for ch in db.channels.find({}, {"_id": 0, "name": 1, "videos": 1, "sort_order": 1}):
        for v in ch.get("videos", []):
            total_videos_in_channels += 1
            url = v.get("video_url") or ""
            if url.startswith("/api/videos/"):
                total_bad_urls += 1
            if url.startswith("http"):
                total_uploaded_refs += 1
            if v.get("youtube_id"):
                total_youtube_refs += 1

    total_uploaded = await db.uploaded_videos.count_documents({})
    total_commercials = await db.commercials.count_documents({})

    print(f"Channels: {total_channels}")
    print(f"Total videos assigned to channels: {total_videos_in_channels}")
    print(f"  - YouTube refs: {total_youtube_refs}")
    print(f"  - Uploaded/R2 refs: {total_uploaded_refs}")
    print(f"  - Stale /api/videos/ refs: {total_bad_urls}")
    print(f"uploaded_videos collection: {total_uploaded}")
    print(f"commercials: {total_commercials}")

    print("\nChannel order (sort_order ASC):")
    async for ch in db.channels.find({}, {"_id": 0, "name": 1, "sort_order": 1, "videos": 1}).sort("sort_order", 1):
        print(f"  {ch.get('sort_order'):>4}  {ch.get('name'):30}  ({len(ch.get('videos', []))} videos)")

    mongo.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(main())
