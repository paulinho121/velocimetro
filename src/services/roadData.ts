import localforage from 'localforage';
import { RoadHazard } from '../types';

/**
 * Speed bumps and speed cameras from OpenStreetMap, via the Overpass API.
 *
 * The public Overpass instances are strict: two concurrent slots per IP with a
 * cooldown, and they time out under load. Nothing here may poll. Instead the
 * world is cut into cells, each cell is fetched at most once per TTL, and the
 * result is cached on the device — so a driver crossing a city makes a handful
 * of requests, not one per GPS fix.
 *
 * Data (c) OpenStreetMap contributors, ODbL.
 */

const HAZARD_STORE = localforage.createInstance({
  name: 'Velox',
  storeName: 'road_hazards',
});

/** ~5.5 km per side. Big enough that a request lasts several minutes of driving. */
const CELL_SIZE = 0.05;
/** Overlap so a hazard just past a cell edge is already in hand. */
const CELL_MARGIN = 0.012;
/** OSM edits are not urgent for us; a week old is fine. */
const TTL = 7 * 24 * 60 * 60 * 1000;
/** Floor between two Overpass requests, whatever the caller asks for. */
const MIN_REQUEST_INTERVAL = 8000;
/** After a failure, wait this long before trying the same cell again. */
const FAILURE_BACKOFF = 60000;
/** Being rate limited means backing off properly, not just retrying sooner. */
const RATE_LIMIT_BACKOFF = 180000;
const REQUEST_TIMEOUT = 25000;

/**
 * `traffic_calming` covers far more than bumps - `island`, `choker` and
 * `chicane` are geometry, not something to slow down for. In a 1 km sample of
 * central Sao Paulo 37 of 53 hits were islands, so filtering server-side keeps
 * the payload small and the alerts meaningful.
 */
const BUMP_VALUES = ['bump', 'hump', 'table', 'cushion', 'rumble_strip'];

/**
 * Both verified to answer with `Access-Control-Allow-Origin: *` on the POST
 * itself, which is what a browser needs. Several popular mirrors
 * (kumi.systems among them) send no CORS header at all and are unusable from
 * a web app no matter how healthy they look from a terminal.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

interface CachedCell {
  fetchedAt: number;
  hazards: RoadHazard[];
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

let lastRequestAt = 0;
/** Cells currently being fetched, so two callers never duplicate a request. */
const inFlight = new Map<string, Promise<RoadHazard[]>>();
/** Cells that failed recently, mapped to the time we may retry. */
const failedUntil = new Map<string, number>();

export function cellKeyFor(lat: number, lng: number): string {
  const y = Math.floor(lat / CELL_SIZE);
  const x = Math.floor(lng / CELL_SIZE);
  return `${y}:${x}`;
}

function cellBounds(key: string) {
  const [y, x] = key.split(':').map(Number);
  return {
    south: y * CELL_SIZE - CELL_MARGIN,
    west: x * CELL_SIZE - CELL_MARGIN,
    north: (y + 1) * CELL_SIZE + CELL_MARGIN,
    east: (x + 1) * CELL_SIZE + CELL_MARGIN,
  };
}

function buildQuery(key: string): string {
  const { south, west, north, east } = cellBounds(key);
  const bbox = `${south},${west},${north},${east}`;
  const calming = BUMP_VALUES.join('|');
  return `[out:json][timeout:60];
(
  node["traffic_calming"~"^(${calming})$"](${bbox});
  node["highway"="speed_camera"](${bbox});
);
out body;`;
}

function parseElements(elements: OverpassElement[]): RoadHazard[] {
  const hazards: RoadHazard[] = [];
  for (const el of elements) {
    if (el.lat === undefined || el.lon === undefined) continue;
    const tags = el.tags ?? {};

    const isCamera = tags.highway === 'speed_camera';
    const calming = tags.traffic_calming;
    if (!isCamera && (!calming || !BUMP_VALUES.includes(calming))) continue;

    const rawMax = tags.maxspeed;
    const parsedMax = rawMax ? parseInt(rawMax, 10) : NaN;

    hazards.push({
      id: `${el.type}/${el.id}`,
      type: isCamera ? 'camera' : 'bump',
      subtype: isCamera ? 'speed_camera' : calming!,
      lat: el.lat,
      lng: el.lon,
      maxspeed: Number.isFinite(parsedMax) ? parsedMax : null,
    });
  }
  return hazards;
}

async function requestOverpass(query: string): Promise<RoadHazard[]> {
  // Respect the floor between requests no matter who calls.
  const wait = MIN_REQUEST_INTERVAL - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  let lastError: unknown = null;

  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      // 429 is the rate limiter, 504 the load shedder. Both mean "not now",
      // and both are routine on the public instances.
      if (!res.ok) {
        const err = new Error(`Overpass ${res.status}`) as Error & {
          status?: number;
        };
        err.status = res.status;
        throw err;
      }

      const json = await res.json();
      if (!Array.isArray(json?.elements)) throw new Error('Overpass: bad payload');
      return parseElements(json.elements);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Overpass unreachable');
}

/**
 * Hazards for the cell containing this position. Served from cache when fresh;
 * otherwise fetched once, with failures backed off rather than retried.
 * Returns whatever is cached (even stale) if the network is unavailable.
 */
export async function getHazardsNear(
  lat: number,
  lng: number,
): Promise<RoadHazard[]> {
  const key = cellKeyFor(lat, lng);

  const cached = await HAZARD_STORE.getItem<CachedCell>(key);
  if (cached && Date.now() - cached.fetchedAt < TTL) return cached.hazards;

  const retryAt = failedUntil.get(key);
  if (retryAt && Date.now() < retryAt) return cached?.hazards ?? [];

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const hazards = await requestOverpass(buildQuery(key));
      await HAZARD_STORE.setItem<CachedCell>(key, {
        fetchedAt: Date.now(),
        hazards,
      });
      failedUntil.delete(key);
      return hazards;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const backoff =
        status === 429 ? RATE_LIMIT_BACKOFF : FAILURE_BACKOFF;
      failedUntil.set(key, Date.now() + backoff);
      // Stale data beats no data when you are moving.
      if (cached) return cached.hazards;
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, pending);
  return pending;
}

export async function clearHazardCache(): Promise<void> {
  await HAZARD_STORE.clear();
  failedUntil.clear();
}

export async function hazardCacheSize(): Promise<number> {
  return HAZARD_STORE.length();
}
