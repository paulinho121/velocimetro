import { Destination } from '../types';
import { PhotonFeature, parsePhotonFeature } from '../utils/place';

/**
 * Address search through Photon, komoot's public geocoder over OpenStreetMap
 * data: free, no key, and built for search-as-you-type (unlike Nominatim,
 * whose policy forbids it). It also forgives typos, so "senador pompei"
 * still finds Rua Senador Pompeu.
 * https://photon.komoot.io
 */
const ENDPOINT = 'https://photon.komoot.io/api/';

/** Places matching `query`, the ones near the rider first. */
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number } | null,
  signal?: AbortSignal,
): Promise<Destination[]> {
  const params = new URLSearchParams({ q: query, limit: '6' });
  if (near) {
    params.set('lat', near.lat.toFixed(3));
    params.set('lon', near.lng.toFixed(3));
  }
  const res = await fetch(`${ENDPOINT}?${params}`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? []).map(parsePhotonFeature);
}
