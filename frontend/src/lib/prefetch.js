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
const FETCH_TIMEOUT_MS = 8 * 1000; // Fail fast so UI can render an interactive retry state

let _promise = null;
let _resolvedAt = 0;
let _resolvedData = null;

function fireFetch() {
  const url = `${BACKEND_URL}/api/schedule/live`;
  _promise = axios.get(url, { timeout: FETCH_TIMEOUT_MS })
    .then((res) => {
      _resolvedData = res.data;
      _resolvedAt = Date.now();
      return res.data;
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
 * Returns the prefetched /api/schedule/live payload. If the cache is warm and
 * fresh (< TTL), resolves immediately. If a fetch is in-flight, awaits it.
 * If the cache is stale or the previous fetch failed, starts a new fetch.
 */
export async function getPrefetchedLiveSchedule() {
  const isFresh = _resolvedData && (Date.now() - _resolvedAt) < TTL_MS;
  if (isFresh) return _resolvedData;
  if (_promise) return _promise;
  return fireFetch();
}

/** Force refresh (e.g. after regenerating a schedule). */
export function invalidateLiveSchedule() {
  _resolvedData = null;
  _resolvedAt = 0;
  _promise = null;
}

/** Warm the cache manually — useful after login state changes. */
export function warmLiveSchedule() {
  if (!_promise && (!_resolvedData || (Date.now() - _resolvedAt) >= TTL_MS)) {
    fireFetch();
  }
}
