import { describe, expect, it } from 'vitest';
import {
  FRAME_MS,
  MAX_SWEEP,
  MIN_SWEEP,
  clampSweep,
  sweepValue,
} from './useAnimatedSpeed';

describe('sweepValue', () => {
  it('starts at the origin and ends at the target', () => {
    expect(sweepValue(0, 100, 0, 1000)).toBe(0);
    expect(sweepValue(0, 100, 1000, 1000)).toBe(100);
  });

  it('moves at a constant rate, so digits tick evenly', () => {
    expect(sweepValue(0, 100, 250, 1000)).toBe(25);
    expect(sweepValue(0, 100, 500, 1000)).toBe(50);
    expect(sweepValue(0, 100, 750, 1000)).toBe(75);
  });

  it('never overshoots once the sweep is done', () => {
    expect(sweepValue(0, 100, 5000, 1000)).toBe(100);
  });

  it('sweeps downwards too', () => {
    expect(sweepValue(100, 0, 500, 1000)).toBe(50);
  });

  it('jumps straight to the target on a zero-length sweep', () => {
    expect(sweepValue(0, 60, 0, 0)).toBe(60);
  });
});

describe('clampSweep', () => {
  it('follows the measured gap between fixes', () => {
    expect(clampSweep(700)).toBe(700);
  });

  it('stays within bounds when fixes are unusually fast or slow', () => {
    expect(clampSweep(50)).toBe(MIN_SWEEP);
    expect(clampSweep(9000)).toBe(MAX_SWEEP);
  });

  it('falls back to the full sweep on a nonsense interval', () => {
    expect(clampSweep(0)).toBe(MAX_SWEEP);
    expect(clampSweep(-100)).toBe(MAX_SWEEP);
    expect(clampSweep(Number.NaN)).toBe(MAX_SWEEP);
  });
});

/**
 * Fluidity is a timing property, so assert it directly: replay a realistic
 * 1 Hz sequence through the same maths the hook runs and measure how long the
 * readout can sit frozen. The previous exponential approach raced to each new
 * value in ~300 ms and then stalled for ~700 ms, which is what made hard
 * acceleration look jerky.
 */
function longestFreeze(targetsKmh: number[], fixIntervalMs = 1000): number {
  let value = targetsKmh[0];
  let display = Math.round(value);
  const changeTimes: number[] = [];

  for (let i = 0; i < targetsKmh.length; i++) {
    const from = value;
    const to = targetsKmh[i];
    const startedAt = i * fixIntervalMs;
    const duration = clampSweep(fixIntervalMs);

    for (let t = startedAt; t < startedAt + fixIntervalMs; t += FRAME_MS) {
      value = sweepValue(from, to, t - startedAt, duration);
      const rounded = Math.round(value);
      if (rounded !== display) {
        display = rounded;
        changeTimes.push(t);
      }
    }
  }

  let worst = 0;
  for (let i = 1; i < changeTimes.length; i++) {
    worst = Math.max(worst, changeTimes[i] - changeTimes[i - 1]);
  }
  return worst;
}

describe('fluidity under real riding profiles', () => {
  // 0 to 100 km/h in about six seconds, then holding.
  const ACCELERATION = [0, 16.6, 33.5, 50, 66.6, 83.2, 100, 100, 100, 100];
  // 100 km/h to a full stop in about four seconds.
  const BRAKING = [100, 75, 50, 25, 0, 0, 0, 0];

  it('keeps the digits moving while accelerating hard', () => {
    // Two frames of stillness is imperceptible; half a second is a stutter.
    expect(longestFreeze(ACCELERATION)).toBeLessThan(200);
  });

  it('keeps the digits moving while braking hard', () => {
    expect(longestFreeze(BRAKING)).toBeLessThan(200);
  });

  it('still flows when the handset only reports every two seconds', () => {
    // The sweep is capped, so a slow device gets a pause rather than a crawl.
    expect(longestFreeze(ACCELERATION, 2000)).toBeLessThan(1200);
  });

  it('reaches a full stop within one sweep', () => {
    const duration = clampSweep(1000);
    expect(sweepValue(60, 0, duration, duration)).toBe(0);
    expect(duration).toBeLessThanOrEqual(MAX_SWEEP);
  });
});
