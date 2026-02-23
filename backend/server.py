from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Body, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
import subprocess
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directories
UPLOADS_DIR = ROOT_DIR / "uploads" / "videos"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

IMAGES_DIR = ROOT_DIR / "uploads" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# YouTube cookies directory
COOKIES_DIR = ROOT_DIR / "cookies"
COOKIES_DIR.mkdir(parents=True, exist_ok=True)
COOKIES_FILE = COOKIES_DIR / "youtube_cookies.txt"

# yt-dlp binary path - check multiple locations for compatibility
def get_ytdlp_path():
    """Find yt-dlp binary in various possible locations"""
    import shutil
    possible_paths = [
        os.environ.get('YTDLP_PATH'),  # Environment variable override
        shutil.which('yt-dlp'),  # System PATH (production)
        "/root/.venv/bin/yt-dlp",  # Local venv
        "/usr/local/bin/yt-dlp",  # Common install location
        "/usr/bin/yt-dlp",  # System install
    ]
    for path in possible_paths:
        if path and os.path.isfile(path):
            return path
    # Fallback to 'yt-dlp' and hope it's in PATH
    return "yt-dlp"

YTDLP_PATH = get_ytdlp_path()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Admin credentials from environment
ADMIN_EMAIL = os.environ['ADMIN_EMAIL']
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']

# Create the main app
app = FastAPI(title="TV Network API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Root-level health check endpoint for Kubernetes
@app.get("/health")
async def root_health_check():
    return {"status": "healthy"}

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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class VideoItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    youtube_id: Optional[str] = None
    video_url: Optional[str] = None  # For uploaded videos
    title: str
    thumbnail: Optional[str] = None
    duration: int = 0  # in seconds
    order: int = 0

class VideoCreate(BaseModel):
    youtube_id: Optional[str] = None
    title: str
    thumbnail: Optional[str] = None
    duration: int = 0
    video_url: Optional[str] = None  # For uploaded videos

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
    random_play: bool = False  # If True, videos play in random order
    use_schedule: bool = False  # If True, channel uses synchronized 24-hour schedule

class ChannelCreate(ChannelBase):
    pass

class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    thumbnail: Optional[str] = None
    is_public: Optional[bool] = None
    is_24_7: Optional[bool] = None
    random_play: Optional[bool] = None
    use_schedule: Optional[bool] = None

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
    random_play: bool = False
    use_schedule: bool = False
    sort_order: Optional[int] = None

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
    
    # Sort by sort_order first, then by favorites_count
    channels = await db.channels.find(query, {"_id": 0}).sort([("sort_order", 1), ("favorites_count", -1)]).to_list(100)
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

class ChannelOrderUpdate(BaseModel):
    channel_ids: List[str]  # List of channel IDs in the desired order

@api_router.put("/channels/reorder")
async def reorder_channels(data: ChannelOrderUpdate, user: dict = Depends(require_user)):
    """Reorder channels - admin only"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Update sort_order for each channel
    for index, channel_id in enumerate(data.channel_ids):
        await db.channels.update_one(
            {"id": channel_id},
            {"$set": {"sort_order": index}}
        )
    
    return {"message": "Channels reordered", "count": len(data.channel_ids)}

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
        "random_play": data.random_play,
        "use_schedule": data.use_schedule,
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
    
    # Determine thumbnail based on video type
    thumbnail = data.thumbnail
    if not thumbnail:
        if data.youtube_id:
            thumbnail = f"https://img.youtube.com/vi/{data.youtube_id}/maxresdefault.jpg"
        else:
            thumbnail = None  # Uploaded videos may not have thumbnails
    
    video = VideoItem(
        youtube_id=data.youtube_id,
        video_url=data.video_url,
        title=data.title,
        thumbnail=thumbnail,
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

# Video reorder endpoint - MUST come before /videos/{video_id} to avoid route conflict
@api_router.put("/channels/{channel_id}/videos/reorder")
async def reorder_videos(request: Request, channel_id: str, user = Depends(require_user)):
    # Accept raw array of video IDs from request body
    video_ids = await request.json()
    if not isinstance(video_ids, list):
        raise HTTPException(status_code=422, detail="Body must be an array of video IDs")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can reorder videos in any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    videos = channel.get("videos", [])
    video_map = {v["id"]: v for v in videos}
    
    # Validate all video IDs exist to prevent accidental deletion
    invalid_ids = [vid for vid in video_ids if vid not in video_map]
    if invalid_ids:
        raise HTTPException(status_code=400, detail=f"Invalid video IDs: {invalid_ids[:5]}...")
    
    # Ensure all videos are included (in case some were missing from the request)
    reordered = []
    seen_ids = set()
    for i, vid in enumerate(video_ids):
        if vid in video_map and vid not in seen_ids:
            video_map[vid]["order"] = i
            reordered.append(video_map[vid])
            seen_ids.add(vid)
    
    # Add any videos that weren't in the reorder request at the end
    for video in videos:
        if video["id"] not in seen_ids:
            video["order"] = len(reordered)
            reordered.append(video)
    
    await db.channels.update_one({"id": channel_id}, {"$set": {"videos": reordered}})
    
    return {"message": "Videos reordered", "count": len(reordered)}

class VideoUpdate(BaseModel):
    title: Optional[str] = None
    duration: Optional[int] = None
    thumbnail: Optional[str] = None

@api_router.put("/channels/{channel_id}/videos/{video_id}")
async def update_video_in_channel(
    channel_id: str, 
    video_id: str, 
    data: VideoUpdate,
    user: dict = Depends(require_user)
):
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Admin can update videos in any channel
    if channel["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Build update dict only for provided fields
    update_fields = {}
    if data.title is not None:
        update_fields["videos.$.title"] = data.title
    if data.duration is not None:
        update_fields["videos.$.duration"] = data.duration
    if data.thumbnail is not None:
        update_fields["videos.$.thumbnail"] = data.thumbnail
    
    if not update_fields:
        return {"message": "No updates provided"}
    
    result = await db.channels.update_one(
        {"id": channel_id, "videos.id": video_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return {"message": "Video updated"}

# ===================== VIDEO UPLOAD ROUTES =====================

class UploadedVideoResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    url: str
    size: int
    duration: int = 300  # Default 5 min, can be updated
    thumbnail: Optional[str] = None
    created_at: str

MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

@api_router.post("/upload/video", response_model=UploadedVideoResponse)
async def upload_video(
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload a video file - MP4 only, max 2GB"""
    # Validate file type - MP4 only
    if file.content_type != "video/mp4":
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Only MP4 files are allowed"
        )
    
    # Generate unique filename
    file_ext = Path(file.filename).suffix or ".mp4"
    video_id = str(uuid.uuid4())
    filename = f"{video_id}{file_ext}"
    file_path = UPLOADS_DIR / filename
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Get file size
    file_size = file_path.stat().st_size
    
    # Store in database
    now = datetime.now(timezone.utc).isoformat()
    video_doc = {
        "id": video_id,
        "filename": filename,
        "original_name": file.filename,
        "size": file_size,
        "duration": 300,  # Default, can be updated later
        "thumbnail": None,
        "owner_id": user["id"],
        "created_at": now
    }
    
    await db.uploaded_videos.insert_one(video_doc)
    
    return UploadedVideoResponse(
        id=video_id,
        filename=filename,
        original_name=file.filename,
        url=f"/api/videos/{filename}",
        size=file_size,
        duration=300,
        thumbnail=None,
        created_at=now
    )

@api_router.get("/upload/videos")
async def list_uploaded_videos(user: dict = Depends(require_user)):
    """List all uploaded videos (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    videos = await db.uploaded_videos.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Add URLs
    for video in videos:
        video["url"] = f"/api/videos/{video['filename']}"
    
    return videos

@api_router.delete("/upload/video/{video_id}")
async def delete_uploaded_video(video_id: str, user: dict = Depends(require_user)):
    """Delete an uploaded video (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    video = await db.uploaded_videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Delete file
    file_path = UPLOADS_DIR / video["filename"]
    if file_path.exists():
        file_path.unlink()
    
    # Delete from database
    await db.uploaded_videos.delete_one({"id": video_id})
    
    return {"message": "Video deleted"}

@api_router.put("/upload/video/{video_id}/duration")
async def update_video_duration(
    video_id: str, 
    duration: int,
    user: dict = Depends(require_user)
):
    """Update video duration (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.uploaded_videos.update_one(
        {"id": video_id},
        {"$set": {"duration": duration}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return {"message": "Duration updated"}

# ===================== VIDEO CLEANUP ROUTES =====================
import httpx

class DeleteVideoByYoutubeId(BaseModel):
    youtube_id: str
    channel_id: str

@api_router.post("/videos/delete-by-youtube-id")
async def delete_video_by_youtube_id(data: DeleteVideoByYoutubeId):
    """Delete a video from a channel by its YouTube ID (for auto-cleanup of unplayable videos)"""
    channel = await db.channels.find_one({"id": data.channel_id})
    if not channel:
        return {"message": "Channel not found", "deleted": False}
    
    # Find and remove the video with matching youtube_id
    videos = channel.get("videos", [])
    video_to_remove = None
    for video in videos:
        if video.get("youtube_id") == data.youtube_id:
            video_to_remove = video
            break
    
    if not video_to_remove:
        return {"message": "Video not found", "deleted": False}
    
    # Remove the video
    await db.channels.update_one(
        {"id": data.channel_id},
        {"$pull": {"videos": {"youtube_id": data.youtube_id}}}
    )
    
    # Log the deletion
    await db.deleted_videos.insert_one({
        "youtube_id": data.youtube_id,
        "channel_id": data.channel_id,
        "title": video_to_remove.get("title", "Unknown"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "reason": "unplayable"
    })
    
    return {"message": f"Video '{video_to_remove.get('title', 'Unknown')}' deleted", "deleted": True}

@api_router.get("/videos/deleted")
async def get_deleted_videos(user: dict = Depends(require_user)):
    """Get list of auto-deleted videos (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    deleted = await db.deleted_videos.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(100)
    return deleted

@api_router.delete("/videos/deleted/clear")
async def clear_deleted_videos_log(user: dict = Depends(require_user)):
    """Clear the deleted videos log (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.deleted_videos.delete_many({})
    return {"message": "Deleted videos log cleared"}

async def check_youtube_video_playable(youtube_id: str) -> dict:
    """Check if a YouTube video is playable using oEmbed API"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Try oEmbed API - it returns error for unavailable videos
            response = await client.get(
                f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={youtube_id}&format=json"
            )
            if response.status_code == 200:
                return {"playable": True, "title": response.json().get("title", "")}
            elif response.status_code == 401:
                return {"playable": False, "reason": "embedding_disabled"}
            elif response.status_code == 404:
                return {"playable": False, "reason": "not_found"}
            else:
                return {"playable": False, "reason": f"error_{response.status_code}"}
    except Exception as e:
        return {"playable": None, "reason": f"check_failed: {str(e)}"}

class CleanupResult(BaseModel):
    total_checked: int
    deleted_count: int
    deleted_videos: List[dict]
    errors: List[str]

@api_router.post("/videos/cleanup", response_model=CleanupResult)
async def cleanup_unplayable_videos(user: dict = Depends(require_user)):
    """Check all videos and remove unplayable ones (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total_checked = 0
    deleted_count = 0
    deleted_videos = []
    errors = []
    
    # Get all channels
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    for channel in channels:
        videos = channel.get("videos", [])
        videos_to_delete = []
        
        for video in videos:
            youtube_id = video.get("youtube_id")
            if not youtube_id:
                continue
            
            total_checked += 1
            
            # Check if video is playable
            result = await check_youtube_video_playable(youtube_id)
            
            if result.get("playable") is False:
                videos_to_delete.append({
                    "youtube_id": youtube_id,
                    "title": video.get("title", "Unknown"),
                    "channel": channel.get("name", "Unknown"),
                    "reason": result.get("reason", "unknown")
                })
        
        # Delete unplayable videos from this channel
        for video_info in videos_to_delete:
            try:
                await db.channels.update_one(
                    {"id": channel["id"]},
                    {"$pull": {"videos": {"youtube_id": video_info["youtube_id"]}}}
                )
                
                # Log deletion
                await db.deleted_videos.insert_one({
                    "youtube_id": video_info["youtube_id"],
                    "channel_id": channel["id"],
                    "title": video_info["title"],
                    "deleted_at": datetime.now(timezone.utc).isoformat(),
                    "reason": video_info["reason"]
                })
                
                deleted_videos.append(video_info)
                deleted_count += 1
            except Exception as e:
                errors.append(f"Failed to delete {video_info['title']}: {str(e)}")
    
    return CleanupResult(
        total_checked=total_checked,
        deleted_count=deleted_count,
        deleted_videos=deleted_videos,
        errors=errors
    )

@api_router.get("/videos/check-status")
async def check_videos_status(user: dict = Depends(require_user)):
    """Check status of all videos without deleting (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    results = {
        "total": 0,
        "playable": 0,
        "unplayable": 0,
        "unknown": 0,
        "unplayable_videos": []
    }
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    for channel in channels:
        videos = channel.get("videos", [])
        
        for video in videos:
            youtube_id = video.get("youtube_id")
            if not youtube_id:
                continue
            
            results["total"] += 1
            
            video_status = await check_youtube_video_playable(youtube_id)
            
            if video_status.get("playable") is True:
                results["playable"] += 1
            elif video_status.get("playable") is False:
                results["unplayable"] += 1
                results["unplayable_videos"].append({
                    "youtube_id": youtube_id,
                    "title": video.get("title", "Unknown"),
                    "channel": channel.get("name", "Unknown"),
                    "reason": video_status.get("reason", "unknown")
                })
            else:
                results["unknown"] += 1
    
    return results

async def fetch_youtube_duration(youtube_id: str) -> int:
    """Fetch video duration from YouTube"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try to get video info from YouTube's video page
            response = await client.get(
                f"https://www.youtube.com/watch?v={youtube_id}",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9"
                },
                follow_redirects=True
            )
            if response.status_code == 200:
                content = response.text
                import re
                
                # Try multiple patterns to find duration
                patterns = [
                    r'"lengthSeconds":"(\d+)"',
                    r'"length_seconds":(\d+)',
                    r'approxDurationMs":"(\d+)"',
                    r'"duration":{"seconds":"(\d+)"',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, content)
                    if match:
                        value = int(match.group(1))
                        # If it's milliseconds (approxDurationMs), convert to seconds
                        if 'Ms' in pattern:
                            value = value // 1000
                        if value > 0:
                            return value
                
                # Try to find PT format (ISO 8601 duration)
                pt_match = re.search(r'"duration":"PT(\d+)M(\d+)S"', content)
                if pt_match:
                    minutes = int(pt_match.group(1))
                    seconds = int(pt_match.group(2))
                    return minutes * 60 + seconds
                
                pt_match2 = re.search(r'"duration":"PT(\d+)M"', content)
                if pt_match2:
                    return int(pt_match2.group(1)) * 60
                    
    except Exception as e:
        print(f"Error fetching duration for {youtube_id}: {e}")
    
    return 0

@api_router.post("/videos/update-durations")
async def update_video_durations(user: dict = Depends(require_user), limit: int = 50):
    """Fetch and update durations for videos from YouTube (admin only). 
    Processes videos in batches - call multiple times to update all videos."""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    updated_count = 0
    failed_count = 0
    skipped_count = 0
    results = []
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    processed = 0
    for channel in channels:
        if processed >= limit:
            break
            
        videos = channel.get("videos", [])
        channel_updated = False
        
        for i, video in enumerate(videos):
            if processed >= limit:
                break
                
            youtube_id = video.get("youtube_id")
            current_duration = video.get("duration", 300)
            
            # Skip if already has a non-default duration (not 300 or 180)
            if current_duration not in [300, 180, 0]:
                skipped_count += 1
                continue
            
            if not youtube_id:
                continue
            
            processed += 1
            
            # Fetch duration from YouTube
            duration = await fetch_youtube_duration(youtube_id)
            
            if duration > 0:
                videos[i]["duration"] = duration
                channel_updated = True
                updated_count += 1
                results.append({
                    "title": video.get("title", "Unknown"),
                    "youtube_id": youtube_id,
                    "old_duration": current_duration,
                    "new_duration": duration
                })
            else:
                failed_count += 1
        
        # Update channel in database if any videos were updated
        if channel_updated:
            await db.channels.update_one(
                {"id": channel["id"]},
                {"$set": {"videos": videos}}
            )
    
    # Count remaining videos with default duration
    remaining = 0
    for channel in channels:
        for video in channel.get("videos", []):
            if video.get("duration", 300) in [300, 180, 0]:
                remaining += 1
    
    return {
        "updated": updated_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "remaining": remaining - updated_count - failed_count,
        "results": results
    }

@api_router.post("/videos/update-duration")
async def update_single_video_duration(
    channel_id: str,
    youtube_id: str,
    duration: int
):
    """Update duration for a single video (called from frontend when video plays)"""
    if duration <= 0:
        return {"updated": False, "reason": "invalid_duration"}
    
    # Find the channel and update the video's duration
    channel = await db.channels.find_one({"id": channel_id})
    if not channel:
        return {"updated": False, "reason": "channel_not_found"}
    
    videos = channel.get("videos", [])
    updated = False
    old_duration = 0
    
    for i, video in enumerate(videos):
        if video.get("youtube_id") == youtube_id:
            old_duration = video.get("duration", 300)
            # Only update if current duration is a default value OR significantly different
            if old_duration in [300, 180, 0] or abs(old_duration - duration) > 30:
                videos[i]["duration"] = duration
                updated = True
                break
    
    if updated:
        await db.channels.update_one(
            {"id": channel_id},
            {"$set": {"videos": videos}}
        )
        
        # If duration changed significantly (more than 60 seconds difference), regenerate schedule
        if abs(old_duration - duration) > 60:
            today = get_eastern_date()
            # Delete existing schedule for this channel
            await db.schedules.delete_one({"channel_id": channel_id, "schedule_date": today})
            # Generate new schedule
            updated_channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
            if updated_channel:
                schedule = generate_24h_schedule(updated_channel, today, force_random=False)
                await db.schedules.insert_one(schedule)
        
        return {"updated": True, "new_duration": duration, "schedule_regenerated": abs(old_duration - duration) > 60}
    
    return {"updated": False, "reason": "video_not_found_or_already_set"}

# ===================== IMAGE UPLOAD ROUTES =====================

class UploadedImageResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    url: str
    size: int
    created_at: str

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

@api_router.post("/upload/image", response_model=UploadedImageResponse)
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload an image file - JPEG, PNG, WebP, GIF only, max 10MB"""
    # Validate file type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400, 
            detail="Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed"
        )
    
    # Generate unique filename
    file_ext = Path(file.filename).suffix or ".jpg"
    image_id = str(uuid.uuid4())
    filename = f"{image_id}{file_ext}"
    file_path = IMAGES_DIR / filename
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Check file size after saving
    file_size = file_path.stat().st_size
    if file_size > MAX_IMAGE_SIZE:
        file_path.unlink()  # Delete the file
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    
    # Store in database
    now = datetime.now(timezone.utc).isoformat()
    image_doc = {
        "id": image_id,
        "filename": filename,
        "original_name": file.filename,
        "size": file_size,
        "owner_id": user["id"],
        "created_at": now
    }
    
    await db.uploaded_images.insert_one(image_doc)
    
    return UploadedImageResponse(
        id=image_id,
        filename=filename,
        original_name=file.filename,
        url=f"/api/images/{filename}",
        size=file_size,
        created_at=now
    )

@api_router.get("/upload/images")
async def list_uploaded_images(user: dict = Depends(require_user)):
    """List uploaded images for the current user"""
    # Users see their own images, admins see all
    query = {} if user.get("is_admin", False) else {"owner_id": user["id"]}
    images = await db.uploaded_images.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Add URLs
    for image in images:
        image["url"] = f"/api/images/{image['filename']}"
    
    return images

@api_router.delete("/upload/image/{image_id}")
async def delete_uploaded_image(image_id: str, user: dict = Depends(require_user)):
    """Delete an uploaded image (owner or admin)"""
    image = await db.uploaded_images.find_one({"id": image_id})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Only owner or admin can delete
    if image["owner_id"] != user["id"] and not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Delete file
    file_path = IMAGES_DIR / image["filename"]
    if file_path.exists():
        file_path.unlink()
    
    # Delete from database
    await db.uploaded_images.delete_one({"id": image_id})
    
    return {"message": "Image deleted"}

# ===================== YOUTUBE PROXY ROUTES (Age-Restricted Videos) =====================

def get_video_info_with_ytdlp(youtube_id: str, use_cookies: bool = True) -> dict:
    """Get video info using yt-dlp, optionally with cookies for age-restricted content"""
    cmd = [
        YTDLP_PATH,
        "--dump-json",
        "--no-download",
        "--no-warnings",
        "-f", "best[height<=720]/best",  # Limit quality for streaming
        f"https://www.youtube.com/watch?v={youtube_id}"
    ]
    
    # Add cookies if available and requested
    if use_cookies and COOKIES_FILE.exists():
        cmd.extend(["--cookies", str(COOKIES_FILE)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
        else:
            logger.error(f"yt-dlp error for {youtube_id}: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        logger.error(f"yt-dlp timeout for {youtube_id}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"yt-dlp JSON decode error for {youtube_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"yt-dlp exception for {youtube_id}: {e}")
        return None

def get_direct_video_url(youtube_id: str, use_cookies: bool = True) -> Optional[str]:
    """Get direct video URL using yt-dlp"""
    cmd = [
        YTDLP_PATH,
        "--get-url",
        "--no-warnings",
        "-f", "best[height<=720][ext=mp4]/best[height<=720]/best",
        f"https://www.youtube.com/watch?v={youtube_id}"
    ]
    
    if use_cookies and COOKIES_FILE.exists():
        cmd.extend(["--cookies", str(COOKIES_FILE)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and result.stdout.strip():
            urls = result.stdout.strip().split('\n')
            return urls[0] if urls else None
        else:
            logger.error(f"yt-dlp get-url error for {youtube_id}: {result.stderr}")
            return None
    except Exception as e:
        logger.error(f"yt-dlp get-url exception for {youtube_id}: {e}")
        return None

@api_router.get("/youtube/check/{youtube_id}")
async def check_youtube_video(youtube_id: str):
    """Check if a YouTube video is playable and if it's age-restricted"""
    info = get_video_info_with_ytdlp(youtube_id, use_cookies=False)
    
    if info is None:
        # Try with cookies
        info_with_cookies = get_video_info_with_ytdlp(youtube_id, use_cookies=True)
        if info_with_cookies:
            return {
                "playable": True,
                "age_restricted": True,
                "needs_proxy": True,
                "title": info_with_cookies.get("title", ""),
                "duration": info_with_cookies.get("duration", 0),
                "cookies_available": COOKIES_FILE.exists()
            }
        return {
            "playable": False,
            "age_restricted": False,
            "needs_proxy": False,
            "error": "Video unavailable"
        }
    
    age_restricted = info.get("age_limit", 0) >= 18
    
    return {
        "playable": True,
        "age_restricted": age_restricted,
        "needs_proxy": age_restricted,
        "title": info.get("title", ""),
        "duration": info.get("duration", 0),
        "cookies_available": COOKIES_FILE.exists()
    }

@api_router.get("/youtube/stream/{youtube_id}")
async def stream_youtube_video(youtube_id: str):
    """Get direct stream URL for age-restricted videos (uses cookies)"""
    # First check if cookies are available
    if not COOKIES_FILE.exists():
        raise HTTPException(
            status_code=400, 
            detail="YouTube cookies not configured. Please upload cookies file in admin settings."
        )
    
    # Get direct URL
    video_url = get_direct_video_url(youtube_id, use_cookies=True)
    
    if not video_url:
        raise HTTPException(status_code=404, detail="Could not get video stream URL")
    
    # Return redirect to the direct video URL
    return RedirectResponse(url=video_url, status_code=302)

@api_router.get("/youtube/stream-info/{youtube_id}")
async def get_stream_info(youtube_id: str):
    """Get stream URL info for a YouTube video"""
    has_cookies = COOKIES_FILE.exists()
    
    # Try without cookies first
    video_url = get_direct_video_url(youtube_id, use_cookies=False)
    
    if video_url:
        return {
            "success": True,
            "url": video_url,
            "used_cookies": False
        }
    
    # Try with cookies
    if has_cookies:
        video_url = get_direct_video_url(youtube_id, use_cookies=True)
        if video_url:
            return {
                "success": True,
                "url": video_url,
                "used_cookies": True
            }
    
    return {
        "success": False,
        "error": "Could not get video URL",
        "cookies_available": has_cookies
    }

@api_router.post("/youtube/cookies")
async def upload_youtube_cookies(
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload YouTube cookies file (Netscape format) - admin only"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate file extension
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Cookies file must be a .txt file in Netscape format")
    
    # Read and validate content
    content = await file.read()
    content_str = content.decode('utf-8', errors='ignore')
    
    # Basic validation - check for YouTube domain
    if 'youtube.com' not in content_str.lower() and '.youtube' not in content_str.lower():
        raise HTTPException(
            status_code=400, 
            detail="Invalid cookies file. Must contain YouTube cookies."
        )
    
    # Save the file
    try:
        with open(COOKIES_FILE, 'wb') as f:
            f.write(content)
        
        # Test if cookies work by checking a known video
        test_result = get_video_info_with_ytdlp("dQw4w9WgXcQ", use_cookies=True)
        
        return {
            "message": "Cookies uploaded successfully",
            "filename": file.filename,
            "size": len(content),
            "test_result": "Cookies are working" if test_result else "Cookies uploaded but test failed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save cookies: {str(e)}")

@api_router.get("/youtube/cookies/status")
async def get_cookies_status(user: dict = Depends(require_user)):
    """Check if YouTube cookies are configured - admin only"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not COOKIES_FILE.exists():
        return {
            "configured": False,
            "message": "No cookies file uploaded"
        }
    
    # Get file info
    stat = COOKIES_FILE.stat()
    
    # Test cookies
    test_result = get_video_info_with_ytdlp("dQw4w9WgXcQ", use_cookies=True)
    
    return {
        "configured": True,
        "file_size": stat.st_size,
        "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "working": test_result is not None
    }

@api_router.delete("/youtube/cookies")
async def delete_youtube_cookies(user: dict = Depends(require_user)):
    """Delete YouTube cookies file - admin only"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if COOKIES_FILE.exists():
        COOKIES_FILE.unlink()
        return {"message": "Cookies deleted"}
    
    return {"message": "No cookies file to delete"}

@api_router.get("/youtube/bulk-check")
async def bulk_check_videos(user: dict = Depends(require_user)):
    """
    Bulk check all videos across all channels for age restrictions and playability.
    Returns categorized lists of videos by status.
    Admin only - this can take a while for large video libraries.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all channels
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    results = {
        "total_videos": 0,
        "checked": 0,
        "playable": 0,
        "age_restricted": 0,
        "unavailable": 0,
        "skipped": 0,  # Non-YouTube videos
        "age_restricted_videos": [],
        "unavailable_videos": [],
        "channels_summary": []
    }
    
    has_cookies = COOKIES_FILE.exists()
    
    for channel in channels:
        channel_stats = {
            "channel_id": channel.get("id"),
            "channel_name": channel.get("name"),
            "total": 0,
            "playable": 0,
            "age_restricted": 0,
            "unavailable": 0
        }
        
        videos = channel.get("videos", [])
        
        for video in videos:
            youtube_id = video.get("youtube_id")
            results["total_videos"] += 1
            channel_stats["total"] += 1
            
            # Skip non-YouTube videos
            if not youtube_id:
                results["skipped"] += 1
                continue
            
            results["checked"] += 1
            
            # Try to get video info without cookies first
            info = get_video_info_with_ytdlp(youtube_id, use_cookies=False)
            
            if info:
                age_limit = info.get("age_limit", 0)
                if age_limit >= 18:
                    results["age_restricted"] += 1
                    channel_stats["age_restricted"] += 1
                    results["age_restricted_videos"].append({
                        "youtube_id": youtube_id,
                        "title": video.get("title", info.get("title", "Unknown")),
                        "channel_id": channel.get("id"),
                        "channel_name": channel.get("name"),
                        "age_limit": age_limit,
                        "can_play_with_cookies": has_cookies
                    })
                else:
                    results["playable"] += 1
                    channel_stats["playable"] += 1
            else:
                # Video not accessible without cookies, try with cookies
                if has_cookies:
                    info_with_cookies = get_video_info_with_ytdlp(youtube_id, use_cookies=True)
                    if info_with_cookies:
                        # Video is age-restricted but playable with cookies
                        results["age_restricted"] += 1
                        channel_stats["age_restricted"] += 1
                        results["age_restricted_videos"].append({
                            "youtube_id": youtube_id,
                            "title": video.get("title", info_with_cookies.get("title", "Unknown")),
                            "channel_id": channel.get("id"),
                            "channel_name": channel.get("name"),
                            "age_limit": info_with_cookies.get("age_limit", 18),
                            "can_play_with_cookies": True
                        })
                    else:
                        # Video is unavailable even with cookies
                        results["unavailable"] += 1
                        channel_stats["unavailable"] += 1
                        results["unavailable_videos"].append({
                            "youtube_id": youtube_id,
                            "title": video.get("title", "Unknown"),
                            "channel_id": channel.get("id"),
                            "channel_name": channel.get("name"),
                            "reason": "Video unavailable or deleted"
                        })
                else:
                    # No cookies, mark as potentially age-restricted or unavailable
                    results["unavailable"] += 1
                    channel_stats["unavailable"] += 1
                    results["unavailable_videos"].append({
                        "youtube_id": youtube_id,
                        "title": video.get("title", "Unknown"),
                        "channel_id": channel.get("id"),
                        "channel_name": channel.get("name"),
                        "reason": "Cannot verify - may be age-restricted (no cookies configured)"
                    })
        
        # Only add channel to summary if it has videos
        if channel_stats["total"] > 0:
            results["channels_summary"].append(channel_stats)
    
    results["cookies_configured"] = has_cookies
    
    return results

@api_router.get("/youtube/quick-check")
async def quick_check_sample_videos(user: dict = Depends(require_user), sample_size: int = 10):
    """
    Quick check a sample of videos from each channel.
    Faster than full bulk check - useful for quick status overview.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    results = {
        "total_checked": 0,
        "playable": 0,
        "age_restricted": 0,
        "unavailable": 0,
        "issues": [],
        "cookies_configured": COOKIES_FILE.exists()
    }
    
    import random
    
    for channel in channels:
        videos = channel.get("videos", [])
        youtube_videos = [v for v in videos if v.get("youtube_id")]
        
        # Sample up to sample_size videos per channel
        sample = random.sample(youtube_videos, min(sample_size, len(youtube_videos))) if youtube_videos else []
        
        for video in sample:
            youtube_id = video.get("youtube_id")
            results["total_checked"] += 1
            
            info = get_video_info_with_ytdlp(youtube_id, use_cookies=False)
            
            if info:
                if info.get("age_limit", 0) >= 18:
                    results["age_restricted"] += 1
                    results["issues"].append({
                        "type": "age_restricted",
                        "youtube_id": youtube_id,
                        "title": video.get("title", "Unknown"),
                        "channel": channel.get("name")
                    })
                else:
                    results["playable"] += 1
            else:
                results["unavailable"] += 1
                results["issues"].append({
                    "type": "unavailable",
                    "youtube_id": youtube_id,
                    "title": video.get("title", "Unknown"),
                    "channel": channel.get("name")
                })
    
    return results

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
    # Use aggregation to get all category counts in a single query
    pipeline = [
        {"$match": {"is_public": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    counts_cursor = db.channels.aggregate(pipeline)
    counts_list = await counts_cursor.to_list(None)
    counts_dict = {doc["_id"]: doc["count"] for doc in counts_list}
    
    # Get total count for "All" category
    total_count = sum(counts_dict.values())
    
    result = []
    for cat in CATEGORIES:
        if cat["name"] == "All":
            count = total_count
        else:
            count = counts_dict.get(cat["name"], 0)
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
                "random_play": channel.get("random_play", False),
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

# ===================== ANALYTICS =====================

class ViewEvent(BaseModel):
    channel_id: str
    viewer_id: str  # Anonymous viewer ID (from frontend)

@api_router.post("/analytics/view")
async def record_view(event: ViewEvent):
    """Record a channel view event"""
    now = datetime.now(timezone.utc)
    view_doc = {
        "id": str(uuid.uuid4()),
        "channel_id": event.channel_id,
        "viewer_id": event.viewer_id,
        "timestamp": now.isoformat()
    }
    await db.views.insert_one(view_doc)
    return {"status": "recorded"}

@api_router.get("/analytics/stats")
async def get_analytics(user: dict = Depends(require_user)):
    """Get analytics stats (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_5min = now - timedelta(minutes=5)
    
    # Get all views
    all_views = await db.views.find({}, {"_id": 0}).to_list(10000)
    
    # Filter by time
    views_24h = []
    views_5min = []
    
    for view in all_views:
        try:
            view_time = datetime.fromisoformat(view["timestamp"].replace("Z", "+00:00"))
            if view_time.tzinfo is None:
                view_time = view_time.replace(tzinfo=timezone.utc)
            
            if view_time >= last_24h:
                views_24h.append(view)
            if view_time >= last_5min:
                views_5min.append(view)
        except Exception:
            continue
    
    # Count unique viewers
    unique_24h = len(set(v["viewer_id"] for v in views_24h))
    unique_5min = len(set(v["viewer_id"] for v in views_5min))
    
    # Views per channel
    channel_views = {}
    for view in views_24h:
        cid = view["channel_id"]
        if cid not in channel_views:
            channel_views[cid] = {"total": 0, "unique_viewers": set()}
        channel_views[cid]["total"] += 1
        channel_views[cid]["unique_viewers"].add(view["viewer_id"])
    
    # Get channel names
    channels = await db.channels.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    channel_names = {c["id"]: c["name"] for c in channels}
    
    # Format channel stats
    channel_stats = []
    for cid, stats in channel_views.items():
        channel_stats.append({
            "channel_id": cid,
            "channel_name": channel_names.get(cid, "Unknown"),
            "total_views": stats["total"],
            "unique_viewers": len(stats["unique_viewers"])
        })
    
    # Sort by total views
    channel_stats.sort(key=lambda x: x["total_views"], reverse=True)
    
    return {
        "viewers_24h": unique_24h,
        "current_viewers": unique_5min,
        "total_views_24h": len(views_24h),
        "channel_stats": channel_stats
    }

# ===================== 24-HOUR SCHEDULE =====================

import random
from zoneinfo import ZoneInfo

# Eastern timezone for schedule resets at midnight ET
EASTERN_TZ = ZoneInfo("America/New_York")

def get_eastern_date():
    """Get current date in Eastern time"""
    return datetime.now(EASTERN_TZ).strftime("%Y-%m-%d")

class ScheduledVideo(BaseModel):
    video_id: str
    title: str
    thumbnail: Optional[str] = None
    youtube_id: Optional[str] = None
    start_time: str  # HH:MM:SS format
    end_time: str  # HH:MM:SS format
    duration: int  # seconds

class ChannelSchedule(BaseModel):
    channel_id: str
    channel_name: str
    channel_thumbnail: Optional[str] = None
    schedule_date: str  # YYYY-MM-DD
    videos: List[ScheduledVideo]
    total_duration: int  # seconds

async def get_or_create_schedule(channel: dict, date: str) -> dict:
    """Get schedule from database or create if doesn't exist for the date"""
    channel_id = channel.get("id", "")
    
    # Check if schedule exists for this channel and date
    existing = await db.schedules.find_one(
        {"channel_id": channel_id, "schedule_date": date},
        {"_id": 0}
    )
    
    if existing:
        # Always use current channel data (in case it was updated)
        existing["channel_thumbnail"] = channel.get("thumbnail")
        existing["channel_name"] = channel.get("name")
        existing["unique_video_count"] = len(channel.get("videos", []))
        existing["use_schedule"] = channel.get("use_schedule", False)
        return existing
    
    # Generate new schedule for this date
    schedule = generate_24h_schedule(channel, date)
    
    # Store in database
    await db.schedules.insert_one(schedule)
    
    # Remove _id if added by MongoDB
    schedule.pop("_id", None)
    
    return schedule

@api_router.get("/schedule/channels")
async def get_all_channel_schedules(user: dict = Depends(require_user)):
    """Get 24-hour schedules for all channels (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(100)
    today = get_eastern_date()
    
    schedules = []
    for channel in channels:
        if not channel.get("videos"):
            continue
        
        schedule = await get_or_create_schedule(channel, today)
        schedules.append(schedule)
    
    return {"date": today, "schedules": schedules}

@api_router.get("/schedule/channel/{channel_id}")
async def get_channel_schedule(channel_id: str, user: dict = Depends(require_user)):
    """Get 24-hour schedule for a specific channel (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    today = get_eastern_date()
    schedule = await get_or_create_schedule(channel, today)
    
    return schedule

# Public endpoint for Live TV - no auth required
@api_router.get("/schedule/live")
async def get_live_schedules():
    """Get 24-hour schedules for all public channels (for Live TV)"""
    channels = await db.channels.find({"is_public": True}, {"_id": 0}).sort([("sort_order", 1), ("favorites_count", -1)]).to_list(100)
    today = get_eastern_date()
    
    schedules = []
    for channel in channels:
        if not channel.get("videos"):
            continue
        
        schedule = await get_or_create_schedule(channel, today)
        schedules.append(schedule)
    
    return {"date": today, "timezone": "America/New_York", "schedules": schedules}

# Public endpoint for single channel schedule
@api_router.get("/schedule/live/{channel_id}")
async def get_live_channel_schedule(channel_id: str):
    """Get 24-hour schedule for a specific channel (for Live TV)"""
    channel = await db.channels.find_one({"id": channel_id, "is_public": True}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    today = get_eastern_date()
    schedule = await get_or_create_schedule(channel, today)
    
    return {"date": today, "timezone": "America/New_York", "schedule": schedule}

@api_router.post("/schedule/regenerate/{channel_id}")
async def regenerate_channel_schedule(channel_id: str, user: dict = Depends(require_user)):
    """Regenerate 24-hour schedule for a channel (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    today = get_eastern_date()
    
    # Delete existing schedule for today
    await db.schedules.delete_one({"channel_id": channel_id, "schedule_date": today})
    
    # Generate new random schedule
    schedule = generate_24h_schedule(channel, today, force_random=True)
    
    # Store in database
    await db.schedules.insert_one(schedule)
    schedule.pop("_id", None)
    
    return schedule

@api_router.post("/schedules/regenerate-all")
async def regenerate_all_schedules(user: dict = Depends(require_user)):
    """Regenerate schedules for all channels (admin only) - use after updating video durations"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    today = get_eastern_date()
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    regenerated = 0
    for channel in channels:
        # Delete existing schedule
        await db.schedules.delete_one({"channel_id": channel["id"], "schedule_date": today})
        
        # Generate new schedule with current durations
        schedule = generate_24h_schedule(channel, today, force_random=False)
        
        # Store in database
        await db.schedules.insert_one(schedule)
        regenerated += 1
    
    return {"regenerated": regenerated, "date": today}

def generate_24h_schedule(channel: dict, date: str, force_random: bool = False) -> dict:
    """Generate a 24-hour schedule for a channel by randomly distributing videos"""
    videos = channel.get("videos", [])
    if not videos:
        return {
            "channel_id": channel.get("id", ""),
            "channel_name": channel.get("name", ""),
            "channel_thumbnail": channel.get("thumbnail"),
            "schedule_date": date,
            "videos": [],
            "total_duration": 0,
            "unique_video_count": 0
        }
    
    # Use date as seed for consistent daily schedule (unless force_random)
    if not force_random:
        seed_str = f"{channel.get('id', '')}-{date}"
        random.seed(hash(seed_str))
    
    # Shuffle videos
    shuffled_videos = videos.copy()
    random.shuffle(shuffled_videos)
    
    # Reset random seed
    if not force_random:
        random.seed()
    
    # Fill 24 hours (86400 seconds) with videos
    total_seconds = 24 * 60 * 60
    scheduled = []
    current_time = 0
    video_index = 0
    
    while current_time < total_seconds:
        video = shuffled_videos[video_index % len(shuffled_videos)]
        duration = video.get("duration", 300)  # Default 5 min if no duration
        if duration <= 0:
            duration = 300
        
        start_h = current_time // 3600
        start_m = (current_time % 3600) // 60
        start_s = current_time % 60
        
        end_time = min(current_time + duration, total_seconds)
        end_h = end_time // 3600
        end_m = (end_time % 3600) // 60
        end_s = end_time % 60
        
        scheduled.append({
            "video_id": video.get("id", ""),
            "title": video.get("title", "Untitled"),
            "thumbnail": video.get("thumbnail"),
            "youtube_id": video.get("youtube_id"),
            "start_time": f"{start_h:02d}:{start_m:02d}:{start_s:02d}",
            "end_time": f"{end_h:02d}:{end_m:02d}:{end_s:02d}",
            "duration": duration
        })
        
        current_time += duration
        video_index += 1
    
    return {
        "channel_id": channel.get("id", ""),
        "channel_name": channel.get("name", ""),
        "channel_thumbnail": channel.get("thumbnail"),
        "schedule_date": date,
        "videos": scheduled,
        "total_duration": min(current_time, total_seconds),
        "unique_video_count": len(videos)  # Actual number of unique videos in the channel
    }

# Save custom schedule (for manual scheduling)
class ScheduleVideoInput(BaseModel):
    video_id: str
    youtube_id: Optional[str] = None
    title: str
    duration: int
    start_time: str
    end_time: str
    video_url: Optional[str] = None

class SaveScheduleInput(BaseModel):
    channel_id: str
    date: str
    videos: List[ScheduleVideoInput]

@api_router.post("/schedule/save")
async def save_schedule(data: SaveScheduleInput, current_user: dict = Depends(get_current_user)):
    """Save a custom schedule created by admin"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get channel info
    channel = await db.channels.find_one({"id": data.channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    # Calculate total duration
    total_duration = sum(v.duration for v in data.videos)
    
    # Create schedule document
    schedule_doc = {
        "channel_id": data.channel_id,
        "channel_name": channel.get("name", ""),
        "channel_thumbnail": channel.get("thumbnail"),
        "schedule_date": data.date,
        "videos": [
            {
                "video_id": v.video_id,
                "youtube_id": v.youtube_id,
                "title": v.title,
                "duration": v.duration,
                "start_time": v.start_time,
                "end_time": v.end_time,
                "video_url": v.video_url,
            }
            for v in data.videos
        ],
        "total_duration": total_duration,
        "unique_video_count": len(set(v.video_id for v in data.videos)),
        "is_custom": True,  # Mark as manually created
        "updated_at": datetime.utcnow().isoformat()
    }
    
    # Upsert the schedule (replace if exists for this channel and date)
    await db.schedules.update_one(
        {"channel_id": data.channel_id, "schedule_date": data.date},
        {"$set": schedule_doc},
        upsert=True
    )
    
    return {"success": True, "message": "Schedule saved", "total_videos": len(data.videos)}

@api_router.get("/schedule/channel/{channel_id}")
async def get_channel_schedule(channel_id: str, date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get schedule for a specific channel"""
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Use today's date if not specified
    if not date:
        eastern = pytz.timezone('America/New_York')
        date = datetime.now(eastern).strftime('%Y-%m-%d')
    
    # Check for existing schedule
    schedule = await db.schedules.find_one(
        {"channel_id": channel_id, "schedule_date": date},
        {"_id": 0}
    )
    
    if schedule:
        return {
            "channel_id": channel_id,
            "date": date,
            "videos": schedule.get("videos", []),
            "is_custom": schedule.get("is_custom", False),
            "total_duration": schedule.get("total_duration", 0)
        }
    
    # No schedule exists, return empty
    return {
        "channel_id": channel_id,
        "date": date,
        "videos": [],
        "is_custom": False,
        "total_duration": 0
    }

# ===================== MIGRATION ENDPOINT =====================

class MigrationResult(BaseModel):
    total_channels_processed: int
    channels_updated: List[str]
    videos_added: int
    errors: List[str]

@api_router.post("/migrate-data", response_model=MigrationResult)
async def migrate_data_from_old_build(user: dict = Depends(require_user)):
    """
    One-time migration endpoint to sync videos from the old application.
    This merges video data from the old build while preserving existing data.
    Admin only.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import json
    
    # Load old data from file
    old_data_path = ROOT_DIR / "old_data.json"
    if not old_data_path.exists():
        raise HTTPException(status_code=404, detail="old_data.json not found. Please fetch data first.")
    
    with open(old_data_path, 'r') as f:
        old_channels = json.load(f)
    
    results = {
        "total_channels_processed": 0,
        "channels_updated": [],
        "videos_added": 0,
        "errors": []
    }
    
    for old_channel in old_channels:
        old_name = old_channel.get("name", "").strip()
        old_videos = old_channel.get("videos", [])
        
        if not old_name:
            results["errors"].append(f"Channel with no name skipped")
            continue
        
        results["total_channels_processed"] += 1
        
        # Find matching channel in current database (by name - try exact and trimmed)
        current_channel = await db.channels.find_one({"name": old_name}, {"_id": 0})
        if not current_channel:
            # Try with trailing space (some channels have whitespace issues)
            current_channel = await db.channels.find_one({"name": old_name + " "}, {"_id": 0})
        if not current_channel:
            # Try regex case-insensitive match
            current_channel = await db.channels.find_one(
                {"name": {"$regex": f"^{old_name.strip()}\\s*$", "$options": "i"}}, 
                {"_id": 0}
            )
        
        if not current_channel:
            results["errors"].append(f"Channel '{old_name}' not found in current DB")
            continue
        
        current_videos = current_channel.get("videos", [])
        current_video_ids = set()
        
        # Build set of existing video identifiers (youtube_id or video_url)
        for cv in current_videos:
            if cv.get("youtube_id"):
                current_video_ids.add(cv["youtube_id"])
            if cv.get("video_url"):
                current_video_ids.add(cv["video_url"])
        
        # Check if channel has 0 videos - full restore needed
        full_restore = len(current_videos) == 0
        
        videos_to_add = []
        for old_video in old_videos:
            vid_identifier = old_video.get("youtube_id") or old_video.get("video_url")
            
            if not vid_identifier:
                continue
            
            if full_restore or vid_identifier not in current_video_ids:
                # Create new video entry preserving all fields
                new_video = {
                    "id": old_video.get("id") or str(uuid.uuid4()),
                    "youtube_id": old_video.get("youtube_id"),
                    "video_url": old_video.get("video_url"),  # Preserve uploaded video URLs
                    "title": old_video.get("title", "Untitled"),
                    "thumbnail": old_video.get("thumbnail"),
                    "duration": old_video.get("duration", 300),
                    "order": len(current_videos) + len(videos_to_add)
                }
                videos_to_add.append(new_video)
        
        if videos_to_add:
            if full_restore:
                # Complete restore - replace empty videos array
                await db.channels.update_one(
                    {"id": current_channel["id"]},
                    {"$set": {"videos": videos_to_add}}
                )
            else:
                # Merge - add new videos to existing
                await db.channels.update_one(
                    {"id": current_channel["id"]},
                    {"$push": {"videos": {"$each": videos_to_add}}}
                )
            
            results["channels_updated"].append(f"{old_name} (+{len(videos_to_add)} videos)")
            results["videos_added"] += len(videos_to_add)
    
    return results

# Include router and middleware
app.include_router(api_router)

# Serve uploaded videos
app.mount("/api/videos", StaticFiles(directory=str(UPLOADS_DIR)), name="videos")

# Serve uploaded images
app.mount("/api/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

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
