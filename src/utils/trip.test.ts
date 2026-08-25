import { describe, expect, it } from 'vitest';
import { LocationPoint, Trip } from '../types';
import {
  applyFixToTrip,
  applyIdleTime,
  computeFixDelta,
  createTrip,
  isTripWorthKeeping,
  PATH_MAX_POINTS,
  rawSpeedFrom,
  shouldStorePoint,
} from './trip';

const point = (over: Partial<LocationPoint> = {}): LocationPoint => ({
  lat: -3.7319,
  lng: -38.5267,
  alt: 20,
  speed: null,
  heading: null,
  accuracy: 5,
  timestamp: 1_000_000,
  ...over,
});

/** Roughly 111 m north per 0.001 degrees of latitude. */
const northOf = (p: LocationPoint, degrees: number, afterMs: number) =>
  point({ ...p, lat: p.lat + degrees, timestamp: p.timestamp + afterMs });

/**
 * Moves north by exactly the distance the given speed implies. Fixtures that
 * move at one speed while claiming another produce nonsense invariants - the
 * same trap the demo GPS generator fell into.
 */
const travelNorth = (p: LocationPoint, speedMs: number, afterMs: number) =>
  point({
    ...p,
    lat: p.lat + (speedMs * (afterMs / 1000)) / 111_320,
    timestamp: p.timestamp + afterMs,
  });

const emptyTrip = (): Trip => createTrip('t1', 'moto', 1_000_000, null);

describe('rawSpeedFrom', () => {
  it('prefers the GPS Doppler reading', () => {
    expect(rawSpeedFrom(null, point({ speed: 12.5 }))).toBe(12.5);
  });

  it('falls back to distance over time when speed is null', () => {
    const a = point({ speed: null });
    const b = northOf(a, 0.001, 10_000); // ~111 m in 10 s
    expect(rawSpeedFrom(a, b)).toBeCloseTo(11.1, 0);
  });

  it('is zero on the first fix with no reported speed', () => {
    expect(rawSpeedFrom(null, point({ speed: null }))).toBe(0);
  });

  it('does not divide by a zero or negative time gap', () => {
    const a = point();
    const b = point({ lat: a.lat + 0.001, timestamp: a.timestamp });
    expect(rawSpeedFrom(a, b)).toBe(0);
  });

  it('ignores a negative speed from the hardware', () => {
    expect(rawSpeedFrom(null, point({ speed: -1 }))).toBe(0);
  });
});

describe('computeFixDelta', () => {
  it('accumulates distance between fixes', () => {
    const a = point();
    const b = northOf(a, 0.001, 1000);
    const delta = computeFixDelta(a, b, 11.1, a.timestamp);
    expect(delta.distAdded).toBeGreaterThan(100);
    expect(delta.distAdded).toBeLessThan(120);
  });

  it('discards jitter while essentially stationary', () => {
    const a = point();
    // ~0.1 m of wobble at a standstill
    const b = point({ ...a, lat: a.lat + 0.000001, timestamp: a.timestamp + 1000 });
    const delta = computeFixDelta(a, b, 0, a.timestamp);
    expect(delta.distAdded).toBe(0);
  });

  it('keeps a short move when actually moving', () => {
    const a = point();
    const b = point({ ...a, lat: a.lat + 0.00001, timestamp: a.timestamp + 1000 });
    const delta = computeFixDelta(a, b, 5, a.timestamp);
    expect(delta.distAdded).toBeGreaterThan(0);
  });

  it('splits elapsed time by whether the vehicle is moving', () => {
    const a = point();
    const b = northOf(a, 0.001, 1000);
    expect(computeFixDelta(a, b, 10, a.timestamp).isMoving).toBe(true);
    expect(computeFixDelta(a, b, 0, a.timestamp).isMoving).toBe(false);
  });

  it('reports no elapsed time before the first tick', () => {
    const a = point();
    expect(computeFixDelta(null, a, 0, 0).elapsed).toBe(0);
  });

  it('never reports negative elapsed time if a fix arrives out of order', () => {
    const a = point({ timestamp: 1000 });
    expect(computeFixDelta(null, a, 0, 5000).elapsed).toBe(0);
  });

  it('separates climbing from descending, ignoring small wobble', () => {
    const a = point({ alt: 20 });
    const up = point({ ...a, alt: 25, timestamp: a.timestamp + 1000 });
    const down = point({ ...a, alt: 15, timestamp: a.timestamp + 1000 });
    const flat = point({ ...a, alt: 20.5, timestamp: a.timestamp + 1000 });

    expect(computeFixDelta(a, up, 5, a.timestamp).ascentAdded).toBe(5);
    expect(computeFixDelta(a, down, 5, a.timestamp).descentAdded).toBe(5);
    expect(computeFixDelta(a, flat, 5, a.timestamp).ascentAdded).toBe(0);
    expect(computeFixDelta(a, flat, 5, a.timestamp).descentAdded).toBe(0);
  });

  it('skips altitude when the hardware reports none', () => {
    const a = point({ alt: null });
    const b = point({ ...a, alt: null, timestamp: a.timestamp + 1000 });
    const delta = computeFixDelta(a, b, 5, a.timestamp);
    expect(delta.ascentAdded).toBe(0);
    expect(delta.descentAdded).toBe(0);
  });
});

describe('applyFixToTrip', () => {
  it('accumulates across successive fixes', () => {
    // The bug this guards: distance and time stayed at zero for a whole ride
    // because the maths ran inside a setState updater that mutated refs.
    let trip = emptyTrip();
    let prev = point({ speed: 10 });

    for (let i = 1; i <= 5; i++) {
      const next = northOf(prev, 0.0001, 1000);
      const delta = computeFixDelta(prev, next, 10, prev.timestamp);
      trip = applyFixToTrip(trip, delta, next, true, 10);
      prev = next;
    }

    expect(trip.distance).toBeGreaterThan(50);
    expect(trip.movingTime).toBe(5000);
    expect(trip.stoppedTime).toBe(0);
  });

  it('never reports an average above the maximum', () => {
    // The bug this guards: average speed came out at 55 km/h on a trip whose
    // recorded maximum was 9 km/h.
    let trip = emptyTrip();
    let prev = point({ speed: 11.1 });

    for (let i = 1; i <= 20; i++) {
      const next = travelNorth(prev, 11.1, 1000);
      const delta = computeFixDelta(prev, next, 11.1, prev.timestamp);
      trip = applyFixToTrip(trip, delta, next, true, 11.1);
      prev = next;
    }

    expect(trip.averageSpeed).toBeLessThanOrEqual(trip.maxSpeed);
    // And it should actually equal it on a constant-speed ride.
    expect(trip.averageSpeed).toBeCloseTo(11.1, 1);
  });

  it('matches the real average on a ride at varying speed', () => {
    let trip = emptyTrip();
    let prev = point({ speed: 0 });
    const speeds = [5, 10, 15, 20, 15, 10, 5];

    for (const v of speeds) {
      const next = travelNorth(prev, v, 1000);
      const delta = computeFixDelta(prev, next, v, prev.timestamp);
      trip = applyFixToTrip(trip, delta, next, true, v);
      prev = next;
    }

    const expected = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(trip.averageSpeed).toBeCloseTo(expected, 1);
    expect(trip.maxSpeed).toBe(20);
  });

  it('keeps the highest speed ever seen', () => {
    let trip = emptyTrip();
    const p = point();
    const delta = computeFixDelta(null, p, 0, 0);
    trip = applyFixToTrip(trip, delta, p, false, 30);
    trip = applyFixToTrip(trip, delta, p, false, 12);
    expect(trip.maxSpeed).toBe(30);
  });

  it('counts standing still as stopped time, not moving time', () => {
    const trip = applyFixToTrip(
      emptyTrip(),
      { distAdded: 0, ascentAdded: 0, descentAdded: 0, elapsed: 3000, isMoving: false },
      point(),
      false,
      0,
    );
    expect(trip.stoppedTime).toBe(3000);
    expect(trip.movingTime).toBe(0);
    expect(trip.averageSpeed).toBe(0);
  });

  it('does not grow the path when the point is not worth storing', () => {
    const trip = applyFixToTrip(
      emptyTrip(),
      computeFixDelta(null, point(), 0, 0),
      point(),
      false,
      5,
    );
    expect(trip.path).toHaveLength(0);
  });

  it('stops growing the path at the ceiling', () => {
    const base = emptyTrip();
    const full: Trip = { ...base, path: new Array(PATH_MAX_POINTS).fill(point()) };
    const trip = applyFixToTrip(
      full,
      computeFixDelta(null, point(), 0, 0),
      point(),
      true,
      5,
    );
    expect(trip.path).toHaveLength(PATH_MAX_POINTS);
  });

  it('leaves the previous trip object untouched', () => {
    const trip = emptyTrip();
    const before = JSON.stringify(trip);
    applyFixToTrip(
      trip,
      { distAdded: 100, ascentAdded: 0, descentAdded: 0, elapsed: 1000, isMoving: true },
      point(),
      true,
      10,
    );
    expect(JSON.stringify(trip)).toBe(before);
  });
});

describe('shouldStorePoint', () => {
  it('always stores the first point', () => {
    expect(shouldStorePoint(null, point())).toBe(true);
  });

  it('skips points that are too close together', () => {
    const a = point();
    const b = point({ ...a, lat: a.lat + 0.00001, timestamp: a.timestamp + 1000 });
    expect(shouldStorePoint(a, b)).toBe(false);
  });

  it('stores once the rider has moved far enough', () => {
    const a = point();
    expect(shouldStorePoint(a, northOf(a, 0.0002, 1000))).toBe(true);
  });

  it('stores anyway after a long enough pause', () => {
    const a = point();
    const b = point({ ...a, timestamp: a.timestamp + 11_000 });
    expect(shouldStorePoint(a, b)).toBe(true);
  });
});

describe('applyIdleTime', () => {
  it('advances the right clock', () => {
    expect(applyIdleTime(emptyTrip(), 2000, false).stoppedTime).toBe(2000);
    expect(applyIdleTime(emptyTrip(), 2000, true).movingTime).toBe(2000);
  });
});

describe('isTripWorthKeeping', () => {
  it('discards a trip where nothing happened', () => {
    expect(isTripWorthKeeping(emptyTrip())).toBe(false);
  });

  it('keeps a trip with distance or moving time', () => {
    expect(isTripWorthKeeping({ ...emptyTrip(), distance: 10 })).toBe(true);
    expect(isTripWorthKeeping({ ...emptyTrip(), movingTime: 5000 })).toBe(true);
  });
});
