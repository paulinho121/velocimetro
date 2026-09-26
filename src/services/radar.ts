/**
 * Rain radar tiles from RainViewer's free public API (no key).
 * https://www.rainviewer.com/api.html
 *
 * The free tier serves tiles up to zoom 7 only; above that it returns a
 * "Zoom Level Not Supported" picture, so the map must stretch zoom-7 tiles
 * instead of asking for closer ones.
 */
const INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json';
export const RADAR_MAX_ZOOM = 7;

/** A new radar frame is published every 10 minutes. */
export const RADAR_REFRESH_MS = 10 * 60 * 1000;

interface RadarIndex {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

export interface RadarFrame {
  /** Tile URL template for MapLibre. */
  tiles: string;
  /** When the radar image was taken, in ms. */
  time: number;
}

export async function getLatestRadarFrame(): Promise<RadarFrame | null> {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`RainViewer ${res.status}`);
  const index = (await res.json()) as RadarIndex;
  const latest = index.radar.past.at(-1);
  if (!latest) return null;
  // 256 px tiles, colour scheme 2 ("universal blue"), smoothed, snow shown.
  return {
    tiles: `${index.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
    time: latest.time * 1000,
  };
}
