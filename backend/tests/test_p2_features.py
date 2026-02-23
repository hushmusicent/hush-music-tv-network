"""
Test P2 Features: Video Reordering and Schedule Editor
Tests the following features:
1. Video reordering within channels (PUT /api/channels/{channel_id}/videos/reorder)
2. Schedule save endpoint (POST /api/schedule/save)
3. Schedule retrieval (GET /api/schedule/channel/{channel_id})
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "hushmusicent419@gmail.com"
ADMIN_PASSWORD = "$Stisdd419"

# Test channel ID with use_schedule=true
TEST_CHANNEL_ID = "7d4ea480-e7de-4f2d-8745-e83b31e95a4c"

# Channel with videos for reorder testing
TEST_CHANNEL_WITH_VIDEOS = "4fe5112f-0291-4709-b5b7-8d59a83ed990"  # Rap Battles

class TestAuthentication:
    """Test authentication before main tests"""
    
    def test_admin_login(self, api_client):
        """Test admin login works"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data["user"]["is_admin"] == True, "User is not admin"
        print(f"✓ Admin login successful - user: {data['user']['username']}")


class TestVideoReordering:
    """Test video reordering within channels"""
    
    def test_get_channel_videos(self, authenticated_client):
        """Test getting channel with videos"""
        response = authenticated_client.get(f"{BASE_URL}/api/channels/{TEST_CHANNEL_WITH_VIDEOS}")
        assert response.status_code == 200, f"Failed to get channel: {response.text}"
        data = response.json()
        assert "videos" in data, "No videos field in channel response"
        print(f"✓ Channel has {len(data.get('videos', []))} videos")
    
    def test_reorder_videos_endpoint(self, authenticated_client):
        """Test video reordering endpoint"""
        # First get current videos
        channel_response = authenticated_client.get(f"{BASE_URL}/api/channels/{TEST_CHANNEL_WITH_VIDEOS}")
        assert channel_response.status_code == 200
        videos = channel_response.json().get("videos", [])
        
        if len(videos) < 2:
            pytest.skip("Need at least 2 videos to test reordering")
        
        # Get first 5 video IDs and reverse them
        video_ids = [v["id"] for v in videos[:5]]
        reversed_ids = list(reversed(video_ids))
        
        # Reorder videos (only first 5)
        response = authenticated_client.put(
            f"{BASE_URL}/api/channels/{TEST_CHANNEL_WITH_VIDEOS}/videos/reorder",
            json=reversed_ids
        )
        assert response.status_code == 200, f"Reorder failed: {response.text}"
        print(f"✓ Videos reordered successfully")
        
        # Verify order changed
        verify_response = authenticated_client.get(f"{BASE_URL}/api/channels/{TEST_CHANNEL_WITH_VIDEOS}")
        assert verify_response.status_code == 200
        new_videos = verify_response.json().get("videos", [])
        new_video_ids = [v["id"] for v in new_videos[:len(reversed_ids)]]
        
        # The first N videos should match our reversed order
        assert new_video_ids == reversed_ids, "Video order not updated correctly"
        print(f"✓ Video order verified after reorder")
        
        # Restore original order
        all_video_ids = [v["id"] for v in videos]
        restore_response = authenticated_client.put(
            f"{BASE_URL}/api/channels/{TEST_CHANNEL_WITH_VIDEOS}/videos/reorder",
            json=all_video_ids
        )
        assert restore_response.status_code == 200
        print(f"✓ Original video order restored")


class TestScheduleEndpoints:
    """Test schedule-related endpoints for the Schedule Editor feature"""
    
    def test_get_channel_schedule(self, authenticated_client):
        """Test GET /api/schedule/channel/{channel_id}"""
        response = authenticated_client.get(f"{BASE_URL}/api/schedule/channel/{TEST_CHANNEL_ID}")
        assert response.status_code == 200, f"Failed to get schedule: {response.text}"
        data = response.json()
        
        # Verify schedule structure
        assert "channel_id" in data, "Missing channel_id in schedule"
        assert "videos" in data, "Missing videos in schedule"
        assert "schedule_date" in data or "date" in data, "Missing date in schedule"
        
        print(f"✓ Schedule retrieved: {len(data.get('videos', []))} video slots")
        return data
    
    def test_save_schedule_endpoint(self, authenticated_client):
        """Test POST /api/schedule/save"""
        # Get channel videos first
        channel_response = authenticated_client.get(f"{BASE_URL}/api/channels/{TEST_CHANNEL_ID}")
        assert channel_response.status_code == 200
        videos = channel_response.json().get("videos", [])
        
        if len(videos) == 0:
            pytest.skip("No videos in channel to create schedule")
        
        # Create a simple test schedule with first 2 videos (or 1 if only 1 exists)
        test_videos = videos[:min(2, len(videos))]
        current_seconds = 0
        schedule_videos = []
        
        for video in test_videos:
            duration = video.get("duration", 300)
            start_time = f"{current_seconds // 3600:02d}:{(current_seconds % 3600) // 60:02d}:{current_seconds % 60:02d}"
            end_seconds = current_seconds + duration
            end_time = f"{end_seconds // 3600:02d}:{(end_seconds % 3600) // 60:02d}:{end_seconds % 60:02d}"
            
            schedule_videos.append({
                "video_id": video["id"],
                "youtube_id": video.get("youtube_id"),
                "title": video["title"],
                "duration": duration,
                "start_time": start_time,
                "end_time": end_time,
                "video_url": video.get("video_url")
            })
            current_seconds = end_seconds
        
        # Get current date in YYYY-MM-DD format
        from datetime import datetime
        current_date = datetime.now().strftime("%Y-%m-%d")
        
        # Save schedule
        schedule_data = {
            "channel_id": TEST_CHANNEL_ID,
            "date": current_date,
            "videos": schedule_videos
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/schedule/save", json=schedule_data)
        assert response.status_code == 200, f"Failed to save schedule: {response.text}"
        print(f"✓ Schedule saved successfully with {len(schedule_videos)} video slots")
        
        # Verify saved schedule
        verify_response = authenticated_client.get(f"{BASE_URL}/api/schedule/channel/{TEST_CHANNEL_ID}")
        assert verify_response.status_code == 200
        saved_schedule = verify_response.json()
        assert len(saved_schedule.get("videos", [])) > 0, "Saved schedule has no videos"
        print(f"✓ Schedule verified after save")
    
    def test_save_schedule_unauthenticated(self, api_client):
        """Test that save schedule requires authentication"""
        schedule_data = {
            "channel_id": TEST_CHANNEL_ID,
            "date": "2026-01-01",
            "videos": []
        }
        response = api_client.post(f"{BASE_URL}/api/schedule/save", json=schedule_data)
        # Should fail without auth - 401, 403, or 5xx errors possible
        assert response.status_code != 200, f"Expected auth error, got success"
        print(f"✓ Schedule save correctly requires authentication (status: {response.status_code})")
    
    def test_get_live_schedules(self, api_client):
        """Test GET /api/schedule/live (public endpoint)"""
        response = api_client.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200, f"Failed to get live schedules: {response.text}"
        data = response.json()
        
        # Response is a dict with 'schedules' key
        assert "schedules" in data, "Response should contain 'schedules' key"
        schedules = data["schedules"]
        assert isinstance(schedules, list), "Schedules should be a list"
        
        # Check if test channel is in live schedules
        test_channel_found = any(s.get("channel_id") == TEST_CHANNEL_ID for s in schedules)
        print(f"✓ Live schedules retrieved: {len(schedules)} channels")
        if test_channel_found:
            print(f"✓ Test channel found in live schedules")


class TestChannelUseScheduleFlag:
    """Test that use_schedule flag is properly set"""
    
    def test_channel_has_use_schedule_true(self, authenticated_client):
        """Test that Hush Music Radio channel has use_schedule=true"""
        response = authenticated_client.get(f"{BASE_URL}/api/channels/{TEST_CHANNEL_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert "use_schedule" in data, "use_schedule field missing from channel"
        assert data["use_schedule"] == True, f"Expected use_schedule=true, got {data['use_schedule']}"
        print(f"✓ Channel '{data['name']}' has use_schedule=true")


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session without auth"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.fail(f"Authentication failed: {response.text}")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
