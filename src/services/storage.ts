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
