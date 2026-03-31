from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Body, Request, Query, Form, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
# ffmpeg/ffprobe: use system binary if available, otherwise Python fallback
def ensure_ffmpeg():
    pass  # No-op, rely on system ffmpeg or Python fallback
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

def serialize_doc(doc):
    """Convert datetime fields to ISO strings for JSON serialization"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for k, v in doc.items():
            if isinstance(v, datetime):
                result[k] = v.isoformat()
            elif isinstance(v, dict):
                result[k] = serialize_doc(v)
            elif isinstance(v, list):
                result[k] = serialize_doc(v)
            else:
                result[k] = v
        return result
    return doc

# Create uploads directories
UPLOADS_DIR = ROOT_DIR / "uploads" / "videos"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

IMAGES_DIR = ROOT_DIR / "uploads" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# YouTube cookies directory
COOKIES_DIR = ROOT_DIR / "cookies"
try:
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    logger.warning(f"Could not create cookies directory: {e}")
COOKIES_FILE = COOKIES_DIR / "youtube_cookies.txt"

def is_cookies_file_valid():
    """Check if cookies file exists and is valid"""
    try:
        if not COOKIES_FILE.exists():
            return False
        # Check file is readable and not empty
        if COOKIES_FILE.stat().st_size == 0:
            return False
        # Try to read first line
        with open(COOKIES_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            return bool(first_line)
    except Exception as e:
        logger.warning(f"Error checking cookies file: {e}")
        return False

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
    is_live_stream: bool = False  # If True, channel plays a single YouTube live stream
    live_stream_youtube_id: Optional[str] = None  # YouTube video ID for live stream

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
    is_live_stream: Optional[bool] = None
    live_stream_youtube_id: Optional[str] = None

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
    is_live_stream: bool = False
    live_stream_youtube_id: Optional[str] = None
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
    return serialize_doc(channels)

@api_router.get("/channels/featured", response_model=List[ChannelResponse])
async def get_featured_channels():
    channels = await db.channels.find(
        {"is_public": True},
        {"_id": 0}
    ).sort("favorites_count", -1).limit(6).to_list(6)
    return serialize_doc(channels)

@api_router.get("/channels/my", response_model=List[ChannelResponse])
async def get_my_channels(user: dict = Depends(require_user)):
    channels = await db.channels.find({"owner_id": user["id"]}, {"_id": 0}).to_list(100)
    return serialize_doc(channels)

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
        "is_live_stream": data.is_live_stream,
        "live_stream_youtube_id": data.live_stream_youtube_id,
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
    
    # Filter out any invalid IDs silently (don't reject the whole request)
    valid_ids = [vid for vid in video_ids if vid in video_map]
    
    # Ensure all videos are included (in case some were missing from the request)
    reordered = []
    seen_ids = set()
    for i, vid in enumerate(valid_ids):
        if vid not in seen_ids:
            video_map[vid]["order"] = i
            reordered.append(video_map[vid])
            seen_ids.add(vid)
    
    # Add any videos that weren't in the reorder request at the end
    for video in videos:
        if video["id"] not in seen_ids:
            video["order"] = len(reordered)
            reordered.append(video)
    
    await db.channels.update_one({"id": channel_id}, {"$set": {"videos": reordered}})
    
    skipped = len(video_ids) - len(valid_ids)
    return {"message": "Videos reordered", "count": len(reordered), "skipped_invalid": skipped}

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

# Import R2 service
from r2_service import (
    upload_to_r2, 
    delete_from_r2, 
    is_r2_configured, 
    get_public_url,
    test_r2_connection
)

import subprocess
import tempfile

def get_video_duration_from_url(url: str) -> int:
    """Extract MP4 duration by parsing the moov/mvhd atom from HTTP Range request.
    Works without ffprobe. Falls back to 0 on failure."""
    import struct
    try:
        import requests
        # Download first 100KB - enough to find moov/mvhd in most files
        resp = requests.get(url, headers={"Range": "bytes=0-102400"}, timeout=15)
        data = resp.content
        offset = 0
        while offset < len(data) - 8:
            size = struct.unpack(">I", data[offset:offset+4])[0]
            box_type = data[offset+4:offset+8]
            if size < 8:
                break
            if box_type == b'moov':
                # Search inside moov for mvhd
                inner = offset + 8
                while inner < offset + size and inner < len(data) - 8:
                    isize = struct.unpack(">I", data[inner:inner+4])[0]
                    itype = data[inner+4:inner+8]
                    if isize < 8:
                        break
                    if itype == b'mvhd':
                        version = data[inner+8]
                        if version == 0:
                            timescale = struct.unpack(">I", data[inner+20:inner+24])[0]
                            duration = struct.unpack(">I", data[inner+24:inner+28])[0]
                        else:
                            timescale = struct.unpack(">I", data[inner+28:inner+32])[0]
                            duration = struct.unpack(">Q", data[inner+32:inner+40])[0]
                        if timescale > 0:
                            return int(duration / timescale)
                    inner += isize
            offset += size
    except Exception as e:
        logger.warning(f"Python MP4 parse failed for {url}: {e}")
    return 0

def get_video_duration(file_path: str) -> int:
    """Extract video duration using ffprobe, with Python fallback for URLs"""
    ensure_ffmpeg()
    # Try ffprobe first
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            duration = float(result.stdout.strip())
            return int(duration)
    except FileNotFoundError:
        # ffprobe not installed - use Python fallback for URLs
        if file_path.startswith('http'):
            dur = get_video_duration_from_url(file_path)
            if dur > 0:
                return dur
    except Exception as e:
        logger.warning(f"Failed to get video duration: {e}")
    
    # Last resort: try Python parser for URLs
    if file_path.startswith('http'):
        dur = get_video_duration_from_url(file_path)
        if dur > 0:
            return dur
    
    return 300  # Default 5 minutes

class UploadedVideoResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    url: str
    size: int
    duration: int = 300  # Default 5 min, can be updated
    thumbnail: Optional[str] = None
    created_at: str
    storage_type: str = "r2"  # "r2" or "local"

# Commercial models
class CommercialResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    url: str
    size: int
    duration: int = 30  # Default 30 seconds
    thumbnail: Optional[str] = None
    created_at: str
    channel_ids: List[str] = []  # Empty list means ALL channels, otherwise specific channel IDs
    is_global: bool = False  # True = plays on all channels

MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
ALLOWED_VIDEO_EXTENSIONS = {'.mp4'}

def convert_to_mp4(input_path: str, output_path: str) -> bool:
    """Convert video to browser-compatible H.264 MP4 with faststart."""
    try:
        ffmpeg_path = shutil.which('ffmpeg')
        if not ffmpeg_path:
            logger.warning("ffmpeg not found - skipping conversion")
            return False
        
        # Check input video codec
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', input_path],
            capture_output=True, text=True, timeout=30
        )
        video_codec = probe.stdout.strip().lower()
        logger.info(f"Input video codec: {video_codec}")
        
        # If already H.264, just remux with faststart
        if video_codec in ('h264', 'hevc', 'h265'):
            logger.info("Video is H.264/HEVC - remuxing with faststart")
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', input_path, '-c', 'copy', '-movflags', '+faststart', output_path],
                capture_output=True, timeout=600
            )
        else:
            # Re-encode to H.264 (for MPEG-4 Part 2 and other codecs)
            logger.info(f"Re-encoding {video_codec} to H.264...")
            result = subprocess.run(
                ['ffmpeg', '-y', '-i', input_path,
                 '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                 '-c:a', 'aac', '-b:a', '128k',
                 '-movflags', '+faststart', output_path],
                capture_output=True, timeout=1800  # 30 min for large files
            )
        
        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            logger.info(f"Conversion successful: {os.path.getsize(output_path)} bytes")
            return True
        else:
            logger.error(f"FFmpeg failed: {result.stderr[-500:] if result.stderr else 'unknown'}")
            return False
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg conversion timed out")
        return False
    except FileNotFoundError:
        logger.error("ffmpeg not found")
        return False

@api_router.get("/storage/status")
async def get_storage_status(user: dict = Depends(require_user)):
    """Check cloud storage status (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return test_r2_connection()


# Chunked upload storage - use /tmp for compatibility across environments
CHUNK_UPLOADS_DIR = Path("/tmp/video_chunks")
CHUNK_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 5 * 1024 * 1024  # 5MB chunks

@api_router.post("/upload/video/init-chunked")
async def init_chunked_upload(
    filename: str = Query(...),
    total_size: int = Query(...),
    total_chunks: int = Query(...),
    user: dict = Depends(require_user)
):
    """Initialize a chunked upload session"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if total_size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum 2GB")
    
    file_ext = Path(filename).suffix.lower()
    if file_ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}")
    
    upload_id = str(uuid.uuid4())
    chunk_dir = CHUNK_UPLOADS_DIR / upload_id
    chunk_dir.mkdir(parents=True, exist_ok=True)
    
    return {
        "upload_id": upload_id,
        "chunk_size": CHUNK_SIZE,
        "total_chunks": total_chunks,
    }

@api_router.post("/upload/video/chunk")
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload a single chunk"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    chunk_dir = CHUNK_UPLOADS_DIR / upload_id
    if not chunk_dir.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    chunk_path = chunk_dir / f"chunk_{chunk_index:05d}"
    content = await file.read()
    with open(chunk_path, "wb") as f:
        f.write(content)
    
    return {"chunk_index": chunk_index, "size": len(content)}

@api_router.post("/upload/video/complete-chunked")
async def complete_chunked_upload(
    upload_id: str = Query(...),
    filename: str = Query(...),
    total_chunks: int = Query(...),
    user: dict = Depends(require_user)
):
    """Assemble chunks, extract duration, upload to R2"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    chunk_dir = CHUNK_UPLOADS_DIR / upload_id
    if not chunk_dir.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    # Assemble chunks into a single file
    video_id = str(uuid.uuid4())
    file_ext = Path(filename).suffix.lower() or ".mp4"
    assembled_path = CHUNK_UPLOADS_DIR / f"{upload_id}_assembled{file_ext}"
    converted_path = CHUNK_UPLOADS_DIR / f"{upload_id}_converted.mp4"
    
    try:
        with open(assembled_path, "wb") as out:
            for i in range(total_chunks):
                chunk_path = chunk_dir / f"chunk_{i:05d}"
                if not chunk_path.exists():
                    raise HTTPException(status_code=400, detail=f"Missing chunk {i}")
                with open(chunk_path, "rb") as chunk:
                    out.write(chunk.read())
        
        file_size = os.path.getsize(assembled_path)
        logger.info(f"Assembled {total_chunks} chunks into {file_size} bytes for {filename}")
        
        # Convert to browser-compatible MP4 if needed
        final_path = assembled_path
        if convert_to_mp4(str(assembled_path), str(converted_path)):
            final_path = converted_path
            logger.info(f"Converted {filename} to MP4 ({os.path.getsize(converted_path)} bytes)")
        elif file_ext != '.mp4':
            raise HTTPException(status_code=500, detail=f"Failed to convert {file_ext} to MP4")
        
        # Extract duration from final file
        video_duration = get_video_duration(str(final_path))
        logger.info(f"Extracted duration: {video_duration}s for {filename}")
        
        out_filename = f"{video_id}.mp4"
        final_size = os.path.getsize(final_path)
        
        # Upload to R2
        if is_r2_configured():
            object_key = f"videos/{out_filename}"
            with open(str(final_path), "rb") as f:
                file_content = f.read()
            result = upload_to_r2(file_content, object_key, "video/mp4")
            if not result["success"]:
                raise HTTPException(status_code=500, detail=f"Cloud upload failed: {result.get('error')}")
            video_url = result["url"]
        else:
            file_path = UPLOADS_DIR / out_filename
            import shutil
            shutil.move(str(final_path), str(file_path))
            video_url = f"/api/videos/{out_filename}"
        
        # Store in database
        now = datetime.now(timezone.utc).isoformat()
        video_doc = {
            "id": video_id,
            "filename": out_filename,
            "original_name": filename,
            "url": video_url,
            "size": final_size,
            "duration": video_duration,
            "thumbnail": None,
            "owner_id": user["id"],
            "storage_type": "r2" if is_r2_configured() else "local",
            "created_at": now
        }
        await db.uploaded_videos.insert_one(video_doc)
        
        return {
            "id": video_id,
            "filename": out_filename,
            "original_name": filename,
            "url": video_url,
            "size": final_size,
            "duration": video_duration,
            "thumbnail": None,
            "created_at": now,
            "storage_type": video_doc["storage_type"]
        }
    finally:
        # Cleanup chunks and temp files
        import shutil
        if chunk_dir.exists():
            shutil.rmtree(chunk_dir)
        if assembled_path.exists():
            os.unlink(assembled_path)
        if converted_path.exists():
            os.unlink(converted_path)

@api_router.post("/upload/video", response_model=UploadedVideoResponse)
async def upload_video(
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload a video file to cloud storage - all video formats, auto-converts to MP4, max 2GB"""
    # Validate file type
    file_ext = Path(file.filename).suffix.lower() if file.filename else ""
    if file_ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported format. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )
    
    video_id = str(uuid.uuid4())
    
    # Read file content
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 2GB")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
    
    # Save to temp file, convert if needed, extract duration
    video_duration = 300
    tmp_input = f"/tmp/upload_{video_id}{file_ext}"
    tmp_converted = f"/tmp/upload_{video_id}_converted.mp4"
    
    try:
        with open(tmp_input, "wb") as f:
            f.write(file_content)
        
        # Convert to browser-compatible MP4
        if convert_to_mp4(tmp_input, tmp_converted):
            final_path = tmp_converted
            with open(tmp_converted, "rb") as f:
                file_content = f.read()
            logger.info(f"Converted {file.filename} to MP4 ({len(file_content)} bytes)")
        else:
            final_path = tmp_input
        
        video_duration = get_video_duration(final_path)
        logger.info(f"Extracted video duration: {video_duration}s for {file.filename}")
    except Exception as e:
        logger.warning(f"Processing error: {e}")
    finally:
        if os.path.exists(tmp_input):
            os.unlink(tmp_input)
        if os.path.exists(tmp_converted):
            os.unlink(tmp_converted)
    
    filename = f"{video_id}.mp4"
    storage_type = "r2" if is_r2_configured() else "local"
    
    if storage_type == "r2":
        # Upload to R2 cloud storage
        object_key = f"videos/{filename}"
        result = upload_to_r2(file_content, object_key, "video/mp4")
        
        if not result["success"]:
            raise HTTPException(status_code=500, detail=f"Cloud upload failed: {result.get('error', 'Unknown error')}")
        
        video_url = result["url"]
    else:
        # Fallback to local storage
        file_path = UPLOADS_DIR / filename
        try:
            with open(file_path, "wb") as buffer:
                buffer.write(file_content)
            video_url = f"/api/videos/{filename}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Store in database
    now = datetime.now(timezone.utc).isoformat()
    video_doc = {
        "id": video_id,
        "filename": filename,
        "original_name": file.filename,
        "url": video_url,
        "size": file_size,
        "duration": video_duration,  # Extracted from video file
        "thumbnail": None,
        "owner_id": user["id"],
        "storage_type": storage_type,
        "created_at": now
    }
    
    await db.uploaded_videos.insert_one(video_doc)
    
    return UploadedVideoResponse(
        id=video_id,
        filename=filename,
        original_name=file.filename,
        url=video_url,
        size=file_size,
        duration=video_duration,
        thumbnail=None,
        created_at=now,
        storage_type=storage_type
    )

@api_router.get("/upload/videos")
async def list_uploaded_videos(user: dict = Depends(require_user)):
    """List all uploaded videos (admin only)"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    videos = await db.uploaded_videos.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # URLs are now stored directly in the database
    # For backwards compatibility, add URL if not present
    for video in videos:
        if "url" not in video:
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
    
    storage_type = video.get("storage_type", "local")
    
    if storage_type == "r2":
        # Delete from R2
        object_key = f"videos/{video['filename']}"
        result = delete_from_r2(object_key)
        if not result["success"]:
            logger.warning(f"Failed to delete from R2: {result.get('error')}")
    else:
        # Delete local file
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


# ===================== COMMERCIAL ROUTES =====================

@api_router.post("/commercials/upload")
async def upload_commercial(
    file: UploadFile = File(...),
    channel_ids: Optional[str] = Form(None),  # Comma-separated channel IDs, empty = all channels
    is_global: bool = Form(False),
    user: dict = Depends(require_user)
):
    """Upload a commercial video for specific channels or all channels"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import upload_to_r2, is_r2_configured
    
    if not is_r2_configured():
        raise HTTPException(status_code=500, detail="R2 storage not configured")
    
    # Parse channel IDs
    parsed_channel_ids = []
    if channel_ids and not is_global:
        parsed_channel_ids = [cid.strip() for cid in channel_ids.split(",") if cid.strip()]
        # Validate channels exist
        for cid in parsed_channel_ids:
            channel = await db.channels.find_one({"id": cid})
            if not channel:
                raise HTTPException(status_code=404, detail=f"Channel {cid} not found")
    
    # Validate file
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only MP4 files are allowed")
    
    # Read and process file
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    
    commercial_id = str(uuid.uuid4())
    filename = f"{commercial_id}.mp4"
    
    # Save temporarily for processing
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Convert if needed (MPEG-4 to H.264)
        converted_path = tmp_path.replace(".mp4", "_converted.mp4")
        if convert_to_mp4(tmp_path, converted_path):
            upload_path = converted_path
        else:
            upload_path = tmp_path
        
        # Get duration
        duration = 30  # Default
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', upload_path],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                duration = int(float(result.stdout.strip()))
        except:
            pass
        
        # Upload to R2
        with open(upload_path, "rb") as f:
            file_content = f.read()
        
        r2_key = f"commercials/{filename}"
        r2_result = upload_to_r2(file_content, r2_key, content_type="video/mp4")
        
        if not r2_result["success"]:
            raise HTTPException(status_code=500, detail="Failed to upload to storage")
        
        # Store in database
        commercial_doc = {
            "id": commercial_id,
            "filename": filename,
            "original_name": file.filename,
            "url": r2_result["url"],
            "size": len(file_content),
            "duration": duration,
            "channel_ids": parsed_channel_ids,
            "is_global": is_global or len(parsed_channel_ids) == 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Create copy for response before insert (insert_one modifies the dict)
        response_doc = dict(commercial_doc)
        
        await db.commercials.insert_one(commercial_doc)
        
        return response_doc
        
    finally:
        # Cleanup temp files
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if os.path.exists(converted_path):
            os.unlink(converted_path)


# Chunked commercial upload storage
commercial_upload_sessions = {}

@api_router.post("/commercials/upload/init-chunked")
async def init_chunked_commercial_upload(
    filename: str,
    total_size: int,
    total_chunks: int,
    channel_ids: Optional[str] = None,  # Comma-separated, empty = all channels
    is_global: bool = False,
    user: dict = Depends(require_user)
):
    """Initialize a chunked commercial upload session"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Parse channel IDs
    parsed_channel_ids = []
    if channel_ids and not is_global:
        parsed_channel_ids = [cid.strip() for cid in channel_ids.split(",") if cid.strip()]
    
    upload_id = str(uuid.uuid4())
    chunk_dir = Path(f"/tmp/commercial_chunks/{upload_id}")
    chunk_dir.mkdir(parents=True, exist_ok=True)
    
    commercial_upload_sessions[upload_id] = {
        "filename": filename,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "channel_ids": parsed_channel_ids,
        "is_global": is_global or len(parsed_channel_ids) == 0,
        "chunk_dir": str(chunk_dir),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    return {"upload_id": upload_id, "chunk_size": 1 * 1024 * 1024, "total_chunks": total_chunks}


@api_router.post("/commercials/upload/chunk")
async def upload_commercial_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload a single chunk for a commercial"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    session = commercial_upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    chunk_dir = Path(session["chunk_dir"])
    chunk_path = chunk_dir / f"chunk_{chunk_index:05d}"
    
    content = await file.read()
    with open(chunk_path, "wb") as f:
        f.write(content)
    
    return {"chunk_index": chunk_index, "size": len(content)}


@api_router.post("/commercials/upload/complete-chunked")
async def complete_chunked_commercial_upload(
    upload_id: str,
    filename: str,
    total_chunks: int,
    user: dict = Depends(require_user)
):
    """Assemble chunks and complete commercial upload"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import upload_to_r2, is_r2_configured
    
    if not is_r2_configured():
        raise HTTPException(status_code=500, detail="R2 storage not configured")
    
    session = commercial_upload_sessions.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    chunk_dir = Path(session["chunk_dir"])
    
    # Assemble chunks
    assembled_path = chunk_dir / "assembled.mp4"
    with open(assembled_path, "wb") as outfile:
        for i in range(total_chunks):
            chunk_path = chunk_dir / f"chunk_{i:05d}"
            if not chunk_path.exists():
                raise HTTPException(status_code=400, detail=f"Missing chunk {i}")
            with open(chunk_path, "rb") as chunk_file:
                outfile.write(chunk_file.read())
    
    assembled_size = assembled_path.stat().st_size
    logger.info(f"Assembled {total_chunks} chunks into {assembled_size} bytes for commercial {filename}")
    
    try:
        # Convert if needed
        converted_path = str(assembled_path).replace(".mp4", "_converted.mp4")
        if convert_to_mp4(str(assembled_path), converted_path):
            upload_path = converted_path
        else:
            upload_path = str(assembled_path)
        
        # Get duration
        duration = 30
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', upload_path],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                duration = int(float(result.stdout.strip()))
        except:
            pass
        
        # Upload to R2
        commercial_id = str(uuid.uuid4())
        r2_filename = f"{commercial_id}.mp4"
        
        with open(upload_path, "rb") as f:
            file_content = f.read()
        
        r2_key = f"commercials/{r2_filename}"
        r2_result = upload_to_r2(file_content, r2_key, content_type="video/mp4")
        
        if not r2_result["success"]:
            raise HTTPException(status_code=500, detail="Failed to upload to storage")
        
        # Store in database - get channel info from session
        channel_ids = session.get("channel_ids", [])
        is_global = session.get("is_global", False)
        
        commercial_doc = {
            "id": commercial_id,
            "filename": r2_filename,
            "original_name": filename,
            "url": r2_result["url"],
            "size": len(file_content),
            "duration": duration,
            "channel_ids": channel_ids,
            "is_global": is_global,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Create copy for response before insert (insert_one modifies the dict)
        response_doc = dict(commercial_doc)
        
        await db.commercials.insert_one(commercial_doc)
        
        # Clean up session
        del commercial_upload_sessions[upload_id]
        
        return response_doc
        
    finally:
        # Cleanup temp files
        import shutil
        if chunk_dir.exists():
            shutil.rmtree(chunk_dir)


@api_router.get("/commercials", response_model=List[CommercialResponse])
async def list_commercials(
    channel_id: Optional[str] = None,
    user: dict = Depends(require_user)
):
    """List all commercials, optionally filtered by channel"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if channel_id:
        query["channel_id"] = channel_id
    
    commercials = await db.commercials.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return serialize_doc(commercials)


@api_router.get("/channels/{channel_id}/commercials", response_model=List[CommercialResponse])
async def get_channel_commercials(channel_id: str):
    """Get commercials assigned to a specific channel or global commercials (for playback)"""
    # Get commercials that are either:
    # 1. Global (is_global = true)
    # 2. Assigned to this specific channel (channel_id in channel_ids)
    commercials = await db.commercials.find(
        {"$or": [
            {"is_global": True},
            {"channel_ids": channel_id}
        ]}, 
        {"_id": 0}
    ).to_list(100)
    return serialize_doc(commercials)


@api_router.delete("/commercials/{commercial_id}")
async def delete_commercial(commercial_id: str, user: dict = Depends(require_user)):
    """Delete a commercial"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import delete_from_r2
    
    commercial = await db.commercials.find_one({"id": commercial_id})
    if not commercial:
        raise HTTPException(status_code=404, detail="Commercial not found")
    
    # Delete from R2
    r2_key = f"commercials/{commercial['filename']}"
    delete_from_r2(r2_key)
    
    # Delete from database
    await db.commercials.delete_one({"id": commercial_id})
    
    return {"message": "Commercial deleted"}


class CommercialAssignment(BaseModel):
    channel_ids: List[str] = []
    is_global: bool = False


@api_router.put("/commercials/{commercial_id}/assign")
async def assign_commercial_to_channels(
    commercial_id: str,
    assignment: CommercialAssignment,
    user: dict = Depends(require_user)
):
    """Update channel assignments for a commercial"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    commercial = await db.commercials.find_one({"id": commercial_id})
    if not commercial:
        raise HTTPException(status_code=404, detail="Commercial not found")
    
    # Validate channels if not global
    if not assignment.is_global and assignment.channel_ids:
        for cid in assignment.channel_ids:
            channel = await db.channels.find_one({"id": cid})
            if not channel:
                raise HTTPException(status_code=404, detail=f"Channel {cid} not found")
    
    # If global or no channels selected, set is_global to true
    is_global = assignment.is_global or len(assignment.channel_ids) == 0
    
    await db.commercials.update_one(
        {"id": commercial_id},
        {"$set": {
            "channel_ids": [] if is_global else assignment.channel_ids,
            "is_global": is_global
        }}
    )
    
    # Return updated commercial
    updated = await db.commercials.find_one({"id": commercial_id}, {"_id": 0})
    return serialize_doc(updated)


@api_router.post("/channels/{channel_id}/update-durations")
async def update_channel_video_durations(channel_id: str, user: dict = Depends(require_user)):
    """Update video durations for all uploaded videos in a channel using ffprobe on R2 URLs"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    videos = channel.get("videos", [])
    updated_count = 0
    errors = []
    
    for i, video in enumerate(videos):
        video_url = video.get("video_url")
        if not video_url:
            continue  # Skip YouTube-only videos
        
        # Build full URL if relative
        if not video_url.startswith("http"):
            continue  # Skip non-HTTP URLs
        
        # Only update videos with default duration
        if video.get("duration", 300) != 300:
            continue
        
        try:
            # Use ffprobe directly on the R2 URL (only reads header, very fast)
            duration = get_video_duration(video_url)
            if duration > 0 and duration != 300:
                videos[i]["duration"] = duration
                updated_count += 1
                logger.info(f"Updated duration for {video.get('title')}: {duration}s")
        except Exception as e:
            errors.append(f"{video.get('title')}: {str(e)}")
    
    # Save updated videos back to channel
    if updated_count > 0:
        await db.channels.update_one(
            {"id": channel_id},
            {"$set": {"videos": videos}}
        )
    
    return {
        "updated": updated_count,
        "total_videos": len(videos),
        "errors": errors[:10]
    }

@api_router.post("/channels/update-all-uploaded-durations")
async def update_all_uploaded_durations(user: dict = Depends(require_user)):
    """Update video durations for ALL uploaded videos across ALL channels using ffprobe on R2 URLs"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    # Collect all videos that need duration updates
    video_tasks = []  # (channel_idx, video_idx, video_url, title)
    for ci, channel in enumerate(channels):
        videos = channel.get("videos", [])
        for vi, video in enumerate(videos):
            video_url = video.get("video_url")
            if not video_url or not video_url.startswith("http"):
                continue
            if video.get("duration", 300) != 300:
                continue
            video_tasks.append((ci, vi, video_url, video.get("title", "Unknown")))
    
    if not video_tasks:
        return {"total_updated": 0, "total_errors": 0, "channels": [], "message": "No uploaded videos need duration updates"}
    
    # Run ffprobe in parallel using thread pool (10 workers)
    loop = asyncio.get_event_loop()
    results = {}
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_map = {}
        for ci, vi, url, title in video_tasks:
            f = loop.run_in_executor(executor, get_video_duration, url)
            future_map[(ci, vi, title)] = f
        for (ci, vi, title), f in future_map.items():
            try:
                duration = await f
                if duration > 0 and duration != 300:
                    results[(ci, vi)] = duration
            except Exception as e:
                logger.warning(f"Failed duration for {title}: {e}")
    
    # Apply updates to channels and save
    total_updated = 0
    channel_results = []
    updated_channels = set()
    
    for (ci, vi), duration in results.items():
        channels[ci]["videos"][vi]["duration"] = duration
        updated_channels.add(ci)
        total_updated += 1
    
    for ci in updated_channels:
        channel = channels[ci]
        await db.channels.update_one(
            {"id": channel["id"]},
            {"$set": {"videos": channel["videos"]}}
        )
        count = sum(1 for (c, _) in results if c == ci)
        channel_results.append({"channel": channel.get("name"), "updated": count})
    
    return {
        "total_updated": total_updated,
        "total_errors": len(video_tasks) - total_updated,
        "channels": channel_results
    }


@api_router.put("/channels/{channel_id}/videos/{video_index}/duration")
async def update_single_video_duration(
    channel_id: str, 
    video_index: int,
    duration: int,
    user: dict = Depends(require_user)
):
    """Update duration for a single video in a channel"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    videos = channel.get("videos", [])
    if video_index < 0 or video_index >= len(videos):
        raise HTTPException(status_code=404, detail="Video index out of range")
    
    # Update the video duration
    await db.channels.update_one(
        {"id": channel_id},
        {"$set": {f"videos.{video_index}.duration": duration}}
    )
    
    return {"message": f"Updated duration for video {video_index} to {duration}s"}

# Import YouTube API service
from youtube_api import get_videos_info_batch, is_youtube_api_configured

@api_router.post("/channels/{channel_id}/update-youtube-durations")
async def update_youtube_video_durations(channel_id: str, user: dict = Depends(require_user)):
    """Update video durations for all YouTube videos in a channel using YouTube Data API"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    videos = channel.get("videos", [])
    
    # Collect YouTube video IDs that need duration update
    youtube_ids = []
    id_to_index = {}
    
    for i, video in enumerate(videos):
        youtube_id = video.get("youtube_id")
        if youtube_id:
            # Only update if still has default duration
            if video.get("duration", 300) == 300:
                youtube_ids.append(youtube_id)
                id_to_index[youtube_id] = i
    
    if not youtube_ids:
        return {"updated": 0, "total_videos": len(videos), "message": "No videos need duration update"}
    
    # Use YouTube API if available, otherwise fall back to yt-dlp
    updated_count = 0
    errors = []
    
    if is_youtube_api_configured():
        # Fast batch update using YouTube API
        logger.info(f"Updating {len(youtube_ids)} videos using YouTube API")
        video_info = await get_videos_info_batch(youtube_ids)
        
        for youtube_id, info in video_info.items():
            if youtube_id in id_to_index:
                idx = id_to_index[youtube_id]
                duration = info.get("duration", 0)
                if duration > 0:
                    videos[idx]["duration"] = duration
                    # Also update title and thumbnail if available
                    if info.get("title"):
                        videos[idx]["title"] = info["title"]
                    if info.get("thumbnail"):
                        videos[idx]["thumbnail"] = info["thumbnail"]
                    updated_count += 1
                    logger.info(f"Updated {info.get('title', youtube_id)}: {duration}s")
        
        # Check for videos not found in API response
        for youtube_id in youtube_ids:
            if youtube_id not in video_info:
                errors.append(f"Video {youtube_id}: Not found or unavailable")
    else:
        # Fallback to yt-dlp (slower)
        logger.info(f"YouTube API not configured, using yt-dlp for {len(youtube_ids)} videos")
        for youtube_id in youtube_ids:
            idx = id_to_index[youtube_id]
            try:
                cmd = [
                    YTDLP_PATH,
                    "--dump-json",
                    "--no-warnings",
                    f"https://www.youtube.com/watch?v={youtube_id}"
                ]
                
                cookies_file = ROOT_DIR / "cookies.txt"
                if cookies_file.exists():
                    try:
                        cmd.extend(["--cookies", str(cookies_file)])
                    except Exception as e:
                        logger.warning(f"Error adding cookies: {e}")
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0 and result.stdout:
                    info = json.loads(result.stdout)
                    duration = int(info.get("duration", 300))
                    if duration > 0:
                        videos[idx]["duration"] = duration
                        updated_count += 1
                else:
                    errors.append(f"Video {youtube_id}: yt-dlp failed")
                    
            except Exception as e:
                errors.append(f"Video {youtube_id}: {str(e)}")
    
    # Save updated videos back to channel
    if updated_count > 0:
        await db.channels.update_one(
            {"id": channel_id},
            {"$set": {"videos": videos}}
        )
    
    return {
        "updated": updated_count,
        "total_videos": len(videos),
        "needs_update": len(youtube_ids),
        "method": "youtube_api" if is_youtube_api_configured() else "yt-dlp",
        "errors": errors[:10]
    }

@api_router.post("/admin/fix-all-video-metadata")
async def fix_all_video_metadata(user: dict = Depends(require_user)):
    """
    Fix titles and durations for ALL videos across ALL channels.
    - YouTube videos: fetch real title + duration from YouTube Data API
    - Uploaded R2 videos: fetch real duration via ffprobe
    Targets videos with default duration (300s) OR generic titles (e.g. 'Video 1')
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import asyncio
    import re
    from concurrent.futures import ThreadPoolExecutor
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    def is_generic_title(title):
        """Check if title is a generic placeholder like 'Video 1', 'Video 102'"""
        if not title:
            return True
        return bool(re.match(r'^Video \d+$', title.strip()))
    
    # Phase 1: Collect all YouTube videos needing updates
    yt_needs_update = {}  # youtube_id -> [(channel_idx, video_idx)]
    for ci, channel in enumerate(channels):
        for vi, video in enumerate(channel.get("videos", [])):
            yt_id = video.get("youtube_id")
            if not yt_id:
                continue
            needs_dur = video.get("duration", 300) == 300
            needs_title = is_generic_title(video.get("title", ""))
            if needs_dur or needs_title:
                if yt_id not in yt_needs_update:
                    yt_needs_update[yt_id] = []
                yt_needs_update[yt_id].append((ci, vi))
    
    # Phase 2: Collect all uploaded videos needing duration fix
    uploaded_tasks = []  # (channel_idx, video_idx, video_url)
    for ci, channel in enumerate(channels):
        for vi, video in enumerate(channel.get("videos", [])):
            video_url = video.get("video_url")
            if not video_url or not video_url.startswith("http"):
                continue
            if video.get("duration", 300) == 300:
                uploaded_tasks.append((ci, vi, video_url))
    
    logger.info(f"Fix metadata: {len(yt_needs_update)} unique YT videos, {len(uploaded_tasks)} uploaded videos")
    
    yt_updated = 0
    yt_title_updated = 0
    yt_dur_updated = 0
    uploaded_updated = 0
    errors = []
    
    # Phase 3: Fetch YouTube video info in batches
    if yt_needs_update and is_youtube_api_configured():
        all_yt_ids = list(yt_needs_update.keys())
        logger.info(f"Fetching info for {len(all_yt_ids)} YouTube videos via API")
        
        video_info = await get_videos_info_batch(all_yt_ids)
        
        for yt_id, info in video_info.items():
            if yt_id not in yt_needs_update:
                continue
            for ci, vi in yt_needs_update[yt_id]:
                video = channels[ci]["videos"][vi]
                changed = False
                
                # Update duration if it was default
                duration = info.get("duration", 0)
                if duration > 0 and video.get("duration", 300) == 300:
                    channels[ci]["videos"][vi]["duration"] = duration
                    yt_dur_updated += 1
                    changed = True
                
                # Update title if it was generic
                title = info.get("title", "")
                if title and is_generic_title(video.get("title", "")):
                    channels[ci]["videos"][vi]["title"] = title
                    yt_title_updated += 1
                    changed = True
                
                # Update thumbnail if available
                thumbnail = info.get("thumbnail", "")
                if thumbnail and not video.get("thumbnail"):
                    channels[ci]["videos"][vi]["thumbnail"] = thumbnail
                    changed = True
                
                if changed:
                    yt_updated += 1
        
        not_found = [yt_id for yt_id in all_yt_ids if yt_id not in video_info]
        if not_found:
            errors.append(f"{len(not_found)} YouTube videos not found/unavailable")
    elif yt_needs_update:
        errors.append("YouTube API key not configured")
    
    # Phase 4: Fetch uploaded video durations via ffprobe (parallel)
    if uploaded_tasks:
        logger.info(f"Fetching durations for {len(uploaded_tasks)} uploaded videos via ffprobe")
        loop = asyncio.get_event_loop()
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_map = {}
            for ci, vi, url in uploaded_tasks:
                f = loop.run_in_executor(executor, get_video_duration, url)
                future_map[(ci, vi)] = f
            for (ci, vi), f in future_map.items():
                try:
                    duration = await f
                    if duration > 0 and duration != 300:
                        channels[ci]["videos"][vi]["duration"] = duration
                        uploaded_updated += 1
                except Exception as e:
                    title = channels[ci]["videos"][vi].get("title", "Unknown")
                    errors.append(f"ffprobe failed: {title}")
    
    # Phase 5: Save all updated channels
    updated_channel_ids = set()
    for ci, vi in [(ci, vi) for yt_id, locs in yt_needs_update.items() for ci, vi in locs]:
        updated_channel_ids.add(ci)
    for ci, vi, _ in uploaded_tasks:
        updated_channel_ids.add(ci)
    
    saved = 0
    for ci in updated_channel_ids:
        channel = channels[ci]
        await db.channels.update_one(
            {"id": channel["id"]},
            {"$set": {"videos": channel["videos"]}}
        )
        saved += 1
    
    total_updated = yt_updated + uploaded_updated
    
    return {
        "total_updated": total_updated,
        "youtube": {
            "titles_updated": yt_title_updated,
            "durations_updated": yt_dur_updated,
            "total_fixed": yt_updated,
        },
        "uploaded": {
            "durations_updated": uploaded_updated,
        },
        "channels_saved": saved,
        "errors": errors[:20],
    }


@api_router.post("/admin/remux-uploaded-videos")
async def remux_uploaded_videos(user: dict = Depends(require_user)):
    """
    Re-mux all uploaded R2 videos from fragmented MP4 to regular MP4.
    Fragmented MP4 (from yt-dlp) causes slow browser playback.
    Re-muxing with ffmpeg -c copy creates a non-fragmented MP4 that plays instantly.
    This is a long-running operation - runs in background.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import get_r2_client, R2_BUCKET_NAME, R2_PUBLIC_URL, is_r2_configured
    import tempfile
    
    if not is_r2_configured():
        raise HTTPException(status_code=500, detail="R2 not configured")
    
    # Collect all uploaded video URLs
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    video_urls = []
    for ch in channels:
        for v in ch.get("videos", []):
            url = v.get("video_url")
            if url and url.startswith("http") and url.endswith(".mp4"):
                # Extract the R2 object key from the URL
                # URL format: https://pub-xxx.r2.dev/videos/uuid.mp4
                key = "/".join(url.split("/")[-2:])  # "videos/uuid.mp4"
                video_urls.append({"url": url, "key": key, "title": v.get("title", "")})
    
    # Deduplicate by key
    seen = set()
    unique_videos = []
    for v in video_urls:
        if v["key"] not in seen:
            seen.add(v["key"])
            unique_videos.append(v)
    
    logger.info(f"Re-muxing {len(unique_videos)} unique uploaded videos")
    
    r2_client = get_r2_client()
    fixed = 0
    skipped = 0
    errors = []
    
    for i, video in enumerate(unique_videos):
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp_in, \
                 tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp_out:
                
                # Download from R2
                result = subprocess.run(
                    ["curl", "-s", "--max-time", "60", "-o", tmp_in.name, video["url"]],
                    capture_output=True, timeout=90
                )
                if result.returncode != 0:
                    errors.append(f"Download failed: {video['title'][:30]}")
                    continue
                
                in_size = os.path.getsize(tmp_in.name)
                if in_size < 1000:
                    errors.append(f"Too small/404: {video['title'][:30]}")
                    continue
                
                # Check if already non-fragmented
                check = subprocess.run(
                    ["ffprobe", "-v", "trace", tmp_in.name],
                    capture_output=True, text=True, timeout=30
                )
                moof_count = check.stderr.count("type:'moof'")
                if moof_count == 0:
                    skipped += 1
                    continue
                
                # Re-mux to non-fragmented MP4
                remux = subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_in.name, "-c", "copy", 
                     "-movflags", "+faststart", tmp_out.name],
                    capture_output=True, timeout=120
                )
                if remux.returncode != 0:
                    errors.append(f"Remux failed: {video['title'][:30]}")
                    continue
                
                out_size = os.path.getsize(tmp_out.name)
                if out_size < 1000:
                    errors.append(f"Remux empty: {video['title'][:30]}")
                    continue
                
                # Upload back to R2 (overwrite the original)
                with open(tmp_out.name, "rb") as f:
                    r2_client.upload_fileobj(
                        f, R2_BUCKET_NAME, video["key"],
                        ExtraArgs={"ContentType": "video/mp4"}
                    )
                
                fixed += 1
                if (i + 1) % 10 == 0:
                    logger.info(f"Re-mux progress: {i+1}/{len(unique_videos)} ({fixed} fixed, {skipped} skipped)")
                    
        except subprocess.TimeoutExpired:
            errors.append(f"Timeout: {video['title'][:30]}")
        except Exception as e:
            errors.append(f"Error: {video['title'][:30]} - {str(e)[:50]}")
    
    logger.info(f"Re-mux complete: {fixed} fixed, {skipped} already OK, {len(errors)} errors")
    
    return {
        "total_videos": len(unique_videos),
        "fixed": fixed,
        "already_ok": skipped,
        "errors_count": len(errors),
        "errors": errors[:20],
    }


@api_router.post("/admin/reencode-video/{video_id}")
async def reencode_single_video(video_id: str, background_tasks: BackgroundTasks, user: dict = Depends(require_user)):
    """
    Re-encode a single video from MPEG-4 to H.264 in the background.
    Returns immediately - check logs for progress.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import is_r2_configured
    
    if not is_r2_configured():
        raise HTTPException(status_code=500, detail="R2 not configured")
    
    video = await db.uploaded_videos.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Queue the re-encoding task
    background_tasks.add_task(reencode_video_task, video)
    
    return {"message": f"Re-encoding started for {video.get('original_name')}", "video_id": video_id}


def reencode_video_task(video: dict):
    """Background task to re-encode a single video"""
    import tempfile
    import requests
    from r2_service import get_r2_client, R2_BUCKET_NAME
    
    video_url = video.get("url")
    video_name = video.get("original_name", "unknown")
    
    try:
        # Check codec
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=codec_name", "-of", "csv=p=0", video_url],
            capture_output=True, text=True, timeout=30
        )
        codec = probe.stdout.strip().lower()
        
        if codec == "h264":
            logger.info(f"Video {video_name} is already H.264, skipping")
            return
        
        logger.info(f"Re-encoding {video_name} from {codec} to H.264...")
        
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in, \
             tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_out:
            
            # Download
            resp = requests.get(video_url, stream=True, timeout=120)
            for chunk in resp.iter_content(chunk_size=8192):
                tmp_in.write(chunk)
            tmp_in.flush()
            
            # Re-encode
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in.name,
                 "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                 "-c:a", "aac", "-b:a", "128k",
                 "-movflags", "+faststart", tmp_out.name],
                capture_output=True, timeout=900
            )
            
            if result.returncode != 0:
                logger.error(f"FFmpeg failed for {video_name}: {result.stderr[-200:]}")
                return
            
            out_size = os.path.getsize(tmp_out.name)
            
            # Extract key and upload
            key = video_url.split("/")[-2] + "/" + video_url.split("/")[-1]
            r2_client = get_r2_client()
            
            with open(tmp_out.name, "rb") as f:
                r2_client.upload_fileobj(f, R2_BUCKET_NAME, key, ExtraArgs={"ContentType": "video/mp4"})
            
            logger.info(f"Re-encoded {video_name}: {out_size / 1024 / 1024:.1f} MB")
            
            # Cleanup
            os.unlink(tmp_in.name)
            os.unlink(tmp_out.name)
            
    except Exception as e:
        logger.error(f"Error re-encoding {video_name}: {e}")


@api_router.post("/admin/reencode-mpeg4-videos")
async def reencode_mpeg4_videos(user: dict = Depends(require_user)):
    """
    Re-encode uploaded videos from MPEG-4 Part 2 codec to H.264.
    MPEG-4 Part 2 has poor browser support (audio plays but no video).
    H.264 is universally supported by all browsers.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from r2_service import get_r2_client, R2_BUCKET_NAME, R2_PUBLIC_URL, is_r2_configured, upload_to_r2
    import tempfile
    
    if not is_r2_configured():
        raise HTTPException(status_code=500, detail="R2 not configured")
    
    r2_client = get_r2_client()
    
    # Get all uploaded videos
    uploaded_videos = await db.uploaded_videos.find({}, {"_id": 0}).to_list(None)
    
    results = {
        "total_checked": 0,
        "mpeg4_found": 0,
        "reencoded": 0,
        "already_h264": 0,
        "errors": []
    }
    
    for video in uploaded_videos:
        video_url = video.get("url")
        if not video_url or not video_url.endswith(".mp4"):
            continue
        
        results["total_checked"] += 1
        video_name = video.get("original_name", video.get("filename", "unknown"))
        
        try:
            # Check codec
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=codec_name", "-of", "csv=p=0", video_url],
                capture_output=True, text=True, timeout=30
            )
            codec = probe.stdout.strip().lower()
            
            if codec == "h264" or codec == "hevc":
                results["already_h264"] += 1
                continue
            
            if codec != "mpeg4":
                continue
            
            results["mpeg4_found"] += 1
            logger.info(f"Re-encoding MPEG-4 video: {video_name}")
            
            # Download, re-encode, upload
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in, \
                 tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_out:
                
                # Download from R2
                import requests
                resp = requests.get(video_url, stream=True, timeout=60)
                for chunk in resp.iter_content(chunk_size=8192):
                    tmp_in.write(chunk)
                tmp_in.flush()
                
                # Re-encode to H.264
                encode_result = subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_in.name,
                     "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                     "-c:a", "aac", "-b:a", "128k",
                     "-movflags", "+faststart", tmp_out.name],
                    capture_output=True, timeout=600  # 10 minutes max per video
                )
                
                if encode_result.returncode != 0:
                    results["errors"].append(f"Encode failed: {video_name}")
                    continue
                
                out_size = os.path.getsize(tmp_out.name)
                if out_size < 1000:
                    results["errors"].append(f"Encode empty: {video_name}")
                    continue
                
                # Extract key from URL
                # URL: https://pub-xxx.r2.dev/videos/uuid.mp4
                key = video_url.split("/")[-2] + "/" + video_url.split("/")[-1]
                
                # Upload back to R2
                with open(tmp_out.name, "rb") as f:
                    r2_client.upload_fileobj(
                        f, R2_BUCKET_NAME, key,
                        ExtraArgs={"ContentType": "video/mp4"}
                    )
                
                results["reencoded"] += 1
                logger.info(f"Re-encoded: {video_name} ({out_size / 1024 / 1024:.1f} MB)")
                
                # Cleanup
                os.unlink(tmp_in.name)
                os.unlink(tmp_out.name)
                
        except subprocess.TimeoutExpired:
            results["errors"].append(f"Timeout: {video_name}")
        except Exception as e:
            results["errors"].append(f"Error {video_name}: {str(e)[:50]}")
    
    return results


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
async def update_video_durations(user: dict = Depends(require_user), limit: int = 200):
    """Fetch and update durations + titles for YouTube videos using batch API (admin only)."""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import re
    
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    
    # Collect YouTube videos needing updates
    yt_ids_to_fix = {}  # youtube_id -> [(channel_idx, video_idx)]
    for ci, channel in enumerate(channels):
        for vi, video in enumerate(channel.get("videos", [])):
            yt_id = video.get("youtube_id")
            if not yt_id:
                continue
            needs_dur = video.get("duration", 300) in [300, 180, 0]
            needs_title = bool(re.match(r'^Video \d+$', video.get("title", "").strip()))
            if needs_dur or needs_title:
                if yt_id not in yt_ids_to_fix:
                    yt_ids_to_fix[yt_id] = []
                yt_ids_to_fix[yt_id].append((ci, vi))
    
    all_ids = list(yt_ids_to_fix.keys())[:limit]
    
    if not all_ids:
        remaining = 0
        for ch in channels:
            for v in ch.get("videos", []):
                if v.get("youtube_id") and v.get("duration", 300) in [300, 180, 0]:
                    remaining += 1
        return {"updated": 0, "failed": 0, "skipped": 0, "remaining": remaining, "results": []}
    
    # Use batch YouTube API for speed
    updated_count = 0
    failed_count = 0
    results = []
    
    if is_youtube_api_configured():
        video_info = await get_videos_info_batch(all_ids)
        
        updated_channel_idxs = set()
        for yt_id in all_ids:
            info = video_info.get(yt_id)
            if not info:
                failed_count += 1
                continue
            
            for ci, vi in yt_ids_to_fix.get(yt_id, []):
                video = channels[ci]["videos"][vi]
                old_dur = video.get("duration", 300)
                old_title = video.get("title", "")
                changed = False
                
                if info.get("duration", 0) > 0 and old_dur in [300, 180, 0]:
                    channels[ci]["videos"][vi]["duration"] = info["duration"]
                    changed = True
                
                if info.get("title") and re.match(r'^Video \d+$', old_title.strip()):
                    channels[ci]["videos"][vi]["title"] = info["title"]
                    changed = True
                
                if info.get("thumbnail") and not video.get("thumbnail"):
                    channels[ci]["videos"][vi]["thumbnail"] = info["thumbnail"]
                
                if changed:
                    updated_count += 1
                    updated_channel_idxs.add(ci)
                    results.append({
                        "title": info.get("title", old_title),
                        "youtube_id": yt_id,
                        "old_duration": old_dur,
                        "new_duration": info.get("duration", old_dur)
                    })
        
        for ci in updated_channel_idxs:
            await db.channels.update_one(
                {"id": channels[ci]["id"]},
                {"$set": {"videos": channels[ci]["videos"]}}
            )
    else:
        # Fallback to individual fetch
        for yt_id in all_ids:
            duration = await fetch_youtube_duration(yt_id)
            if duration > 0:
                for ci, vi in yt_ids_to_fix.get(yt_id, []):
                    old_dur = channels[ci]["videos"][vi].get("duration", 300)
                    channels[ci]["videos"][vi]["duration"] = duration
                    updated_count += 1
                    results.append({"youtube_id": yt_id, "old_duration": old_dur, "new_duration": duration})
                    await db.channels.update_one(
                        {"id": channels[ci]["id"]},
                        {"$set": {"videos": channels[ci]["videos"]}}
                    )
            else:
                failed_count += 1
    
    # Count remaining
    remaining = 0
    for ch in channels:
        for v in ch.get("videos", []):
            if v.get("youtube_id") and v.get("duration", 300) in [300, 180, 0]:
                remaining += 1
    
    return {
        "updated": updated_count,
        "failed": failed_count,
        "skipped": 0,
        "remaining": remaining - updated_count,
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
    storage_type: str = "r2"

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

@api_router.post("/upload/image", response_model=UploadedImageResponse)
async def upload_image(
    file: UploadFile = File(...),
    user: dict = Depends(require_user)
):
    """Upload an image file to cloud storage - JPEG, PNG, WebP, GIF only, max 10MB"""
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
    
    # Read file content
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_IMAGE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")
    
    # Determine storage method
    storage_type = "r2" if is_r2_configured() else "local"
    
    if storage_type == "r2":
        # Upload to R2 cloud storage
        object_key = f"images/{filename}"
        result = upload_to_r2(file_content, object_key, file.content_type)
        
        if not result["success"]:
            raise HTTPException(status_code=500, detail=f"Cloud upload failed: {result.get('error', 'Unknown error')}")
        
        image_url = result["url"]
    else:
        # Fallback to local storage
        file_path = IMAGES_DIR / filename
        try:
            with open(file_path, "wb") as buffer:
                buffer.write(file_content)
            image_url = f"/api/images/{filename}"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Store in database
    now = datetime.now(timezone.utc).isoformat()
    image_doc = {
        "id": image_id,
        "filename": filename,
        "original_name": file.filename,
        "url": image_url,
        "size": file_size,
        "owner_id": user["id"],
        "storage_type": storage_type,
        "created_at": now
    }
    
    await db.uploaded_images.insert_one(image_doc)
    
    return UploadedImageResponse(
        id=image_id,
        filename=filename,
        original_name=file.filename,
        url=image_url,
        size=file_size,
        created_at=now,
        storage_type=storage_type
    )

@api_router.get("/upload/images")
async def list_uploaded_images(user: dict = Depends(require_user)):
    """List uploaded images for the current user"""
    # Users see their own images, admins see all
    query = {} if user.get("is_admin", False) else {"owner_id": user["id"]}
    images = await db.uploaded_images.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # URLs are now stored directly in the database
    for image in images:
        if "url" not in image:
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
    
    storage_type = image.get("storage_type", "local")
    
    if storage_type == "r2":
        # Delete from R2
        object_key = f"images/{image['filename']}"
        result = delete_from_r2(object_key)
        if not result["success"]:
            logger.warning(f"Failed to delete image from R2: {result.get('error')}")
    else:
        # Delete local file
        file_path = IMAGES_DIR / image["filename"]
        if file_path.exists():
            file_path.unlink()
    
    # Delete from database
    await db.uploaded_images.delete_one({"id": image_id})
    
    return {"message": "Image deleted"}

# ===================== YOUTUBE PROXY ROUTES (Age-Restricted Videos) =====================

def get_video_info_with_ytdlp(youtube_id: str, use_cookies: bool = True) -> dict:
    """Get video info using yt-dlp with multiple strategies"""
    strategies = [
        # Strategy 1: Default with cookies
        {"cookies": use_cookies, "extra_args": []},
        # Strategy 2: XFF US header
        {"cookies": use_cookies, "extra_args": ["--xff", "US"]},
        # Strategy 3: Android client
        {"cookies": use_cookies, "extra_args": ["--extractor-args", "youtube:player_client=android"]},
        # Strategy 4: Geo-bypass + XFF
        {"cookies": use_cookies, "extra_args": ["--geo-bypass", "--geo-bypass-country", "US", "--xff", "US"]},
    ]
    
    for i, strategy in enumerate(strategies):
        cmd = [
            YTDLP_PATH,
            "--dump-json",
            "--no-download",
            "--no-warnings",
            "-f", "best[height<=720]/best",
            *strategy["extra_args"],
            f"https://www.youtube.com/watch?v={youtube_id}"
        ]
        
        if strategy["cookies"] and is_cookies_file_valid():
            try:
                cmd.extend(["--cookies", str(COOKIES_FILE)])
            except Exception:
                pass
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
            logger.debug(f"yt-dlp strategy {i+1} failed for {youtube_id}: {e}")
            continue
    
    logger.error(f"All yt-dlp strategies failed for {youtube_id}")
    return None


def get_direct_video_url(youtube_id: str, use_cookies: bool = True) -> Optional[str]:
    """Get direct video URL using yt-dlp with multiple strategies"""
    strategies = [
        # Strategy 1: Default with cookies
        {"cookies": use_cookies, "extra_args": []},
        # Strategy 2: XFF US header  
        {"cookies": use_cookies, "extra_args": ["--xff", "US"]},
        # Strategy 3: Android client (often bypasses geo-blocks)
        {"cookies": use_cookies, "extra_args": ["--extractor-args", "youtube:player_client=android"]},
        # Strategy 4: Combined geo-bypass
        {"cookies": use_cookies, "extra_args": ["--geo-bypass", "--geo-bypass-country", "US", "--xff", "US"]},
    ]
    
    for i, strategy in enumerate(strategies):
        cmd = [
            YTDLP_PATH,
            "--get-url",
            "--no-warnings",
            "-f", "best[height<=720][ext=mp4]/best[height<=720]/best",
            *strategy["extra_args"],
            f"https://www.youtube.com/watch?v={youtube_id}"
        ]
        
        if strategy["cookies"] and is_cookies_file_valid():
            try:
                cmd.extend(["--cookies", str(COOKIES_FILE)])
            except Exception:
                pass
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and result.stdout.strip():
                urls = result.stdout.strip().split('\n')
                if urls and urls[0]:
                    logger.info(f"yt-dlp strategy {i+1} succeeded for {youtube_id}")
                    return urls[0]
        except Exception as e:
            logger.debug(f"yt-dlp url strategy {i+1} failed for {youtube_id}: {e}")
            continue
    
    logger.error(f"All yt-dlp url strategies failed for {youtube_id}")
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
    
    try:
        if not COOKIES_FILE.exists():
            return {
                "configured": False,
                "message": "No cookies file uploaded"
            }
        
        # Get file info
        stat = COOKIES_FILE.stat()
        
        # Test cookies (with error handling)
        test_result = None
        try:
            test_result = get_video_info_with_ytdlp("dQw4w9WgXcQ", use_cookies=True)
        except Exception as e:
            logger.warning(f"Error testing cookies: {e}")
        
        return {
            "configured": True,
            "file_size": stat.st_size,
            "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            "working": test_result is not None
        }
    except Exception as e:
        logger.error(f"Error checking cookies status: {e}")
        return {
            "configured": False,
            "error": str(e),
            "message": "Error checking cookies status"
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

@api_router.post("/youtube/health-check")
async def health_check_videos(user: dict = Depends(require_user), channel_id: Optional[str] = None):
    """
    Fast health check using YouTube oEmbed API + yt-dlp for detailed categorization.
    Categorizes videos as: embeddable, geo_restricted, age_restricted, unavailable, deleted.
    Uses oEmbed (fast, no yt-dlp) for initial check, then yt-dlp for detailed error info.
    """
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    query = {"id": channel_id} if channel_id else {}
    channels = await db.channels.find(query, {"_id": 0}).to_list(None)
    
    # Collect all YouTube video IDs
    video_map = {}  # youtube_id -> {title, channel_name, channel_id}
    for channel in channels:
        for video in channel.get("videos", []):
            yt_id = video.get("youtube_id")
            if yt_id and yt_id not in video_map:
                video_map[yt_id] = {
                    "title": video.get("title", "Unknown"),
                    "channel_name": channel.get("name"),
                    "channel_id": channel.get("id"),
                }
    
    if not video_map:
        return {"total": 0, "categories": {}, "videos": []}
    
    # Fast check using oEmbed API (parallelized)
    def check_oembed(youtube_id):
        """Check if video is embeddable via oEmbed API - very fast"""
        import urllib.request
        try:
            url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={youtube_id}&format=json"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                return {"status": "embeddable", "title": data.get("title", "")}
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return {"status": "age_restricted"}
            elif e.code == 403:
                return {"status": "embed_blocked"}
            elif e.code == 404:
                return {"status": "deleted"}
            return {"status": "unavailable", "error": f"HTTP {e.code}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    def check_ytdlp_detail(youtube_id):
        """Get detailed error info from yt-dlp for failed videos"""
        cmd = [
            YTDLP_PATH, "--dump-json", "--no-download", "--no-warnings",
            "--xff", "US", "-f", "best[height<=720]/best",
            f"https://www.youtube.com/watch?v={youtube_id}"
        ]
        if is_cookies_file_valid():
            cmd.extend(["--cookies", str(COOKIES_FILE)])
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if result.returncode == 0:
                return {"status": "playable_via_proxy"}
            stderr = result.stderr.lower()
            if "not available in your country" in stderr:
                return {"status": "geo_restricted", "detail": result.stderr.strip().split('\n')[0]}
            elif "age" in stderr or "sign in" in stderr:
                return {"status": "age_restricted", "detail": result.stderr.strip().split('\n')[0]}
            elif "private" in stderr:
                return {"status": "private"}
            elif "removed" in stderr or "deleted" in stderr or "does not exist" in stderr:
                return {"status": "deleted"}
            return {"status": "unavailable", "detail": result.stderr.strip().split('\n')[0]}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
    
    loop = asyncio.get_event_loop()
    
    # Phase 1: Fast oEmbed check for all videos (parallel, 20 workers)
    oembed_results = {}
    with ThreadPoolExecutor(max_workers=20) as executor:
        future_map = {}
        for yt_id in video_map:
            f = loop.run_in_executor(executor, check_oembed, yt_id)
            future_map[yt_id] = f
        for yt_id, f in future_map.items():
            try:
                oembed_results[yt_id] = await f
            except Exception:
                oembed_results[yt_id] = {"status": "error"}
    
    # Phase 2: For non-embeddable videos, get detailed status via yt-dlp (parallel, 5 workers)
    failed_ids = [yt_id for yt_id, r in oembed_results.items() if r["status"] != "embeddable"]
    ytdlp_results = {}
    
    if failed_ids:
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_map = {}
            for yt_id in failed_ids[:50]:  # Limit to 50 for speed
                f = loop.run_in_executor(executor, check_ytdlp_detail, yt_id)
                future_map[yt_id] = f
            for yt_id, f in future_map.items():
                try:
                    ytdlp_results[yt_id] = await f
                except Exception:
                    ytdlp_results[yt_id] = {"status": "error"}
    
    # Compile results
    categories = {
        "embeddable": 0, "playable_via_proxy": 0, "geo_restricted": 0,
        "age_restricted": 0, "embed_blocked": 0, "deleted": 0, "unavailable": 0, "error": 0
    }
    problem_videos = []
    
    for yt_id, info in video_map.items():
        oembed = oembed_results.get(yt_id, {})
        ytdlp = ytdlp_results.get(yt_id, {})
        
        # Use yt-dlp result if available (more detailed), otherwise use oEmbed
        if oembed.get("status") == "embeddable":
            final_status = "embeddable"
        elif ytdlp.get("status") == "playable_via_proxy":
            final_status = "playable_via_proxy"
        elif ytdlp.get("status"):
            final_status = ytdlp["status"]
        else:
            final_status = oembed.get("status", "unknown")
        
        categories[final_status] = categories.get(final_status, 0) + 1
        
        if final_status != "embeddable":
            problem_videos.append({
                "youtube_id": yt_id,
                "title": info["title"],
                "channel_name": info["channel_name"],
                "channel_id": info["channel_id"],
                "status": final_status,
                "detail": ytdlp.get("detail", oembed.get("error", "")),
                "url": f"https://www.youtube.com/watch?v={yt_id}",
            })
    
    return {
        "total": len(video_map),
        "categories": categories,
        "problem_videos": sorted(problem_videos, key=lambda x: x["status"]),
        "cookies_configured": is_cookies_file_valid(),
    }


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
    video_id: Optional[str] = None  # Video being watched
    video_title: Optional[str] = None
    event_type: str = "view"  # view, skip, complete

@api_router.post("/analytics/view")
async def record_view(event: ViewEvent):
    """Record a channel view/skip/complete event"""
    now = datetime.now(timezone.utc)
    view_doc = {
        "id": str(uuid.uuid4()),
        "channel_id": event.channel_id,
        "viewer_id": event.viewer_id,
        "video_id": event.video_id,
        "video_title": event.video_title,
        "event_type": event.event_type,
        "timestamp": now.isoformat(),
        "hour": now.hour,
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


@api_router.get("/analytics/channel/{channel_id}")
async def get_channel_analytics(channel_id: str, user: dict = Depends(require_user)):
    """Get detailed per-channel analytics"""
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    channel = await db.channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "name": 1, "videos": 1})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    now = datetime.now(timezone.utc)
    last_7d = now - timedelta(days=7)
    last_24h = now - timedelta(hours=24)
    
    all_views = await db.views.find(
        {"channel_id": channel_id},
        {"_id": 0}
    ).to_list(50000)
    
    # Parse timestamps and filter
    views_7d = []
    views_24h = []
    for view in all_views:
        try:
            vt = datetime.fromisoformat(view["timestamp"].replace("Z", "+00:00"))
            if vt.tzinfo is None:
                vt = vt.replace(tzinfo=timezone.utc)
            view["_parsed_time"] = vt
            if vt >= last_7d:
                views_7d.append(view)
            if vt >= last_24h:
                views_24h.append(view)
        except Exception:
            continue
    
    # Peak hours (0-23) from last 7 days
    peak_hours = [0] * 24
    for v in views_7d:
        h = v.get("hour", v["_parsed_time"].hour)
        peak_hours[h] += 1
    
    # Daily views for last 7 days
    daily_views = {}
    for v in views_7d:
        day = v["_parsed_time"].strftime("%Y-%m-%d")
        daily_views[day] = daily_views.get(day, 0) + 1
    
    # Fill missing days
    daily_timeline = []
    for i in range(7):
        d = (now - timedelta(days=6 - i)).strftime("%Y-%m-%d")
        daily_timeline.append({"date": d, "views": daily_views.get(d, 0)})
    
    # Video performance (from 7-day data)
    video_stats = {}  # video_title -> {views, skips, completes}
    for v in views_7d:
        title = v.get("video_title") or "Unknown"
        vid = v.get("video_id") or title
        if vid not in video_stats:
            video_stats[vid] = {"title": title, "views": 0, "skips": 0, "completes": 0}
        evt = v.get("event_type", "view")
        if evt == "skip":
            video_stats[vid]["skips"] += 1
        elif evt == "complete":
            video_stats[vid]["completes"] += 1
        else:
            video_stats[vid]["views"] += 1
    
    # Sort videos by most skipped
    most_skipped = sorted(
        [vs for vs in video_stats.values() if vs["skips"] > 0],
        key=lambda x: x["skips"], reverse=True
    )[:10]
    
    # Sort videos by most viewed
    most_viewed = sorted(
        video_stats.values(),
        key=lambda x: x["views"], reverse=True
    )[:10]
    
    # Unique vs returning viewers (7d)
    viewer_counts = {}
    for v in views_7d:
        vid = v.get("viewer_id", "")
        viewer_counts[vid] = viewer_counts.get(vid, 0) + 1
    
    new_viewers = sum(1 for c in viewer_counts.values() if c == 1)
    returning_viewers = sum(1 for c in viewer_counts.values() if c > 1)
    
    return {
        "channel_id": channel_id,
        "channel_name": channel.get("name", "Unknown"),
        "total_videos": len(channel.get("videos", [])),
        "total_views_7d": len(views_7d),
        "total_views_24h": len(views_24h),
        "unique_viewers_7d": len(viewer_counts),
        "new_viewers": new_viewers,
        "returning_viewers": returning_viewers,
        "peak_hours": peak_hours,
        "daily_timeline": daily_timeline,
        "most_viewed": most_viewed,
        "most_skipped": most_skipped,
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
        existing["is_live_stream"] = channel.get("is_live_stream", False)
        existing["live_stream_youtube_id"] = channel.get("live_stream_youtube_id")
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
        # Live stream channels don't need videos/schedules
        if channel.get("is_live_stream") and channel.get("live_stream_youtube_id"):
            schedules.append({
                "channel_id": channel.get("id", ""),
                "channel_name": channel.get("name", ""),
                "channel_thumbnail": channel.get("thumbnail"),
                "schedule_date": today,
                "videos": [],
                "total_duration": 0,
                "unique_video_count": 0,
                "use_schedule": False,
                "is_live_stream": True,
                "live_stream_youtube_id": channel.get("live_stream_youtube_id"),
            })
            continue
        
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
            "video_url": video.get("video_url"),  # Include video_url for uploaded videos
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
    thumbnail: Optional[str] = None

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
                "thumbnail": v.thumbnail,
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
        eastern = ZoneInfo('America/New_York')
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
            # Channel doesn't exist - create it
            new_channel = {
                "id": old_channel.get("id") or str(uuid.uuid4()),
                "name": old_name,
                "description": old_channel.get("description", ""),
                "category": old_channel.get("category", "General"),
                "thumbnail": old_channel.get("thumbnail", ""),
                "videos": old_videos,
                "is_public": old_channel.get("is_public", True),
                "use_schedule": old_channel.get("use_schedule", False),
                "sort_order": old_channel.get("sort_order", 999),
                "favorites_count": old_channel.get("favorites_count", 0),
                "owner_id": old_channel.get("owner_id") or user["id"],
                "owner_username": old_channel.get("owner_username") or user.get("username", "admin"),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.channels.insert_one(new_channel)
            results["channels_updated"].append(f"{old_name} (CREATED with {len(old_videos)} videos)")
            results["videos_added"] += len(old_videos)
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
