import { LocationPoint, Trip } from '../types';
import { calculateDistance } from './geo';

/**
 * The per-fix trip maths, kept pure and outside React.
 *
 * This logic previously lived inside a setState updater, where it mutated refs
 * and read back what it had just written - which silently lost every delta the
 * moment React invoked the updater twice. Pulling it out here is what makes it
 * testable, and the tests below it are the reason that class of bug cannot
 * come back unnoticed.
 */

/** Below this the vehicle counts as stopped for time accounting. */
export const MOVING_THRESHOLD_MS = 0.5;
/** Ignore sub-2 m wobble while essentially stationary; it is GPS jitter. */
export const JITTER_DISTANCE = 2;
export const JITTER_SPEED = 1;
/** Altitude changes below this are noise, not climbing. */
export const ALTITUDE_THRESHOLD = 1;
/** Record a path point at least every N metres... */
export const PATH_MIN_DISTANCE = 8;
/** ...and never let more than this elapse without one. */
export const PATH_MAX_INTERVAL = 10000;
/** Hard ceiling so a long ride cannot grow an unbounded array. */
export const PATH_MAX_POINTS = 5000;

/**
 * Speed for this fix, in m/s. Prefers the GPS Doppler reading, which is far
 * better than differentiating positions, and only falls back to coordinates
 * when the hardware reports nothing.
 */
export function rawSpeedFrom(
  prevPoint: LocationPoint | null,
  location: LocationPoint,
): number {
  if (location.speed !== null && location.speed >= 0) return location.speed;
  if (!prevPoint) return 0;

  const d = calculateDistance(
    prevPoint.lat,
    prevPoint.lng,
    location.lat,
    location.lng,
  );
  const dt = (location.timestamp - prevPoint.timestamp) / 1000;
  return dt > 0 ? d / dt : 0;
}

export interface FixDelta {
  distAdded: number;
  ascentAdded: number;
  descentAdded: number;
  elapsed: number;
  isMoving: boolean;
}

export function computeFixDelta(
  prevPoint: LocationPoint | null,
  location: LocationPoint,
  smoothedSpeed: number,
  lastTickAt: number,
): FixDelta {
  let distAdded = 0;
  if (prevPoint) {
    distAdded = calculateDistance(
      prevPoint.lat,
      prevPoint.lng,
      location.lat,
      location.lng,
    );
    if (distAdded < JITTER_DISTANCE && smoothedSpeed < JITTER_SPEED) {
      distAdded = 0;
    }
  }

  let ascentAdded = 0;
  let descentAdded = 0;
  if (prevPoint && location.alt !== null && prevPoint.alt !== null) {
    const dAlt = location.alt - prevPoint.alt;
    if (dAlt > ALTITUDE_THRESHOLD) ascentAdded = dAlt;
    else if (dAlt < -ALTITUDE_THRESHOLD) descentAdded = Math.abs(dAlt);
  }

  const elapsed =
    lastTickAt > 0 ? Math.max(0, location.timestamp - lastTickAt) : 0;

  return {
    distAdded,
    ascentAdded,
    descentAdded,
    elapsed,
    isMoving: smoothedSpeed > MOVING_THRESHOLD_MS,
  };
}

/** Whether this fix is worth keeping in the recorded path. */
export function shouldStorePoint(
  lastStored: LocationPoint | null,
  location: LocationPoint,
): boolean {
  if (!lastStored) return true;
  if (location.timestamp - lastStored.timestamp >= PATH_MAX_INTERVAL) return true;
  return (
    calculateDistance(
      lastStored.lat,
      lastStored.lng,
      location.lat,
      location.lng,
    ) >= PATH_MIN_DISTANCE
  );
}

export function applyFixToTrip(
  trip: Trip,
  delta: FixDelta,
  location: LocationPoint,
  storePoint: boolean,
  smoothedSpeed: number,
): Trip {
  const distance = trip.distance + delta.distAdded;
  const movingTime = trip.movingTime + (delta.isMoving ? delta.elapsed : 0);
  const stoppedTime = trip.stoppedTime + (delta.isMoving ? 0 : delta.elapsed);

  return {
    ...trip,
    distance,
    maxSpeed: Math.max(trip.maxSpeed, smoothedSpeed),
    path:
      storePoint && trip.path.length < PATH_MAX_POINTS
        ? [...trip.path, location]
        : trip.path,
    movingTime,
    stoppedTime,
    totalAscent: trip.totalAscent + delta.ascentAdded,
    totalDescent: trip.totalDescent + delta.descentAdded,
    averageSpeed: movingTime > 0 ? distance / (movingTime / 1000) : 0,
  };
}

/** Time accounting for the seconds when no fix arrives (parked, or no signal). */
export function applyIdleTime(
  trip: Trip,
  elapsed: number,
  isMoving: boolean,
): Trip {
  return {
    ...trip,
    movingTime: trip.movingTime + (isMoving ? elapsed : 0),
    stoppedTime: trip.stoppedTime + (isMoving ? 0 : elapsed),
  };
}

export function createTrip(id: string, mode: Trip['mode'], startTime: number, first: LocationPoint | null): Trip {
  return {
    id,
    startTime,
    endTime: null,
    mode,
    distance: 0,
    maxSpeed: 0,
    averageSpeed: 0,
    movingTime: 0,
    stoppedTime: 0,
    totalAscent: 0,
    totalDescent: 0,
    path: first ? [first] : [],
  };
}

/** A trip only deserves a slot in the history if something actually happened. */
export function isTripWorthKeeping(trip: Trip): boolean {
  return trip.distance > 0 || trip.movingTime > 0;
}
