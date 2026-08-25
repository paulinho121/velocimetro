import { describe, expect, it } from 'vitest';
import {
  SpeedSmoother,
  STOPPED_THRESHOLD,
  angularDifference,
  calculateBearing,
  calculateDistance,
  convertSpeed,
  distanceParts,
  getHeadingName,
  unitLabel,
} from './geo';

const kmh = (ms: number) => ms * 3.6;

describe('calculateDistance', () => {
  it('measures a known separation', () => {
    // One degree of latitude is ~111.2 km anywhere on the globe.
    const d = calculateDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_500);
  });

  it('is zero for the same point', () => {
    expect(calculateDistance(-3.73, -38.52, -3.73, -38.52)).toBe(0);
  });

  it('is symmetric', () => {
    const a = calculateDistance(-3.73, -38.52, -3.74, -38.53);
    const b = calculateDistance(-3.74, -38.53, -3.73, -38.52);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('calculateBearing', () => {
  it('points north, east, south and west', () => {
    expect(calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 1);
    expect(calculateBearing(0, 0, 0, 1)).toBeCloseTo(90, 1);
    expect(calculateBearing(0, 0, -1, 0)).toBeCloseTo(180, 1);
    expect(calculateBearing(0, 0, 0, -1)).toBeCloseTo(-90, 1);
  });
});

describe('angularDifference', () => {
  it('never exceeds 180', () => {
    expect(angularDifference(0, 350)).toBe(10);
    expect(angularDifference(350, 0)).toBe(10);
    expect(angularDifference(10, 190)).toBe(180);
  });

  it('handles negative bearings, which calculateBearing can return', () => {
    expect(angularDifference(-90, 270)).toBe(0);
    expect(angularDifference(-10, 10)).toBe(20);
  });
});

describe('SpeedSmoother', () => {
  const warmedTo = (ms: number) => {
    const s = new SpeedSmoother();
    for (let i = 0; i < 20; i++) s.update(ms);
    return s;
  };

  it('snaps to zero instead of coasting down', () => {
    // The original filter still showed 16 km/h four seconds after the GPS
    // reported a full stop, and took ten seconds to reach zero.
    const s = warmedTo(16.67); // 60 km/h
    expect(kmh(s.update(0))).toBe(0);
  });

  it('reads zero while parked with typical GPS noise', () => {
    const s = new SpeedSmoother();
    for (const noise of [0.2, 0.5, 0.1, 0.4, 0.3, 0.6, 0.8]) {
      expect(s.update(noise)).toBe(0);
    }
  });

  it('treats anything under the threshold as stopped', () => {
    const s = warmedTo(16.67);
    expect(s.update(STOPPED_THRESHOLD - 0.01)).toBe(0);
  });

  it('keeps reporting just above the threshold', () => {
    const s = new SpeedSmoother();
    expect(s.update(STOPPED_THRESHOLD + 0.5)).toBeGreaterThan(0);
  });

  it('responds faster to braking than to acceleration', () => {
    const from = 16.67;
    const delta = 5;

    const braking = warmedTo(from);
    const brakingGap = Math.abs(braking.update(from - delta) - (from - delta));

    const accelerating = warmedTo(from);
    const accelGap = Math.abs(accelerating.update(from + delta) - (from + delta));

    expect(brakingGap).toBeLessThan(accelGap);
  });

  it('tracks acceleration closely enough to feel live', () => {
    const s = new SpeedSmoother();
    const ramp = [0, 2.8, 5.6, 8.3, 11.1, 13.9, 16.67];
    let shown = 0;
    for (const v of ramp) shown = s.update(v);
    // Within 10% of the real 60 km/h on the very fix that reaches it.
    expect(kmh(shown)).toBeGreaterThan(kmh(16.67) * 0.9);
  });

  it('takes the first reading as-is rather than ramping up from zero', () => {
    const s = new SpeedSmoother();
    expect(s.update(20)).toBe(20);
  });

  it('rejects NaN and negative readings', () => {
    const s = warmedTo(16.67);
    expect(s.update(Number.NaN)).toBe(0);
    const s2 = warmedTo(16.67);
    expect(s2.update(-5)).toBe(0);
  });

  it('decays to zero when fixes stop arriving', () => {
    const s = warmedTo(16.67);
    let value = s.current;
    for (let i = 0; i < 10 && value > 0; i++) value = s.decay(0.6);
    expect(value).toBe(0);
  });

  it('starts fresh after reset', () => {
    const s = warmedTo(16.67);
    s.reset();
    expect(s.current).toBe(0);
    expect(s.update(10)).toBe(10);
  });
});

describe('convertSpeed', () => {
  it('converts to each supported unit', () => {
    expect(convertSpeed(10, 'kmh')).toBeCloseTo(36, 5);
    expect(convertSpeed(10, 'mph')).toBeCloseTo(22.3694, 3);
    expect(convertSpeed(10, 'ms')).toBe(10);
  });

  it('clamps nonsense to zero', () => {
    expect(convertSpeed(-5, 'kmh')).toBe(0);
    expect(convertSpeed(Number.NaN, 'kmh')).toBe(0);
  });
});

describe('distanceParts', () => {
  it('keeps metres and kilometres with their own label', () => {
    // The bug this guards: parseFloat("500 m") was rendered next to a
    // hardcoded "km", showing 500 metres as 500 km.
    expect(distanceParts(500, 'kmh')).toEqual({ value: '500', label: 'm' });
    expect(distanceParts(1500, 'kmh')).toEqual({ value: '1.5', label: 'km' });
  });

  it('uses miles for imperial', () => {
    expect(distanceParts(1609.34, 'mph')).toEqual({ value: '1.0', label: 'mi' });
  });

  it('clamps nonsense to zero', () => {
    expect(distanceParts(-10, 'kmh').value).toBe('0');
    expect(distanceParts(Number.NaN, 'kmh').value).toBe('0');
  });
});

describe('unitLabel', () => {
  it('renders a human label, not the raw enum', () => {
    expect(unitLabel('kmh')).toBe('km/h');
    expect(unitLabel('mph')).toBe('mph');
    expect(unitLabel('ms')).toBe('m/s');
  });
});

describe('getHeadingName', () => {
  it('names the eight compass points', () => {
    expect(getHeadingName(0)).toBe('N');
    expect(getHeadingName(90)).toBe('E');
    expect(getHeadingName(180)).toBe('S');
    expect(getHeadingName(270)).toBe('O');
    expect(getHeadingName(359)).toBe('N');
  });

  it('handles missing and negative headings', () => {
    expect(getHeadingName(null)).toBe('-');
    expect(getHeadingName(Number.NaN)).toBe('-');
    expect(getHeadingName(-90)).toBe('O');
  });
});
