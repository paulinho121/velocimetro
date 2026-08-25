// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimatedSpeed } from './useAnimatedSpeed';

/**
 * Exercises the real hook - effects, refs and all - on fake timers.
 *
 * The pure-maths tests next door prove the sweep is right; these prove the
 * React wiring actually drives it. Measuring this in a live browser turned out
 * to be worthless: a hidden page has its timers clamped to ~1 s, so every
 * reading described the throttling rather than the animation.
 */

const FIX_MS = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Feeds a 1 Hz target sequence and records the readout at every frame. */
function replay(targets: number[], stepMs = 33) {
  const { result, rerender } = renderHook(
    ({ target }) => useAnimatedSpeed(target),
    { initialProps: { target: targets[0] } },
  );

  const frames: { t: number; value: number }[] = [];
  let now = 0;

  for (const target of targets) {
    act(() => rerender({ target }));
    for (let elapsed = 0; elapsed < FIX_MS; elapsed += stepMs) {
      act(() => {
        vi.advanceTimersByTime(stepMs);
      });
      now += stepMs;
      frames.push({ t: now, value: result.current });
    }
  }

  return frames;
}

function freezeStats(frames: { t: number; value: number }[]) {
  const changes: number[] = [];
  const jumps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].value !== frames[i - 1].value) {
      changes.push(frames[i].t);
      jumps.push(Math.abs(frames[i].value - frames[i - 1].value));
    }
  }
  let longest = 0;
  for (let i = 1; i < changes.length; i++) {
    longest = Math.max(longest, changes[i] - changes[i - 1]);
  }
  return { changes: changes.length, longestFreeze: longest, biggestJump: Math.max(0, ...jumps) };
}

describe('useAnimatedSpeed driving a real component', () => {
  it('settles on the target it is given', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedSpeed(target),
      { initialProps: { target: 0 } },
    );

    act(() => rerender({ target: 60 }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(60);
  });

  it('never skips digits while accelerating hard', () => {
    // 0 to 100 km/h in six seconds.
    const stats = freezeStats(replay([0, 16.6, 33.5, 50, 66.6, 83.2, 100, 100]));
    expect(stats.biggestJump).toBe(1);
  });

  it('keeps the readout moving while accelerating hard', () => {
    const stats = freezeStats(replay([0, 16.6, 33.5, 50, 66.6, 83.2, 100, 100]));
    expect(stats.longestFreeze).toBeLessThan(200);
  });

  it('keeps the readout moving while braking hard', () => {
    const stats = freezeStats(replay([100, 75, 50, 25, 0, 0]));
    expect(stats.biggestJump).toBe(1);
    expect(stats.longestFreeze).toBeLessThan(200);
  });

  it('counts all the way down to a standstill', () => {
    const frames = replay([60, 0, 0]);
    expect(frames[frames.length - 1].value).toBe(0);
    // And passes through the intermediate values rather than blanking out.
    const seen = new Set(frames.map((f) => f.value));
    expect(seen.has(30)).toBe(true);
  });

  it('stops ticking once settled, so a parked bike burns no timers', () => {
    const { rerender } = renderHook(({ target }) => useAnimatedSpeed(target), {
      initialProps: { target: 40 },
    });
    act(() => rerender({ target: 40 }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds steady when the speed does not change', () => {
    const frames = replay([50, 50, 50]);
    const tail = frames.slice(Math.floor(frames.length / 2));
    expect(new Set(tail.map((f) => f.value)).size).toBe(1);
  });
});
