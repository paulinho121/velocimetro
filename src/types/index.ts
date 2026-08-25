export type Unit = 'kmh' | 'mph' | 'ms';
export type Theme = 'auto' | 'light' | 'dark';
export type TripMode = 'bike' | 'moto' | 'car' | 'walk';
export type GpsAccuracy = 'high' | 'balanced' | 'low';

export interface Settings {
  unit: Unit;
  theme: Theme;
  defaultMode: TripMode;
  keepScreenOn: boolean;
  gpsAccuracy: GpsAccuracy;
  audioAlerts: boolean;
  speedAlert: number | null; // e.g., limit in chosen unit
  isSetupComplete: boolean;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  alt: number | null;
  speed: number | null; // Speed provided by GPS (m/s)
  heading: number | null;
  accuracy: number;
  timestamp: number;
}

export interface Trip {
  id: string;
  startTime: number;
  endTime: number | null;
  mode: TripMode;
  distance: number; // Total distance in meters
  maxSpeed: number; // Max speed in m/s
  movingTime: number; // Time moving in ms
  stoppedTime: number; // Time stopped in ms
  totalAscent: number; // Total ascent in meters
  totalDescent: number; // Total descent in meters
  path: LocationPoint[];
}

export type GpsStatus = 'waiting' | 'locating' | 'connected' | 'weak' | 'unavailable' | 'denied';
