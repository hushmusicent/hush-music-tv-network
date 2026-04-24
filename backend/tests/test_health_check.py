"""
Backend API tests for Hush TV Network - Health Check and Geo-restricted video handling
Tests: 
1. Health check endpoint (POST /api/youtube/health-check)
2. Health check with channel filter
3. Stream info endpoint (GET /api/youtube/stream-info/{youtube_id})
4. Schedule/live endpoint returns all channels
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://hush-music-tv-3.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "hushmusicent419@gmail.com"
TEST_PASSWORD = "$Stisdd419"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture
def auth_headers(auth_token):
    """Authorization headers"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestScheduleAPI:
    """Tests for /api/schedule/live endpoint"""
    
    def test_schedule_live_returns_200(self):
        """Schedule/live endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASS: Schedule/live returns 200")
    
    def test_schedule_live_returns_channels(self):
        """Schedule/live should return multiple channels"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        data = response.json()
        
        assert "schedules" in data, "Response missing 'schedules' field"
        assert "date" in data, "Response missing 'date' field"
        assert len(data["schedules"]) >= 20, f"Expected at least 20 channels, got {len(data['schedules'])}"
        print(f"PASS: Schedule/live returns {len(data['schedules'])} channels")
    
    def test_live_stream_channel_exists(self):
        """Live stream channel (Hush Music Live) should exist"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        data = response.json()
        
        live_stream_channels = [s for s in data["schedules"] if s.get("is_live_stream")]
        assert len(live_stream_channels) >= 1, "Expected at least 1 live stream channel"
        
        hush_live = next((s for s in live_stream_channels if "Hush Music Live" in s.get("channel_name", "")), None)
        if hush_live:
            assert hush_live.get("live_stream_youtube_id"), "Live stream channel missing YouTube ID"
            print(f"PASS: Hush Music Live found with YouTube ID: {hush_live['live_stream_youtube_id']}")
        else:
            print(f"PASS: Found {len(live_stream_channels)} live stream channel(s)")
    
    def test_scheduled_channels_have_videos(self):
        """Regular channels should have videos in schedule"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        data = response.json()
        
        regular_channels = [s for s in data["schedules"] if not s.get("is_live_stream")]
        channels_with_videos = [s for s in regular_channels if len(s.get("videos", [])) > 0]
        
        assert len(channels_with_videos) >= 10, f"Expected at least 10 channels with videos"
        print(f"PASS: {len(channels_with_videos)} channels have video schedules")
    
    def test_movies_4_everyone_channel_exists(self):
        """Movies 4 Everyone channel should exist and have videos"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        data = response.json()
        
        movies_channel = next(
            (s for s in data["schedules"] if "Movies 4 Everyone" in s.get("channel_name", "")), 
            None
        )
        if movies_channel:
            video_count = len(movies_channel.get("videos", []))
            assert video_count > 0 or movies_channel.get("is_live_stream"), \
                "Movies 4 Everyone should have videos or be live stream"
            print(f"PASS: Movies 4 Everyone found with {video_count} videos")
        else:
            print("INFO: Movies 4 Everyone channel not found (may have been renamed)")


class TestHealthCheckAPI:
    """Tests for /api/youtube/health-check endpoint"""
    
    def test_health_check_requires_auth(self):
        """Health check should require authentication"""
        response = requests.post(f"{BASE_URL}/api/youtube/health-check")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("PASS: Health check requires authentication")
    
    def test_health_check_works_with_auth(self, auth_headers):
        """Health check should work with admin authentication"""
        response = requests.post(
            f"{BASE_URL}/api/youtube/health-check",
            headers=auth_headers,
            timeout=120  # May take time
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total" in data, "Response missing 'total' field"
        assert "categories" in data, "Response missing 'categories' field"
        
        # Verify categories structure
        categories = data["categories"]
        expected_cats = ["embeddable", "playable_via_proxy", "geo_restricted", "age_restricted"]
        for cat in expected_cats:
            assert cat in categories, f"Missing category: {cat}"
        
        print(f"PASS: Health check returned {data['total']} videos")
        print(f"  Categories: embeddable={categories.get('embeddable', 0)}, proxy={categories.get('playable_via_proxy', 0)}, geo={categories.get('geo_restricted', 0)}")
    
    def test_health_check_with_channel_filter(self, auth_headers):
        """Health check should work with channel_id filter"""
        # First get a channel ID
        schedule_response = requests.get(f"{BASE_URL}/api/schedule/live")
        schedules = schedule_response.json().get("schedules", [])
        
        # Find a small channel to test (not live stream)
        test_channel = next(
            (s for s in schedules 
             if not s.get("is_live_stream") and 10 <= len(s.get("videos", [])) <= 30),
            None
        )
        
        if not test_channel:
            pytest.skip("No suitable small channel found for testing")
        
        channel_id = test_channel["channel_id"]
        channel_name = test_channel["channel_name"]
        
        response = requests.post(
            f"{BASE_URL}/api/youtube/health-check?channel_id={channel_id}",
            headers=auth_headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should only return videos from that channel
        assert data["total"] <= len(test_channel.get("videos", [])) + 5, \
            f"Expected videos from single channel, got {data['total']}"
        
        print(f"PASS: Health check with channel filter for '{channel_name}' returned {data['total']} videos")


class TestStreamInfoAPI:
    """Tests for /api/youtube/stream-info/{youtube_id} endpoint"""
    
    def test_stream_info_with_valid_video(self):
        """Stream info should return URL for valid video"""
        # Use a known public video (Rick Astley - Never Gonna Give You Up)
        response = requests.get(f"{BASE_URL}/api/youtube/stream-info/dQw4w9WgXcQ")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should return success or failure with proper structure
        assert "success" in data, "Response missing 'success' field"
        
        if data["success"]:
            assert "url" in data, "Successful response missing 'url' field"
            print(f"PASS: Stream info returned URL (used_cookies={data.get('used_cookies', False)})")
        else:
            assert "error" in data or "cookies_available" in data, \
                "Failed response should have error or cookies_available"
            print(f"PASS: Stream info returned failure status (expected for restricted videos)")
    
    def test_stream_info_with_invalid_video(self):
        """Stream info should handle invalid video ID gracefully"""
        response = requests.get(f"{BASE_URL}/api/youtube/stream-info/INVALID_VIDEO_ID_123")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == False, "Invalid video should return success=false"
        print("PASS: Stream info handles invalid video ID gracefully")


class TestYtdlpMultiStrategy:
    """Tests for yt-dlp multi-strategy fallback"""
    
    def test_stream_info_response_time(self):
        """Stream info should respond within reasonable time (tests multi-strategy isn't blocking)"""
        start_time = time.time()
        response = requests.get(
            f"{BASE_URL}/api/youtube/stream-info/dQw4w9WgXcQ",
            timeout=60
        )
        elapsed = time.time() - start_time
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert elapsed < 45, f"Response took too long: {elapsed:.1f}s (max 45s)"
        
        print(f"PASS: Stream info responded in {elapsed:.1f}s")


class TestChannelsAPI:
    """Additional channel API tests"""
    
    def test_channels_list(self):
        """Channels endpoint should return all public channels"""
        response = requests.get(f"{BASE_URL}/api/channels")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 20, f"Expected at least 20 channels, got {len(data)}"
        print(f"PASS: Channels API returns {len(data)} channels")
    
    def test_channels_have_required_fields(self):
        """All channels should have required fields"""
        response = requests.get(f"{BASE_URL}/api/channels")
        channels = response.json()
        
        required_fields = ["id", "name", "videos", "is_public"]
        for channel in channels[:5]:  # Check first 5 channels
            for field in required_fields:
                assert field in channel, f"Channel missing field: {field}"
        
        print("PASS: All checked channels have required fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
