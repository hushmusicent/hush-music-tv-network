import { useEffect, useState, useLayoutEffect, useRef } from 'react';

/**
 * Ultra-light windowed / virtual scrolling for tall lists.
 *
 * Renders only the items that are visible in `containerRef` (plus a small
 * over-scan buffer above and below) so DOM node count stays constant no
 * matter how many rows the list contains. Written specifically for
 * low-memory devices like Fire TV Stick and Amazon Silk where mounting 90+
 * channel rows (each with a thumbnail image) blows past the JS heap budget.
 *
 * Assumes every row has the same `itemHeight` (px). Callers render a
 * `totalHeight`-tall spacer div and absolutely-position the visible items.
 *
 * When `useWindow: true` the hook virtualizes against the nearest scrollable
 * ancestor of `containerRef` (falling back to `window`) — used by pages
 * (Schedule / TV Guide) whose scroll lives on an outer <main> element.
 */
const findScrollParent = (el) => {
  let node = el?.parentElement || null;
  while (node) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null; // Fall back to window
};

export function useVirtualList({
  containerRef,
  itemCount,
  itemHeight,
  overscan = 4,
  enabled = true,
  useWindow = false,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollParentRef = useRef(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (useWindow) {
      const parent = findScrollParent(containerRef.current);
      scrollParentRef.current = parent;
      setViewportHeight(parent ? parent.clientHeight : window.innerHeight);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
  }, [containerRef, enabled, itemCount, useWindow]);

  useEffect(() => {
    if (!enabled) return;

    if (useWindow) {
      const parent = scrollParentRef.current || findScrollParent(containerRef.current);
      scrollParentRef.current = parent;

      const readScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        if (parent) {
          const containerTop = el.getBoundingClientRect().top;
          const parentTop = parent.getBoundingClientRect().top;
          setScrollTop(Math.max(0, parentTop - containerTop));
        } else {
          setScrollTop(Math.max(0, -el.getBoundingClientRect().top));
        }
      };
      const onResize = () => {
        setViewportHeight(parent ? parent.clientHeight : window.innerHeight);
      };

      const scrollTarget = parent || window;
      scrollTarget.addEventListener('scroll', readScroll, { passive: true });
      window.addEventListener('resize', onResize);
      onResize();
      readScroll();
      return () => {
        scrollTarget.removeEventListener('scroll', readScroll);
        window.removeEventListener('resize', onResize);
      };
    }

    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportHeight(el.clientHeight);

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [containerRef, enabled, useWindow]);

  if (!enabled || itemCount === 0 || itemHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: Math.max(0, itemCount - 1),
      totalHeight: itemCount * itemHeight,
      offsetTop: 0,
    };
  }

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil((viewportHeight || 600) / itemHeight) + overscan * 2;
  const end = Math.min(itemCount - 1, start + visibleCount);

  return {
    startIndex: start,
    endIndex: end,
    totalHeight: itemCount * itemHeight,
    offsetTop: start * itemHeight,
  };
}
