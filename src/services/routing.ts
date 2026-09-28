import { TripMode } from '../types';
import { NavRoute, OsrmResponse, parseOsrmRoute } from '../utils/navigation';

/**
 * Routes from the OSRM servers run by FOSSGIS for the OpenStreetMap project:
 * free, no key, with separate car, bike and foot profiles. Their usage policy
 * asks for light use, so the app only asks when a destination is chosen and
 * when the rider leaves the route, never on a timer.
 * https://routing.openstreetmap.de/about.html
 */
const ENDPOINT = 'https://routing.openstreetmap.de';

/** No motorcycle profile exists; bikes and motos share the roads cars use. */
const PROFILE: Record<TripMode, string> = {
  car: 'routed-car',
  moto: 'routed-car',
  bike: 'routed-bike',
  walk: 'routed-foot',
};

export class NoRouteError extends Error {}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TripMode,
  signal?: AbortSignal,
): Promise<NavRoute> {
  const points = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({
    overview: 'false',
    steps: 'true',
    geometries: 'geojson',
  });
  const res = await fetch(`${ENDPOINT}/${PROFILE[mode]}/route/v1/driving/${points}?${params}`, {
    signal,
  });
  // 400 is how OSRM says "no road connects these points".
  if (res.status === 400) throw new NoRouteError('no route');
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const route = parseOsrmRoute((await res.json()) as OsrmResponse);
  if (!route) throw new NoRouteError('no route');
  return route;
}
