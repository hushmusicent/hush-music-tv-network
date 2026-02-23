"""
Backend API tests for Use Schedule Toggle Feature
Tests the ability to switch channels to synchronized 24-hour schedule mode via admin toggle
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test Credentials (Admin)
ADMIN_EMAIL = "hushmusicent419@gmail.com"
ADMIN_PASSWORD = "$Stisdd419"


class TestUseScheduleFlag:
    """Tests for the use_schedule toggle feature"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["access_token"]
    
    def test_1_login_with_correct_credentials(self):
        """Test admin login works with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["is_admin"] == True
        print(f"SUCCESS: Admin login works - User: {data['user']['username']}")
    
    def test_2_get_channels_returns_use_schedule_field(self):
        """GET /api/channels should return channels with use_schedule field"""
        response = requests.get(f"{BASE_URL}/api/channels")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) > 0, "No channels found"
        
        for channel in data:
            assert "use_schedule" in channel, f"Channel {channel['name']} missing use_schedule field"
            assert isinstance(channel["use_schedule"], bool)
        
        print(f"SUCCESS: All {len(data)} channels have use_schedule field")
        
        # Check for Hush Music Radio which should have use_schedule=true
        hush_music_radio = [c for c in data if "Hush Music Radio" in c['name']]
        if hush_music_radio:
            print(f"  - Hush Music Radio use_schedule: {hush_music_radio[0]['use_schedule']}")
        
        return data
    
    def test_3_create_channel_with_use_schedule_true(self, auth_token):
        """Create a channel with use_schedule=True"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_UseScheduleEnabled",
                "category": "Music",
                "use_schedule": True,
                "is_public": True
            }
        )
        assert response.status_code == 200, f"Create channel failed: {response.text}"
        
        data = response.json()
        assert data["use_schedule"] == True
        assert data["name"] == "TEST_UseScheduleEnabled"
        print(f"SUCCESS: Created channel with use_schedule=True - ID: {data['id']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        return data["id"]
    
    def test_4_create_channel_use_schedule_defaults_false(self, auth_token):
        """Verify use_schedule defaults to False when not specified"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_UseScheduleDefault",
                "category": "Entertainment"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["use_schedule"] == False, "use_schedule should default to False"
        print(f"SUCCESS: use_schedule correctly defaults to False")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_5_update_channel_use_schedule_toggle_on(self, auth_token):
        """PUT /api/channels/{channel_id} should save use_schedule=True"""
        # Create a channel with use_schedule=False first
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_ToggleScheduleOn", "category": "Gaming", "use_schedule": False}
        )
        channel_id = create_resp.json()["id"]
        
        # Update to use_schedule=True
        response = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"use_schedule": True}
        )
        assert response.status_code == 200
        assert response.json()["use_schedule"] == True
        print(f"SUCCESS: Updated use_schedule to True")
        
        # Verify persistence with GET
        get_resp = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert get_resp.json()["use_schedule"] == True
        print(f"SUCCESS: use_schedule=True persisted in database")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_6_update_channel_use_schedule_toggle_off(self, auth_token):
        """PUT /api/channels/{channel_id} should save use_schedule=False"""
        # Create a channel with use_schedule=True first
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_ToggleScheduleOff", "category": "Music", "use_schedule": True}
        )
        channel_id = create_resp.json()["id"]
        
        # Verify it started as True
        initial_get = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert initial_get.json()["use_schedule"] == True
        
        # Update to use_schedule=False
        response = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"use_schedule": False}
        )
        assert response.status_code == 200
        assert response.json()["use_schedule"] == False
        print(f"SUCCESS: Updated use_schedule to False")
        
        # Verify persistence with GET
        get_resp = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert get_resp.json()["use_schedule"] == False
        print(f"SUCCESS: use_schedule=False persisted in database")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_7_schedule_live_returns_use_schedule_flag(self):
        """GET /api/schedule/live returns use_schedule flag for each channel"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        
        data = response.json()
        assert "schedules" in data
        assert len(data["schedules"]) > 0, "No schedules found"
        
        for schedule in data["schedules"]:
            assert "use_schedule" in schedule, f"Schedule for {schedule['channel_name']} missing use_schedule flag"
            assert isinstance(schedule["use_schedule"], bool)
        
        # Report which channels have use_schedule enabled
        scheduled_channels = [s['channel_name'] for s in data['schedules'] if s['use_schedule']]
        non_scheduled_channels = [s['channel_name'] for s in data['schedules'] if not s['use_schedule']]
        
        print(f"SUCCESS: All {len(data['schedules'])} schedules have use_schedule field")
        print(f"  - Channels with use_schedule=True: {scheduled_channels if scheduled_channels else 'None'}")
        print(f"  - Channels with use_schedule=False: {len(non_scheduled_channels)} channels")
        
        return data
    
    def test_8_find_existing_channel_and_toggle_schedule(self, auth_token):
        """Test toggling use_schedule on existing channel (e.g., Rap Battles)"""
        # Find a channel that is NOT Hush Music Radio to test toggling
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        
        # Try to find Rap Battles or another test channel
        test_channel = None
        for ch in channels:
            if "Rap Battles" in ch['name'] or ("Hush Music Radio" not in ch['name'] and ch.get('videos')):
                test_channel = ch
                break
        
        if not test_channel:
            pytest.skip("No suitable channel found to test toggling")
        
        channel_id = test_channel['id']
        original_value = test_channel.get('use_schedule', False)
        
        print(f"Testing toggle on channel: {test_channel['name']} (current use_schedule: {original_value})")
        
        # Toggle to opposite value
        new_value = not original_value
        response = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"use_schedule": new_value}
        )
        assert response.status_code == 200
        assert response.json()["use_schedule"] == new_value
        print(f"SUCCESS: Toggled use_schedule from {original_value} to {new_value}")
        
        # Verify in /api/schedule/live
        live_resp = requests.get(f"{BASE_URL}/api/schedule/live")
        live_data = live_resp.json()
        
        channel_schedule = [s for s in live_data['schedules'] if s['channel_id'] == channel_id]
        if channel_schedule:
            assert channel_schedule[0]['use_schedule'] == new_value
            print(f"SUCCESS: /api/schedule/live reflects updated use_schedule={new_value}")
        
        # Restore original value
        requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"use_schedule": original_value}
        )
        print(f"Restored original use_schedule={original_value}")
    
    def test_9_verify_hush_music_radio_has_use_schedule_true(self):
        """Verify 'Hush Music Radio' channel already has use_schedule=true"""
        response = requests.get(f"{BASE_URL}/api/channels")
        channels = response.json()
        
        hush_music_radio = [c for c in channels if "Hush Music Radio" in c['name']]
        
        if not hush_music_radio:
            pytest.skip("Hush Music Radio channel not found")
        
        channel = hush_music_radio[0]
        assert channel['use_schedule'] == True, f"Hush Music Radio should have use_schedule=True, got {channel['use_schedule']}"
        print(f"SUCCESS: Hush Music Radio has use_schedule=True as expected")
        
        # Also verify in /api/schedule/live
        live_resp = requests.get(f"{BASE_URL}/api/schedule/live")
        live_data = live_resp.json()
        
        channel_schedule = [s for s in live_data['schedules'] if s['channel_id'] == channel['id']]
        if channel_schedule:
            assert channel_schedule[0]['use_schedule'] == True
            print(f"SUCCESS: Hush Music Radio in /api/schedule/live has use_schedule=True")


class TestChannelResponseModel:
    """Test that channel response model includes all expected fields"""
    
    def test_channel_response_structure(self):
        """Verify channel response includes all expected fields"""
        response = requests.get(f"{BASE_URL}/api/channels")
        assert response.status_code == 200
        
        channels = response.json()
        if len(channels) == 0:
            pytest.skip("No channels to test")
        
        channel = channels[0]
        
        # Required fields
        required_fields = ['id', 'name', 'category', 'is_public', 'is_24_7', 'random_play', 'use_schedule']
        for field in required_fields:
            assert field in channel, f"Missing required field: {field}"
        
        # Verify boolean types
        assert isinstance(channel['is_public'], bool)
        assert isinstance(channel['is_24_7'], bool)
        assert isinstance(channel['random_play'], bool)
        assert isinstance(channel['use_schedule'], bool)
        
        print(f"SUCCESS: Channel response model has all required fields")
        print(f"  Sample: name={channel['name']}, is_24_7={channel['is_24_7']}, random_play={channel['random_play']}, use_schedule={channel['use_schedule']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
