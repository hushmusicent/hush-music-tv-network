import requests
import sys
import json
from datetime import datetime

class TVNetworkAdminAPITester:
    def __init__(self, base_url="https://broadcaster.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.channel_id = None
        self.video_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.errors = []
        # Admin credentials
        self.admin_email = "Hushmusicent419@gmail.com"
        self.admin_password = "sstisdd419"

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED")
        else:
            print(f"❌ {name}: FAILED - {details}")
            self.errors.append(f"{name}: {details}")

    def make_request(self, method, endpoint, data=None, auth=True):
        """Make HTTP request with proper headers"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if auth and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except Exception as e:
            return None, str(e)

    def test_health_check(self):
        """Test basic API health"""
        print("\n🔍 Testing Health Check...")
        response = self.make_request('GET', '', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Health Check", False, response[1])
            return False
            
        success = response.status_code == 200
        self.log_test("Health Check", success, f"Status: {response.status_code}")
        return success

    def test_seed_data(self):
        """Seed sample data"""
        print("\n🔍 Testing Seed Data...")
        response = self.make_request('POST', 'seed', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Seed Data", False, response[1])
            return False
            
        success = response.status_code in [200, 400]  # 400 if already seeded
        self.log_test("Seed Data", success, f"Status: {response.status_code}")
        return True  # Always pass as seeding might already be done

    def test_categories(self):
        """Test categories endpoint"""
        print("\n🔍 Testing Categories...")
        response = self.make_request('GET', 'categories', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Get Categories", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            data = response.json()
            success = isinstance(data, list) and len(data) > 0
            self.log_test("Get Categories", success, f"Found {len(data)} categories")
        else:
            self.log_test("Get Categories", False, f"Status: {response.status_code}")
        return success

    def test_user_registration(self):
        """Test user registration"""
        print("\n🔍 Testing User Registration...")
        timestamp = datetime.now().strftime('%H%M%S')
        user_data = {
            "email": f"test_{timestamp}@tvnetwork.com",
            "username": f"testuser_{timestamp}",
            "password": "testpass123"
        }
        
        response = self.make_request('POST', 'auth/register', user_data, auth=False)
        
        if isinstance(response, tuple):
            self.log_test("User Registration", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            data = response.json()
            self.token = data.get('access_token')
            self.user_id = data.get('user', {}).get('id')
            success = bool(self.token and self.user_id)
            self.log_test("User Registration", success, f"Got token: {bool(self.token)}")
        else:
            self.log_test("User Registration", False, f"Status: {response.status_code}, Response: {response.text}")
        return success

    def test_user_profile(self):
        """Test user profile endpoint"""
        print("\n🔍 Testing User Profile...")
        response = self.make_request('GET', 'auth/me')
        
        if isinstance(response, tuple):
            self.log_test("Get User Profile", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            data = response.json()
            success = 'id' in data and 'username' in data
            self.log_test("Get User Profile", success, f"User ID: {data.get('id')}")
        else:
            self.log_test("Get User Profile", False, f"Status: {response.status_code}")
        return success

    def test_channels_public(self):
        """Test public channels endpoints"""
        print("\n🔍 Testing Public Channels...")
        
        # Test get all channels
        response = self.make_request('GET', 'channels', auth=False)
        if isinstance(response, tuple):
            self.log_test("Get All Channels", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            channels = response.json()
            success = isinstance(channels, list)
            self.log_test("Get All Channels", success, f"Found {len(channels)} channels")
        else:
            self.log_test("Get All Channels", False, f"Status: {response.status_code}")
            return False

        # Test featured channels
        response = self.make_request('GET', 'channels/featured', auth=False)
        if isinstance(response, tuple):
            self.log_test("Get Featured Channels", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            featured = response.json()
            success = isinstance(featured, list)
            self.log_test("Get Featured Channels", success, f"Found {len(featured)} featured channels")
        else:
            self.log_test("Get Featured Channels", False, f"Status: {response.status_code}")
            
        return success

    def test_channel_creation(self):
        """Test channel creation"""
        print("\n🔍 Testing Channel Creation...")
        channel_data = {
            "name": "Test Channel",
            "description": "A test channel for automated testing",
            "category": "Entertainment",
            "is_public": True,
            "is_24_7": True
        }
        
        response = self.make_request('POST', 'channels', channel_data)
        
        if isinstance(response, tuple):
            self.log_test("Create Channel", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            channel = response.json()
            self.channel_id = channel.get('id')
            success = bool(self.channel_id)
            self.log_test("Create Channel", success, f"Channel ID: {self.channel_id}")
        else:
            self.log_test("Create Channel", False, f"Status: {response.status_code}, Response: {response.text}")
        return success

    def test_add_video_to_channel(self):
        """Test adding video to channel"""
        if not self.channel_id:
            self.log_test("Add Video to Channel", False, "No channel ID available")
            return False
            
        print("\n🔍 Testing Add Video to Channel...")
        video_data = {
            "youtube_id": "jfKfPfyJRdk",
            "title": "Test Video - Lofi Hip Hop",
            "duration": 3600
        }
        
        response = self.make_request('POST', f'channels/{self.channel_id}/videos', video_data)
        
        if isinstance(response, tuple):
            self.log_test("Add Video to Channel", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            channel = response.json()
            videos = channel.get('videos', [])
            if videos:
                self.video_id = videos[0].get('id')
            success = len(videos) > 0
            self.log_test("Add Video to Channel", success, f"Videos in channel: {len(videos)}")
        else:
            self.log_test("Add Video to Channel", False, f"Status: {response.status_code}")
        return success

    def test_get_channel_by_id(self):
        """Test getting specific channel"""
        if not self.channel_id:
            self.log_test("Get Channel by ID", False, "No channel ID available")
            return False
            
        print("\n🔍 Testing Get Channel by ID...")
        response = self.make_request('GET', f'channels/{self.channel_id}', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Get Channel by ID", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            channel = response.json()
            success = channel.get('id') == self.channel_id
            self.log_test("Get Channel by ID", success, f"Channel name: {channel.get('name')}")
        else:
            self.log_test("Get Channel by ID", False, f"Status: {response.status_code}")
        return success

    def test_my_channels(self):
        """Test getting user's own channels"""
        print("\n🔍 Testing My Channels...")
        response = self.make_request('GET', 'channels/my')
        
        if isinstance(response, tuple):
            self.log_test("Get My Channels", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            channels = response.json()
            success = isinstance(channels, list) and len(channels) > 0
            self.log_test("Get My Channels", success, f"Found {len(channels)} own channels")
        else:
            self.log_test("Get My Channels", False, f"Status: {response.status_code}")
        return success

    def test_favorites(self):
        """Test favorites functionality"""
        if not self.channel_id:
            self.log_test("Favorites Test", False, "No channel ID available")
            return False
            
        print("\n🔍 Testing Favorites...")
        
        # Add to favorites
        response = self.make_request('POST', f'favorites/{self.channel_id}')
        
        if isinstance(response, tuple):
            self.log_test("Add to Favorites", False, response[1])
            return False
            
        success = response.status_code == 200
        self.log_test("Add to Favorites", success, f"Status: {response.status_code}")
        
        if not success:
            return False

        # Get favorites
        response = self.make_request('GET', 'favorites')
        
        if isinstance(response, tuple):
            self.log_test("Get Favorites", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            favorites = response.json()
            success = isinstance(favorites, list)
            self.log_test("Get Favorites", success, f"Found {len(favorites)} favorites")
        else:
            self.log_test("Get Favorites", False, f"Status: {response.status_code}")
            
        return success

    def test_tv_guide(self):
        """Test TV guide endpoint"""
        print("\n🔍 Testing TV Guide...")
        response = self.make_request('GET', 'tv-guide', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Get TV Guide", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            guide = response.json()
            success = isinstance(guide, list)
            self.log_test("Get TV Guide", success, f"Found {len(guide)} channels in guide")
        else:
            self.log_test("Get TV Guide", False, f"Status: {response.status_code}")
        return success

    def test_channel_search(self):
        """Test channel search functionality"""
        print("\n🔍 Testing Channel Search...")
        response = self.make_request('GET', 'channels?search=Test', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Channel Search", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            results = response.json()
            success = isinstance(results, list)
            self.log_test("Channel Search", success, f"Found {len(results)} search results")
        else:
            self.log_test("Channel Search", False, f"Status: {response.status_code}")
        return success

    def test_channel_category_filter(self):
        """Test channel filtering by category"""
        print("\n🔍 Testing Channel Category Filter...")
        response = self.make_request('GET', 'channels?category=Entertainment', auth=False)
        
        if isinstance(response, tuple):
            self.log_test("Category Filter", False, response[1])
            return False
            
        success = response.status_code == 200
        if success:
            results = response.json()
            success = isinstance(results, list)
            self.log_test("Category Filter", success, f"Found {len(results)} Entertainment channels")
        else:
            self.log_test("Category Filter", False, f"Status: {response.status_code}")
        return success

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting TV Network API Tests...")
        print(f"Testing against: {self.base_url}")
        
        # Basic tests
        if not self.test_health_check():
            print("❌ Health check failed - API might be down")
            return False
            
        self.test_seed_data()
        
        # Public endpoints
        self.test_categories()
        self.test_channels_public()
        self.test_tv_guide()
        self.test_channel_search()
        self.test_channel_category_filter()
        
        # Auth required tests
        if self.test_user_registration():
            self.test_user_profile()
            self.test_channel_creation()
            self.test_add_video_to_channel()
            self.test_get_channel_by_id()
            self.test_my_channels()
            self.test_favorites()
        else:
            print("❌ User registration failed - skipping auth-required tests")
        
        # Print summary
        print(f"\n📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        if self.errors:
            print("\n❌ Failed Tests:")
            for error in self.errors:
                print(f"  - {error}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = TVNetworkAPITester()
    success = tester.run_all_tests()
    
    # Return results for external processing
    results = {
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "failed_tests": tester.tests_run - tester.tests_passed,
        "success_rate": (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
        "errors": tester.errors
    }
    
    print(f"\n📈 Success Rate: {results['success_rate']:.1f}%")
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())