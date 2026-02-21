"""
Backend API tests for TV Network Hub
Covers: Authentication, Channels, Videos, Upload, Categories, TV Guide
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test Credentials (Admin)
ADMIN_EMAIL = "Hushmusicent419@gmail.com"
ADMIN_PASSWORD = "sstisdd419"


class TestHealthAndSeed:
    """Health check and seed data tests"""
    
    def test_health_check(self):
        """Verify API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        print("SUCCESS: Health check passed")
    
    def test_root_endpoint(self):
        """Verify root API endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert "message" in response.json()
        print("SUCCESS: Root endpoint works")
    
    def test_seed_data(self):
        """Seed initial data"""
        response = requests.post(f"{BASE_URL}/api/seed")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"SUCCESS: Seed data - {data['message']}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_with_admin_credentials(self):
        """Login with provided admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["is_admin"] == True
        print(f"SUCCESS: Admin login successful - User: {data['user']['username']}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("SUCCESS: Invalid credentials correctly rejected")
    
    def test_registration_disabled(self):
        """Verify registration is disabled (admin-only system)"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "testpass123"
        })
        assert response.status_code == 403
        print("SUCCESS: Registration correctly disabled")
    
    def test_get_me_authenticated(self):
        """Test /auth/me with valid token"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["access_token"]
        
        # Get user info
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["is_admin"] == True
        print(f"SUCCESS: Get me endpoint works - {data['username']}")
    
    def test_get_me_unauthenticated(self):
        """Test /auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("SUCCESS: Unauthenticated request correctly rejected")


class TestCategories:
    """Categories endpoint tests"""
    
    def test_get_all_categories(self):
        """Get all categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Verify category structure
        for cat in data:
            assert "name" in cat
            assert "count" in cat
        
        print(f"SUCCESS: Retrieved {len(data)} categories")
        return data


class TestChannels:
    """Channels CRUD tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_all_channels(self):
        """Get all public channels"""
        response = requests.get(f"{BASE_URL}/api/channels")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Retrieved {len(data)} channels")
        return data
    
    def test_get_featured_channels(self):
        """Get featured channels"""
        response = requests.get(f"{BASE_URL}/api/channels/featured")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Retrieved {len(data)} featured channels")
    
    def test_get_channels_by_category(self):
        """Filter channels by category"""
        response = requests.get(f"{BASE_URL}/api/channels", params={"category": "Music"})
        assert response.status_code == 200
        
        data = response.json()
        for channel in data:
            assert channel["category"] == "Music"
        print(f"SUCCESS: Category filter works - {len(data)} Music channels")
    
    def test_search_channels(self):
        """Search channels by name"""
        response = requests.get(f"{BASE_URL}/api/channels", params={"search": "lofi"})
        assert response.status_code == 200
        
        data = response.json()
        print(f"SUCCESS: Search works - Found {len(data)} channels matching 'lofi'")
    
    def test_create_channel(self, auth_token):
        """Create a new channel"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Channel",
                "description": "Test channel for backend testing",
                "category": "Music",
                "is_public": True,
                "is_24_7": True
            }
        )
        assert response.status_code == 200, f"Create channel failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Channel"
        assert data["category"] == "Music"
        assert data["is_public"] == True
        assert "id" in data
        print(f"SUCCESS: Channel created - ID: {data['id']}")
        return data["id"]
    
    def test_get_my_channels(self, auth_token):
        """Get channels owned by current user"""
        response = requests.get(
            f"{BASE_URL}/api/channels/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: My channels retrieved - {len(data)} channels")
    
    def test_get_channel_by_id(self, auth_token):
        """Get a specific channel by ID"""
        # First get all channels
        all_channels = requests.get(f"{BASE_URL}/api/channels").json()
        if len(all_channels) > 0:
            channel_id = all_channels[0]["id"]
            response = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
            assert response.status_code == 200
            
            data = response.json()
            assert data["id"] == channel_id
            print(f"SUCCESS: Channel retrieved by ID - {data['name']}")
        else:
            pytest.skip("No channels available to test")
    
    def test_update_channel(self, auth_token):
        """Update a channel"""
        # First create a channel to update
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_UpdateChannel",
                "category": "Entertainment"
            }
        )
        channel_id = create_resp.json()["id"]
        
        # Update the channel
        response = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_UpdatedChannel", "description": "Updated description"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "TEST_UpdatedChannel"
        assert data["description"] == "Updated description"
        print(f"SUCCESS: Channel updated - {data['name']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_delete_channel(self, auth_token):
        """Delete a channel"""
        # First create a channel to delete
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_DeleteChannel", "category": "Gaming"}
        )
        channel_id = create_resp.json()["id"]
        
        # Delete the channel
        response = requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Verify deletion
        get_resp = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert get_resp.status_code == 404
        print("SUCCESS: Channel deleted and verified gone")
    
    def test_create_channel_unauthenticated(self):
        """Creating channel without auth should fail"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            json={"name": "TEST_NoAuth", "category": "Music"}
        )
        assert response.status_code == 401
        print("SUCCESS: Unauthenticated channel creation rejected")


class TestChannelVideos:
    """Tests for adding/removing videos from channels"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_add_youtube_video_to_channel(self, auth_token):
        """Add a YouTube video to a channel"""
        # Create a test channel
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_VideoChannel", "category": "Music"}
        )
        channel_id = create_resp.json()["id"]
        
        # Add a video
        response = requests.post(
            f"{BASE_URL}/api/channels/{channel_id}/videos",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "youtube_id": "dQw4w9WgXcQ",
                "title": "Test Video",
                "duration": 300
            }
        )
        assert response.status_code == 200, f"Add video failed: {response.text}"
        
        data = response.json()
        assert len(data["videos"]) > 0
        assert data["videos"][0]["youtube_id"] == "dQw4w9WgXcQ"
        print(f"SUCCESS: YouTube video added to channel - {len(data['videos'])} videos")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_add_uploaded_video_to_channel(self, auth_token):
        """Add an uploaded video (via URL) to a channel"""
        # Create a test channel
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_UploadVideoChannel", "category": "Entertainment"}
        )
        channel_id = create_resp.json()["id"]
        
        # Add an uploaded video (using video_url instead of youtube_id)
        response = requests.post(
            f"{BASE_URL}/api/channels/{channel_id}/videos",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "Uploaded Test Video",
                "video_url": "/api/videos/test-video.mp4",
                "duration": 600
            }
        )
        assert response.status_code == 200, f"Add uploaded video failed: {response.text}"
        
        data = response.json()
        assert len(data["videos"]) > 0
        assert data["videos"][0]["video_url"] == "/api/videos/test-video.mp4"
        print(f"SUCCESS: Uploaded video reference added to channel")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_remove_video_from_channel(self, auth_token):
        """Remove a video from a channel"""
        # Create a channel with a video
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_RemoveVideoChannel", "category": "Comedy"}
        )
        channel_id = create_resp.json()["id"]
        
        # Add a video
        add_resp = requests.post(
            f"{BASE_URL}/api/channels/{channel_id}/videos",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"youtube_id": "testid123", "title": "Video to Remove", "duration": 120}
        )
        video_id = add_resp.json()["videos"][0]["id"]
        
        # Remove the video
        response = requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}/videos/{video_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        # Verify removal
        get_resp = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert len(get_resp.json()["videos"]) == 0
        print("SUCCESS: Video removed from channel")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestVideoUpload:
    """Video upload functionality tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_upload_video_admin_only(self):
        """Verify upload requires admin"""
        # Try without auth
        response = requests.post(f"{BASE_URL}/api/upload/video")
        assert response.status_code == 401
        print("SUCCESS: Upload endpoint requires authentication")
    
    def test_list_uploaded_videos(self, auth_token):
        """List all uploaded videos (admin only)"""
        response = requests.get(
            f"{BASE_URL}/api/upload/videos",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Listed {len(data)} uploaded videos")
    
    def test_list_videos_requires_admin(self):
        """List videos should require admin"""
        response = requests.get(f"{BASE_URL}/api/upload/videos")
        assert response.status_code == 401
        print("SUCCESS: List uploaded videos requires authentication")


class TestTVGuide:
    """TV Guide endpoint tests"""
    
    def test_get_tv_guide(self):
        """Get TV guide schedule"""
        response = requests.get(f"{BASE_URL}/api/tv-guide")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        for channel in data:
            assert "channel_id" in channel
            assert "channel_name" in channel
            assert "videos" in channel
        
        print(f"SUCCESS: TV Guide retrieved - {len(data)} channels")


class TestRandomPlay:
    """Random Play feature tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_create_channel_with_random_play_true(self, auth_token):
        """Create channel with random_play enabled"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_RandomPlayOn",
                "category": "Music",
                "random_play": True
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["random_play"] == True
        print(f"SUCCESS: Created channel with random_play=True")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_create_channel_random_play_default_false(self, auth_token):
        """Verify random_play defaults to False"""
        response = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_RandomPlayDefault",
                "category": "Entertainment"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["random_play"] == False
        print(f"SUCCESS: random_play defaults to False")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_update_channel_random_play(self, auth_token):
        """Update channel random_play field"""
        # Create channel
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_RandomPlayUpdate", "category": "Gaming", "random_play": False}
        )
        channel_id = create_resp.json()["id"]
        
        # Update to True
        update_resp = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"random_play": True}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["random_play"] == True
        print(f"SUCCESS: Updated random_play to True")
        
        # Verify persistence
        get_resp = requests.get(f"{BASE_URL}/api/channels/{channel_id}")
        assert get_resp.json()["random_play"] == True
        print(f"SUCCESS: random_play persisted in database")
        
        # Update back to False
        update_resp2 = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"random_play": False}
        )
        assert update_resp2.json()["random_play"] == False
        print(f"SUCCESS: Updated random_play to False")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_get_channel_returns_random_play(self, auth_token):
        """Verify GET channel includes random_play field"""
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        if len(channels) > 0:
            channel = channels[0]
            assert "random_play" in channel
            print(f"SUCCESS: GET channel returns random_play field (value: {channel['random_play']})")
        else:
            pytest.skip("No channels to test")


class TestImageUpload:
    """Image upload functionality tests (new feature for thumbnail upload)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_upload_image_requires_auth(self):
        """Verify image upload requires authentication"""
        response = requests.post(f"{BASE_URL}/api/upload/image")
        assert response.status_code == 401
        print("SUCCESS: Image upload endpoint requires authentication")
    
    def test_upload_image_admin_only(self, auth_token):
        """Test image upload with a small test image"""
        # Create a small valid PNG image (1x1 pixel)
        import io
        # PNG header for 1x1 pixel image
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # width=1, height=1
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,  # bit depth, color type, etc
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {'file': ('test_thumbnail.png', io.BytesIO(png_data), 'image/png')}
        response = requests.post(
            f"{BASE_URL}/api/upload/image",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "filename" in data
        assert "url" in data
        assert data["url"].startswith("/api/images/")
        print(f"SUCCESS: Image uploaded - URL: {data['url']}")
        
        # Cleanup - delete the uploaded image
        requests.delete(
            f"{BASE_URL}/api/upload/image/{data['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        return data
    
    def test_list_uploaded_images(self, auth_token):
        """List all uploaded images (admin only)"""
        response = requests.get(
            f"{BASE_URL}/api/upload/images",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Listed {len(data)} uploaded images")
    
    def test_list_images_requires_admin(self):
        """List images should require admin"""
        response = requests.get(f"{BASE_URL}/api/upload/images")
        assert response.status_code == 401
        print("SUCCESS: List uploaded images requires authentication")
    
    def test_image_accessible_via_static_route(self, auth_token):
        """Verify uploaded images are accessible via /api/images/"""
        # Upload a test image first
        import io
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {'file': ('access_test.png', io.BytesIO(png_data), 'image/png')}
        upload_resp = requests.post(
            f"{BASE_URL}/api/upload/image",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        if upload_resp.status_code == 200:
            data = upload_resp.json()
            image_url = f"{BASE_URL}{data['url']}"
            
            # Try to access the image
            access_resp = requests.get(image_url)
            assert access_resp.status_code == 200
            print(f"SUCCESS: Image accessible at {image_url}")
            
            # Cleanup
            requests.delete(
                f"{BASE_URL}/api/upload/image/{data['id']}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
        else:
            pytest.skip("Could not upload image to test access")
    
    def test_delete_uploaded_image(self, auth_token):
        """Delete an uploaded image"""
        # Upload first
        import io
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {'file': ('delete_test.png', io.BytesIO(png_data), 'image/png')}
        upload_resp = requests.post(
            f"{BASE_URL}/api/upload/image",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        if upload_resp.status_code == 200:
            image_id = upload_resp.json()["id"]
            
            # Delete the image
            delete_resp = requests.delete(
                f"{BASE_URL}/api/upload/image/{image_id}",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert delete_resp.status_code == 200
            print("SUCCESS: Image deleted successfully")
            
            # Verify it's gone from the list
            list_resp = requests.get(
                f"{BASE_URL}/api/upload/images",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            images = list_resp.json()
            image_ids = [img["id"] for img in images]
            assert image_id not in image_ids
            print("SUCCESS: Deleted image no longer in list")
        else:
            pytest.skip("Could not upload image to test deletion")
    
    def test_update_channel_thumbnail_with_uploaded_image(self, auth_token):
        """Test that a channel thumbnail can be updated with an uploaded image URL"""
        # First upload an image
        import io
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {'file': ('thumbnail_test.png', io.BytesIO(png_data), 'image/png')}
        upload_resp = requests.post(
            f"{BASE_URL}/api/upload/image",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        if upload_resp.status_code != 200:
            pytest.skip("Could not upload image for thumbnail test")
        
        image_url = upload_resp.json()["url"]
        image_id = upload_resp.json()["id"]
        
        # Create a test channel
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_ThumbnailChannel",
                "category": "Music"
            }
        )
        channel_id = create_resp.json()["id"]
        
        # Update channel with uploaded image thumbnail
        update_resp = requests.put(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"thumbnail": f"{BASE_URL}{image_url}"}
        )
        assert update_resp.status_code == 200
        assert image_url in update_resp.json()["thumbnail"]
        print(f"SUCCESS: Channel thumbnail updated with uploaded image")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        requests.delete(
            f"{BASE_URL}/api/upload/image/{image_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestScheduleEndpoints:
    """24-Hour Schedule endpoints tests (TV Guide feature)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_all_channel_schedules(self, auth_token):
        """GET /api/schedule/channels - Get 24-hour schedules for all channels"""
        response = requests.get(
            f"{BASE_URL}/api/schedule/channels",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed to get schedules: {response.text}"
        
        data = response.json()
        assert "date" in data
        assert "schedules" in data
        assert isinstance(data["schedules"], list)
        
        # Verify schedule structure for each channel
        for schedule in data["schedules"]:
            assert "channel_id" in schedule
            assert "channel_name" in schedule
            assert "videos" in schedule
            assert isinstance(schedule["videos"], list)
            
            # Verify video schedule structure
            if len(schedule["videos"]) > 0:
                video = schedule["videos"][0]
                assert "video_id" in video
                assert "title" in video
                assert "start_time" in video
                assert "end_time" in video
                assert "duration" in video
        
        print(f"SUCCESS: Retrieved 24h schedules for {len(data['schedules'])} channels")
        return data
    
    def test_get_all_schedules_requires_admin(self):
        """GET /api/schedule/channels requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/schedule/channels")
        assert response.status_code == 401
        print("SUCCESS: Schedule endpoints require authentication")
    
    def test_get_single_channel_schedule(self, auth_token):
        """GET /api/schedule/channel/{channel_id} - Get schedule for specific channel"""
        # First get channels to find an ID
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        if len(channels) == 0:
            pytest.skip("No channels to test schedule")
        
        # Filter to channels with videos
        channels_with_videos = [c for c in channels if len(c.get("videos", [])) > 0]
        if len(channels_with_videos) == 0:
            pytest.skip("No channels with videos to test schedule")
        
        channel_id = channels_with_videos[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/schedule/channel/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["channel_id"] == channel_id
        assert "videos" in data
        assert "schedule_date" in data
        assert "total_duration" in data
        print(f"SUCCESS: Got schedule for channel {data['channel_name']} - {len(data['videos'])} scheduled videos")
    
    def test_get_nonexistent_channel_schedule(self, auth_token):
        """GET /api/schedule/channel/{channel_id} - 404 for nonexistent channel"""
        response = requests.get(
            f"{BASE_URL}/api/schedule/channel/nonexistent-id-12345",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 404
        print("SUCCESS: Nonexistent channel returns 404")
    
    def test_regenerate_channel_schedule(self, auth_token):
        """POST /api/schedule/regenerate/{channel_id} - Regenerate schedule for a channel"""
        # Get a channel with videos
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        channels_with_videos = [c for c in channels if len(c.get("videos", [])) > 0]
        if len(channels_with_videos) == 0:
            pytest.skip("No channels with videos to test regenerate")
        
        channel_id = channels_with_videos[0]["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/schedule/regenerate/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["channel_id"] == channel_id
        assert "videos" in data
        assert len(data["videos"]) > 0
        print(f"SUCCESS: Regenerated schedule for {data['channel_name']} - {len(data['videos'])} videos")
    
    def test_regenerate_nonexistent_channel(self, auth_token):
        """POST /api/schedule/regenerate/{channel_id} - 404 for nonexistent channel"""
        response = requests.post(
            f"{BASE_URL}/api/schedule/regenerate/nonexistent-id-12345",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 404
        print("SUCCESS: Regenerate nonexistent channel returns 404")
    
    def test_regenerate_requires_admin(self):
        """POST /api/schedule/regenerate requires admin authentication"""
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        if len(channels) > 0:
            response = requests.post(f"{BASE_URL}/api/schedule/regenerate/{channels[0]['id']}")
            assert response.status_code == 401
            print("SUCCESS: Regenerate endpoint requires authentication")
        else:
            pytest.skip("No channels to test")
    
    def test_schedule_videos_cover_24_hours(self, auth_token):
        """Verify schedule videos span full 24 hours"""
        response = requests.get(
            f"{BASE_URL}/api/schedule/channels",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            for schedule in data["schedules"]:
                if len(schedule["videos"]) > 0:
                    # Check first video starts at 00:00:00
                    first_video = schedule["videos"][0]
                    assert first_video["start_time"] == "00:00:00", f"First video doesn't start at midnight"
                    
                    # Check total duration is approximately 24 hours (86400 seconds)
                    total_duration = schedule.get("total_duration", 0)
                    assert total_duration >= 86400, f"Schedule doesn't cover 24 hours"
                    
                    print(f"SUCCESS: {schedule['channel_name']} schedule covers 24 hours ({len(schedule['videos'])} videos)")
                    break  # Test one channel is enough
            else:
                pytest.skip("No channels with videos to verify")


class TestVideoDurationUpdate:
    """Video duration update endpoint tests (self-healing feature)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_update_duration_no_auth_required(self):
        """Update duration endpoint is public (called from frontend when video plays)"""
        # Get a channel with videos
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        channels_with_videos = [c for c in channels if len(c.get("videos", [])) > 0]
        if len(channels_with_videos) == 0:
            pytest.skip("No channels with videos to test")
        
        channel = channels_with_videos[0]
        video = channel["videos"][0]
        youtube_id = video.get("youtube_id")
        if not youtube_id:
            pytest.skip("No YouTube video to test")
        
        # Call update-duration endpoint (no auth required)
        response = requests.post(
            f"{BASE_URL}/api/videos/update-duration",
            params={
                "channel_id": channel["id"],
                "youtube_id": youtube_id,
                "duration": 250
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Response should have these fields
        assert "updated" in data or "reason" in data
        print(f"SUCCESS: Duration update endpoint works without auth - {data}")
    
    def test_update_duration_invalid_duration(self):
        """Update duration rejects invalid duration values"""
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        channels_with_videos = [c for c in channels if len(c.get("videos", [])) > 0]
        if len(channels_with_videos) == 0:
            pytest.skip("No channels to test")
        
        channel = channels_with_videos[0]
        
        # Test with invalid duration (0 or negative)
        response = requests.post(
            f"{BASE_URL}/api/videos/update-duration",
            params={
                "channel_id": channel["id"],
                "youtube_id": "test123",
                "duration": 0
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["updated"] == False
        assert data["reason"] == "invalid_duration"
        print("SUCCESS: Invalid duration correctly rejected")
    
    def test_update_duration_nonexistent_channel(self):
        """Update duration handles nonexistent channel gracefully"""
        response = requests.post(
            f"{BASE_URL}/api/videos/update-duration",
            params={
                "channel_id": "nonexistent-channel-id",
                "youtube_id": "test123",
                "duration": 300
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["updated"] == False
        assert data["reason"] == "channel_not_found"
        print("SUCCESS: Nonexistent channel handled correctly")
    
    def test_update_duration_schedule_regeneration(self, auth_token):
        """Update duration triggers schedule regeneration when difference > 60s"""
        # Create a test channel with a video
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_DurationSchedule", "category": "Music"}
        )
        channel_id = create_resp.json()["id"]
        
        # Add a video with default duration (300)
        add_resp = requests.post(
            f"{BASE_URL}/api/channels/{channel_id}/videos",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"youtube_id": "test_duration_vid", "title": "Duration Test Video", "duration": 300}
        )
        
        # Update duration with significant change (> 60 seconds)
        response = requests.post(
            f"{BASE_URL}/api/videos/update-duration",
            params={
                "channel_id": channel_id,
                "youtube_id": "test_duration_vid",
                "duration": 500  # 200 second difference, should trigger regeneration
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        if data.get("updated"):
            assert data["new_duration"] == 500
            assert data["schedule_regenerated"] == True
            print(f"SUCCESS: Duration updated and schedule regenerated - {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_update_duration_no_regeneration_for_small_change(self, auth_token):
        """Update duration does NOT regenerate schedule for small changes"""
        # Create a test channel with a video
        create_resp = requests.post(
            f"{BASE_URL}/api/channels",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_SmallDuration", "category": "Music"}
        )
        channel_id = create_resp.json()["id"]
        
        # Add a video with non-default duration (avoid 300/180/0)
        add_resp = requests.post(
            f"{BASE_URL}/api/channels/{channel_id}/videos",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"youtube_id": "test_small_change", "title": "Small Change Video", "duration": 250}
        )
        
        # Update duration with small change (< 30 seconds)
        response = requests.post(
            f"{BASE_URL}/api/videos/update-duration",
            params={
                "channel_id": channel_id,
                "youtube_id": "test_small_change",
                "duration": 260  # Only 10 second difference
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Small change should not update (threshold is > 30s)
        assert data.get("updated") == False or data.get("schedule_regenerated") == False
        print(f"SUCCESS: Small duration change handled correctly - {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/channels/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )


class TestLiveScheduleEndpoints:
    """Public Live Schedule endpoints (for Live TV page)"""
    
    def test_get_live_schedules_public(self):
        """GET /api/schedule/live - Public endpoint for Live TV"""
        response = requests.get(f"{BASE_URL}/api/schedule/live")
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data
        assert "timezone" in data
        assert data["timezone"] == "America/New_York"
        assert "schedules" in data
        assert isinstance(data["schedules"], list)
        
        print(f"SUCCESS: Public live schedules endpoint works - {len(data['schedules'])} channels")
    
    def test_get_live_channel_schedule_public(self):
        """GET /api/schedule/live/{channel_id} - Public endpoint for single channel"""
        # First get channels to find one
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        channels_with_videos = [c for c in channels if len(c.get("videos", [])) > 0]
        if len(channels_with_videos) == 0:
            pytest.skip("No channels with videos to test")
        
        channel_id = channels_with_videos[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/schedule/live/{channel_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data
        assert "timezone" in data
        assert "schedule" in data
        assert data["schedule"]["channel_id"] == channel_id
        assert len(data["schedule"]["videos"]) > 0
        
        print(f"SUCCESS: Public single channel schedule works - {len(data['schedule']['videos'])} videos")
    
    def test_get_live_schedule_nonexistent_channel(self):
        """GET /api/schedule/live/{channel_id} - 404 for nonexistent channel"""
        response = requests.get(f"{BASE_URL}/api/schedule/live/nonexistent-id-12345")
        assert response.status_code == 404
        print("SUCCESS: Nonexistent channel returns 404")


class TestFavorites:
    """Favorites functionality tests"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_favorites_empty(self, auth_token):
        """Get favorites (may be empty)"""
        response = requests.get(
            f"{BASE_URL}/api/favorites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Favorites retrieved - {len(data)} favorites")
    
    def test_add_and_remove_favorite(self, auth_token):
        """Add and remove a favorite channel"""
        # Get a channel to favorite
        channels = requests.get(f"{BASE_URL}/api/channels").json()
        if len(channels) == 0:
            pytest.skip("No channels to test favorites")
        
        channel_id = channels[0]["id"]
        
        # Add to favorites
        add_resp = requests.post(
            f"{BASE_URL}/api/favorites/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert add_resp.status_code == 200
        print(f"SUCCESS: Channel added to favorites")
        
        # Remove from favorites
        remove_resp = requests.delete(
            f"{BASE_URL}/api/favorites/{channel_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert remove_resp.status_code == 200
        print("SUCCESS: Channel removed from favorites")


class TestYouTubeHealthCheck:
    """YouTube video health check endpoints (bulk check feature)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_check_video_endpoint(self):
        """GET /api/youtube/check/{videoId} - Check a single video (public)"""
        # Test with a known working video (Rick Astley - Never Gonna Give You Up)
        response = requests.get(f"{BASE_URL}/api/youtube/check/dQw4w9WgXcQ")
        assert response.status_code == 200
        
        data = response.json()
        assert "playable" in data
        assert "age_restricted" in data
        assert "needs_proxy" in data
        print(f"SUCCESS: Video check endpoint works - playable: {data['playable']}, age_restricted: {data['age_restricted']}")
    
    def test_check_video_unavailable(self):
        """GET /api/youtube/check/{videoId} - Check an invalid video ID"""
        response = requests.get(f"{BASE_URL}/api/youtube/check/invalid_video_id_xyz")
        assert response.status_code == 200
        
        data = response.json()
        # Invalid video should return playable: False
        assert data["playable"] == False or "error" in data
        print(f"SUCCESS: Invalid video check handled - {data}")
    
    def test_quick_check_requires_auth(self):
        """GET /api/youtube/quick-check requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/youtube/quick-check")
        assert response.status_code == 401
        print("SUCCESS: Quick check endpoint requires authentication")
    
    def test_quick_check_endpoint(self, auth_token):
        """GET /api/youtube/quick-check - Quick sample check (admin only)"""
        # Use sample_size=2 to speed up the test
        response = requests.get(
            f"{BASE_URL}/api/youtube/quick-check",
            params={"sample_size": 2},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=120  # Longer timeout for yt-dlp processing
        )
        assert response.status_code == 200, f"Quick check failed: {response.text}"
        
        data = response.json()
        assert "total_checked" in data
        assert "playable" in data
        assert "age_restricted" in data
        assert "unavailable" in data
        assert "issues" in data
        assert "cookies_configured" in data
        
        print(f"SUCCESS: Quick check completed - checked: {data['total_checked']}, playable: {data['playable']}, age_restricted: {data['age_restricted']}, unavailable: {data['unavailable']}")
    
    def test_bulk_check_requires_auth(self):
        """GET /api/youtube/bulk-check requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/youtube/bulk-check")
        assert response.status_code == 401
        print("SUCCESS: Bulk check endpoint requires authentication")
    
    def test_bulk_check_endpoint(self, auth_token):
        """GET /api/youtube/bulk-check - Full video health check (admin only)"""
        # Note: This can take a long time with many videos - we just verify structure
        response = requests.get(
            f"{BASE_URL}/api/youtube/bulk-check",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=300  # 5 min timeout for full check
        )
        assert response.status_code == 200, f"Bulk check failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "total_videos" in data
        assert "checked" in data
        assert "playable" in data
        assert "age_restricted" in data
        assert "unavailable" in data
        assert "skipped" in data
        assert "age_restricted_videos" in data
        assert "unavailable_videos" in data
        assert "channels_summary" in data
        assert "cookies_configured" in data
        
        # Verify summary totals add up
        assert data["playable"] + data["age_restricted"] + data["unavailable"] == data["checked"]
        
        print(f"SUCCESS: Bulk check completed - total: {data['total_videos']}, checked: {data['checked']}, playable: {data['playable']}, age_restricted: {data['age_restricted']}, unavailable: {data['unavailable']}")
        return data
    
    def test_cookies_status_requires_auth(self):
        """GET /api/youtube/cookies/status requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/youtube/cookies/status")
        assert response.status_code == 401
        print("SUCCESS: Cookies status endpoint requires authentication")
    
    def test_cookies_status_endpoint(self, auth_token):
        """GET /api/youtube/cookies/status - Check cookies configuration"""
        response = requests.get(
            f"{BASE_URL}/api/youtube/cookies/status",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "configured" in data
        if data["configured"]:
            assert "file_size" in data
            assert "working" in data
        else:
            assert "message" in data
        
        print(f"SUCCESS: Cookies status - configured: {data['configured']}")
    
    def test_stream_info_endpoint(self):
        """GET /api/youtube/stream-info/{videoId} - Get stream info for a video"""
        response = requests.get(f"{BASE_URL}/api/youtube/stream-info/dQw4w9WgXcQ")
        assert response.status_code == 200
        
        data = response.json()
        assert "success" in data
        if data["success"]:
            assert "url" in data
            assert "used_cookies" in data
        else:
            assert "error" in data or "cookies_available" in data
        
        print(f"SUCCESS: Stream info endpoint works - success: {data['success']}")


# Cleanup any TEST_ prefixed channels after tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    yield
    # Cleanup after all tests
    try:
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code == 200:
            token = login_resp.json()["access_token"]
            channels = requests.get(
                f"{BASE_URL}/api/channels/my",
                headers={"Authorization": f"Bearer {token}"}
            ).json()
            
            for channel in channels:
                if channel["name"].startswith("TEST_"):
                    requests.delete(
                        f"{BASE_URL}/api/channels/{channel['id']}",
                        headers={"Authorization": f"Bearer {token}"}
                    )
            print("Cleanup: Removed TEST_ prefixed channels")
    except Exception as e:
        print(f"Cleanup warning: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
