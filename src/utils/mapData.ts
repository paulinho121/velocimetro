import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { LocationPoint, RoadHazard } from '../types';
import { hazardLabel } from './hazards';

/**
 * Turning app state into the GeoJSON the map draws, kept pure so it can be
 * tested without WebGL. MapLibre wants [lng, lat] - the reverse of how the rest
 * of the app talks about coordinates - so that swap lives here and nowhere else.
 */

export type LngLat = [number, number];
export type Bounds = [LngLat, LngLat];

export const EMPTY_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function toLngLat(p: { lat: number; lng: number }): LngLat {
  return [p.lng, p.lat];
}

/** The ridden path as one line; empty until there are two points to join. */
export function pathToGeoJSON(path: LocationPoint[]): FeatureCollection<LineString> {
  if (path.length < 2) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: path.map(toLngLat) },
      },
    ],
  };
}

export interface HazardProps {
  id: string;
  type: RoadHazard['type'];
  name: string;
  /** Camera limit as text for the map label; empty when unknown or a bump. */
  limit: string;
}

export function hazardsToGeoJSON(
  hazards: RoadHazard[],
): FeatureCollection<Point, HazardProps> {
  return {
    type: 'FeatureCollection',
    features: hazards.map(
      (h): Feature<Point, HazardProps> => ({
        type: 'Feature',
        id: h.id,
        properties: {
          id: h.id,
          type: h.type,
          name: hazardLabel(h.subtype),
          limit: h.maxspeed != null ? String(h.maxspeed) : '',
        },
        geometry: { type: 'Point', coordinates: toLngLat(h) },
      }),
    ),
  };
}

/** South-west / north-east corners enclosing the path, or null if empty. */
export function pathBounds(path: { lat: number; lng: number }[]): Bounds | null {
  if (path.length === 0) return null;
  let minLng = path[0].lng;
  let maxLng = minLng;
  let minLat = path[0].lat;
  let maxLat = minLat;
  for (const p of path) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** Corners enclosing a line given as [lng, lat] pairs, or null if empty. */
export function lineBounds(coords: LngLat[]): Bounds | null {
  if (coords.length === 0) return null;
  return pathBounds(coords.map(([lng, lat]) => ({ lat, lng })));
}
