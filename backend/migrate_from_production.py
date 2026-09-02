#!/usr/bin/env python3
"""Migrate data from production to preview environment"""

import asyncio
import httpx
import os
from motor.motor_asyncio import AsyncIOMotorClient

PRODUCTION_URL = "https://broadcaster.emergent.host/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "hush_music_tv")

async def fetch_production_data():
    """Fetch all data from production API"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Fetch channels
        print("Fetching channels from production...")
        channels_resp = await client.get(f"{PRODUCTION_URL}/channels")
        channels = channels_resp.json()
        print(f"  Found {len(channels)} channels")
        
        # Fetch uploaded videos (public endpoint)
        print("Fetching uploaded videos...")
        try:
            videos_resp = await client.get(f"{PRODUCTION_URL}/upload/videos")
            uploaded_videos = videos_resp.json()
            print(f"  Found {len(uploaded_videos)} uploaded videos")
        except Exception:
            uploaded_videos = []
            print("  Could not fetch uploaded videos")
        
        # Fetch commercials
        print("Fetching commercials...")
        try:
            commercials_resp = await client.get(f"{PRODUCTION_URL}/commercials")
            commercials = commercials_resp.json()
            print(f"  Found {len(commercials)} commercials")
        except Exception:
            commercials = []
            print("  Could not fetch commercials")
        
        return {
            "channels": channels,
            "uploaded_videos": uploaded_videos,
            "commercials": commercials
        }

async def migrate_to_preview(data):
    """Import data into preview database"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Migrate channels
    print("\nMigrating channels...")
    channels_col = db.channels
    
    for channel in data["channels"]:
        channel_id = channel.get("id")
        if not channel_id:
            continue
            
        # Check if channel exists
        existing = await channels_col.find_one({"id": channel_id})
        if existing:
            # Update existing channel
            await channels_col.update_one(
                {"id": channel_id},
                {"$set": channel}
            )
            print(f"  Updated: {channel.get('name')}")
        else:
            # Insert new channel
            await channels_col.insert_one(channel)
            print(f"  Created: {channel.get('name')}")
    
    # Migrate uploaded videos
    print("\nMigrating uploaded videos...")
    videos_col = db.uploaded_videos
    
    for video in data["uploaded_videos"]:
        video_id = video.get("id")
        if not video_id:
            continue
            
        existing = await videos_col.find_one({"id": video_id})
        if existing:
            await videos_col.update_one({"id": video_id}, {"$set": video})
            print(f"  Updated: {video.get('original_name', video.get('filename'))}")
        else:
            await videos_col.insert_one(video)
            print(f"  Created: {video.get('original_name', video.get('filename'))}")
    
    # Migrate commercials
    print("\nMigrating commercials...")
    commercials_col = db.commercials
    
    for commercial in data["commercials"]:
        commercial_id = commercial.get("id")
        if not commercial_id:
            continue
            
        existing = await commercials_col.find_one({"id": commercial_id})
        if existing:
            await commercials_col.update_one({"id": commercial_id}, {"$set": commercial})
            print(f"  Updated: {commercial.get('original_name', commercial.get('filename'))}")
        else:
            await commercials_col.insert_one(commercial)
            print(f"  Created: {commercial.get('original_name', commercial.get('filename'))}")
    
    client.close()
    print("\nMigration complete!")

async def main():
    print("=" * 50)
    print("Production to Preview Migration")
    print("=" * 50)
    
    # Fetch data from production
    data = await fetch_production_data()
    
    # Migrate to preview
    await migrate_to_preview(data)
    
    # Verify
    print("\n" + "=" * 50)
    print("Verification")
    print("=" * 50)
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    channels_count = await db.channels.count_documents({})
    videos_count = await db.uploaded_videos.count_documents({})
    commercials_count = await db.commercials.count_documents({})
    
    print(f"Preview database now has:")
    print(f"  - {channels_count} channels")
    print(f"  - {videos_count} uploaded videos")
    print(f"  - {commercials_count} commercials")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
