import { useEffect, useRef, useState } from 'react';

/** ~30 fps is plenty for digits and far cheaper than a rAF loop. */
const FRAME_MS = 33;
/** Fraction of the remaining gap closed each frame (~330 ms to settle). */
const STEP = 0.25;
/** Close enough to stop ticking. */
const EPSILON = 0.05;

/**
 * Sweeps the displayed number towards the real one instead of letting it jump
 * once per GPS fix. The GPS delivers at 1 Hz, so without this the readout
 * teleports 0 -> 16 -> 26 during acceleration and reads like a data field
 * rather than an instrument.
 *
 * Returns an already-rounded integer and only re-renders when that integer
 * changes, so a smooth-looking climb costs a handful of renders per second
 * rather than thirty. The ticker stops itself once settled.
 */
export function useAnimatedSpeed(target: number): number {
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;

  const valueRef = useRef(safeTarget);
  const targetRef = useRef(safeTarget);
  const displayRef = useRef(Math.round(safeTarget));
  const [display, setDisplay] = useState(displayRef.current);

  targetRef.current = safeTarget;

  useEffect(() => {
    let timer = 0;

    const commit = (v: number) => {
      const rounded = Math.round(v);
      if (rounded !== displayRef.current) {
        displayRef.current = rounded;
        setDisplay(rounded);
      }
    };

    const step = () => {
      const t = targetRef.current;
      const diff = t - valueRef.current;

      if (Math.abs(diff) < EPSILON) {
        valueRef.current = t;
        commit(t);
        return; // settled - no more timers until the target moves
      }

      valueRef.current += diff * STEP;
      commit(valueRef.current);
      timer = window.setTimeout(step, FRAME_MS);
    };

    step();
    return () => window.clearTimeout(timer);
  }, [safeTarget]);

  return display;
}
