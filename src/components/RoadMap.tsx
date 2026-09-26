import React, { useEffect, useRef, useState } from 'react';
import {
  GeoJSONSource,
  Map as MapLibreMap,
  Popup,
  RasterTileSource,
  setWorkerUrl,
} from 'maplibre-gl';
// MapLibre finds its worker next to its own file, which is not where it ends
// up once Vite has bundled it. Have Vite bundle the worker too and say where.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSON } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import clsx from 'clsx';
import { CloudRain, LocateFixed } from 'lucide-react';
import { RADAR_MAX_ZOOM, RADAR_REFRESH_MS, getLatestRadarFrame } from '../services/radar';
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
  showRadar: boolean;
  onToggleRadar: () => void;
}

type RadarState = { status: 'off' } | { status: 'loading' } | { status: 'error' } | { status: 'on'; time: number };

const RADAR_ATTRIBUTION = '<a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>';

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

export default function RoadMap({
  path,
  location,
  hazards,
  onUnavailable,
  showRadar,
  onToggleRadar,
}: RoadMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  /** Keep the rider centred until they pan away to look around. */
  const [follow, setFollow] = useState(true);
  /** Whether the camera has been brought in to the rider yet. */
  const centeredRef = useRef(false);
  const locationRef = useRef(location);
  locationRef.current = location;

  // Latest callback without re-creating the map when the parent re-renders.
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  // ---- Create the map once ---------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    // Open straight onto the rider when we know where they are: starting from
    // the whole of Brazil means downloading a view nobody looks at.
    const start = locationRef.current;
    if (start) centeredRef.current = true;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        ...(start ? { center: toLngLat(start), zoom: FOLLOW_ZOOM } : FALLBACK_VIEW),
        attributionControl: { compact: true },
        pitchWithRotate: false,
      });
    } catch {
      // Thrown synchronously when the device has no usable WebGL.
      onUnavailableRef.current();
      return;
    }
    mapRef.current = map;

    // Our layers only need the style, not the basemap tiles; waiting for
    // 'load' (which waits for every tile in view) left the ride undrawn for
    // seconds on a slow connection.
    let styleArrived = false;
    map.once('style.load', () => {
      styleArrived = true;
      addLayers(map);
      setReady(true);
    });
    // A failed tile is just a blank square, but without the style itself
    // (offline, style server down) there is no map at all.
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

  // ---- Rain radar ----------------------------------------------------------------
  const [radar, setRadar] = useState<RadarState>({ status: 'off' });

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const removeRadar = () => {
      if (map.getLayer('radar')) map.removeLayer('radar');
      if (map.getSource('radar')) map.removeSource('radar');
    };

    if (!showRadar) {
      removeRadar();
      setRadar({ status: 'off' });
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const frame = await getLatestRadarFrame();
        if (cancelled || !mapRef.current) return;
        if (!frame) throw new Error('no radar frame');
        const source = map.getSource('radar') as RasterTileSource | undefined;
        if (source) {
          source.setTiles([frame.tiles]);
        } else {
          map.addSource('radar', {
            type: 'raster',
            tiles: [frame.tiles],
            tileSize: 256,
            // Free tier stops at 7; MapLibre stretches those tiles further in.
            maxzoom: RADAR_MAX_ZOOM,
            attribution: RADAR_ATTRIBUTION,
          });
          // Under the ride, so rain never hides the route or the hazards.
          map.addLayer(
            { id: 'radar', type: 'raster', source: 'radar', paint: { 'raster-opacity': 0.6 } },
            'trip-casing',
          );
        }
        setRadar({ status: 'on', time: frame.time });
      } catch {
        if (!cancelled) setRadar({ status: 'error' });
      }
    };

    setRadar({ status: 'loading' });
    load();
    const id = setInterval(load, RADAR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready, showRadar]);

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
      // Jump in to street level the first time; afterwards only glide the
      // centre, so a rider who pinched out (to watch rain coming, say) keeps
      // their zoom instead of being yanked back on the next fix.
      if (!centeredRef.current) {
        centeredRef.current = true;
        map.jumpTo({ center: toLngLat(location), zoom: FOLLOW_ZOOM });
      } else {
        map.easeTo({ center: toLngLat(location), duration: 600 });
      }
      return;
    }

    // No live fix (e.g. GPS lost) but a ride on record: show the whole ride.
    const bounds = pathBounds(path);
    if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: FOLLOW_ZOOM, duration: 0 });
  }, [ready, follow, location, path]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl">
      <div ref={containerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={onToggleRadar}
        aria-pressed={showRadar}
        aria-label="Radar de chuva"
        className={clsx(
          'absolute right-3 top-3 flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur',
          showRadar
            ? 'border-sky-400/50 bg-sky-500/80 text-white'
            : 'border-white/15 bg-[#050A15]/85 text-white/70',
        )}
      >
        <CloudRain className="h-4 w-4" />
        {radar.status === 'on'
          ? `Chuva · ${new Date(radar.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : radar.status === 'loading'
            ? 'Chuva…'
            : radar.status === 'error'
              ? 'Radar indisponível'
              : 'Chuva'}
      </button>
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
