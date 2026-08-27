import { useEffect, useState } from 'react';

/**
 * A clock that ticks only while something needs it.
 *
 * Used to count up "sem sinal há 23s". While the GPS is healthy the caller
 * passes `active: false` and nothing runs, so a parked bike is not re-rendering
 * once a second for no reason.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
