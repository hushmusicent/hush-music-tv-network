"""
YouTube Data API Service for fetching video information
"""
import os
import re
import httpx
import logging
from typing import Optional, Dict, List

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY', '')
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

def parse_duration(duration_str: str) -> int:
    """
    Parse ISO 8601 duration format (PT1H30M45S) to seconds
    """
    if not duration_str:
        return 0
    
    # Remove PT prefix
    duration_str = duration_str.replace('PT', '')
    
    hours = 0
    minutes = 0
    seconds = 0
    
    # Extract hours
    if 'H' in duration_str:
        hours_match = re.search(r'(\d+)H', duration_str)
        if hours_match:
            hours = int(hours_match.group(1))
    
    # Extract minutes
    if 'M' in duration_str:
        minutes_match = re.search(r'(\d+)M', duration_str)
        if minutes_match:
            minutes = int(minutes_match.group(1))
    
    # Extract seconds
    if 'S' in duration_str:
        seconds_match = re.search(r'(\d+)S', duration_str)
        if seconds_match:
            seconds = int(seconds_match.group(1))
    
    return hours * 3600 + minutes * 60 + seconds

async def get_video_info(video_id: str) -> Optional[Dict]:
    """
    Get video information including duration from YouTube API
    """
    if not YOUTUBE_API_KEY:
        logger.warning("YouTube API key not configured")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{YOUTUBE_API_BASE}/videos",
                params={
                    "part": "contentDetails,snippet",
                    "id": video_id,
                    "key": YOUTUBE_API_KEY
                }
            )
            
            if response.status_code != 200:
                logger.error(f"YouTube API error: {response.status_code} - {response.text}")
                return None
            
            data = response.json()
            items = data.get("items", [])
            
            if not items:
                logger.warning(f"Video not found: {video_id}")
                return None
            
            item = items[0]
            content_details = item.get("contentDetails", {})
            snippet = item.get("snippet", {})
            
            duration_str = content_details.get("duration", "PT0S")
            duration_seconds = parse_duration(duration_str)
            
            return {
                "video_id": video_id,
                "title": snippet.get("title", ""),
                "duration": duration_seconds,
                "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                "channel_title": snippet.get("channelTitle", ""),
                "is_live": snippet.get("liveBroadcastContent") == "live"
            }
            
    except Exception as e:
        logger.error(f"Error fetching video info for {video_id}: {e}")
        return None

async def get_videos_info_batch(video_ids: List[str]) -> Dict[str, Dict]:
    """
    Get video information for multiple videos in a single API call (up to 50)
    """
    if not YOUTUBE_API_KEY:
        logger.warning("YouTube API key not configured")
        return {}
    
    if not video_ids:
        return {}
    
    # YouTube API allows max 50 IDs per request
    results = {}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Process in batches of 50
            for i in range(0, len(video_ids), 50):
                batch = video_ids[i:i+50]
                
                response = await client.get(
                    f"{YOUTUBE_API_BASE}/videos",
                    params={
                        "part": "contentDetails,snippet",
                        "id": ",".join(batch),
                        "key": YOUTUBE_API_KEY
                    }
                )
                
                if response.status_code != 200:
                    logger.error(f"YouTube API error: {response.status_code}")
                    continue
                
                data = response.json()
                
                for item in data.get("items", []):
                    vid = item.get("id")
                    content_details = item.get("contentDetails", {})
                    snippet = item.get("snippet", {})
                    
                    duration_str = content_details.get("duration", "PT0S")
                    duration_seconds = parse_duration(duration_str)
                    
                    results[vid] = {
                        "video_id": vid,
                        "title": snippet.get("title", ""),
                        "duration": duration_seconds,
                        "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                        "is_live": snippet.get("liveBroadcastContent") == "live"
                    }
                    
    except Exception as e:
        logger.error(f"Error in batch video fetch: {e}")
    
    return results

def is_youtube_api_configured() -> bool:
    """Check if YouTube API is configured"""
    return bool(YOUTUBE_API_KEY)
