#!/usr/bin/env python3
"""
Migration script to import channels and videos from broadcaster.emergent.host
"""
import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Source API
SOURCE_URL = "https://broadcaster.emergent.host"

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def fetch_source_data():
    """Fetch all channels and their videos from the source"""
    async with httpx.AsyncClient(timeout=30.0) as http:
        # Get channels with full data
        response = await http.get(f"{SOURCE_URL}/api/channels")
        channels = response.json()
        print(f"Fetched {len(channels)} channels from source")
        return channels

async def migrate_channels():
    """Migrate channels and videos to new database"""
    
    # Get admin user for owner assignment
    admin = await db.users.find_one({"is_admin": True})
    if not admin:
        print("ERROR: No admin user found. Run seed first.")
        return
    
    admin_id = admin["id"]
    admin_username = admin["username"]
    print(f"Using admin: {admin_username} ({admin_id})")
    
    # Fetch source data
    source_channels = await fetch_source_data()
    
    migrated = 0
    updated = 0
    total_videos = 0
    
    for channel in source_channels:
        channel_name = channel.get("name", "Unknown")
        channel_id = channel.get("id")
        videos = channel.get("videos", [])
        
        # Check if channel already exists
        existing = await db.channels.find_one({"name": channel_name})
        
        if existing:
            # Update existing channel with new videos
            existing_video_ids = {v.get("youtube_id") for v in existing.get("videos", [])}
            new_videos = []
            
            for video in videos:
                if video.get("youtube_id") not in existing_video_ids:
                    new_videos.append(video)
            
            if new_videos:
                # Append new videos
                await db.channels.update_one(
                    {"id": existing["id"]},
                    {"$push": {"videos": {"$each": new_videos}}}
                )
                print(f"  Updated '{channel_name}': added {len(new_videos)} new videos")
                updated += 1
                total_videos += len(new_videos)
            else:
                print(f"  Skipped '{channel_name}': no new videos")
        else:
            # Create new channel
            new_channel = {
                "id": channel_id,
                "name": channel_name,
                "description": channel.get("description", ""),
                "category": channel.get("category", "Entertainment"),
                "thumbnail": channel.get("thumbnail"),
                "is_public": True,
                "is_24_7": True,
                "random_play": channel.get("random_play", False),
                "owner_id": admin_id,
                "owner_username": admin_username,
                "videos": videos,
                "schedule": [],
                "viewers_count": channel.get("viewers_count", 0),
                "favorites_count": channel.get("favorites_count", 0),
                "created_at": channel.get("created_at", "2026-02-18T00:00:00Z")
            }
            
            await db.channels.insert_one(new_channel)
            print(f"  Created '{channel_name}': {len(videos)} videos")
            migrated += 1
            total_videos += len(videos)
    
    # Clear old schedules so they regenerate with new data
    await db.schedules.delete_many({})
    print("\nCleared old schedules for regeneration")
    
    print(f"\n=== Migration Complete ===")
    print(f"New channels created: {migrated}")
    print(f"Existing channels updated: {updated}")
    print(f"Total videos migrated: {total_videos}")

async def main():
    print("Starting migration from broadcaster.emergent.host...")
    print("=" * 50)
    await migrate_channels()
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
