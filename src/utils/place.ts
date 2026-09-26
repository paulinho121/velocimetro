/**
 * Reading Nominatim reverse-geocoding answers and deciding when to ask again,
 * kept pure so it can be tested without a network.
 */

/** The fields of a Nominatim `address` block we use. All are optional. */
export interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  cycleway?: string;
  path?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
}

export interface Place {
  /** Street being ridden on, when there is one. */
  street: string | null;
  /** Neighbourhood, for context under the street. */
  area: string | null;
  city: string | null;
}

export function parsePlace(address: NominatimAddress | undefined): Place {
  const a = address ?? {};
  return {
    street: a.road ?? a.pedestrian ?? a.cycleway ?? a.footway ?? a.path ?? null,
    area: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? null,
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
  };
}

/**
 * Short name for where a trip started or ended, e.g. "Aldeota, Fortaleza".
 * The street alone is meaningless in a list of past rides; the area is not.
 */
export function placeSummary(place: Place): string | null {
  const parts = [place.area ?? place.street, place.city].filter(
    (p): p is string => Boolean(p),
  );
  // "Fortaleza, Fortaleza" happens when the area is missing and falls back.
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length > 0 ? unique.join(', ') : null;
}

/**
 * Nominatim's public server allows one request per second and bans heavy
 * users, so a moving rider asks again only after both covering some ground
 * and some time having passed.
 */
export const STREET_REFETCH_METRES = 150;
export const STREET_REFETCH_MS = 15_000;

export function shouldRefetchStreet(
  metresSinceLast: number | null,
  msSinceLast: number | null,
): boolean {
  if (metresSinceLast === null || msSinceLast === null) return true;
  return metresSinceLast >= STREET_REFETCH_METRES && msSinceLast >= STREET_REFETCH_MS;
}

/** ~11 m cells: close enough to reuse an answer, far enough to be useful. */
export function placeCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}
