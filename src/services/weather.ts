import { OpenMeteoResponse, Weather, parseWeather, weatherCell } from '../utils/weather';

/**
 * Current conditions and the next hour's rain from Open-Meteo: free, no key,
 * free for non-commercial use. https://open-meteo.com/en/terms
 */
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Weather is good for a while; this keeps a long ride to a handful of calls. */
export const WEATHER_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, Weather>();

export async function getWeather(lat: number, lng: number): Promise<Weather> {
  const cell = weatherCell(lat, lng);
  const cached = cache.get(cell);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL_MS) return cached;

  // The coarse cell, not the rider's exact position, is what leaves the phone.
  const [cellLat, cellLng] = cell.split(',');
  const params = new URLSearchParams({
    latitude: cellLat,
    longitude: cellLng,
    current: 'temperature_2m,weather_code,precipitation,is_day',
    minutely_15: 'precipitation',
    forecast_minutely_15: '4', // the next hour
    timezone: 'auto',
  });
  const res = await fetch(`${ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const weather = parseWeather((await res.json()) as OpenMeteoResponse, Date.now());
  cache.set(cell, weather);
  return weather;
}
