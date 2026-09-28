import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Destination } from '../types';
import { useGps } from './GpsContext';
import { useSettings } from './SettingsContext';
import { useTrip } from './TripContext';
import { NoRouteError, fetchRoute } from '../services/routing';
import {
  addRecentDestination,
  clearActiveDestination,
  getActiveDestination,
  getRecentDestinations,
  removeRecentDestination,
  saveActiveDestination,
} from '../services/storage';
import { calculateDistance } from '../utils/geo';
import {
  ARRIVAL_METRES,
  MIN_REROUTE_MS,
  Maneuver,
  NavRoute,
  OFF_ROUTE_FIXES,
  RoutePosition,
  announceStage,
  announcementText,
  isOffRoute,
  locateOnRoute,
  nextManeuverIndex,
  remainingSeconds,
  routeSummaryPhrase,
} from '../utils/navigation';
import { placeSummary } from '../utils/place';
import { speak, stopSpeaking } from '../utils/speech';

/**
 * idle: nowhere to go. routing: working out the first route. preview: route
 * shown with its distance and time, waiting for the rider to start.
 * navigating: guiding. rerouting: the rider left the route, a new one is on
 * its way. arrived: there. error: no route could be had (offline, unreachable
 * place).
 */
export type NavStatus =
  | 'idle'
  | 'routing'
  | 'preview'
  | 'navigating'
  | 'rerouting'
  | 'arrived'
  | 'error';

/** A saved destination older than this is not resumed on startup. */
const RESUME_WITHIN_MS = 6 * 60 * 60 * 1000;

interface NavigationContextValue {
  destination: Destination | null;
  route: NavRoute | null;
  status: NavStatus;
  error: string | null;
  /** Where the rider is on the route, once there is a fix and a route. */
  position: RoutePosition | null;
  next: Maneuver | null;
  /** Metres to `next`. */
  distanceToNext: number | null;
  /** Metres left to the end of the route. */
  remaining: number | null;
  /** Seconds left, by the router's estimate. */
  remainingSec: number | null;
  recents: Destination[];
  /** True once the rider pressed Iniciar; false while only previewing. */
  guiding: boolean;
  /** Shows the route to `dest` without starting guidance. */
  chooseDestination: (dest: Destination) => void;
  /** Starts turn-by-turn guidance on the previewed route. */
  start: () => void;
  cancel: () => void;
  retry: () => void;
  removeRecent: (id: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | undefined>(undefined);

/**
 * One route and one voice for the whole app: the map, the speedometer and the
 * fullscreen view all read the same guidance, and each turn is said once.
 */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const { location } = useGps();
  const { settings } = useSettings();
  const { activeTrip, isActive, startTrip, currentSpeedMs } = useTrip();

  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [status, setStatus] = useState<NavStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<RoutePosition | null>(null);
  const [recents, setRecents] = useState<Destination[]>([]);
  const [guiding, setGuiding] = useState(false);
  /** Bumped whenever a (new) route is wanted; 0 means none has been yet. */
  const [routeRequest, setRouteRequest] = useState(0);
  /** The request a route was delivered for, so a GPS blip does not refetch it. */
  const servedRequestRef = useRef(0);

  // Read inside effects without re-running them on every change.
  const locationRef = useRef(location);
  locationRef.current = location;
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const statusRef = useRef(status);
  statusRef.current = status;
  const speedRef = useRef(currentSpeedMs);
  speedRef.current = currentSpeedMs;
  const mode = activeTrip?.mode ?? settings.defaultMode;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const voiceRef = useRef(settings.voiceGuidance);
  voiceRef.current = settings.voiceGuidance;
  const guidingRef = useRef(guiding);
  guidingRef.current = guiding;

  /** Last segment matched while on the route (see locateOnRoute). */
  const segmentRef = useRef(0);
  const offRouteFixesRef = useRef(0);
  const lastRouteAtRef = useRef(0);
  /** "maneuverIndex:stage" already spoken for the current route. */
  const announcedRef = useRef(new Set<string>());
  /** The route being fetched replaces one the rider strayed from. */
  const isRerouteRef = useRef(false);

  const say = useCallback((text: string, interrupt = false) => {
    if (voiceRef.current) speak(text, { interrupt });
  }, []);

  useEffect(() => {
    if (!settings.voiceGuidance) stopSpeaking();
  }, [settings.voiceGuidance]);

  // ---- Recents, and a route cut short by a reload -----------------------------
  useEffect(() => {
    getRecentDestinations().then(setRecents).catch(() => {});
    getActiveDestination()
      .then((saved) => {
        if (!saved) return;
        if (Date.now() - saved.savedAt > RESUME_WITHIN_MS) {
          clearActiveDestination().catch(() => {});
          return;
        }
        // The rider may already have picked somewhere new.
        if (destinationRef.current) return;
        // It was being followed when the page went away: carry on guiding.
        setGuiding(true);
        setDestination(saved.destination);
        setStatus('routing');
        setRouteRequest((n) => n + 1);
      })
      .catch(() => {});
  }, []);

  // ---- Fetch a route -----------------------------------------------------------
  const hasLocation = location !== null;
  // Keyed on the place, not the object: naming a picked point must not refetch.
  const destinationKey = destination ? `${destination.lat},${destination.lng}` : null;

  useEffect(() => {
    const dest = destinationRef.current;
    const from = locationRef.current;
    if (!dest || routeRequest === 0 || !from) return;
    if (servedRequestRef.current === routeRequest) return;

    const controller = new AbortController();
    lastRouteAtRef.current = Date.now();

    fetchRoute(from, dest, modeRef.current, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        servedRequestRef.current = routeRequest;
        segmentRef.current = 0;
        offRouteFixesRef.current = 0;
        announcedRef.current = new Set();
        setRoute(found);
        setPosition(null);
        setError(null);
        setStatus(guidingRef.current ? 'navigating' : 'preview');
        if (guidingRef.current && !isRerouteRef.current) say(routeSummaryPhrase(found));
        isRerouteRef.current = false;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        servedRequestRef.current = routeRequest;
        // Lost the signal while off the route: keep guiding on the old one,
        // the next off-route fix asks again.
        if (isRerouteRef.current && !(err instanceof NoRouteError)) {
          setStatus('navigating');
          return;
        }
        setStatus('error');
        setError(
          err instanceof NoRouteError
            ? 'Não há caminho por ruas até esse destino.'
            : 'Sem conexão com o serviço de rotas.',
        );
      });

    return () => controller.abort();
  }, [destinationKey, routeRequest, hasLocation, say]);

  // ---- Follow the rider along the route ----------------------------------------
  useEffect(() => {
    const dest = destinationRef.current;
    const current = statusRef.current;
    if (!route || !location || !dest) return;
    if (current !== 'navigating' && current !== 'rerouting') return;

    const pos = locateOnRoute(route, location.lat, location.lng, segmentRef.current);
    const off = isOffRoute(pos.offset, location.accuracy);
    // A match made while off the road would drag the search window with it.
    if (off === false) segmentRef.current = pos.segment;
    setPosition(pos);

    // Arrived: at the end of the route, or at the spot itself (a destination
    // set back from the road is reached on foot from the route's end).
    const toDestination = calculateDistance(location.lat, location.lng, dest.lat, dest.lng);
    if (
      (off === false && route.length - pos.along <= ARRIVAL_METRES) ||
      toDestination <= ARRIVAL_METRES
    ) {
      setStatus('arrived');
      say('Você chegou ao destino.', true);
      clearActiveDestination().catch(() => {});
      return;
    }

    if (off === true) offRouteFixesRef.current += 1;
    else if (off === false) offRouteFixesRef.current = 0;

    if (
      offRouteFixesRef.current >= OFF_ROUTE_FIXES &&
      current === 'navigating' &&
      Date.now() - lastRouteAtRef.current >= MIN_REROUTE_MS
    ) {
      offRouteFixesRef.current = 0;
      isRerouteRef.current = true;
      setStatus('rerouting');
      say('Recalculando rota.', true);
      setRouteRequest((n) => n + 1);
      return;
    }
    // Directions for a road the rider is not on would only confuse.
    if (off !== false) return;

    const index = nextManeuverIndex(route, pos.along);
    if (index === null) return;
    const maneuver = route.maneuvers[index];
    const distance = maneuver.along - pos.along;
    const stage = announceStage(distance, speedRef.current);
    // Reaching the destination has its own message, said on arrival.
    if (!stage || (maneuver.type === 'arrive' && stage === 'now')) return;

    const key = `${index}:${stage}`;
    if (announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    // Too late for the early warning once the final one has been said.
    announcedRef.current.add(`${index}:prepare`);
    say(announcementText(route, index, stage, distance), stage === 'now');
  }, [route, location, say]);

  // ---- Actions -------------------------------------------------------------------
  const rememberDestination = useCallback((dest: Destination) => {
    saveActiveDestination(dest).catch(() => {});
    addRecentDestination(dest).then(setRecents).catch(() => {});
  }, []);

  const chooseDestination = useCallback(
    (dest: Destination) => {
      isRerouteRef.current = false;
      setGuiding(false);
      setDestination(dest);
      setRoute(null);
      setPosition(null);
      setError(null);
      setStatus('routing');
      setRouteRequest((n) => n + 1);

      if (dest.name) return;
      // A point picked on the map: name it after the street it is on.
      import('../services/nominatim')
        .then(({ reverseGeocode }) => reverseGeocode(dest.lat, dest.lng))
        .then((place) => ({
          ...dest,
          name: place.street ?? placeSummary(place) ?? 'Ponto no mapa',
          detail: place.street ? placeSummary(place) : null,
        }))
        .catch(() => ({ ...dest, name: 'Ponto no mapa' }))
        .then((named) => {
          if (destinationRef.current?.id !== dest.id) return;
          setDestination(named);
          if (guidingRef.current) rememberDestination(named);
        });
    },
    [rememberDestination],
  );

  const start = useCallback(() => {
    const dest = destinationRef.current;
    if (!route || !dest) return;
    segmentRef.current = 0;
    offRouteFixesRef.current = 0;
    announcedRef.current = new Set();
    // The route was worked out when the destination was chosen; if the rider
    // has moved since, the first off-route fixes fetch a fresh one.
    lastRouteAtRef.current = 0;
    setGuiding(true);
    setStatus('navigating');
    // Spoken from the tap, which is also what lets iOS speak later on.
    say(routeSummaryPhrase(route), true);
    rememberDestination(dest);
    if (!isActive) startTrip(modeRef.current);
  }, [route, isActive, startTrip, say, rememberDestination]);

  const cancel = useCallback(() => {
    stopSpeaking();
    setGuiding(false);
    setDestination(null);
    setRoute(null);
    setPosition(null);
    setError(null);
    setStatus('idle');
    // The request counter is left alone: restarting it would reuse numbers
    // already marked as served, and the next route would never be fetched.
    clearActiveDestination().catch(() => {});
  }, []);

  const retry = useCallback(() => {
    isRerouteRef.current = false;
    setError(null);
    setStatus('routing');
    setRouteRequest((n) => n + 1);
  }, []);

  const removeRecent = useCallback((id: string) => {
    removeRecentDestination(id).then(setRecents).catch(() => {});
  }, []);

  // ---- Derived -----------------------------------------------------------------------
  const nextIndex = route && position ? nextManeuverIndex(route, position.along) : null;
  const next = route && nextIndex !== null ? route.maneuvers[nextIndex] : null;
  const distanceToNext = next && position ? Math.max(0, next.along - position.along) : null;
  const remaining = route ? Math.max(0, route.length - (position?.along ?? 0)) : null;
  const remainingSec = route ? remainingSeconds(route, position?.along ?? 0) : null;

  return (
    <NavigationContext.Provider
      value={{
        destination,
        route,
        status,
        error,
        position,
        next,
        distanceToNext,
        remaining,
        remainingSec,
        recents,
        guiding,
        chooseDestination,
        start,
        cancel,
        retry,
        removeRecent,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
