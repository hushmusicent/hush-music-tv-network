/**
 * Module-level prefetch cache for the TV Network's core data.
 *
 * On import (which happens at app boot from `App.js`), this file immediately
 * fires GET /api/schedule/live and holds the in-flight promise + resolved
 * data. Any page (LiveTV, Schedule, TV Guide) can call
 * `getPrefetchedLiveSchedule()` and instantly get the data instead of waiting
 * for its own fetch.
 *
 * Falls back to a fresh fetch if the prefetch failed or was consumed already.
 *
 * The cache is TTL'd (60s) so a page revisit within a minute skips the wire.
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 30 * 1000; // 30 s — matches backend Mongo/serverSelection timeouts and survives cold-start warmups

let _promise = null;
let _resolvedAt = 0;
let _resolvedData = null;
let _paused = false; // When true, no new background fetches are fired.

// Retry config for backend outages (e.g. nightly maintenance window)
const MAX_RETRIES = 20;
const RETRY_BASE_MS = 15000; // 15s, backs off; covers ~15min outage

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  try {
    const res = await axios.get(url, { timeout: FETCH_TIMEOUT_MS });
    return res.data;
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const delay = Math.min(RETRY_BASE_MS * Math.pow(1.5, attempt), 300000);
    console.warn(`Schedule fetch failed (attempt ${attempt + 1}), retrying in ${Math.round(delay/1000)}s...`);
    await sleep(delay);
    return fetchWithRetry(url, attempt + 1);
  }
}

function fireFetch() {
  // Suppress prefetch while a heavy consumer (e.g. Live TV playback) is
  // active. The next getPrefetchedLiveSchedule() will still be honored, but
  // we won't spend memory/network on speculative fetches in the background.
  if (_paused) return null;
  const url = `${BACKEND_URL}/api/schedule/live`;
  _promise = fetchWithRetry(url)
    .then((data) => {
      _resolvedData = data;
      _resolvedAt = Date.now();
      return data;
    })
    .catch((err) => {
      // Drop the promise so callers will trigger a fresh fetch
      _promise = null;
      throw err;
    });
  return _promise;
}

// Kick off immediately on module import.
if (BACKEND_URL && typeof window !== 'undefined') {
  fireFetch();
}

/**
 * Suppress background prefetches (e.g. while the video player is active on
 * low-memory devices like Fire TV Stick / Amazon Silk). In-flight fetches
 * are not cancelled, but no new speculative fetches will be fired until
 * `resumeBackgroundFetches` is called. Explicit `getPrefetchedLiveSchedule`
 * calls still work — they'll bypass the paused flag if the cache is empty.
 */
export function pauseBackgroundFetches() {
  _paused = true;
}

export function resumeBackgroundFetches() {
  _paused = false;
}

/**
 * Returns the prefetched /api/schedule/live payload. If the cache is warm and
 * fresh (< TTL), resolves immediately. If a fetch is in-flight, awaits it.
 * If the cache is stale or the previous fetch failed, starts a new fetch.
 */
export async function getPrefetchedLiveSchedule() {
  const isFresh = _resolvedData && (Date.now() - _resolvedAt) < TTL_MS;
  if (isFresh) return _resolvedData;
  if (_promise) return _promise;
  // Bypass pause for explicit callers — they need the data now.
  const wasPaused = _paused;
  _paused = false;
  try {
    return await fireFetch();
  } finally {
    _paused = wasPaused;
  }
}

/** Force refresh (e.g. after regenerating a schedule). */
export function invalidateLiveSchedule() {
  _resolvedData = null;
  _resolvedAt = 0;
  _promise = null;
}

/** Warm the cache manually — useful after login state changes. */
export function warmLiveSchedule() {
  if (_paused) return;
  if (!_promise && (!_resolvedData || (Date.now() - _resolvedAt) >= TTL_MS)) {
    fireFetch();
  }
}
