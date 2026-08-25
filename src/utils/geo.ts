import { LocationPoint, Unit } from '../types';

const EARTH_RADIUS = 6371e3; // meters

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function formatSpeed(speedMs: number, unit: Unit): string {
  if (isNaN(speedMs) || speedMs < 0) speedMs = 0;
  let converted = 0;
  if (unit === 'kmh') {
    converted = speedMs * 3.6;
  } else if (unit === 'mph') {
    converted = speedMs * 2.23694;
  } else {
    converted = speedMs;
  }
  return converted.toFixed(1); // 1 decimal place or 0? 0 is better for main display, but let caller handle it.
}

export function convertSpeed(speedMs: number, unit: Unit): number {
  if (isNaN(speedMs) || speedMs < 0) speedMs = 0;
  if (unit === 'kmh') return speedMs * 3.6;
  if (unit === 'mph') return speedMs * 2.23694;
  return speedMs;
}

export function formatDistance(distanceMeters: number, unit: Unit): string {
  if (isNaN(distanceMeters) || distanceMeters < 0) distanceMeters = 0;
  if (unit === 'mph') {
    // Miles
    const miles = distanceMeters / 1609.34;
    return miles.toFixed(miles < 10 ? 1 : 1) + ' mi';
  } else {
    // km/h or m/s use km
    if (distanceMeters < 1000) {
      return distanceMeters.toFixed(0) + ' m';
    }
    const km = distanceMeters / 1000;
    return km.toFixed(1) + ' km';
  }
}

export function getHeadingName(heading: number | null): string {
  if (heading === null || isNaN(heading)) return '-';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
  return dirs[index];
}

// A simple exponential moving average filter for smoothing speed
export class SpeedSmoother {
  private value: number | null = null;
  private alpha: number = 0.3; // 0 < alpha <= 1 (smaller = smoother but slower response)

  constructor(alpha: number = 0.3) {
    this.alpha = alpha;
  }

  update(newValue: number): number {
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }
    // Snap to 0 if very small to avoid lingering 0.1 km/h
    if (this.value < 0.3) { // less than ~1km/h
       return 0;
    }
    return this.value;
  }
  
  reset() {
    this.value = null;
  }
}

/** Display label for a speed unit ('kmh' -> 'km/h'). */
export function unitLabel(unit: Unit): string {
  if (unit === 'kmh') return 'km/h';
  if (unit === 'mph') return 'mph';
  return 'm/s';
}

/**
 * Distance split into number and label so the two can be styled separately.
 * Switches m -> km automatically, which is why the label must travel with
 * the value instead of being hardcoded at the call site.
 */
export function distanceParts(
  distanceMeters: number,
  unit: Unit,
): { value: string; label: string } {
  if (isNaN(distanceMeters) || distanceMeters < 0) distanceMeters = 0;
  if (unit === 'mph') {
    return { value: (distanceMeters / 1609.34).toFixed(1), label: 'mi' };
  }
  if (distanceMeters < 1000) {
    return { value: distanceMeters.toFixed(0), label: 'm' };
  }
  return { value: (distanceMeters / 1000).toFixed(1), label: 'km' };
}

/** Initial bearing from point 1 to point 2, in degrees clockwise from north. */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Smallest absolute angle between two bearings, always 0-180. */
export function angularDifference(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}
