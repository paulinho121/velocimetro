import localforage from 'localforage';
import { NominatimAddress, Place, parsePlace, placeCacheKey } from '../utils/place';

/**
 * Reverse geocoding through OpenStreetMap's public Nominatim server.
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
