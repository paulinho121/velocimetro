import { describe, expect, it } from 'vitest';
import { formatClock, msUntilNextMinute } from './useClock';

describe('formatClock', () => {
  it('pads to HH:MM in 24-hour form', () => {
    expect(formatClock(new Date(2026, 7, 25, 9, 5))).toBe('09:05');
    expect(formatClock(new Date(2026, 7, 25, 14, 32))).toBe('14:32');
    expect(formatClock(new Date(2026, 7, 25, 0, 0))).toBe('00:00');
    expect(formatClock(new Date(2026, 7, 25, 23, 59))).toBe('23:59');
  });

  it('never shows 12-hour time, which would be ambiguous on a dashboard', () => {
    expect(formatClock(new Date(2026, 7, 25, 13, 0))).toBe('13:00');
  });
});

describe('msUntilNextMinute', () => {
  it('waits the remainder of the current minute', () => {
    // 20 s into a minute leaves 40 s.
    expect(msUntilNextMinute(20_000)).toBe(40_000);
    expect(msUntilNextMinute(59_999)).toBe(1);
  });

  it('waits a full minute when already exactly on the boundary', () => {
    // Zero would spin the timer instead of sleeping.
    expect(msUntilNextMinute(0)).toBe(60_000);
    expect(msUntilNextMinute(120_000)).toBe(60_000);
  });

  it('always returns a positive delay within one minute', () => {
    for (let ms = 0; ms < 200_000; ms += 997) {
      const delay = msUntilNextMinute(ms);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(60_000);
    }
  });

  it('lands exactly on the boundary from any starting point', () => {
    for (const start of [0, 1, 12_345, 59_999, 3_600_000 + 17]) {
      expect((start + msUntilNextMinute(start)) % 60_000).toBe(0);
    }
  });
});
