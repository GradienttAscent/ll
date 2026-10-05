import React, { useEffect, useState } from 'react';

export interface ParticleFlight {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  onComplete: () => void;
}

interface AscentParticleOverlayProps {
  flights: ParticleFlight[];
}

interface ActiveFlightItem {
  id: string;
  currentX: number;
  currentY: number;
  opacity: number;
  scale: number;
}

export const AscentParticleOverlay: React.FC<AscentParticleOverlayProps> = ({ flights }) => {
  const [activeItems, setActiveItems] = useState<ActiveFlightItem[]>([]);

  useEffect(() => {
    if (flights.length === 0) return;

    const currentFlight = flights[flights.length - 1];
    const { id, startX, startY, targetX, targetY, onComplete } = currentFlight;

    // Control point for a natural upward parabolic arc
    const midX = (startX + targetX) / 2;
    const midY = Math.min(startX, targetY) - 90;

    const duration = 650; // ms
    const startTime = performance.now();

    const animateParticle = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Quadratic bezier curve interpolation: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      const t = progress;
      const invT = 1 - t;
      const curX = invT * invT * startX + 2 * invT * t * midX + t * t * targetX;
      const curY = invT * invT * startY + 2 * invT * t * midY + t * t * targetY;

      setActiveItems([
        {
          id,
          currentX: curX,
          currentY: curY,
          opacity: progress < 0.85 ? 1 : 1 - (progress - 0.85) / 0.15,
          scale: progress < 0.2 ? progress / 0.2 : progress > 0.8 ? 1 - (progress - 0.8) / 0.4 : 1,
        },
      ]);

      if (progress < 1) {
        requestAnimationFrame(animateParticle);
      } else {
        setActiveItems([]);
        onComplete();
      }
    };

    const frameId = requestAnimationFrame(animateParticle);
    return () => cancelAnimationFrame(frameId);
  }, [flights]);

  if (activeItems.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {activeItems.map((item) => (
        <div
          key={item.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 will-change-transform"
          style={{
            transform: `translate3d(${item.currentX}px, ${item.currentY}px, 0) scale(${item.scale})`,
            opacity: item.opacity,
          }}
        >
          {/* Luminous Core Orb */}
          <div className="relative w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_4px_rgba(167,139,250,0.9)]">
            {/* Outer Radiant Violet Ring */}
            <div className="absolute -inset-1.5 rounded-full bg-[#8B5CF6] opacity-75 blur-[2px] animate-pulse" />
            {/* Particle Trail Flare */}
            <div className="absolute inset-0 rounded-full bg-[#C4B5FD] opacity-90" />
          </div>
        </div>
      ))}
    </div>
  );
};
