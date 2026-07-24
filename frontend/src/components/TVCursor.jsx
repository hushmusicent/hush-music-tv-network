import React from 'react';
import useTVCursor from '../hooks/useTVCursor';

/**
 * Visible TV cursor / focus ring. Renders a fixed-position highlight over the
 * currently D-pad-focused element. Designed for Amazon Fire TV, Roku Browser,
 * Android TV, and any 10-foot UI.
 *
 * Mount once at the App root. It self-activates on first arrow-key press so
 * mouse users on desktop never see it.
 */
const TVCursor = () => {
  const { active, rect } = useTVCursor();
  if (!active || !rect) return null;

  const style = {
    position: 'fixed',
    top: Math.max(0, rect.top - 6),
    left: Math.max(0, rect.left - 6),
    width: rect.width + 12,
    height: rect.height + 12,
    borderRadius: 12,
    pointerEvents: 'none',
    zIndex: 9999,
    boxSizing: 'border-box',
    border: '3px solid rgba(147, 197, 253, 1)',           // sky-300 solid
    boxShadow:
      '0 0 0 2px rgba(255,255,255,0.85), ' +               // inner white ring
      '0 0 24px 4px rgba(59, 130, 246, 0.55), ' +          // outer blue glow
      'inset 0 0 12px rgba(147,197,253,0.35)',
    transition: 'top 140ms ease, left 140ms ease, width 140ms ease, height 140ms ease',
    animation: 'tv-cursor-pulse 1.6s ease-in-out infinite',
  };

  return (
    <>
      <style>{`
        @keyframes tv-cursor-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 0 20px 3px rgba(59,130,246,0.5), inset 0 0 10px rgba(147,197,253,0.3); }
          50%      { box-shadow: 0 0 0 2px rgba(255,255,255,0.95), 0 0 32px 6px rgba(59,130,246,0.75), inset 0 0 14px rgba(147,197,253,0.45); }
        }
      `}</style>
      <div style={style} data-testid="tv-cursor" aria-hidden="true" />
    </>
  );
};

export default TVCursor;
