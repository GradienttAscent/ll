import { useEffect, useRef, useState } from 'react';
import type { FocusSession } from '../../types';

/**
 * Countdown for a room focus session.
 *
 * The server owns the clock: a response carries `endsAt` and `serverNow`, so the remaining time is
 * always derived (`endsAt - serverTime`) rather than counted down locally. A tab that was
 * backgrounded, a laptop that slept, or a client whose clock is wrong all resynchronise from the
 * same two timestamps instead of drifting.
 */
export function useFocusCountdown(session: FocusSession | null): number {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  // Offset between the browser clock and the server clock, measured when the session was fetched.
  const skewRef = useRef(0);

  useEffect(() => {
    if (!session) {
      setRemainingSeconds(0);
      return undefined;
    }
    const serverNow = Date.parse(session.serverNow);
    const endsAt = Date.parse(session.endsAt);
    if (!Number.isFinite(serverNow) || !Number.isFinite(endsAt)) {
      setRemainingSeconds(0);
      return undefined;
    }
    skewRef.current = serverNow - Date.now();

    const tick = () => setRemainingSeconds(Math.max(0, Math.round((endsAt - (Date.now() + skewRef.current)) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  return remainingSeconds;
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatRelativeTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return 'just now';
  const minutes = Math.round(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}