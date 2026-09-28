import localforage from 'localforage';
import { Destination } from '../types';
import {
  NominatimAddress,
  NominatimSearchResult,
  Place,
  parsePlace,
  parseSearchResult,
  placeCacheKey,
} from '../utils/place';

/**
 * Geocoding through OpenStreetMap's public Nominatim server.
 *
 * Its usage policy allows at most one request per second per application and
 * bans heavy users, so every call in the app goes through the one queue below,
 * and answers are cached on the device by ~11 m cell.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org';
const MIN_GAP_MS = 1100;

const PLACE_STORE = localforage.createInstance({ name: 'Velox', storeName: 'places' });

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Runs `task` after every earlier one, at least MIN_GAP_MS after the last. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return task();
  });
  // A failed request must not jam everything queued behind it.
  queue = run.catch(() => undefined);
  return run;
}

async function fetchPlace(lat: number, lng: number, signal?: AbortSignal): Promise<Place> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    zoom: '17', // streets, not buildings
    addressdetails: '1',
    'accept-language': 'pt-BR',
  });
  const res = await fetch(`${ENDPOINT}/reverse?${params}`, { signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const body = (await res.json()) as { address?: NominatimAddress };
  return parsePlace(body.address);
}

/**
 * The place at a point. Cached on the device, so revisiting a street or
 * reopening the history costs no request.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<Place> {
  const key = placeCacheKey(lat, lng);
  const cached = await PLACE_STORE.getItem<Place>(key).catch(() => null);
  if (cached) return cached;

  const place = await enqueue(() => {
    // Dropped while waiting its turn (the rider moved on): skip the request.
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return fetchPlace(lat, lng, signal);
  });
  PLACE_STORE.setItem(key, place).catch(() => {});
  return place;
}

/** How far around the rider search results are favoured (not limited), in degrees. */
const SEARCH_BIAS_DEG = 0.3;

/**
 * Places matching what the rider typed, nearest area first.
 *
 * Only ever called on submit: the usage policy forbids search-as-you-type
 * against the public server.
 */
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<Destination[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '6',
    addressdetails: '1',
    'accept-language': 'pt-BR',
  });
  if (near) {
    const d = SEARCH_BIAS_DEG;
    // left, top, right, bottom. Not bounded: a far city still matches.
    params.set('viewbox', [near.lng - d, near.lat + d, near.lng + d, near.lat - d].join(','));
  }
  return enqueue(async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetch(`${ENDPOINT}/search?${params}`, { signal });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return ((await res.json()) as NominatimSearchResult[]).map(parseSearchResult);
  });
}
