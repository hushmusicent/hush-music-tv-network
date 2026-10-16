#!/usr/bin/env python3
"""Midnight-outage fix for Hush Music TV Network backend (backend/server.py).

Problem: at midnight ET the date rolls over, /api/schedule/live finds no
schedules for the new date across all 89 channels, and tries to generate them
all serially -> takes minutes -> Fire TV client times out after 30s.

Fix (two parts):
  Part 1 - serve stale while regenerating: missing channels serve YESTERDAY's
           schedule immediately (flagged "stale": true) while today's real
           schedule regenerates in a background task. The endpoint never blocks.
  Part 2 - nightly prewarm: a background coroutine generates tomorrow's
           schedules every night at 23:00 ET, so the rollover usually finds
           everything already done.

Usage (Emergent patch flow):
    python3 tv-midnight-fix-patch.py            # patches backend/server.py in place
    python3 -c "import ast; ast.parse(open('backend/server.py').read()); print('syntax OK')"

Idempotent: safe to run twice (each replacement asserts its anchor is present
exactly once and skips if the new code is already there).
"""
import sys

PATH = "backend/server.py"


def replace_once(src: str, old: str, new: str, label: str) -> str:
    if new.strip()[:60] in src:
        print(f"[skip] {label}: already applied")
        return src
    count = src.count(old)
    if count != 1:
        print(f"[FAIL] {label}: anchor found {count}x (expected 1). Aborting.")
        sys.exit(1)
    print(f"[ok] {label}")
    return src.replace(old, new, 1)


def main() -> None:
    with open(PATH) as f:
        src = f.read()

    # ------------------------------------------------------------------
    # Part 1a: background-regen helpers, inserted just before the
    #          /schedule/live endpoint.
    # ------------------------------------------------------------------
    anchor_endpoint = '@api_router.get("/schedule/live")\nasync def get_live_schedules():'
    helpers = '''# Set of "channel_id:date" keys with a background schedule regen already in
# flight. Prevents the midnight rollover from kicking off duplicate
# generation tasks for the same channel.
_regen_inflight: set = set()


def _kickoff_bg_regen(channel: dict, date: str):
    """Fire-and-forget: regenerate a channel's schedule in the background."""
    key = f"{channel.get('id', '')}:{date}"
    if key in _regen_inflight:
        return
    _regen_inflight.add(key)
    asyncio.create_task(_regen_schedule_bg(channel, date, key))


async def _regen_schedule_bg(channel: dict, date: str, key: str):
    """Background worker: generate + store a channel's schedule for `date`.

    get_or_create_schedule is idempotent, so concurrent callers are harmless.
    """
    try:
        await get_or_create_schedule(channel, date)
        logger.info(f"[schedule/live] background regen done for {channel.get('name')} ({date})")
    except Exception as e:
        logger.warning(f"[schedule/live] background regen failed for {channel.get('name')}: {e}")
    finally:
        _regen_inflight.discard(key)


'''
    src = replace_once(
        src,
        anchor_endpoint,
        helpers + anchor_endpoint,
        "Part 1a: background regen helpers",
    )

    # ------------------------------------------------------------------
    # Part 1b: serve stale while regenerating (never block the endpoint).
    # ------------------------------------------------------------------
    old_missing = '''    # Only the channels missing a schedule for today go through the
    # (expensive) generator — usually 0-3 on a warm day.
    for channel in missing_channels:
        try:
            schedules.append(await get_or_create_schedule(channel, today))
        except Exception as e:
            logger.warning(f"[schedule/live] generation failed for {channel.get('name')}: {e}")
'''
    new_missing = '''    # Midnight-rollover path: channels missing today's schedule are served
    # YESTERDAY's schedule immediately (flagged stale) while today's real
    # schedule regenerates in the background. The endpoint never blocks on
    # generation, so the Fire TV client never hits its 30s timeout.
    yesterday = (datetime.now(EASTERN_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")
    for channel in missing_channels:
        cid = channel.get("id", "")
        stale_doc = None
        try:
            stale_doc = await db.schedules.find_one(
                {"channel_id": cid, "schedule_date": yesterday},
                {"_id": 0},
            )
        except Exception as e:
            logger.warning(f"[schedule/live] stale lookup failed for {channel.get('name')}: {e}")
        if stale_doc:
            # Serve a copy of yesterday's schedule, rewritten as today's.
            served = dict(stale_doc)
            served["schedule_date"] = today
            served["stale"] = True
            served["channel_thumbnail"] = channel.get("thumbnail")
            served["channel_name"] = channel.get("name")
            served["unique_video_count"] = len(channel.get("videos", []))
            served["use_schedule"] = channel.get("use_schedule", False)
            served["is_live_stream"] = channel.get("is_live_stream", False)
            served["live_stream_youtube_id"] = channel.get("live_stream_youtube_id")
            schedules.append(served)
            # Regenerate today's real schedule in the background (deduped).
            _kickoff_bg_regen(channel, today)
        else:
            # Brand-new channel with no history — last resort: generate inline.
            try:
                schedules.append(await get_or_create_schedule(channel, today))
            except Exception as e:
                logger.warning(f"[schedule/live] generation failed for {channel.get('name')}: {e}")
'''
    src = replace_once(src, old_missing, new_missing, "Part 1b: serve-stale-while-regenerating")

    # ------------------------------------------------------------------
    # Part 2a: nightly prewarm coroutine, inserted before _startup_warmup.
    # ------------------------------------------------------------------
    anchor_warmup = "async def _startup_warmup():"
    prewarm = '''async def _nightly_schedule_prewarm():
    """Generate tomorrow's schedules every night at 23:00 ET so the midnight
    rollover never finds an empty schedule cache. Runs forever; all errors
    are logged and swallowed. Yields between channels so request handling is
    never blocked.
    """
    while True:
        try:
            # Sleep until 23:00 ET tonight (or tomorrow night if past 23:00).
            now = datetime.now(EASTERN_TZ)
            target = now.replace(hour=23, minute=0, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=1)
            wait_s = (target - now).total_seconds()
            logger.info(f"[prewarm] sleeping {wait_s/3600:.1f}h until 23:00 ET")
            await asyncio.sleep(wait_s)

            tomorrow = (datetime.now(EASTERN_TZ) + timedelta(days=1)).strftime("%Y-%m-%d")
            channels = await db.channels.find(
                {"is_public": True},
                {"_id": 0},
            ).to_list(length=None)

            done = 0
            total = 0
            for channel in channels:
                if not channel.get("videos"):
                    continue
                if channel.get("is_live_stream") and channel.get("live_stream_youtube_id"):
                    continue
                total += 1
                try:
                    # Idempotent: skips channels that already have tomorrow's schedule.
                    await get_or_create_schedule(channel, tomorrow)
                    done += 1
                except Exception as e:
                    logger.warning(f"[prewarm] failed for {channel.get('name')}: {e}")
                # Yield so the event loop can serve requests between generations.
                await asyncio.sleep(0)
            logger.info(f"[prewarm] pre-warmed {done}/{total} channel schedules for {tomorrow}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[prewarm] loop error (non-fatal): {e}")
            # Back off before retrying so a persistent failure doesn't spin.
            await asyncio.sleep(300)


'''
    src = replace_once(src, anchor_warmup, prewarm + anchor_warmup, "Part 2a: nightly prewarm coroutine")

    # ------------------------------------------------------------------
    # Part 2b: start the prewarm task from the startup handler.
    # ------------------------------------------------------------------
    old_kickoff = """    try:
        asyncio.create_task(_startup_warmup())
    except Exception as e:
        # Even task-creation failures must not block startup.
        logger.warning(f"[startup] could not schedule warmup task: {e}")"""
    new_kickoff = """    try:
        asyncio.create_task(_startup_warmup())
        asyncio.create_task(_nightly_schedule_prewarm())
    except Exception as e:
        # Even task-creation failures must not block startup.
        logger.warning(f"[startup] could not schedule warmup task: {e}")"""
    src = replace_once(src, old_kickoff, new_kickoff, "Part 2b: start prewarm on startup")

    with open(PATH, "w") as f:
        f.write(src)
    print("Patched backend/server.py")


if __name__ == "__main__":
    main()
