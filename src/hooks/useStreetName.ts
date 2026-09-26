import { useEffect, useRef, useState } from 'react';
import { LocationPoint } from '../types';
import { Place, shouldRefetchStreet } from '../utils/place';
import { calculateDistance } from '../utils/geo';

/**
 * Remembered across mounts: the normal and fullscreen views swap in and out,
 * and each swap must neither blank the street nor spend a new request.
 */
let lastPlace: Place | null = null;
let lastQuery: { lat: number; lng: number; at: number } | null = null;
/** After a failure, retry once the interval passes even if the rider is parked. */
let lastFailed = false;

/** The street the rider is on, looked up sparingly (see shouldRefetchStreet). */
export function useStreetName(location: LocationPoint | null, enabled: boolean): Place | null {
  const [place, setPlace] = useState<Place | null>(enabled ? lastPlace : null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlace(null);
      return;
    }
    if (!location) return;

    const metres = !lastQuery
      ? null
      : lastFailed
        ? Infinity
        : calculateDistance(lastQuery.lat, lastQuery.lng, location.lat, location.lng);
    const ms = lastQuery ? Date.now() - lastQuery.at : null;
    if (!shouldRefetchStreet(metres, ms)) return;

    const query = { lat: location.lat, lng: location.lng, at: Date.now() };
    lastQuery = query;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    // Loaded on demand: most sessions never need the geocoder.
    import('../services/nominatim')
      .then(({ reverseGeocode }) =>
        reverseGeocode(location.lat, location.lng, controller.signal),
      )
      .then((found) => {
        lastPlace = found;
        lastFailed = false;
        if (!controller.signal.aborted) setPlace(found);
      })
      .catch(() => {
        // Offline or rate limited: keep showing the last street we knew.
        if (lastQuery === query) lastFailed = true;
      });
  }, [enabled, location]);

  useEffect(() => () => inFlight.current?.abort(), []);

  return place;
}
