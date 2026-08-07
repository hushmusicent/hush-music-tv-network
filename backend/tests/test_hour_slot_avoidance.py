"""Test the new hour-slot avoidance algorithm.

Rule: A show that started in hour H on any of the last 7 days must not start
in hour H today.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import asyncio
from datetime import datetime, timedelta

# Import from server module (functions we want to exercise)
from server import (
    _show_key,
    _avoid_same_hour_slot,
    _get_hour_slot_shows,
    generate_24h_schedule,
    db,
)


def _lay_out_schedule(videos):
    """Simulate schedule placement: return list of (hour_of_start, show_key)."""
    cursor = 0
    out = []
    for v in videos:
        d = v.get("duration") or 300
        if d <= 0:
            d = 300
        hour = (cursor // 3600) % 24
        out.append((hour, _show_key(v.get("title", ""))))
        cursor += d
    return out


def test_avoid_same_hour_swaps():
    videos = [
        {"id": "a1", "title": "The Parkers - S01E01", "duration": 1800},
        {"id": "b1", "title": "Iliza Show - Ep 3", "duration": 1800},
        {"id": "a2", "title": "The Parkers - S01E02", "duration": 1800},
        {"id": "c1", "title": "Webster - 04", "duration": 1800},
        {"id": "b2", "title": "Iliza Show - Ep 5", "duration": 1800},
    ]
    # Yesterday: 'the_parkers' started in hour 0, 'iliza_show' started in hour 1
    conflicts = {0: {"the_parkers"}, 1: {"iliza_show"}}
    out = _avoid_same_hour_slot(videos, conflicts)
    layout = _lay_out_schedule(out)
    print("Result layout (hour, show_key):", layout)
    # The show at hour 0 must NOT be 'the_parkers'
    hour0 = [k for h, k in layout if h == 0]
    hour1 = [k for h, k in layout if h == 1]
    assert "the_parkers" not in hour0, f"the_parkers still at hour 0: {layout}"
    assert "iliza_show" not in hour1, f"iliza_show still at hour 1: {layout}"
    print("PASS: hour-slot swap correctly moved conflicting shows away")


def test_empty_conflicts_noop():
    videos = [
        {"id": "a1", "title": "Foo", "duration": 600},
        {"id": "a2", "title": "Bar", "duration": 600},
    ]
    out = _avoid_same_hour_slot(videos, {})
    assert out == videos, "Empty conflicts should leave list unchanged"
    print("PASS: empty conflicts is no-op")


async def test_e2e_two_day_schedule():
    """Generate a schedule for a real channel two days in a row and verify no
    show starts in the same hour on both days.
    """
    ch = await db.channels.find_one(
        {"videos.10": {"$exists": True}}, {"_id": 0}
    )
    if not ch:
        print("SKIP: no channel with >=10 videos found in DB")
        return
    channel_id = ch["id"]
    today = datetime.utcnow().strftime("%Y-%m-%d")
    tomorrow = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")

    # Wipe any existing schedules to force fresh generation
    await db.schedules.delete_many(
        {"channel_id": channel_id, "schedule_date": {"$in": [today, tomorrow]}}
    )

    sched_today = await generate_24h_schedule(ch, today)
    # Persist today's schedule so tomorrow's generator sees it
    await db.schedules.insert_one(sched_today)

    sched_tomorrow = await generate_24h_schedule(ch, tomorrow)

    # Build {hour: set(show_keys)} for both days
    def by_hour(sched):
        m = {}
        for v in sched.get("videos", []):
            start = v.get("start_time") or ""
            try:
                h = int(start.split(":")[0])
            except Exception:
                continue
            k = _show_key(v.get("title") or "")
            if k:
                m.setdefault(h, set()).add(k)
        return m

    a = by_hour(sched_today)
    b = by_hour(sched_tomorrow)
    clashes = []
    for h in range(24):
        overlap = a.get(h, set()) & b.get(h, set())
        if overlap:
            clashes.append((h, overlap))

    print(f"Channel: {ch['name']}  Today hours: {len(a)}  Tomorrow hours: {len(b)}")
    print(f"Distinct shows in channel: {len({_show_key(v.get('title','')) for v in ch.get('videos', [])})}")

    # We expect ZERO clashes when the channel has enough distinct shows to
    # cover all hours. When distinct_shows < 24 some clashes are unavoidable.
    distinct = len({_show_key(v.get("title", "")) for v in ch.get("videos", []) if _show_key(v.get("title", ""))})
    if distinct >= 24:
        assert not clashes, f"Found {len(clashes)} hour-slot clashes: {clashes[:5]}"
        print(f"PASS: 0 hour-slot clashes across 24 hours ({distinct} distinct shows)")
    else:
        print(f"INFO: {len(clashes)} clashes found (expected when distinct_shows={distinct} < 24)")

    # Clean up
    await db.schedules.delete_many(
        {"channel_id": channel_id, "schedule_date": {"$in": [today, tomorrow]}}
    )


if __name__ == "__main__":
    test_empty_conflicts_noop()
    test_avoid_same_hour_swaps()
    asyncio.run(test_e2e_two_day_schedule())
    print("\nAll tests done.")
