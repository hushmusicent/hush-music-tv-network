import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

async def migrate():
    # Load production data
    with open('/app/backend/prod_migration_data.json', 'r') as f:
        prod_channels = json.load(f)
    
    print(f"Loaded {len(prod_channels)} channels from production")
    
    # Connect to local MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Get existing channels
    existing = await db.channels.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    existing_ids = {c['id'] for c in existing}
    existing_names = {c['name'].strip().lower() for c in existing}
    
    print(f"Existing channels in DB: {len(existing)}")
    
    created = 0
    updated = 0
    errors = []
    
    for prod_channel in prod_channels:
        channel_id = prod_channel.get('id')
        channel_name = prod_channel.get('name', '').strip()
        
        if not channel_id:
            errors.append(f"Channel without ID: {channel_name}")
            continue
        
        # Prepare channel document
        channel_doc = {
            "id": channel_id,
            "name": channel_name,
            "description": prod_channel.get("description", ""),
            "category": prod_channel.get("category", "General"),
            "thumbnail": prod_channel.get("thumbnail", ""),
            "videos": prod_channel.get("videos", []),
            "is_public": prod_channel.get("is_public", True),
            "use_schedule": prod_channel.get("use_schedule", False),
            "sort_order": prod_channel.get("sort_order", 999),
            "favorites_count": prod_channel.get("favorites_count", 0),
            "owner_id": prod_channel.get("owner_id", "admin"),
            "owner_username": prod_channel.get("owner_username", "admin"),
            "created_at": prod_channel.get("created_at", "2026-01-01T00:00:00Z")
        }
        
        if channel_id in existing_ids:
            # Update existing channel
            result = await db.channels.replace_one(
                {"id": channel_id},
                channel_doc
            )
            if result.modified_count > 0:
                updated += 1
                print(f"  Updated: {channel_name} ({len(channel_doc['videos'])} videos)")
        else:
            # Create new channel
            await db.channels.insert_one(channel_doc)
            created += 1
            print(f"  Created: {channel_name} ({len(channel_doc['videos'])} videos)")
    
    # Delete channels not in production (cleanup old test channels)
    prod_ids = {c['id'] for c in prod_channels}
    for existing_ch in existing:
        if existing_ch['id'] not in prod_ids:
            if 'TEST_' in existing_ch.get('name', ''):
                await db.channels.delete_one({"id": existing_ch['id']})
                print(f"  Deleted test channel: {existing_ch['name']}")
    
    client.close()
    
    print(f"\n=== Migration Complete ===")
    print(f"Created: {created}")
    print(f"Updated: {updated}")
    if errors:
        print(f"Errors: {len(errors)}")
        for e in errors[:5]:
            print(f"  - {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
