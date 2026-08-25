import { useEffect, useState } from 'react';

/** Milliseconds from `now` until the next whole minute. */
export function msUntilNextMinute(now: number): number {
  const remainder = now % 60_000;
  return remainder === 0 ? 60_000 : 60_000 - remainder;
}

/** 24-hour HH:MM, which is what a Brazilian dashboard shows. */
export function formatClock(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Wall-clock time for the dashboard.
 *
 * Wakes on the minute boundary rather than every second: the readout has no
 * seconds, so ticking 60 times a minute would be 59 wasted renders on a device
 * that is running the GPS for hours. Re-syncs when the app comes back to the
 * foreground, because a hidden page has its timers throttled and the clock
 * would otherwise return stale.
 */
export function useClock(): string {
  const [time, setTime] = useState(() => formatClock(new Date()));

  useEffect(() => {
    let timer = 0;

    const schedule = () => {
      setTime(formatClock(new Date()));
      timer = window.setTimeout(schedule, msUntilNextMinute(Date.now()));
    };

    timer = window.setTimeout(schedule, msUntilNextMinute(Date.now()));

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      schedule();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return time;
}
