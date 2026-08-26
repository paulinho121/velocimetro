import { useCallback, useEffect, useRef, useState } from 'react';

export type WakeLockStatus =
  /** The browser has no Wake Lock API (iOS Safari before 16.4, for one). */
  | 'unsupported'
  /** Held: the screen will not sleep. */
  | 'active'
  /** Not held right now - the app is in the background, or it is switched off. */
  | 'idle'
  /** The browser refused. Battery saver is the usual reason. */
  | 'blocked';

interface Sentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', fn: () => void) => void;
  removeEventListener: (type: 'release', fn: () => void) => void;
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

/**
 * Keeps the screen awake while the app is on screen.
 *
 * A wake lock is not something you take once. The platform drops it whenever
 * the page is hidden, and may drop it on its own - entering or leaving
 * fullscreen, battery saver kicking in. The previous implementation only
 * re-armed on `visibilitychange`, so every other kind of release went
 * unnoticed and the screen went dark mid-ride with nothing in the code aware
 * of it.
 *
 * So: listen to the sentinel's own `release` event, and re-arm on fullscreen
 * transitions too. The status is returned rather than swallowed, because a
 * rider needs to know the screen will stay on before setting off - a silent
 * failure here looks exactly like a working app until it is too late.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() =>
    isWakeLockSupported() ? 'idle' : 'unsupported',
  );
  const sentinelRef = useRef<Sentinel | null>(null);
  /**
   * `acquire` awaits before it can store the sentinel, so two events arriving
   * back to back would both pass the "already holding one" check and leave two
   * locks held. Marked synchronously, before the await, to close that window.
   */
  const acquiringRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    if (sentinel && !sentinel.released) {
      await sentinel.release().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isWakeLockSupported()) {
      setStatus('unsupported');
      return;
    }

    if (!enabled) {
      void release();
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let onRelease: (() => void) | null = null;

    const acquire = async () => {
      if (cancelled || !enabledRef.current) return;
      // Already holding one: asking again would stack sentinels and leak them.
      if (sentinelRef.current && !sentinelRef.current.released) return;
      if (acquiringRef.current) return;
      // The platform only grants it to a visible page; not an error worth
      // reporting, we simply try again when the app comes back.
      if (document.visibilityState !== 'visible') {
        setStatus('idle');
        return;
      }

      acquiringRef.current = true;
      try {
        const sentinel: Sentinel = await (navigator as any).wakeLock.request(
          'screen',
        );

        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }

        sentinelRef.current = sentinel;
        setStatus('active');

        onRelease = () => {
          setStatus('idle');
          // Dropped by the platform rather than by us - take it back.
          void acquire();
        };
        sentinel.addEventListener('release', onRelease);
      } catch {
        if (!cancelled) setStatus('blocked');
      } finally {
        acquiringRef.current = false;
      }
    };

    const reacquire = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', reacquire);
    document.addEventListener('fullscreenchange', reacquire);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', reacquire);
      document.removeEventListener('fullscreenchange', reacquire);
      const sentinel = sentinelRef.current;
      if (sentinel && onRelease) sentinel.removeEventListener('release', onRelease);
      void release();
    };
  }, [enabled, release]);

  return status;
}
