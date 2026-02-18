#!/usr/bin/env python3
"""
Script to migrate channel thumbnails from broadcaster.emergent.host to local storage
"""
import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Local images directory
IMAGES_DIR = ROOT_DIR / "uploads" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

async def migrate_thumbnails():
    """Download thumbnails from old server and store locally"""
    
    channels = await db.channels.find({}).to_list(None)
    print(f"Found {len(channels)} channels")
    
    migrated = 0
    failed = 0
    skipped = 0
    
    async with httpx.AsyncClient(timeout=30.0) as http:
        for channel in channels:
            thumbnail = channel.get("thumbnail")
            channel_name = channel.get("name", "Unknown")
            
            # Skip if no thumbnail or already local
            if not thumbnail:
                print(f"  {channel_name}: No thumbnail")
                skipped += 1
                continue
                
            if thumbnail.startswith("/api/images/") or "tv-schedule-sync" in thumbnail:
                print(f"  {channel_name}: Already local")
                skipped += 1
                continue
            
            # Skip if not from broadcaster.emergent.host
            if "broadcaster.emergent.host" not in thumbnail:
                print(f"  {channel_name}: External URL (keeping as-is)")
                skipped += 1
                continue
            
            try:
                # Download the image
                print(f"  {channel_name}: Downloading from {thumbnail[:60]}...")
                response = await http.get(thumbnail)
                
                if response.status_code == 200:
                    # Determine file extension
                    content_type = response.headers.get("content-type", "image/jpeg")
                    ext = ".jpg"
                    if "png" in content_type:
                        ext = ".png"
                    elif "webp" in content_type:
                        ext = ".webp"
                    elif "gif" in content_type:
                        ext = ".gif"
                    
                    # Save locally
                    image_id = str(uuid.uuid4())
                    filename = f"{image_id}{ext}"
                    file_path = IMAGES_DIR / filename
                    
                    with open(file_path, "wb") as f:
                        f.write(response.content)
                    
                    # Update database with local URL
                    new_url = f"/api/images/{filename}"
                    await db.channels.update_one(
                        {"id": channel["id"]},
                        {"$set": {"thumbnail": new_url}}
                    )
                    
                    print(f"    -> Saved as {new_url}")
                    migrated += 1
                else:
                    print(f"    -> Failed: HTTP {response.status_code}")
                    failed += 1
                    
            except Exception as e:
                print(f"    -> Error: {e}")
                failed += 1
    
    print(f"\n=== Thumbnail Migration Complete ===")
    print(f"Migrated: {migrated}")
    print(f"Failed: {failed}")
    print(f"Skipped: {skipped}")

async def main():
    print("Starting thumbnail migration...")
    print("=" * 50)
    await migrate_thumbnails()
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
