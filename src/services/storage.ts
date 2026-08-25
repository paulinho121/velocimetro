import localforage from 'localforage';
import { Settings, Trip } from '../types';

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
