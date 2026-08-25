import { HazardAhead, LocationPoint, RoadHazard } from '../types';
import { angularDifference, calculateBearing, calculateDistance } from './geo';

/**
 * Deciding which hazard to warn about, kept pure so the geometry can be tested
 * without a GPS, a browser or a React tree.
 */

/** Anything beyond this is not actionable yet. */
export const CONSIDER_RADIUS = 1200;
/** How far off the direction of travel a hazard may sit and still count. */
export const AHEAD_CONE = 50;
/** Warn this many seconds before arrival... */
export const LEAD_SECONDS = 9;
/** ...but never later than this, so it still works at walking pace. */
export const MIN_ALERT_DISTANCE = 120;
/** Below this the bearing between two fixes is GPS noise, not a direction. */
export const MIN_TRAVEL_FOR_BEARING = 5;

export function alertDistanceFor(speedMs: number): number {
  return Math.max(MIN_ALERT_DISTANCE, speedMs * LEAD_SECONDS);
}

/**
 * The GPS reports no heading while stationary, and some hardware never reports
 * one at all, so fall back to the bearing between the last two fixes.
 */
export function resolveHeading(
  location: LocationPoint,
  prevPoint: LocationPoint | null,
): number | null {
  if (location.heading != null && !Number.isNaN(location.heading)) {
    return location.heading;
  }
  if (!prevPoint) return null;

  const travelled = calculateDistance(
    prevPoint.lat,
    prevPoint.lng,
    location.lat,
    location.lng,
  );
  if (travelled <= MIN_TRAVEL_FOR_BEARING) return null;

  return calculateBearing(prevPoint.lat, prevPoint.lng, location.lat, location.lng);
}

/**
 * Nearest hazard within the cone ahead. Returns null when nothing qualifies -
 * including when the heading is unknown, because warning about something
 * behind the rider is worse than staying quiet.
 */
export function selectNextHazard(
  location: Pick<LocationPoint, 'lat' | 'lng'>,
  heading: number | null,
  hazards: RoadHazard[],
  speedMs: number,
): HazardAhead | null {
  if (heading === null || hazards.length === 0) return null;

  const alertDistance = alertDistanceFor(speedMs);
  let best: HazardAhead | null = null;

  for (const hazard of hazards) {
    const distance = calculateDistance(
      location.lat,
      location.lng,
      hazard.lat,
      hazard.lng,
    );
    if (distance > CONSIDER_RADIUS) continue;

    const bearing = calculateBearing(
      location.lat,
      location.lng,
      hazard.lat,
      hazard.lng,
    );
    if (angularDifference(bearing, heading) > AHEAD_CONE) continue;

    if (!best || distance < best.distance) {
      best = { hazard, distance, isAlerting: distance <= alertDistance };
    }
  }

  return best;
}
