import React from 'react';

export type FigureMovement = 'idle' | 'walking-up' | 'walking-down' | 'recovering';

interface AscentFigureProps {
  x: number;
  y: number;
  slopeAngleDeg?: number;
  movementState: FigureMovement;
  facing: 'forward' | 'backward';
  isAbsorbingLight?: boolean;
  isDark?: boolean;
}

export const AscentFigure: React.FC<AscentFigureProps> = ({
  x,
  y,
  slopeAngleDeg = -20,
  movementState,
  facing,
  isAbsorbingLight = false,
  isDark = false,
}) => {
  const isWalking = movementState === 'walking-up' || movementState === 'walking-down' || movementState === 'recovering';
  const scaleX = facing === 'backward' ? -1 : 1;

  // Gentle upright pitch (~1.5°) matching a calm, natural uphill walk
  const baseRotation = facing === 'backward' ? -slopeAngleDeg * 0.08 : slopeAngleDeg * 0.08;

  const figureColor = isDark ? '#F5F3F7' : '#1C1B1F';
  const shadowColor = isDark ? '#000000' : '#1C1B1F';
  const shadowOpacity = isDark ? '0.45' : '0.22';

  return (
    <g
      id="ascent-human-figure"
      transform={`translate(${x}, ${y})`}
      className="transition-all duration-300 ease-out"
      style={{
        transformOrigin: '0 0',
      }}
    >
      {/* Ground contact shadow - subtle ellipse beneath feet */}
      <ellipse
        cx="2"
        cy="1"
        rx="10"
        ry="2.4"
        fill={shadowColor}
        opacity={shadowOpacity}
        className="filter blur-[1px] transition-all duration-300"
      />

      {/* Luminous resonance ring when absorbing light from completed study session */}
      {isAbsorbingLight && (
        <circle
          cx="1.5"
          cy="-21"
          r="26"
          fill="none"
          stroke="#A78BFA"
          strokeWidth="2"
          className="animate-ping opacity-75"
        />
      )}

      {/* Polished Editorial Human Silhouette - Normal Young College Student Walking Uphill */}
      <g
        transform={`scale(${scaleX}, 1) rotate(${baseRotation})`}
        style={{ transformOrigin: '0 0' }}
        className="transition-transform duration-300 ease-in-out"
      >
        {/* Subtle breathing / vitality container when idle */}
        <g className={!isWalking ? 'ascent-figure-breathing' : ''}>
          
          {/* 1. Back Arm (Subtle opposite backward swing, clearly separated from torso) */}
          <path
            d="
              M -1.5,-32.8
              C -2.2,-30.0 -3.0,-27.5 -3.5,-26.0
              L -4.8,-20.5
              C -5.0,-19.8 -4.5,-19.2 -4.0,-19.4
              C -3.6,-19.6 -3.4,-20.2 -3.6,-20.8
              L -2.5,-26.5
              C -2.0,-28.5 -1.4,-30.8 -0.8,-32.8
              Z
            "
            fill={figureColor}
            opacity={isDark ? '0.78' : '0.85'}
          />

          {/* 2. Back Leg (Trailing leg extending behind in stride with natural knee & shoe) */}
          <path
            d="
              M -2.8,-21.5
              C -3.4,-18.0 -4.0,-14.5 -4.4,-11.0
              C -4.8,-7.5 -5.0,-4.5 -5.2,-1.5
              C -5.3,-0.8 -4.8,0 -4.2,0
              L -0.4,0
              C 0.1,0 0.3,-0.6 0.0,-1.2
              L -1.4,-2.0
              C -1.6,-4.5 -1.6,-7.5 -1.6,-11.0
              C -1.4,-14.5 -0.8,-18.0 0.2,-21.5
              Z
            "
            fill={figureColor}
            opacity={isDark ? '0.88' : '0.92'}
          />

          {/* 3. Core Body: Upright Torso, Visible Neck & Refined Head (~1/7 body height) */}
          <path
            d="
              M -2.8,-21.5
              C -3.2,-24.5 -2.8,-28.5 -3.2,-31.8
              C -3.4,-32.8 -2.8,-33.4 -2.0,-33.6
              L -1.8,-35.8
              C -2.4,-36.5 -2.6,-38.0 -2.2,-39.4
              C -1.8,-40.8 -0.6,-41.6 0.6,-41.6
              C 2.0,-41.6 2.8,-40.5 2.6,-38.8
              C 2.4,-37.5 1.9,-36.6 1.4,-35.8
              L 1.2,-33.6
              C 2.2,-33.4 3.0,-32.5 3.4,-31.8
              C 3.8,-28.5 3.6,-24.5 3.0,-21.5
              Z
            "
            fill={figureColor}
          />

          {/* 4. Front Leg (Lead leg stepping forward, fluid athletic taper with natural knee & shoe) */}
          <path
            d="
              M 0.2,-21.5
              C 0.8,-18.0 1.8,-14.5 2.4,-11.0
              C 3.0,-7.5 3.4,-4.5 3.8,-2.0
              L 3.4,-1.0
              C 3.2,-0.4 3.6,0 4.4,0
              L 9.2,0
              C 9.7,0 9.9,-0.6 9.5,-1.2
              L 7.8,-2.0
              C 7.2,-4.5 6.4,-7.5 5.2,-11.0
              C 4.4,-14.5 3.6,-18.0 3.0,-21.5
              Z
            "
            fill={figureColor}
          />

          {/* 5. Front Arm (Swinging forward with natural elbow bend, reinforcing walking motion) */}
          <path
            d="
              M 1.5,-32.8
              C 2.2,-30.0 3.0,-27.5 3.4,-26.0
              L 5.2,-20.5
              C 5.4,-19.8 6.0,-19.2 6.5,-19.4
              C 6.9,-19.6 7.1,-20.2 6.9,-20.8
              L 5.0,-26.5
              C 4.5,-28.5 3.8,-30.8 3.2,-32.8
              Z
            "
            fill={figureColor}
          />
        </g>
      </g>
    </g>
  );
};
