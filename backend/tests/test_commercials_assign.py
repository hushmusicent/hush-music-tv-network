"""
Tests for the Commercials Manager assign/register endpoints.
Verifies that stale channel_ids are silently dropped instead of failing.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hush-music-tv-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Hushmusicent419@gmail.com"
ADMIN_PASSWORD = "sstisdd419"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def channels(auth_headers):
    r = requests.get(f"{API}/channels", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    chs = r.json()
    assert isinstance(chs, list) and len(chs) >= 1, "Need at least 1 channel for tests"
    return chs


@pytest.fixture(scope="module")
def commercials(auth_headers):
    r = requests.get(f"{API}/commercials", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    return r.json()


# --- GET commercials ---
class TestGetCommercials:
    def test_list_commercials_have_name_and_url(self, commercials):
        assert isinstance(commercials, list)
        # Not strictly enforced if list is empty, but if present validate fields
        for c in commercials[:5]:
            assert "id" in c
            assert "original_name" in c
            assert "url" in c


# --- PUT /commercials/{id}/assign ---
class TestAssignCommercial:
    def _pick_commercial(self, commercials, auth_headers):
        if commercials:
            return commercials[0]["id"], False
        # Create a fake one through register for testing
        payload = {
            "video_id": f"TEST_{uuid.uuid4()}",
            "video_url": "/api/videos/TEST.mp4",
            "original_name": "TEST_commercial.mp4",
            "duration": 30,
            "size": 0,
            "channel_ids": [],
            "is_global": True,
        }
        r = requests.post(f"{API}/commercials/register", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"], True

    def test_assign_mixed_stale_and_valid(self, auth_headers, commercials, channels):
        cid, created = self._pick_commercial(commercials, auth_headers)
        valid_chan = channels[0]["id"]
        stale_id = f"fake-channel-stale-{uuid.uuid4()}"
        payload = {"channel_ids": [stale_id, valid_chan], "is_global": False}
        r = requests.put(f"{API}/commercials/{cid}/assign", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert stale_id not in data.get("channel_ids", []), "stale ID should be dropped"
        assert valid_chan in data.get("channel_ids", []), "valid ID should be kept"
        assert data.get("is_global") is False
        if created:
            requests.delete(f"{API}/commercials/{cid}", headers=auth_headers, timeout=15)

    def test_assign_only_stale_becomes_global(self, auth_headers, commercials):
        cid, created = self._pick_commercial(commercials, auth_headers)
        stale_a = f"fake-stale-a-{uuid.uuid4()}"
        stale_b = f"fake-stale-b-{uuid.uuid4()}"
        payload = {"channel_ids": [stale_a, stale_b], "is_global": False}
        r = requests.put(f"{API}/commercials/{cid}/assign", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_global") is True, f"should be global, got {data}"
        assert data.get("channel_ids") == []
        if created:
            requests.delete(f"{API}/commercials/{cid}", headers=auth_headers, timeout=15)

    def test_assign_is_global_true_clears_channels(self, auth_headers, commercials, channels):
        cid, created = self._pick_commercial(commercials, auth_headers)
        payload = {"channel_ids": [channels[0]["id"]], "is_global": True}
        r = requests.put(f"{API}/commercials/{cid}/assign", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_global") is True
        assert data.get("channel_ids") == []
        if created:
            requests.delete(f"{API}/commercials/{cid}", headers=auth_headers, timeout=15)

    def test_assign_all_valid_preserved(self, auth_headers, commercials, channels):
        cid, created = self._pick_commercial(commercials, auth_headers)
        valid_ids = [c["id"] for c in channels[:2]]
        payload = {"channel_ids": valid_ids, "is_global": False}
        r = requests.put(f"{API}/commercials/{cid}/assign", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert sorted(data.get("channel_ids", [])) == sorted(valid_ids)
        assert data.get("is_global") is False
        if created:
            requests.delete(f"{API}/commercials/{cid}", headers=auth_headers, timeout=15)


# --- POST /commercials/register ---
class TestRegisterCommercial:
    def test_register_drops_stale_keeps_valid(self, auth_headers, channels):
        valid_chan = channels[0]["id"]
        stale_id = f"fake-stale-reg-{uuid.uuid4()}"
        payload = {
            "video_id": f"TEST_{uuid.uuid4()}",
            "video_url": "/api/videos/TEST_REG.mp4",
            "original_name": "TEST_register.mp4",
            "duration": 30,
            "size": 0,
            "channel_ids": [stale_id, valid_chan],
            "is_global": False,
        }
        r = requests.post(f"{API}/commercials/register", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        try:
            assert stale_id not in data["channel_ids"]
            assert valid_chan in data["channel_ids"]
            assert data["is_global"] is False

            # Verify persistence
            cid = data["id"]
            list_r = requests.get(f"{API}/commercials", headers=auth_headers, timeout=30)
            assert list_r.status_code == 200
            found = next((c for c in list_r.json() if c["id"] == cid), None)
            assert found is not None
            assert stale_id not in found["channel_ids"]
            assert valid_chan in found["channel_ids"]
        finally:
            requests.delete(f"{API}/commercials/{data['id']}", headers=auth_headers, timeout=15)
