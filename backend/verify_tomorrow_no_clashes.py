"""Generate TOMORROW'S schedule for every channel, then verify no show plays
in the same hour-slot as today. This is the real proof-of-work for the new
algorithm.
"""
import asyncio
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from server import db, generate_24h_schedule, get_eastern_date, _show_key


async def main():
    today = get_eastern_date()
    tomorrow = (datetime.strptime(today, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
    channels = await db.channels.find({}, {"_id": 0}).to_list(None)

    print(f"Generating {tomorrow} schedules for {len(channels)} channels and checking against {today}...\n")

    def by_hour(sched):
        m = {}
        for v in (sched or {}).get("videos", []):
            st = v.get("start_time") or ""
            try:
                h = int(st.split(":")[0])
            except Exception:
                continue
            k = _show_key(v.get("title") or "")
            if k:
                m.setdefault(h, set()).add(k)
        return m

    total_ch = 0
    total_clashes = 0
    perfect = 0
    unavoidable = 0
    reported = []

    for ch in channels:
        vids = ch.get("videos") or []
        if not vids:
            continue
        await db.schedules.delete_one({"channel_id": ch["id"], "schedule_date": tomorrow})
        sched_tmr = await generate_24h_schedule(ch, tomorrow, force_random=False)
        await db.schedules.insert_one(sched_tmr)

        sched_today = await db.schedules.find_one(
            {"channel_id": ch["id"], "schedule_date": today}, {"_id": 0}
        )
        a = by_hour(sched_today)
        b = by_hour(sched_tmr)
        clashes = sum(len(a.get(h, set()) & b.get(h, set())) for h in range(24))
        distinct = len({_show_key(v.get('title','')) for v in vids if _show_key(v.get('title',''))})

        total_ch += 1
        total_clashes += clashes
        if clashes == 0:
            perfect += 1
        elif distinct < 24:
            unavoidable += 1

        if clashes > 0:
            reported.append((ch['name'], distinct, clashes))

    print(f"Channels regenerated: {total_ch}")
    print(f"Channels with ZERO hour-slot clashes: {perfect} / {total_ch}  ({perfect*100//max(total_ch,1)}%)")
    print(f"Channels with clashes but distinct<24 (unavoidable): {unavoidable}")
    print(f"Total hour-slot clashes: {total_clashes}\n")

    if reported:
        print("Channels with residual clashes:")
        for name, distinct, cl in sorted(reported, key=lambda x: -x[2])[:15]:
            reason = "UNAVOIDABLE (not enough distinct shows)" if distinct < 24 else "unexpected"
            print(f"  {name[:35]:35s}  distinct={distinct:3d}  clashes={cl}  {reason}")


asyncio.run(main())
