'use client';
import { useRef, type MouseEvent, type ReactNode } from 'react';

// Subtle foil / tilt wrapper for MatchCard. CSS handles the actual rendering
// (see .match-card-foil + ::after in src/app/globals.css). This client
// component only updates CSS custom properties on pointer move and clears
// them on pointer leave. Reduced-motion is honoured via the global CSS rule;
// no extra JS check needed here.
//
// Design constraints:
//   - Subtle: tilt capped at ±4°, lift 4 px on hover.
//   - Not Panini / FUT / EA card chrome — no frame overlays.
//   - Static fallback: if JS doesn't run, the card renders without tilt or
//     highlight, and is fully informative.

export function MatchCardFoil({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMove = (event: MouseEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const normX = localX / rect.width;
    const normY = localY / rect.height;
    const rotateY = (normX - 0.5) * 8; // ±4°
    const rotateX = -(normY - 0.5) * 6; // ±3°
    el.style.setProperty('--foil-x', `${localX}px`);
    el.style.setProperty('--foil-y', `${localY}px`);
    el.style.setProperty('--foil-opacity', '1');
    el.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
  };

  const handleLeave = (): void => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--foil-opacity', '0');
    el.style.transform = '';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="match-card-foil shadow-card hover:shadow-card-hover transition-shadow"
    >
      {children}
    </div>
  );
}
