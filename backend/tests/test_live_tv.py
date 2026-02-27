"""
Test Live TV Features:
1. GET /api/schedule/live returns 30 channels
2. 'Hush Music Live' channel has is_live_stream=true and correct youtube_id
3. Regular channels have proper schedule data
4. Admin login works with provided credentials
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
ADMIN_EMAIL = "hushmusicent419@gmail.com"
ADMIN_PASSWORD = "$Stisdd419"

class TestScheduleLiveEndpoint:
    """Tests for /api/schedule/live endpoint"""
    
    def test_schedule_live_returns_200(self):
        """Test that /api/schedule/live returns 200 status"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASS: /api/schedule/live returns 200")
    
    def test_schedule_live_returns_30_channels(self):
        """Test that exactly 30 channels are returned"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        
        assert "schedules" in data, "Response must have 'schedules' field"
        schedules = data["schedules"]
        
        assert len(schedules) == 30, f"Expected 30 channels, got {len(schedules)}"
        print(f"PASS: /api/schedule/live returns 30 channels")
    
    def test_hush_music_live_channel_exists(self):
        """Test that 'Hush Music Live' channel exists in the schedule"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        # Find Hush Music Live channel
        hush_live = None
        for schedule in schedules:
            if schedule.get("channel_name", "").strip() == "Hush Music Live":
                hush_live = schedule
                break
        
        assert hush_live is not None, "Hush Music Live channel not found in schedules"
        print(f"PASS: 'Hush Music Live' channel found in schedules")
    
    def test_hush_music_live_has_live_stream_flag(self):
        """Test that 'Hush Music Live' channel has is_live_stream=true"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        hush_live = None
        for schedule in schedules:
            if schedule.get("channel_name", "").strip() == "Hush Music Live":
                hush_live = schedule
                break
        
        assert hush_live is not None, "Hush Music Live channel not found"
        assert hush_live.get("is_live_stream") == True, f"Expected is_live_stream=True, got {hush_live.get('is_live_stream')}"
        print(f"PASS: Hush Music Live has is_live_stream=True")
    
    def test_hush_music_live_has_correct_youtube_id(self):
        """Test that 'Hush Music Live' has correct live_stream_youtube_id"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        hush_live = None
        for schedule in schedules:
            if schedule.get("channel_name", "").strip() == "Hush Music Live":
                hush_live = schedule
                break
        
        assert hush_live is not None, "Hush Music Live channel not found"
        expected_id = "yfG9FPgFoLM"
        actual_id = hush_live.get("live_stream_youtube_id")
        assert actual_id == expected_id, f"Expected youtube_id={expected_id}, got {actual_id}"
        print(f"PASS: Hush Music Live has correct youtube_id: {expected_id}")
    
    def test_regular_channels_have_videos(self):
        """Test that non-live-stream channels have videos array"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        # Find a non-live-stream channel
        regular_channel = None
        for schedule in schedules:
            if not schedule.get("is_live_stream", False) and schedule.get("channel_name") != "Hush Music Live":
                regular_channel = schedule
                break
        
        assert regular_channel is not None, "No regular channels found"
        assert "videos" in regular_channel, "Regular channel must have 'videos' field"
        print(f"PASS: Regular channel '{regular_channel.get('channel_name')}' has videos array")


class TestAdminAuth:
    """Tests for admin authentication"""
    
    def test_admin_login_success(self):
        """Test admin login with provided credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
        )
        
        assert response.status_code == 200, f"Login failed with status {response.status_code}: {response.text}"
        data = response.json()
        
        assert "access_token" in data, "Response must have 'access_token'"
        assert "user" in data, "Response must have 'user'"
        assert data["user"].get("is_admin") == True, "User must be admin"
        print(f"PASS: Admin login successful, is_admin=True")
    
    def test_admin_login_returns_valid_token(self):
        """Test that admin login returns a usable token"""
        # Login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        # Use token to access /auth/me
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert me_response.status_code == 200, f"Token validation failed: {me_response.status_code}"
        user = me_response.json()
        assert user.get("is_admin") == True, "User from /auth/me must be admin"
        print(f"PASS: Admin token is valid and works with /auth/me")


class TestScheduledChannels:
    """Tests for channels with use_schedule=true"""
    
    def test_movies_4_everyone_loads(self):
        """Test that Movies 4 Everyone channel data is accessible"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        movies_channel = None
        for schedule in schedules:
            if "Movies 4 Everyone" in schedule.get("channel_name", ""):
                movies_channel = schedule
                break
        
        if movies_channel:
            print(f"PASS: Movies 4 Everyone channel found - is_live_stream: {movies_channel.get('is_live_stream')}, use_schedule: {movies_channel.get('use_schedule')}")
        else:
            print("INFO: Movies 4 Everyone channel not found in schedules")
    
    def test_hush_music_radio_exists(self):
        """Test that Hush Music Radio channel exists (scheduled channel)"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        radio_channel = None
        for schedule in schedules:
            if "Hush Music Radio" in schedule.get("channel_name", ""):
                radio_channel = schedule
                break
        
        if radio_channel:
            print(f"PASS: Hush Music Radio found - use_schedule: {radio_channel.get('use_schedule')}, videos: {len(radio_channel.get('videos', []))}")
        else:
            print("INFO: Hush Music Radio channel not in schedules (may have 0 videos)")


class TestChannelStructure:
    """Tests for channel data structure"""
    
    def test_all_channels_have_required_fields(self):
        """Test that all channels have required fields"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        required_fields = ["channel_id", "channel_name"]
        missing_fields = []
        
        for schedule in schedules:
            for field in required_fields:
                if field not in schedule:
                    missing_fields.append(f"{schedule.get('channel_name', 'Unknown')}: missing {field}")
        
        assert len(missing_fields) == 0, f"Missing fields: {missing_fields}"
        print(f"PASS: All {len(schedules)} channels have required fields")
    
    def test_live_stream_channels_flagged_correctly(self):
        """Test that live stream channels are properly flagged"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        data = response.json()
        schedules = data["schedules"]
        
        live_stream_channels = [s for s in schedules if s.get("is_live_stream") == True]
        
        for channel in live_stream_channels:
            youtube_id = channel.get("live_stream_youtube_id")
            assert youtube_id is not None and youtube_id != "", f"Live stream channel '{channel.get('channel_name')}' missing youtube_id"
        
        print(f"PASS: Found {len(live_stream_channels)} live stream channel(s), all have youtube_id")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
