import { describe, expect, it } from 'vitest';
import { LocationPoint, RoadHazard } from '../types';
import {
  AHEAD_CONE,
  MIN_ALERT_DISTANCE,
  alertDistanceFor,
  resolveHeading,
  selectNextHazard,
} from './hazards';

const HERE = { lat: -3.7319, lng: -38.5267 };

/** Places a hazard `metres` away on the given bearing from HERE. */
const hazardAt = (
  metres: number,
  bearingDeg: number,
  over: Partial<RoadHazard> = {},
): RoadHazard => {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    id: `n/${metres}-${bearingDeg}`,
    type: 'bump',
    subtype: 'hump',
    lat: HERE.lat + (metres * Math.cos(rad)) / 111_320,
    lng:
      HERE.lng +
      (metres * Math.sin(rad)) / (111_320 * Math.cos((HERE.lat * Math.PI) / 180)),
    maxspeed: null,
    ...over,
  };
};

const point = (over: Partial<LocationPoint> = {}): LocationPoint => ({
  ...HERE,
  alt: 20,
  speed: null,
  heading: null,
  accuracy: 5,
  timestamp: 1_000_000,
  ...over,
});

describe('alertDistanceFor', () => {
  it('warns earlier the faster you go', () => {
    expect(alertDistanceFor(30)).toBeGreaterThan(alertDistanceFor(10));
  });

  it('never drops below the floor, so it still works at walking pace', () => {
    expect(alertDistanceFor(0)).toBe(MIN_ALERT_DISTANCE);
  });
});

describe('resolveHeading', () => {
  it('uses the GPS heading when the hardware reports one', () => {
    expect(resolveHeading(point({ heading: 42 }), null)).toBe(42);
  });

  it('derives a bearing from the last two fixes otherwise', () => {
    const prev = point();
    const now = point({ lat: prev.lat + 0.001 }); // ~111 m north
    expect(resolveHeading(now, prev)).toBeCloseTo(0, 0);
  });

  it('refuses to guess from a move too small to be real', () => {
    const prev = point();
    const now = point({ lat: prev.lat + 0.00001 }); // ~1 m: GPS noise
    expect(resolveHeading(now, prev)).toBeNull();
  });

  it('is null on the very first fix with no reported heading', () => {
    expect(resolveHeading(point(), null)).toBeNull();
  });

  it('ignores a NaN heading', () => {
    expect(resolveHeading(point({ heading: Number.NaN }), null)).toBeNull();
  });
});

describe('selectNextHazard', () => {
  it('picks a hazard straight ahead', () => {
    const ahead = hazardAt(300, 0);
    const result = selectNextHazard(HERE, 0, [ahead], 10);
    expect(result?.hazard.id).toBe(ahead.id);
    expect(result?.distance).toBeGreaterThan(280);
    expect(result?.distance).toBeLessThan(320);
  });

  it('ignores a hazard behind the rider', () => {
    // Warning about something already passed is worse than staying quiet.
    expect(selectNextHazard(HERE, 0, [hazardAt(300, 180)], 10)).toBeNull();
  });

  it('ignores a hazard off to the side', () => {
    expect(selectNextHazard(HERE, 0, [hazardAt(300, 90)], 10)).toBeNull();
  });

  it('respects the edges of the cone', () => {
    const inside = selectNextHazard(HERE, 0, [hazardAt(300, AHEAD_CONE - 5)], 10);
    const outside = selectNextHazard(HERE, 0, [hazardAt(300, AHEAD_CONE + 5)], 10);
    expect(inside).not.toBeNull();
    expect(outside).toBeNull();
  });

  it('handles the wrap around north', () => {
    // Heading 350 and a hazard at bearing 10 are 20 degrees apart, not 340.
    expect(selectNextHazard(HERE, 350, [hazardAt(300, 10)], 10)).not.toBeNull();
  });

  it('picks the nearest when several lie ahead', () => {
    const near = hazardAt(200, 5);
    const far = hazardAt(800, 5);
    const result = selectNextHazard(HERE, 0, [far, near], 10);
    expect(result?.hazard.id).toBe(near.id);
  });

  it('ignores anything past the consideration radius', () => {
    expect(selectNextHazard(HERE, 0, [hazardAt(5000, 0)], 10)).toBeNull();
  });

  it('stays quiet when the heading is unknown', () => {
    expect(selectNextHazard(HERE, null, [hazardAt(200, 0)], 10)).toBeNull();
  });

  it('flags alerting only once inside the warning distance', () => {
    const close = selectNextHazard(HERE, 0, [hazardAt(100, 0)], 0);
    const far = selectNextHazard(HERE, 0, [hazardAt(600, 0)], 0);
    expect(close?.isAlerting).toBe(true);
    expect(far?.isAlerting).toBe(false);
  });

  it('starts alerting sooner at speed', () => {
    const hazard = [hazardAt(250, 0)];
    expect(selectNextHazard(HERE, 0, hazard, 5)?.isAlerting).toBe(false);
    expect(selectNextHazard(HERE, 0, hazard, 30)?.isAlerting).toBe(true);
  });

  it('carries the camera limit through', () => {
    const camera = hazardAt(200, 0, {
      type: 'camera',
      subtype: 'speed_camera',
      maxspeed: 60,
    });
    expect(selectNextHazard(HERE, 0, [camera], 10)?.hazard.maxspeed).toBe(60);
  });

  it('copes with an empty hazard list', () => {
    expect(selectNextHazard(HERE, 0, [], 10)).toBeNull();
  });
});
