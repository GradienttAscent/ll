import React, { useEffect, useRef, useState } from 'react';
import { AscentStage, TomorrowCommitmentSummary } from '../../types';
import { AscentFigure, FigureMovement } from './AscentFigure';
import { ASCENT_STAGES, RIDGE_PATH_D, STAGE_ORDER, getApproximatePathPoint } from './ascentUtils';
import { useTheme } from '../../context/ThemeContext';

interface AscentLandscapeProps {
  progress: number; // 0.04 .. 0.96
  stage: AscentStage;
  elevationMeters: number;
  tomorrowCommitment?: TomorrowCommitmentSummary | null;
  onFigurePosCalculated?: (rect: { x: number; y: number }) => void;
  isAbsorbingLight?: boolean;
  statusBadgeText?: string;
}

export const AscentLandscape: React.FC<AscentLandscapeProps> = ({
  progress,
  stage,
  elevationMeters,
  tomorrowCommitment,
  onFigurePosCalculated,
  isAbsorbingLight = false,
  statusBadgeText,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const pathRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const figureGroupRef = useRef<SVGGElement>(null);

  // Smooth interpolated parametric position along the ridge curve
  const [currentT, setCurrentT] = useState(progress);
  const [movementState, setMovementState] = useState<FigureMovement>('idle');
  const [facing, setFacing] = useState<'forward' | 'backward'>('forward');
  const targetTRef = useRef(progress);
  const animFrameRef = useRef<number | null>(null);
  const isInitialMount = useRef(true);

  // Stage milestone checkpoints along the curve (progress fractions for the 5 stages)
  const stageMilestones = [
    { stage: 'STARTING' as AscentStage, t: 0.08, label: 'Basecamp' },
    { stage: 'BUILDING' as AscentStage, t: 0.28, label: 'Pine Ridge' },
    { stage: 'CONSISTENT' as AscentStage, t: 0.52, label: 'High Saddle' },
    { stage: 'MOMENTUM' as AscentStage, t: 0.74, label: 'Alpine Crest' },
    { stage: 'MASTERY' as AscentStage, t: 0.92, label: 'Summit Plateau' },
  ];

  // Calculate coordinates along the path
  const getPathCoords = (t: number) => {
    if (pathRef.current) {
      try {
        const totalLength = pathRef.current.getTotalLength();
        const clampedT = Math.max(0.02, Math.min(0.98, t));
        const distance = clampedT * totalLength;
        const pt = pathRef.current.getPointAtLength(distance);
        const ptNext = pathRef.current.getPointAtLength(Math.min(totalLength, distance + 4));
        const angleDeg = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x) * (180 / Math.PI);
        return { x: pt.x, y: pt.y, angleDeg };
      } catch {
        // Fall back to analytical approximation if SVG method temporarily unavailable
      }
    }
    return getApproximatePathPoint(t);
  };

  // Figure coordinates along the ridge
  const figureCoords = getPathCoords(currentT);

  // Animate figure smoothly along the path whenever `progress` updates
  useEffect(() => {
    targetTRef.current = progress;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      setCurrentT(progress);
      return;
    }

    const startT = currentT;
    const diff = progress - startT;
    if (Math.abs(diff) < 0.002) {
      setCurrentT(progress);
      setMovementState('idle');
      return;
    }

    const isMovingUp = diff > 0;
    setFacing(isMovingUp ? 'forward' : 'backward');
    setMovementState(isMovingUp ? 'walking-up' : 'walking-down');

    const duration = Math.min(2200, Math.max(1100, Math.abs(diff) * 6000));
    const startTime = performance.now();

    const animateWalk = (now: number) => {
      const elapsed = now - startTime;
      const linearFraction = Math.min(1, elapsed / duration);
      const ease = linearFraction < 0.5
        ? 2 * linearFraction * linearFraction
        : 1 - Math.pow(-2 * linearFraction + 2, 2) / 2;

      const nextT = startT + diff * ease;
      setCurrentT(nextT);

      if (linearFraction < 1) {
        animFrameRef.current = requestAnimationFrame(animateWalk);
      } else {
        setCurrentT(progress);
        setMovementState('idle');
        if (!isMovingUp) {
          setTimeout(() => setFacing('forward'), 350);
        }
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animateWalk);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [progress]);

  // Report figure screen coordinate for the travelling light animation
  useEffect(() => {
    if (figureGroupRef.current && onFigurePosCalculated) {
      const rect = figureGroupRef.current.getBoundingClientRect();
      onFigurePosCalculated({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  }, [currentT, onFigurePosCalculated]);

  // Environmental parameters dynamically responding to current stage
  const stageInfo = ASCENT_STAGES[stage];
  const mistOpacity = stage === 'STARTING' ? 0.75 : stage === 'BUILDING' ? 0.52 : stage === 'CONSISTENT' ? 0.32 : stage === 'MOMENTUM' ? 0.18 : 0.08;

  // Subtle camera pan/elevation as figure climbs higher
  const cameraShiftY = (currentT - 0.5) * -18;

  // Theme-aware palette definitions
  const skyGradStops = isDark ? (
    <>
      <stop offset="0%" stopColor="#111013" />
      <stop offset="45%" stopColor="#16131D" />
      <stop offset="100%" stopColor="#1D1726" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#FFFFFF" />
      <stop offset="45%" stopColor="#FAF7FD" />
      <stop offset="100%" stopColor="#EDE6F6" />
    </>
  );

  const summitGlowColor = isDark ? '#8B5CF6' : '#CEB8FF';
  const summitGlowOpacity = isDark
    ? (stage === 'MASTERY' ? '0.35' : '0.15')
    : (stage === 'MASTERY' ? '0.45' : '0.22');

  const distantMountainStops = isDark ? (
    <>
      <stop offset="0%" stopColor="#231D2E" stopOpacity="0.85" />
      <stop offset="100%" stopColor="#16131D" stopOpacity="0.95" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#D8CCE8" stopOpacity="0.45" />
      <stop offset="100%" stopColor="#FAF8FC" stopOpacity="0.85" />
    </>
  );

  const midMountainStops = isDark ? (
    <>
      <stop offset="0%" stopColor="#2A2238" stopOpacity="0.9" />
      <stop offset="100%" stopColor="#1A1624" stopOpacity="0.95" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#BFB2D6" stopOpacity="0.6" />
      <stop offset="100%" stopColor="#FAF8FC" stopOpacity="0.95" />
    </>
  );

  const ridgeBaseStops = isDark ? (
    <>
      <stop offset="0%" stopColor="#1E1928" />
      <stop offset="40%" stopColor="#17141F" />
      <stop offset="100%" stopColor="#13111A" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#F5F0FB" />
      <stop offset="40%" stopColor="#EFE8F7" />
      <stop offset="100%" stopColor="#E5DAF2" />
    </>
  );

  const pathStrokeStops = isDark ? (
    <>
      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" />
      <stop offset="50%" stopColor="#A78BFA" stopOpacity="0.9" />
      <stop offset="100%" stopColor="#C4B5FD" stopOpacity="1" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#8E7EA6" stopOpacity="0.5" />
      <stop offset="50%" stopColor="#5E35B1" stopOpacity="0.85" />
      <stop offset="100%" stopColor="#6D28D9" stopOpacity="1" />
    </>
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl sm:rounded-3xl border border-[#EDE7F3] dark:border-[#302B35] bg-white dark:bg-[#17151A] overflow-hidden shadow-xs select-none transition-colors duration-200"
    >
      {/* Top Bar / HUD overlaid subtly on landscape */}
      <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
        
        {/* Stage & Elevation Pill */}
        <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-[#17151A]/90 backdrop-blur-md border border-[#D8CCE8] dark:border-[#302B35] text-xs shadow-2xs font-sans">
          <span className="w-2 h-2 rounded-full bg-[#5E35B1] dark:bg-[#8B5CF6] animate-pulse-soft" />
          <span className="font-bold text-[#1C1B1F] dark:text-[#F5F3F7] tracking-wider uppercase text-[9.5px]">{stageInfo.label}</span>
          <span className="text-[#D8CCE8] dark:text-[#4A4254]">&bull;</span>
          <span className="font-mono text-[11px] font-semibold text-[#5E35B1] dark:text-[#8B5CF6]">{elevationMeters}m elevation</span>
        </div>

        {/* Dynamic Status / Micro-Feedback Message */}
        {statusBadgeText && (
          <div className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1C1B1F] dark:bg-[#251E30] text-white dark:text-[#F5F3F7] text-[11px] font-medium border border-white/10 dark:border-[#3A3342] shadow-sm animate-fade-in">
            <span>{statusBadgeText}</span>
          </div>
        )}
      </div>

      {/* The Living Mountain SVG Canvas */}
      <div className="w-full relative aspect-[16/7] min-h-[280px] max-h-[460px]">
        <svg
          viewBox="0 0 1000 460"
          className="w-full h-full object-cover"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Your Ascent landscape showing current stage: ${stageInfo.label} at ${elevationMeters}m`}
        >
          <defs>
            {/* Sky atmospheric gradient */}
            <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              {skyGradStops}
            </linearGradient>

            {/* Ambient Summit / Horizon Glow */}
            <radialGradient id="summitGlow" cx="88%" cy="16%" r="45%">
              <stop offset="0%" stopColor={summitGlowColor} stopOpacity={summitGlowOpacity} />
              <stop offset="60%" stopColor={isDark ? '#1D1726' : '#FAF7FD'} stopOpacity="0.06" />
              <stop offset="100%" stopColor={isDark ? '#1D1726' : '#FAF7FD'} stopOpacity="0" />
            </radialGradient>

            {/* Distant mountain peaks fill */}
            <linearGradient id="distantMountainFill" x1="0%" y1="0%" x2="0%" y2="100%">
              {distantMountainStops}
            </linearGradient>

            {/* Midground mountain ridge fill */}
            <linearGradient id="midMountainFill" x1="0%" y1="0%" x2="0%" y2="100%">
              {midMountainStops}
            </linearGradient>

            {/* Foreground Craggy Walking Ridge */}
            <linearGradient id="ridgeBaseFill" x1="0%" y1="0%" x2="0%" y2="100%">
              {ridgeBaseStops}
            </linearGradient>

            {/* Ridge path stroke gradient */}
            <linearGradient id="pathStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              {pathStrokeStops}
            </linearGradient>

            {/* Soft Mist Filter */}
            <filter id="mistBlur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* 1. Backdrop Sky */}
          <rect width="1000" height="460" fill="url(#skyGrad)" />
          <rect width="1000" height="460" fill="url(#summitGlow)" />

          {/* 2. Living Clouds Layer — Slow Drifting */}
          <g className={`ascent-cloud-drift-far ${isDark ? 'opacity-20' : 'opacity-65'}`}>
            <path
              d="M 120,70 C 140,55 180,55 200,68 C 215,60 240,64 250,75 C 265,72 285,82 280,95 C 270,105 130,105 120,95 C 110,88 115,75 120,70 Z"
              fill={isDark ? '#A78BFA' : '#FFFFFF'}
              opacity="0.8"
            />
            <path
              d="M 520,45 C 545,30 590,30 615,44 C 635,35 665,40 675,52 C 695,50 715,62 710,75 C 700,85 530,85 520,75 C 508,68 512,52 520,45 Z"
              fill={isDark ? '#A78BFA' : '#FFFFFF'}
              opacity="0.75"
            />
          </g>

          <g className={`ascent-cloud-drift-mid ${isDark ? 'opacity-15' : 'opacity-50'}`}>
            <path
              d="M 750,110 C 770,95 810,95 830,108 C 845,100 870,104 880,115 C 895,112 915,122 910,135 C 900,145 760,145 750,135 C 740,128 745,115 750,110 Z"
              fill={isDark ? '#A78BFA' : '#FFFFFF'}
              opacity="0.7"
            />
          </g>

          {/* 3. Deep Distant Mountain Peaks Silhouette */}
          <g transform={`translate(0, ${cameraShiftY * 0.3})`}>
            <path
              d="M 0,260 L 80,190 L 160,240 L 250,170 L 340,230 L 440,150 L 530,220 L 610,135 L 720,200 L 840,110 L 930,165 L 1000,120 L 1000,460 L 0,460 Z"
              fill="url(#distantMountainFill)"
            />
            {/* Fine editorial contour lines along distant peaks */}
            <path
              d="M 250,170 L 290,230 M 440,150 L 485,210 M 610,135 L 660,190 M 840,110 L 880,160"
              stroke={isDark ? '#3E3254' : '#CEB8FF'}
              strokeWidth="0.8"
              opacity={isDark ? '0.35' : '0.4'}
            />
          </g>

          {/* 4. Midground Rolling Ridges Layer */}
          <g transform={`translate(0, ${cameraShiftY * 0.6})`}>
            <path
              d="M 0,330 C 110,310 200,285 290,305 C 380,325 470,260 560,270 C 650,280 730,210 820,215 C 890,220 950,180 1000,175 L 1000,460 L 0,460 Z"
              fill="url(#midMountainFill)"
            />
          </g>

          {/* 5. Atmospheric Mist Layer (Enclosed in Starting, Lifts as you climb) */}
          <rect
            x="0"
            y="180"
            width="1000"
            height="280"
            fill={isDark ? '#111013' : '#FAF8FC'}
            opacity={isDark ? mistOpacity * 0.5 : mistOpacity}
            filter="url(#mistBlur)"
          />

          {/* 6. Pine Grove Silhouettes in Valley / Foothills */}
          <g opacity={stage === 'STARTING' ? '0.75' : '0.45'} className="transition-opacity duration-500">
            <path
              d="M 45,405 L 49,388 L 53,405 Z M 57,408 L 62,385 L 67,408 Z M 72,406 L 76,391 L 80,406 Z M 95,398 L 100,378 L 105,398 Z"
              fill={isDark ? '#2E273A' : '#756A88'}
            />
          </g>

          {/* 7. Foreground Crag / Solid Mass Beneath the Ridge Path */}
          <path
            d="M 0,460 L 0,410 C 30,405 60,400 60,400 C 120,400 170,375 230,350 C 290,325 350,305 420,275 C 490,245 560,225 630,195 C 700,165 760,145 820,120 C 865,100 895,80 940,65 L 1000,55 L 1000,460 Z"
            fill="url(#ridgeBaseFill)"
          />

          {/* Craggy topography strokes along the slope */}
          <g stroke={isDark ? '#362F44' : '#D8CCE8'} strokeWidth="1" opacity={isDark ? '0.45' : '0.6'}>
            <path d="M 120,402 L 140,430 M 180,380 L 195,415 M 290,332 L 315,370" />
            <path d="M 370,312 L 390,350 M 470,260 L 495,295 M 570,228 L 595,265" />
            <path d="M 680,182 L 705,215 M 780,142 L 800,175 M 880,95 L 900,125" />
          </g>

          {/* 8. The Continuous Ridge Path Line */}
          <path
            ref={pathRef}
            d={RIDGE_PATH_D}
            fill="none"
            stroke="transparent"
            strokeWidth="1"
          />

          {/* Subtle glow / track under the path */}
          <path
            d={RIDGE_PATH_D}
            fill="none"
            stroke={isDark ? '#8B5CF6' : '#CEB8FF'}
            strokeWidth="7"
            strokeLinecap="round"
            opacity={isDark ? '0.28' : '0.35'}
            className="ascent-path-shimmer"
          />

          {/* Visible Editorial Ridge Path Stroke */}
          <path
            d={RIDGE_PATH_D}
            fill="none"
            stroke="url(#pathStrokeGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Dashed trail line indicating continuity and footsteps */}
          <path
            d={RIDGE_PATH_D}
            fill="none"
            stroke={isDark ? '#EDE9FE' : '#FFFFFF'}
            strokeWidth="1.2"
            strokeDasharray="4 6"
            strokeLinecap="round"
            opacity={isDark ? '0.55' : '0.75'}
          />

          {/* 9. Stage Milestones subtly integrated along the landscape */}
          {stageMilestones.map((m) => {
            const pt = getPathCoords(m.t);
            const isReached = currentT >= m.t - 0.03;
            const isCurrent = stage === m.stage;

            const strokeColor = isCurrent
              ? (isDark ? '#8B5CF6' : '#5E35B1')
              : isReached
              ? (isDark ? '#F5F3F7' : '#1C1B1F')
              : (isDark ? '#544D60' : '#9E94AB');

            const textColor = isCurrent
              ? (isDark ? 'fill-[#8B5CF6]' : 'fill-[#5E35B1]')
              : isReached
              ? (isDark ? 'fill-[#F5F3F7]' : 'fill-[#1C1B1F]')
              : (isDark ? 'fill-[#7E758C]' : 'fill-[#9E94AB]');

            return (
              <g key={m.stage} transform={`translate(${pt.x}, ${pt.y})`} className="transition-all duration-300">
                {/* Milestone tick on path */}
                <line
                  x1="0"
                  y1="-6"
                  x2="0"
                  y2="6"
                  stroke={strokeColor}
                  strokeWidth={isCurrent ? '2' : '1.2'}
                  strokeLinecap="round"
                />

                {/* Delicate stage name text below path */}
                <text
                  x="0"
                  y="18"
                  textAnchor="middle"
                  className={`text-[8.5px] font-sans font-bold uppercase tracking-[0.14em] transition-colors ${textColor}`}
                >
                  {m.stage}
                </text>
              </g>
            );
          })}

          {/* 11. The Human Silhouette Figure Standing on Ridge */}
          <g ref={figureGroupRef}>
            <AscentFigure
              x={figureCoords.x}
              y={figureCoords.y}
              slopeAngleDeg={figureCoords.angleDeg}
              movementState={movementState}
              facing={facing}
              isAbsorbingLight={isAbsorbingLight}
              isDark={isDark}
            />
          </g>

          {/* 12. Summit Cairn / Plateau Marker at the Far Top Right (Mastery Apex) */}
          <g transform="translate(940, 65)">
            <ellipse cx="0" cy="0" rx="9" ry="3" fill={isDark ? '#2E273A' : '#D8CCE8'} opacity="0.6" />
            <ellipse cx="0" cy="-3" rx="7" ry="2.5" fill={isDark ? '#403650' : '#BFB2D6'} />
            <ellipse cx="0" cy="-6" rx="5" ry="2" fill={isDark ? '#63557C' : '#9E94AB'} />
            <ellipse cx="0" cy="-8.5" rx="3" ry="1.5" fill={isDark ? '#8B5CF6' : '#5E35B1'} />
          </g>
        </svg>
      </div>

      {/* Editorial Bottom Legend */}
      <div className="border-t border-[#EDE7F3] dark:border-[#302B35] bg-[#FAF8FC]/80 dark:bg-[#17151A]/80 px-6 py-2.5 flex items-center justify-between text-[11px] text-[#7B7484] dark:text-[#A9A3AE] font-sans">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#1C1B1F] dark:text-[#F5F3F7]">Stage:</span>
          <span className="font-bold text-[#5E35B1] dark:text-[#8B5CF6] uppercase tracking-wider">{stageInfo.label}</span>
          <span className="text-[#D8CCE8] dark:text-[#4A4254]">&bull;</span>
          <span className="italic">{stageInfo.description}</span>
        </div>
      </div>
    </div>
  );
};
