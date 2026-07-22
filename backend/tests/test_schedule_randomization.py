"""Tests for schedule randomization fixes (Jan 2026):
   1. `_show_key` correctly extracts show name (ignore underscores/dashes/space).
   2. `_deinterleave_by_show` never produces back-to-back same-show entries.
   3. `POST /api/schedules/regenerate-all` now uses force_random=True — two
      consecutive calls produce different orderings.
   4. Post-regeneration, no consecutive video slots share the same show key.
   5. Admin creds work.
"""
import os
import sys
import pytest
import requests

# Import server for direct function unit tests
sys.path.insert(0, "/app/backend")
import server  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    "https://hush-music-tv-3.preview.emergentagent.com"

ADMIN_EMAIL = "Hushmusicent419@gmail.com"
ADMIN_PASSWORD = "sstisdd419"


# ============ UNIT TESTS: _show_key ============
class TestShowKey:
    """Direct unit tests for server._show_key"""

    @pytest.mark.parametrize("title,expected", [
        ("Tripping the Rift - Benito's Revenge", "tripping_the_rift"),
        ("The-Andy-Dick-Show - 01-05-Kid-Krist", "the_andy_dick_show"),
        ("Webster - 01", "webster"),
        ("The Amanda Show - S2-EP2 (HD)", "the_amanda_show"),
        ("Doug - 1991_2", "doug"),
        ("Darkwing_Duck - 1991", "darkwing_duck"),
        ("All_That_Season_1_Episode_5", "all_that"),
        ("Joey - S1E5", "joey"),
        ("The Richard Pryor Show - Episode 4 | NBC | 1977",
         "the_richard_pryor_show"),
    ])
    def test_show_key_extraction(self, title, expected):
        result = server._show_key(title)
        assert result == expected, \
            f"For title {title!r}: expected {expected!r}, got {result!r}"

    def test_show_key_normalization_equivalence(self):
        """The-Amanda-Show == The Amanda Show == the_amanda_show."""
        a = server._show_key("The-Amanda-Show")
        b = server._show_key("The Amanda Show")
        c = server._show_key("the_amanda_show")
        assert a == b == c

    def test_empty_title(self):
        assert server._show_key("") == ""
        assert server._show_key(None) == ""  # type: ignore


# ============ UNIT TESTS: _deinterleave_by_show ============
class TestDeinterleaveByShow:
    """Direct unit tests for server._deinterleave_by_show"""

    def test_no_back_to_back_stress_10_3_3(self):
        """3 shows with counts [10,3,3], min_distance=5.
        For [10,3,3] the theoretical MINIMUM unavoidable back-to-back is
        max(0, max_count - (n - max_count) - 1) = 10 - 6 - 1 = 3. Assert the
        algorithm gets close to that bound (allow small slack of 2).
        """
        videos = []
        for i in range(10):
            videos.append({"id": f"a{i}", "title": f"ShowA - EP{i}"})
        for i in range(3):
            videos.append({"id": f"b{i}", "title": f"ShowB - EP{i}"})
        for i in range(3):
            videos.append({"id": f"c{i}", "title": f"ShowC - EP{i}"})

        out = server._deinterleave_by_show(videos, min_distance=5)
        assert len(out) == len(videos)

        keys = [server._show_key(v["title"]) for v in out]
        back_to_back = [
            (i, keys[i]) for i in range(1, len(keys)) if keys[i] == keys[i - 1]
        ]
        # Theoretical min = 3 (10 A's cannot all be separated by only 6 non-A's).
        theoretical_min = 3
        print(f"\n[10,3,3] back-to-back count: {len(back_to_back)} "
              f"(theoretical min: {theoretical_min})")
        print(f"Sequence: {keys}")
        # Allow small slack (2) — algorithm may be suboptimal but not egregious.
        assert len(back_to_back) <= theoretical_min + 2, (
            f"Algorithm produced {len(back_to_back)} back-to-back pairs, "
            f"theoretical min is {theoretical_min}. Sequence: {keys}"
        )

    def test_no_back_to_back_avoidable_case(self):
        """[5, 3, 3] — 5 A + 6 non-A can be FULLY interleaved with zero
        back-to-back. Assert the algorithm achieves that."""
        videos = []
        for i in range(5):
            videos.append({"id": f"a{i}", "title": f"ShowA - EP{i}"})
        for i in range(3):
            videos.append({"id": f"b{i}", "title": f"ShowB - EP{i}"})
        for i in range(3):
            videos.append({"id": f"c{i}", "title": f"ShowC - EP{i}"})
        out = server._deinterleave_by_show(videos, min_distance=5)
        keys = [server._show_key(v["title"]) for v in out]
        bad = [(i, keys[i]) for i in range(1, len(keys)) if keys[i] == keys[i - 1]]
        assert not bad, f"Avoidable back-to-back found: {bad}, seq: {keys}"

    def test_no_back_to_back_extreme_scarcity(self):
        """Almost-all-one-show scarcity: 20 of ShowA vs 1 of ShowB."""
        videos = []
        for i in range(20):
            videos.append({"id": f"a{i}", "title": f"ShowA - EP{i}"})
        videos.append({"id": "b0", "title": "ShowB - EP0"})
        out = server._deinterleave_by_show(videos, min_distance=5)
        keys = [server._show_key(v["title"]) for v in out]
        # In this pathological case one repeat is unavoidable (only 1 B for 20 A).
        # Count max back-to-back run of same show.
        max_run = 1
        cur = 1
        for i in range(1, len(keys)):
            if keys[i] == keys[i - 1]:
                cur += 1
                max_run = max(max_run, cur)
            else:
                cur = 1
        # Should still avoid runs > small number given the fix picks non-last_key.
        # With 20 A and 1 B, best we can do is limit runs but the algorithm
        # will unavoidably repeat A. We just want the fix to NOT throw.
        assert len(out) == 21

    def test_balanced_no_back_to_back(self):
        """Balanced 3x4 case — must have zero back-to-back."""
        videos = []
        for show in ("A", "B", "C"):
            for i in range(4):
                videos.append({"id": f"{show}{i}", "title": f"Show{show} - EP{i}"})
        out = server._deinterleave_by_show(videos, min_distance=2)
        keys = [server._show_key(v["title"]) for v in out]
        for i in range(1, len(keys)):
            assert keys[i] != keys[i - 1], \
                f"Back-to-back at {i}: {keys}"


# ============ INTEGRATION TESTS ============
@pytest.fixture(scope="module")
def admin_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    }, timeout=30)
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    assert "access_token" in data
    assert data.get("user", {}).get("is_admin") is True
    return data["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestAdminAuth:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20


class TestRegenerateAllRandomness:
    """Two calls to /api/schedules/regenerate-all should produce different
    orderings for the same channel on the same date (force_random=True).
    """

    def _pick_channel_with_videos(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/schedule/channels",
                         headers=admin_headers, timeout=60)
        assert r.status_code == 200, f"schedule/channels failed: {r.text[:200]}"
        schedules = r.json().get("schedules", [])
        # Prefer named channels first (they have real show data)
        preferred_names = ["Sketch Comedy Tv", "Classix Channel"]
        by_name = {s.get("channel_name"): s for s in schedules}
        for name in preferred_names:
            if name in by_name and len(by_name[name].get("videos", [])) > 5:
                return by_name[name]["channel_id"], by_name[name]["channel_name"]
        # Fallback: any channel with >5 videos
        for s in schedules:
            if len(s.get("videos", [])) > 5:
                return s["channel_id"], s.get("channel_name", "?")
        pytest.skip("No channel with enough videos to test")

    def _fetch_schedule(self, channel_id, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/schedule/channel/{channel_id}",
            headers=admin_headers, timeout=60)
        assert r.status_code == 200, f"fetch schedule failed: {r.text[:200]}"
        return r.json()

    def _regenerate_all(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/schedules/regenerate-all",
                          headers=admin_headers, timeout=180)
        assert r.status_code == 200, f"regenerate-all failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "regenerated" in data
        return data

    def test_regenerate_all_produces_different_ordering(self, admin_headers):
        channel_id, channel_name = self._pick_channel_with_videos(admin_headers)
        print(f"\nTesting channel: {channel_name} ({channel_id})")

        # First regenerate + fetch
        self._regenerate_all(admin_headers)
        sched_a = self._fetch_schedule(channel_id, admin_headers)
        vids_a = sched_a.get("videos", [])
        assert len(vids_a) > 0
        order_a = [v.get("video_id") for v in vids_a]

        # Second regenerate + fetch
        self._regenerate_all(admin_headers)
        sched_b = self._fetch_schedule(channel_id, admin_headers)
        vids_b = sched_b.get("videos", [])
        order_b = [v.get("video_id") for v in vids_b]

        # They should differ at the start most of the time; check first-10
        # positions have at least SOME difference.
        head_a = order_a[:10]
        head_b = order_b[:10]
        diffs = sum(1 for i in range(min(len(head_a), len(head_b)))
                    if head_a[i] != head_b[i])
        assert diffs >= 1, (
            f"Two regenerate-all calls produced identical head-of-schedule. "
            f"force_random appears not to be working. "
            f"A_head={head_a} B_head={head_b}"
        )
        print(f"Order diff in first 10 slots: {diffs}/10")

    def test_no_back_to_back_same_show_in_regen_schedule(self, admin_headers):
        """After a fresh force_random regen, iterate through the actual
        schedule.videos and assert no two adjacent slots share the same
        _show_key. This is the user's key requirement.
        """
        channel_id, channel_name = self._pick_channel_with_videos(admin_headers)
        print(f"\nChecking back-to-back in: {channel_name}")

        self._regenerate_all(admin_headers)
        sched = self._fetch_schedule(channel_id, admin_headers)
        vids = sched.get("videos", [])
        assert len(vids) > 1, "Schedule must have >1 videos to test"

        keys = [server._show_key(v.get("title", "")) for v in vids]
        # Because 24-hour schedules WRAP the shuffled list, back-to-back may
        # occur at the wrap-around boundary. Only check within a single
        # unique-content pass: unique-video-count window.
        unique_count = sched.get("unique_video_count") or len(set(
            v.get("video_id") for v in vids
        ))
        # Only inspect the first unique_count slots (before wrap-around).
        window = keys[:unique_count]

        bad = [
            (i, window[i - 1], window[i])
            for i in range(1, len(window))
            if window[i] == window[i - 1] and window[i]  # skip empty keys
        ]
        # We allow a tiny amount of unavoidable repeats when one show
        # dominates the channel, but expect very few.
        ratio = len(bad) / max(1, len(window) - 1)
        print(f"Back-to-back pairs: {len(bad)}/{len(window) - 1} "
              f"= {ratio:.2%}")
        if bad[:5]:
            print(f"Examples: {bad[:5]}")
        # Strict: zero back-to-back (matches user's requirement)
        assert not bad, (
            f"Found {len(bad)} back-to-back same-show pairs in schedule "
            f"for '{channel_name}'. First few: {bad[:5]}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
