import { AscentStage, AscentStageInfo } from '../../types';

export const ASCENT_STAGES: Record<AscentStage, AscentStageInfo> = {
  STARTING: {
    stage: 'STARTING',
    label: 'Starting',
    elevation: '120m – 380m',
    description: 'Baseline habit established through scheduled study.',
    minProgress: 0.04,
    maxProgress: 0.20,
  },
  BUILDING: {
    stage: 'BUILDING',
    label: 'Building',
    elevation: '380m – 780m',
    description: 'Steadily following through on scheduled study sessions.',
    minProgress: 0.20,
    maxProgress: 0.40,
  },
  CONSISTENT: {
    stage: 'CONSISTENT',
    label: 'Consistent',
    elevation: '780m – 1,320m',
    description: 'Strong calendar execution and dependable study rhythm.',
    minProgress: 0.40,
    maxProgress: 0.65,
  },
  MOMENTUM: {
    stage: 'MOMENTUM',
    label: 'Momentum',
    elevation: '1,320m – 1,840m',
    description: 'High completion rate across multiple scheduled study days.',
    minProgress: 0.65,
    maxProgress: 0.85,
  },
  MASTERY: {
    stage: 'MASTERY',
    label: 'Mastery',
    elevation: '1,840m – 2,150m',
    description: 'Consistent follow-through across your entire study schedule.',
    minProgress: 0.85,
    maxProgress: 1.00,
  },
};

export const STAGE_ORDER: AscentStage[] = ['STARTING', 'BUILDING', 'CONSISTENT', 'MOMENTUM', 'MASTERY'];

export function getStageFromProgress(progress: number): AscentStage {
  if (progress >= 0.85) return 'MASTERY';
  if (progress >= 0.65) return 'MOMENTUM';
  if (progress >= 0.40) return 'CONSISTENT';
  if (progress >= 0.20) return 'BUILDING';
  return 'STARTING';
}

export function getElevationMeters(progress: number): number {
  return Math.round(120 + Math.max(0, Math.min(1, progress)) * 2030);
}

// Continuous ridge path SVG definition
// Lower-left (60, 400) to Upper-right (940, 65)
export const RIDGE_PATH_D = 'M 60,400 C 120,400 170,375 230,350 C 290,325 350,305 420,275 C 490,245 560,225 630,195 C 700,165 760,145 820,120 C 865,100 895,80 940,65';

// Pre-computed fallback points along the curve if SVG getPointAtLength is initializing
export function getApproximatePathPoint(t: number): { x: number; y: number; angleDeg: number } {
  const clampedT = Math.max(0, Math.min(1, t));
  // Quadratic/cubic spline approximation for viewBox 0 0 1000 460
  const x = 60 + clampedT * (940 - 60);
  // Monotonically climbing from y=400 down to y=65 with subtle plateaus
  const easeY = Math.pow(clampedT, 0.92);
  const y = 400 - easeY * (400 - 65);
  // Incline slope angle (approx -18 deg to -24 deg)
  const angleDeg = -20 - Math.sin(clampedT * Math.PI) * 4;
  return { x, y, angleDeg };
}
