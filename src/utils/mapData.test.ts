import { describe, expect, it } from 'vitest';
import { LocationPoint, RoadHazard } from '../types';
import { hazardsToGeoJSON, pathBounds, pathToGeoJSON, toLngLat } from './mapData';

const point = (lat: number, lng: number): LocationPoint => ({
  lat,
  lng,
  alt: null,
  speed: null,
  heading: null,
  accuracy: 5,
  timestamp: 0,
});

const hazard = (over: Partial<RoadHazard> = {}): RoadHazard => ({
  id: 'node/1',
  type: 'bump',
  subtype: 'hump',
  lat: -3.73,
  lng: -38.52,
  maxspeed: null,
  ...over,
});

describe('toLngLat', () => {
  it('puts longitude first, as GeoJSON requires', () => {
    expect(toLngLat({ lat: -3.7, lng: -38.5 })).toEqual([-38.5, -3.7]);
  });
});

describe('pathToGeoJSON', () => {
  it('draws nothing until there are two points to join', () => {
    expect(pathToGeoJSON([]).features).toHaveLength(0);
    expect(pathToGeoJSON([point(1, 2)]).features).toHaveLength(0);
  });

  it('joins the path in order as one line', () => {
    const { features } = pathToGeoJSON([point(1, 2), point(3, 4), point(5, 6)]);
    expect(features).toHaveLength(1);
    expect(features[0].geometry.coordinates).toEqual([
      [2, 1],
      [4, 3],
      [6, 5],
    ]);
  });
});

describe('hazardsToGeoJSON', () => {
  it('names each hazard in Portuguese and keeps its id for lookups', () => {
    const [f] = hazardsToGeoJSON([hazard({ subtype: 'table' })]).features;
    expect(f.id).toBe('node/1');
    expect(f.properties).toMatchObject({ id: 'node/1', type: 'bump', name: 'Lombada elevada' });
    expect(f.geometry.coordinates).toEqual([-38.52, -3.73]);
  });

  it('labels cameras with their limit', () => {
    const [f] = hazardsToGeoJSON([
      hazard({ type: 'camera', subtype: 'speed_camera', maxspeed: 60 }),
    ]).features;
    expect(f.properties.name).toBe('Radar');
    expect(f.properties.limit).toBe('60');
  });

  it('leaves the label empty when the limit is unknown', () => {
    const [f] = hazardsToGeoJSON([hazard({ type: 'camera', subtype: 'speed_camera' })]).features;
    expect(f.properties.limit).toBe('');
  });

  it('falls back to a generic name for unmapped subtypes', () => {
    const [f] = hazardsToGeoJSON([hazard({ subtype: 'chicane' })]).features;
    expect(f.properties.name).toBe('Obstáculo');
  });
});

describe('pathBounds', () => {
  it('is null for an empty path', () => {
    expect(pathBounds([])).toBeNull();
  });

  it('encloses every point, south-west corner first', () => {
    expect(pathBounds([point(-3, -38), point(-4, -37), point(-2, -39)])).toEqual([
      [-39, -4],
      [-37, -2],
    ]);
  });
});
