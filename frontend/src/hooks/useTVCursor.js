import { useEffect, useRef, useState } from 'react';

/**
 * TV D-pad spatial navigation for Fire TV / Roku / Android TV / smart TV browsers.
 *
 * - Enter/OK  →  click the currently focused element
 * - Arrows    →  jump to the nearest focusable element in that direction
 *                (uses bounding-rect geometry so it feels like a spatial cursor)
 * - Back/Esc  →  history.back
 *
 * A visible highlight is rendered by <TVCursor /> based on the returned rect.
 *
 * Activation:
 *   The cursor is dormant on desktops/mice and lights up the first time the
 *   viewer presses a D-pad / arrow key. That way we don't interfere with
 *   regular mouse users, and TV remotes get instant highlight feedback.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[data-tv-focusable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// TV remote key codes emitted by Fire TV / Android TV / Roku browsers
const KEY_ENTER = ['Enter', 'NumpadEnter', ' '];
const KEY_BACK = ['Escape', 'GoBack', 'Backspace'];
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  // Must be at least partially in the viewport OR anywhere on the document
  return true;
}

function centerOf(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function scoreCandidate(fromRect, toRect, dir) {
  const from = centerOf(fromRect);
  const to = centerOf(toRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Must lie in the correct half-plane
  switch (dir) {
    case 'up':    if (dy >= -8) return Infinity; break;
    case 'down':  if (dy <= 8)  return Infinity; break;
    case 'left':  if (dx >= -8) return Infinity; break;
    case 'right': if (dx <= 8)  return Infinity; break;
    default: return Infinity;
  }

  // Primary axis distance vs perpendicular penalty — prefer aligned neighbours
  const primary = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx);
  const perp    = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
  return primary + perp * 2;
}

function findNearest(from, dir) {
  const all = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  if (!from) {
    // No current selection — pick the first visible focusable in reading order
    return all[0] || null;
  }
  if (all.length === 0) return null;
  const fromRect = from.getBoundingClientRect();
  let best = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === from) continue;
    const s = scoreCandidate(fromRect, el.getBoundingClientRect(), dir);
    if (s < bestScore) { bestScore = s; best = el; }
  }
  return best;
}

export default function useTVCursor() {
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState(null);
  const focusedRef = useRef(null);

  // Recompute the cursor rect on focus, resize, scroll
  useEffect(() => {
    if (!active) return undefined;
    const update = () => {
      const el = focusedRef.current;
      if (!el || !el.isConnected) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const raf = requestAnimationFrame(update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  useEffect(() => {
    const focusOn = (el) => {
      if (!el) return;
      focusedRef.current = el;
      try { el.focus({ preventScroll: false }); } catch (_) { /* noop */ }
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } catch (_) { /* noop */ }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const onKey = (e) => {
      // Ignore keys inside text-editing controls so admins can still type
      const tag = (e.target?.tagName || '').toUpperCase();
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;

      if (DIRS[e.key]) {
        if (editing) return;
        e.preventDefault();
        if (!active) setActive(true);
        const current = focusedRef.current && focusedRef.current.isConnected
          ? focusedRef.current
          : document.activeElement && document.activeElement !== document.body
              ? document.activeElement
              : null;
        const next = findNearest(current, DIRS[e.key]);
        if (next) focusOn(next);
        return;
      }

      if (KEY_ENTER.includes(e.key)) {
        if (editing) return;
        const el = focusedRef.current;
        if (el && el.isConnected) {
          e.preventDefault();
          el.click();
        }
        return;
      }

      if (KEY_BACK.includes(e.key)) {
        // Only intercept the TV "Back" button, not user typing Backspace in
        // a form field. Editing check above handles that.
        if (editing) return;
        if (e.key === 'GoBack') {
          e.preventDefault();
          window.history.back();
        }
      }
    };

    const onMouseMove = () => {
      // A real mouse is in use — hide the TV cursor to stay out of the way
      if (active) setActive(false);
    };

    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [active]);

  return { active, rect };
}
