/**
 * Safe numeric helper functions to ensure NaN, null, undefined, and Infinity never render to users.
 */

export function safeNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return fallback;
  return num;
}

export function formatHours(minutes: any): string {
  const mins = safeNumber(minutes, 0);
  if (mins <= 0) return '0 hrs';
  const hrs = Math.round((mins / 60) * 10) / 10;
  return `${hrs} hrs`;
}

export function formatMinutes(minutes: any): string {
  const mins = safeNumber(minutes, 0);
  if (mins <= 0) return '0 mins';
  return `${mins} mins`;
}

export function formatPercent(rate: any): string {
  const r = safeNumber(rate, 0);
  // Accept both 0..1 scale (e.g. 0.75) and 0..100 scale (e.g. 75)
  const pct = r <= 1 && r > 0 ? Math.round(r * 100) : Math.round(r);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function formatDateStr(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Today';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
