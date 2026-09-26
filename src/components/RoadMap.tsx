import React, { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Map as MapLibreMap, Popup, setWorkerUrl } from 'maplibre-gl';
// MapLibre finds its worker next to its own file, which is not where it ends
// up once Vite has bundled it. Have Vite bundle the worker too and say where.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSON } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed } from 'lucide-react';
import { LocationPoint, RoadHazard } from '../types';
import {
  EMPTY_COLLECTION,
  HazardProps,
  hazardsToGeoJSON,
  pathBounds,
  pathToGeoJSON,
  toLngLat,
} from '../utils/mapData';

/**
 * Vector basemap from OpenFreeMap: OpenStreetMap data, free, no key, no
 * account. The attribution it requires is shown by MapLibre's own control.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Roughly the whole of Brazil, for when we know nothing about the rider yet. */
const FALLBACK_VIEW = { center: [-51.9, -14.2] as [number, number], zoom: 3 };
const FOLLOW_ZOOM = 16;

setWorkerUrl(workerUrl);

const CYAN = '#22d3ee';
const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';

interface RoadMapProps {
  path: LocationPoint[];
  location: LocationPoint | null;
  hazards: RoadHazard[];
  /** Called when the basemap cannot be shown (no WebGL, offline...). */
  onUnavailable: () => void;
}

function addLayers(map: MapLibreMap) {
  map.addSource('trip', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('start', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('hazards', { type: 'geojson', data: EMPTY_COLLECTION });
  map.addSource('me', { type: 'geojson', data: EMPTY_COLLECTION });

  map.addLayer({
    id: 'trip-casing',
    type: 'line',
    source: 'trip',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#050A15', 'line-width': 9, 'line-opacity': 0.7 },
  });
  map.addLayer({
    id: 'trip-line',
    type: 'line',
    source: 'trip',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': CYAN, 'line-width': 5 },
  });
  map.addLayer({
    id: 'start',
    type: 'circle',
    source: 'start',
    paint: {
      'circle-radius': 6,
      'circle-color': EMERALD,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'hazards',
    type: 'circle',
    source: 'hazards',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 7],
      'circle-color': ['match', ['get', 'type'], 'camera', RED, AMBER],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 2],
    },
  });
  // Invisible, finger-sized target: the visible dots are too small to tap.
  map.addLayer({
    id: 'hazards-hit',
    type: 'circle',
    source: 'hazards',
    paint: { 'circle-radius': 20, 'circle-opacity': 0 },
  });
  map.addLayer({
    id: 'hazard-limits',
    type: 'symbol',
    source: 'hazards',
    minzoom: 13,
    filter: ['!=', ['get', 'limit'], ''],
    layout: {
      'text-field': ['get', 'limit'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-offset': [0, -1.5],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#fff', 'text-halo-color': RED, 'text-halo-width': 2 },
  });
  map.addLayer({
    id: 'me-halo',
    type: 'circle',
    source: 'me',
    paint: { 'circle-radius': 18, 'circle-color': CYAN, 'circle-opacity': 0.2 },
  });
  map.addLayer({
    id: 'me',
    type: 'circle',
    source: 'me',
    paint: {
      'circle-radius': 8,
      'circle-color': CYAN,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 3,
    },
  });
}

function setData(map: MapLibreMap, id: string, data: GeoJSON) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export default function RoadMap({ path, location, hazards, onUnavailable }: RoadMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  /** Keep the rider centred until they pan away to look around. */
  const [follow, setFollow] = useState(true);

  // Latest callback without re-creating the map when the parent re-renders.
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  // ---- Create the map once ---------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        ...FALLBACK_VIEW,
        attributionControl: { compact: true },
        pitchWithRotate: false,
      });
    } catch {
      // Thrown synchronously when the device has no usable WebGL.
      onUnavailableRef.current();
      return;
    }
    mapRef.current = map;

    map.on('load', () => {
      addLayers(map);
      setReady(true);
    });
    // A failed tile is just a blank square, but without the style itself
    // (offline, style server down) there is no map at all. 'styledata' marks
    // the style arriving; 'load' would be too late, as it waits for tiles.
    let styleArrived = false;
    map.once('styledata', () => {
      styleArrived = true;
    });
    map.on('error', () => {
      if (!styleArrived) onUnavailableRef.current();
    });

    // Only gestures stop following; our own easeTo calls have no originalEvent.
    map.on('dragstart', (e) => {
      if (e.originalEvent) setFollow(false);
    });

    map.on('click', 'hazards-hit', (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const { name, limit } = feature.properties as HazardProps;
      const el = document.createElement('div');
      el.className = 'text-sm font-bold text-slate-900';
      el.textContent = limit ? `${name} · ${limit} km/h` : name;
      new Popup({ closeButton: false, offset: 12 })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on('mouseenter', 'hazards-hit', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'hazards-hit', () => (map.getCanvas().style.cursor = ''));

    return () => {
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, []);

  // ---- Keep the layers in step with the ride ---------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, 'trip', pathToGeoJSON(path));
    setData(
      map,
      'start',
      path.length > 0
        ? { type: 'Point', coordinates: toLngLat(path[0]) }
        : EMPTY_COLLECTION,
    );
  }, [ready, path]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, 'hazards', hazardsToGeoJSON(hazards));
  }, [ready, hazards]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(
      map,
      'me',
      location ? { type: 'Point', coordinates: toLngLat(location) } : EMPTY_COLLECTION,
    );
  }, [ready, location]);

  // ---- Camera ------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !follow) return;

    if (location) {
      // Jump the first time, glide afterwards: easing in from the whole of
      // Brazil on every open would be slow and dizzying.
      const far = map.getZoom() < FOLLOW_ZOOM - 3;
      map[far ? 'jumpTo' : 'easeTo']({
        center: toLngLat(location),
        zoom: far ? FOLLOW_ZOOM : map.getZoom(),
        ...(far ? {} : { duration: 600 }),
      });
      return;
    }

    // No live fix (e.g. GPS lost) but a ride on record: show the whole ride.
    const bounds = pathBounds(path);
    if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: FOLLOW_ZOOM, duration: 0 });
  }, [ready, follow, location, path]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      <div ref={containerRef} className="h-full w-full" />
      {!follow && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/15 bg-[#050A15]/85 px-4 py-2.5 text-sm font-bold text-cyan-300 shadow-lg backdrop-blur"
        >
          <LocateFixed className="h-4 w-4" />
          Centralizar
        </button>
      )}
    </div>
  );
}
