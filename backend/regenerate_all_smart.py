"""One-off: regenerate today's schedule for every channel using the new smart
rules (daily seed + 48h cooldown + show de-interleave + no-same-show-same-hour).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from server import db, generate_24h_schedule, get_eastern_date, _show_key


async def main():
    today = get_eastern_date()
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)
    print(f"Regenerating schedules for {len(channels)} channels on {today} with smart rules...")

    total_clashes = 0
    checked = 0
    for ch in channels:
        vids = ch.get("videos") or []
        if not vids:
            continue
        await db.schedules.delete_one({"channel_id": ch["id"], "schedule_date": today})
        sched = await generate_24h_schedule(ch, today, force_random=False)
        await db.schedules.insert_one(sched)

        # Quick sanity check: no clashes with yesterday within this channel
        from datetime import datetime as _dt, timedelta as _td
        yday = (_dt.strptime(today, '%Y-%m-%d') - _td(days=1)).strftime('%Y-%m-%d')
        yesterday = await db.schedules.find_one(
            {"channel_id": ch["id"], "schedule_date": yday}, {"_id": 0}
        )
        if yesterday:
            def by_hour(s):
                m = {}
                for v in s.get("videos", []):
                    st = v.get("start_time") or ""
                    try:
                        h = int(st.split(":")[0])
                    except Exception:
                        continue
                    k = _show_key(v.get("title") or "")
                    if k:
                        m.setdefault(h, set()).add(k)
                return m
            a = by_hour(sched)
            b = by_hour(yesterday)
            clashes = sum(len(a.get(h, set()) & b.get(h, set())) for h in range(24))
            distinct = len({_show_key(v.get('title','')) for v in vids if _show_key(v.get('title',''))})
            marker = " *" if clashes > 0 and distinct >= 24 else ""
            print(f"  {ch['name'][:35]:35s}  distinct={distinct:3d}  hour-slot clashes vs yesterday: {clashes}{marker}")
            total_clashes += clashes
            checked += 1
        else:
            print(f"  {ch['name'][:35]:35s}  (no yesterday schedule to compare)")

    print(f"\nDone. Total hour-slot clashes across {checked} channels: {total_clashes}")


asyncio.run(main())
