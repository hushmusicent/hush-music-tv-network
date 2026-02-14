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
