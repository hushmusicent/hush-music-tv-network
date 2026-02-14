from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads" / "videos"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'tv-network-secret-key-change-in-prod')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="TV Network API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ===================== MODELS =====================

class UserBase(BaseModel):
    email: EmailStr
    username: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    username: str
    avatar: Optional[str] = None
    is_admin: bool = False
    created_at: str

# Admin credentials
ADMIN_EMAIL = "Hushmusicent419@gmail.com"
ADMIN_PASSWORD = "sstisdd419"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class VideoItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    youtube_id: str
    title: str
    thumbnail: Optional[str] = None
    duration: int = 0  # in seconds
    order: int = 0

class VideoCreate(BaseModel):
    youtube_id: str
    title: str
    thumbnail: Optional[str] = None
    duration: int = 0

class ScheduleSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    video_id: str
    start_time: str  # HH:MM format
    day_of_week: int  # 0=Monday, 6=Sunday

class ScheduleSlotCreate(BaseModel):
    video_id: str
    start_time: str
    day_of_week: int

class ChannelBase(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "General"
    thumbnail: Optional[str] = None
    is_public: bool = True
    is_24_7: bool = True

class ChannelCreate(ChannelBase):
    pass

class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    thumbnail: Optional[str] = None
    is_public: Optional[bool] = None
    is_24_7: Optional[bool] = None

class ChannelResponse(ChannelBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    owner_id: str
    owner_username: str
    videos: List[VideoItem] = []
    schedule: List[ScheduleSlot] = []
    viewers_count: int = 0
    favorites_count: int = 0
    created_at: str

class CategoryResponse(BaseModel):
    name: str
    count: int
    thumbnail: Optional[str] = None

# ===================== AUTH HELPERS =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        return user
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def require_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user = await get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate):
    # Registration is disabled - admin only system
    raise HTTPException(status_code=403, detail="Registration is disabled. Admin only system.")

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"])
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        avatar=user.get("avatar"),
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(require_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        username=user["username"],
        avatar=user.get("avatar"),
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )

# ===================== CHANNEL ROUTES =====================

@api_router.get("/channels", response_model=List[ChannelResponse])
async def get_channels(
    category: Optional[str] = None,
    search: Optional[str] = None,
    user: Optional[dict] = Depends(get_current_user)
):
    query = {"is_public": True}
    if category and category != "All":
        query["category"] = category
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    channels = await db.channels.find(query, {"_id": 0}).sort("favorites_count", -1).to_list(100)
    return channels

@api_router.get("/channels/featured", response_model=List[ChannelResponse])
async def get_featured_channels():
    channels = await db.channels.find(
        {"is_public": True},
        {"_id": 0}
    ).sort("favorites_count", -1).limit(6).to_list(6)
    return channels

@api_router.get("/channels/my", response_model=List[ChannelResponse])
async def get_my_channels(user: dict = Depends(require_user)):
    channels = await db.channels.find({"owner_id": user["id"]}, {"_id": 0}).to_list(100)
    return channels

@api_router.get("/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(channel_id: str, user: Optional[dict] = Depends(get_current_user)):
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if not channel.get("is_public") and (not user or channel["owner_id"] != user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return channel

@api_router.post("/channels", response_model=ChannelResponse)
async def create_channel(data: ChannelCreate, user: dict = Depends(require_user)):
    channel_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    channel_doc = {
        "id": channel_id,
        "name": data.name,
        "description": data.description,
        "category": data.category,
        "thumbnail": data.thumbnail,
        "is_public": data.is_public,
        "is_24_7": data.is_24_7,
        "owner_id": user["id"],
        "owner_username": user["username"],
        "videos": [],
        "schedule": [],
        "viewers_count": 0,
        "favorites_count": 0,
        "created_at": now
    }
    
    await db.channels.insert_one(channel_doc)
    if "_id" in channel_doc:
        del channel_doc["_id"]
    
    return channel_doc

@api_router.put("/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(channel_id: str, data: ChannelUpdate, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can edit any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if update_data:
        await db.channels.update_one({"id": channel_id}, {"$set": update_data})
    
    updated = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return updated

@api_router.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can delete any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.channels.delete_one({"id": channel_id})
    # Remove from all favorites
    await db.users.update_many({}, {"$pull": {"favorites": channel_id}})
    
    return {"message": "Channel deleted"}

# ===================== VIDEO ROUTES =====================

@api_router.post("/channels/{channel_id}/videos", response_model=ChannelResponse)
async def add_video_to_channel(channel_id: str, data: VideoCreate, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can add videos to any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    video = VideoItem(
        youtube_id=data.youtube_id,
        title=data.title,
        thumbnail=data.thumbnail or f"https://img.youtube.com/vi/{data.youtube_id}/maxresdefault.jpg",
        duration=data.duration,
        order=len(channel.get("videos", []))
    )
    
    await db.channels.update_one(
        {"id": channel_id},
        {"$push": {"videos": video.model_dump()}}
    )
    
    updated = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return updated

@api_router.delete("/channels/{channel_id}/videos/{video_id}")
async def remove_video_from_channel(channel_id: str, video_id: str, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can remove videos from any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.channels.update_one(
        {"id": channel_id},
        {"$pull": {"videos": {"id": video_id}}}
    )
    
    return {"message": "Video removed"}

@api_router.put("/channels/{channel_id}/videos/reorder")
async def reorder_videos(channel_id: str, video_ids: List[str], user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can reorder videos in any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    videos = channel.get("videos", [])
    video_map = {v["id"]: v for v in videos}
    
    reordered = []
    for i, vid in enumerate(video_ids):
        if vid in video_map:
            video_map[vid]["order"] = i
            reordered.append(video_map[vid])
    
    await db.channels.update_one({"id": channel_id}, {"$set": {"videos": reordered}})
    
    return {"message": "Videos reordered"}

# ===================== SCHEDULE ROUTES =====================

@api_router.post("/channels/{channel_id}/schedule", response_model=ChannelResponse)
async def add_schedule_slot(channel_id: str, data: ScheduleSlotCreate, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can add schedule to any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    slot = ScheduleSlot(
        video_id=data.video_id,
        start_time=data.start_time,
        day_of_week=data.day_of_week
    )
    
    await db.channels.update_one(
        {"id": channel_id},
        {"$push": {"schedule": slot.model_dump()}}
    )
    
    updated = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    return updated

@api_router.delete("/channels/{channel_id}/schedule/{slot_id}")
async def remove_schedule_slot(channel_id: str, slot_id: str, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can remove schedule from any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.channels.update_one(
        {"id": channel_id},
        {"$pull": {"schedule": {"id": slot_id}}}
    )
    
    return {"message": "Schedule slot removed"}

# ===================== FAVORITES ROUTES =====================

@api_router.get("/favorites", response_model=List[ChannelResponse])
async def get_favorites(user: dict = Depends(require_user)):
    favorites = user.get("favorites", [])
    if not favorites:
        return []
    
    channels = await db.channels.find({"id": {"$in": favorites}}, {"_id": 0}).to_list(100)
    return channels

@api_router.post("/favorites/{channel_id}")
async def add_favorite(channel_id: str, user: dict = Depends(require_user)):
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if channel_id not in user.get("favorites", []):
        await db.users.update_one({"id": user["id"]}, {"$push": {"favorites": channel_id}})
        await db.channels.update_one({"id": channel_id}, {"$inc": {"favorites_count": 1}})
    
    return {"message": "Added to favorites"}

@api_router.delete("/favorites/{channel_id}")
async def remove_favorite(channel_id: str, user: dict = Depends(require_user)):
    if channel_id in user.get("favorites", []):
        await db.users.update_one({"id": user["id"]}, {"$pull": {"favorites": channel_id}})
        await db.channels.update_one({"id": channel_id}, {"$inc": {"favorites_count": -1}})
    
    return {"message": "Removed from favorites"}

# ===================== CATEGORIES ROUTES =====================

CATEGORIES = [
    {"name": "All", "thumbnail": "https://images.unsplash.com/photo-1576307302704-b6142d572612?w=400"},
    {"name": "Entertainment", "thumbnail": "https://images.unsplash.com/photo-1544618869-f9a365fc4526?w=400"},
    {"name": "Music", "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400"},
    {"name": "Sports", "thumbnail": "https://images.unsplash.com/photo-1461896836934- voices?w=400"},
    {"name": "News", "thumbnail": "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=400"},
    {"name": "Gaming", "thumbnail": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400"},
    {"name": "Education", "thumbnail": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400"},
    {"name": "Lifestyle", "thumbnail": "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400"},
    {"name": "Technology", "thumbnail": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400"},
    {"name": "Comedy", "thumbnail": "https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=400"},
]

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories():
    result = []
    for cat in CATEGORIES:
        if cat["name"] == "All":
            count = await db.channels.count_documents({"is_public": True})
        else:
            count = await db.channels.count_documents({"category": cat["name"], "is_public": True})
        result.append(CategoryResponse(name=cat["name"], count=count, thumbnail=cat["thumbnail"]))
    return result

# ===================== TV GUIDE ROUTES =====================

@api_router.get("/tv-guide")
async def get_tv_guide():
    """Get the TV guide schedule for all public channels"""
    channels = await db.channels.find({"is_public": True}, {"_id": 0}).limit(20).to_list(20)
    
    guide = []
    for channel in channels:
        if channel.get("videos"):
            guide.append({
                "channel_id": channel["id"],
                "channel_name": channel["name"],
                "thumbnail": channel.get("thumbnail"),
                "is_24_7": channel.get("is_24_7", True),
                "videos": channel.get("videos", []),
                "schedule": channel.get("schedule", [])
            })
    
    return guide

# ===================== SEED DATA =====================

@api_router.post("/seed")
async def seed_data():
    """Seed admin user and sample channels"""
    # Create or update admin user
    admin_user = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin_user:
        admin_user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        admin_doc = {
            "id": admin_user_id,
            "email": ADMIN_EMAIL,
            "username": "Admin",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "avatar": None,
            "favorites": [],
            "is_admin": True,
            "created_at": now
        }
        await db.users.insert_one(admin_doc)
        admin_user = admin_doc
    else:
        admin_user_id = admin_user["id"]
        # Ensure admin flag is set
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"is_admin": True}})
    
    # Check if channels already seeded
    existing_channels = await db.channels.count_documents({})
    if existing_channels > 0:
        return {"message": "Admin user created/updated, channels already seeded"}
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Sample channels owned by admin
    sample_channels = [
        {
            "id": str(uuid.uuid4()),
            "name": "Lofi Hip Hop Radio",
            "description": "24/7 lofi hip hop beats to relax/study to",
            "category": "Music",
            "thumbnail": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "jfKfPfyJRdk", "title": "lofi hip hop radio - beats to relax/study to", "thumbnail": "https://img.youtube.com/vi/jfKfPfyJRdk/maxresdefault.jpg", "duration": 0, "order": 0},
            ],
            "schedule": [],
            "viewers_count": 1250,
            "favorites_count": 456,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Nature Documentary",
            "description": "Breathtaking nature documentaries from around the world",
            "category": "Entertainment",
            "thumbnail": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "WmVLcj-XKnM", "title": "Our Planet | One Planet", "thumbnail": "https://img.youtube.com/vi/WmVLcj-XKnM/maxresdefault.jpg", "duration": 2940, "order": 0},
                {"id": str(uuid.uuid4()), "youtube_id": "TGvPNz5IvvA", "title": "Planet Earth II - Mountains", "thumbnail": "https://img.youtube.com/vi/TGvPNz5IvvA/maxresdefault.jpg", "duration": 2880, "order": 1},
            ],
            "schedule": [],
            "viewers_count": 890,
            "favorites_count": 234,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Tech News Daily",
            "description": "Latest technology news and reviews",
            "category": "Technology",
            "thumbnail": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "GpMj7njxzHs", "title": "AI News Update", "thumbnail": "https://img.youtube.com/vi/GpMj7njxzHs/maxresdefault.jpg", "duration": 600, "order": 0},
            ],
            "schedule": [],
            "viewers_count": 567,
            "favorites_count": 123,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Gaming Highlights",
            "description": "Best gaming moments and esports highlights",
            "category": "Gaming",
            "thumbnail": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "dQw4w9WgXcQ", "title": "Epic Gaming Moments", "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", "duration": 300, "order": 0},
            ],
            "schedule": [],
            "viewers_count": 2340,
            "favorites_count": 678,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Comedy Central",
            "description": "The best stand-up comedy clips",
            "category": "Comedy",
            "thumbnail": "https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "unkIVvjZc9Y", "title": "Best Comedy Moments", "thumbnail": "https://img.youtube.com/vi/unkIVvjZc9Y/maxresdefault.jpg", "duration": 480, "order": 0},
            ],
            "schedule": [],
            "viewers_count": 1890,
            "favorites_count": 445,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Learn & Grow",
            "description": "Educational content for curious minds",
            "category": "Education",
            "thumbnail": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800",
            "is_public": True,
            "is_24_7": True,
            "owner_id": admin_user_id,
            "owner_username": "Admin",
            "videos": [
                {"id": str(uuid.uuid4()), "youtube_id": "8jvoTV54nXw", "title": "How the Internet Works", "thumbnail": "https://img.youtube.com/vi/8jvoTV54nXw/maxresdefault.jpg", "duration": 720, "order": 0},
            ],
            "schedule": [],
            "viewers_count": 670,
            "favorites_count": 189,
            "created_at": now
        },
    ]
    
    await db.channels.insert_many(sample_channels)
    
    return {"message": "Admin and data seeded successfully", "channels_created": len(sample_channels)}

# ===================== HEALTH CHECK =====================

@api_router.get("/")
async def root():
    return {"message": "TV Network API is running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
