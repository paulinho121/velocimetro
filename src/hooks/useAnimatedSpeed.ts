import { useEffect, useRef, useState } from 'react';

/** ~30 fps is plenty for digits and far cheaper than a rAF loop. */
export const FRAME_MS = 33;
/** Bounds for the sweep, in case fixes arrive unusually fast or stop entirely. */
export const MIN_SWEEP = 400;
export const MAX_SWEEP = 1000;

/** Linear position between two values. Even ticking beats an eased flourish. */
export function sweepValue(
  from: number,
  to: number,
  elapsed: number,
  duration: number,
): number {
  if (duration <= 0) return to;
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  return from + (to - from) * progress;
}

export function clampSweep(interval: number): number {
  if (!Number.isFinite(interval) || interval <= 0) return MAX_SWEEP;
  return Math.min(MAX_SWEEP, Math.max(MIN_SWEEP, interval));
}

/**
 * Sweeps the displayed number towards the real one instead of letting it jump
 * once per GPS fix.
 *
 * The sweep is spread across the measured gap between fixes rather than racing
 * to the target: an exponential approach reached the new value in ~300 ms and
 * then sat frozen for the remaining ~700 ms of the second, which reads as a
 * stutter under hard acceleration. Filling the gap instead keeps the digits
 * ticking continuously, at the cost of trailing the raw reading by up to one
 * GPS interval - invisible on a speedometer, unlike the stutter.
 *
 * Returns an already-rounded integer and only re-renders when that integer
 * changes, so a smooth climb costs a handful of renders per second rather than
 * thirty. The ticker stops itself once settled.
 */
export function useAnimatedSpeed(target: number): number {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;

  const valueRef = useRef(safeTarget);
  const displayRef = useRef(Math.round(safeTarget));
  const lastTargetAtRef = useRef(0);
  const [display, setDisplay] = useState(displayRef.current);

  useEffect(() => {
    const now = Date.now();
    const previousTargetAt = lastTargetAtRef.current;
    lastTargetAtRef.current = now;

    const duration = clampSweep(
      previousTargetAt > 0 ? now - previousTargetAt : MAX_SWEEP,
    );
    const from = valueRef.current;
    let timer = 0;

    const commit = (v: number) => {
      const rounded = Math.round(v);
      if (rounded !== displayRef.current) {
        displayRef.current = rounded;
        setDisplay(rounded);
      }
    };

    const step = () => {
      const elapsed = Date.now() - now;
      const next = sweepValue(from, safeTarget, elapsed, duration);
      valueRef.current = next;
      commit(next);

      if (elapsed >= duration) return; // arrived - stop ticking
      timer = window.setTimeout(step, FRAME_MS);
    };

    step();
    return () => window.clearTimeout(timer);
  }, [safeTarget]);

  return display;
}
