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
