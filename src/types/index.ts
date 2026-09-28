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
  hazardAlerts: boolean; // warn about speed bumps / cameras ahead
  streetName: boolean; // show the current street (Nominatim)
  weather: boolean; // show weather and warn about rain (Open-Meteo)
  rainRadar: boolean; // rain radar layer on the map (RainViewer)
  voiceGuidance: boolean; // speak turn-by-turn directions while navigating
  isSetupComplete: boolean;
}

/** Where the rider asked to be guided to. */
export interface Destination {
  id: string;
  /** Short name, e.g. "Iguatemi Bosque". Null until a picked point is named. */
  name: string | null;
  /** Address line under the name, e.g. "Av. Washington Soares, 85 · Edson Queiroz". */
  detail: string | null;
  lat: number;
  lng: number;
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
  averageSpeed: number; // Average moving speed in m/s
  movingTime: number; // Time moving in ms
  stoppedTime: number; // Time stopped in ms
  totalAscent: number; // Total ascent in meters
  totalDescent: number; // Total descent in meters
  path: LocationPoint[];
  /**
   * Where the ride started and ended, e.g. "Aldeota, Fortaleza". Undefined
   * until looked up; null when the lookup found nothing to call it.
   */
  startPlace?: string | null;
  endPlace?: string | null;
}

export type GpsStatus = 'waiting' | 'locating' | 'connected' | 'weak' | 'unavailable' | 'denied';

/** A point hazard pulled from OpenStreetMap via the Overpass API. */
export type HazardType = 'bump' | 'camera';

export interface RoadHazard {
  id: string;
  type: HazardType;
  /** Raw OSM value: hump, table, cushion, rumble_strip, speed_camera... */
  subtype: string;
  lat: number;
  lng: number;
  /** Enforced limit in km/h, when the camera declares one. */
  maxspeed: number | null;
}

/** A hazard resolved against the driver's current position and heading. */
export interface HazardAhead {
  hazard: RoadHazard;
  /** Metres to the hazard. */
  distance: number;
  /** True once it is close enough to warrant warning at the current speed. */
  isAlerting: boolean;
}
