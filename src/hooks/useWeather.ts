import { useEffect, useState } from 'react';
import { LocationPoint } from '../types';
import { Weather, weatherCell } from '../utils/weather';

/** Survives the normal/fullscreen view swap, like useStreetName. */
let lastWeather: Weather | null = null;
let lastCell: string | null = null;

const RECHECK_MS = 60_000;

/**
 * Current weather where the rider is. Refetched when they move into another
 * ~11 km cell or the cached answer expires; checked at most once a minute.
 */
export function useWeather(location: LocationPoint | null, enabled: boolean): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(enabled ? lastWeather : null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), RECHECK_MS);
    return () => clearInterval(id);
  }, [enabled]);

  // Only the cell matters, so a new fix every second does not re-run this.
  const cell = location ? weatherCell(location.lat, location.lng) : null;

  useEffect(() => {
    if (!enabled) {
      setWeather(null);
      return;
    }
    if (!cell) return;

    let cancelled = false;
    const [lat, lng] = cell.split(',').map(Number);
    import('../services/weather')
      .then(({ getWeather }) => getWeather(lat, lng))
      .then((w) => {
        lastWeather = w;
        lastCell = cell;
        if (!cancelled) setWeather(w);
      })
      .catch(() => {
        // Keep the last reading if it is for this area; drop it otherwise.
        if (!cancelled && lastCell !== cell) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, cell, tick]);

  return weather;
}
