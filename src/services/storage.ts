import localforage from 'localforage';
import { Destination, Settings, Trip } from '../types';
import { calculateDistance } from '../utils/geo';

const TRIPS_STORE = localforage.createInstance({
  name: 'Velox',
  storeName: 'trips',
});

const SETTINGS_STORE = localforage.createInstance({
  name: 'Velox',
  storeName: 'settings',
});

/**
 * The in-progress ride, checkpointed separately from the finished history.
 *
 * A phone locking, the browser reclaiming the tab or the rider switching apps
 * all tear down the page without warning. Keeping the live trip only in React
 * state meant every one of those threw away the whole ride.
 */
const ACTIVE_STORE = localforage.createInstance({
  name: 'Velox',
  storeName: 'active_trip',
});

const ACTIVE_KEY = 'in_progress';

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kmh',
  theme: 'auto',
  defaultMode: 'car',
  keepScreenOn: true,
  gpsAccuracy: 'high',
  audioAlerts: false,
  speedAlert: null,
  hazardAlerts: true,
  streetName: true,
  weather: true,
  rainRadar: false,
  voiceGuidance: true,
  isSetupComplete: false,
};

export async function getSettings(): Promise<Settings> {
  const saved = await SETTINGS_STORE.getItem<Settings>('user_settings');
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await SETTINGS_STORE.setItem('user_settings', settings);
}

export async function getTrips(): Promise<Trip[]> {
  const trips: Trip[] = [];
  await TRIPS_STORE.iterate((value: Trip) => {
    trips.push(value);
  });
  return trips.sort((a, b) => b.startTime - a.startTime);
}

export async function saveTrip(trip: Trip): Promise<void> {
  await TRIPS_STORE.setItem(trip.id, trip);
}

export async function getTrip(id: string): Promise<Trip | null> {
  return await TRIPS_STORE.getItem<Trip>(id);
}

export async function deleteTrip(id: string): Promise<void> {
  await TRIPS_STORE.removeItem(id);
}

export async function clearAllTrips(): Promise<void> {
  await TRIPS_STORE.clear();
}

export interface ActiveTripSnapshot {
  trip: Trip;
  isPaused: boolean;
  savedAt: number;
}

export async function saveActiveTrip(
  snapshot: ActiveTripSnapshot,
): Promise<void> {
  await ACTIVE_STORE.setItem(ACTIVE_KEY, snapshot);
}

export async function getActiveTrip(): Promise<ActiveTripSnapshot | null> {
  const saved = await ACTIVE_STORE.getItem<ActiveTripSnapshot>(ACTIVE_KEY);
  if (!saved?.trip) return null;
  return saved;
}

export async function clearActiveTrip(): Promise<void> {
  await ACTIVE_STORE.removeItem(ACTIVE_KEY);
}

// ---- Navigation ------------------------------------------------------------

const NAV_STORE = localforage.createInstance({
  name: 'Velox',
  storeName: 'navigation',
});

const RECENTS_KEY = 'recent_destinations';
const ACTIVE_DESTINATION_KEY = 'active_destination';
const MAX_RECENTS = 8;
/** A destination closer than this to a saved one is the same place. */
const SAME_PLACE_METRES = 50;

export async function getRecentDestinations(): Promise<Destination[]> {
  return (await NAV_STORE.getItem<Destination[]>(RECENTS_KEY)) ?? [];
}

/** Puts `dest` first, dropping older entries for the same spot. */
export async function addRecentDestination(dest: Destination): Promise<Destination[]> {
  const current = await getRecentDestinations();
  const others = current.filter(
    (d) =>
      d.id !== dest.id &&
      calculateDistance(d.lat, d.lng, dest.lat, dest.lng) > SAME_PLACE_METRES,
  );
  const updated = [dest, ...others].slice(0, MAX_RECENTS);
  await NAV_STORE.setItem(RECENTS_KEY, updated);
  return updated;
}

export async function removeRecentDestination(id: string): Promise<Destination[]> {
  const updated = (await getRecentDestinations()).filter((d) => d.id !== id);
  await NAV_STORE.setItem(RECENTS_KEY, updated);
  return updated;
}

/**
 * The destination being navigated to, so a reload or a killed tab picks the
 * guidance back up instead of dropping the rider mid-route.
 */
export interface ActiveDestinationSnapshot {
  destination: Destination;
  savedAt: number;
}

export async function saveActiveDestination(destination: Destination): Promise<void> {
  await NAV_STORE.setItem(ACTIVE_DESTINATION_KEY, { destination, savedAt: Date.now() });
}

export async function getActiveDestination(): Promise<ActiveDestinationSnapshot | null> {
  return await NAV_STORE.getItem<ActiveDestinationSnapshot>(ACTIVE_DESTINATION_KEY);
}

export async function clearActiveDestination(): Promise<void> {
  await NAV_STORE.removeItem(ACTIVE_DESTINATION_KEY);
}
