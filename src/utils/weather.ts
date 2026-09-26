/**
 * Reading Open-Meteo answers, kept pure so it can be tested without a network.
 */

export type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export interface Weather {
  temperature: number;
  kind: WeatherKind;
  label: string;
  isDay: boolean;
  /** Rain now or expected within the next hour. */
  rainSoon: boolean;
  fetchedAt: number;
}

/** Shape of the parts of the Open-Meteo forecast response we ask for. */
export interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    precipitation: number;
    is_day: number;
  };
  minutely_15?: { precipitation: (number | null)[] };
}

/** Below this (mm per 15 min) it is noise, not rain worth warning about. */
export const RAIN_THRESHOLD_MM = 0.1;

/** WMO weather interpretation codes, as documented by Open-Meteo. */
export function describeWeatherCode(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Céu limpo' };
  if (code === 1 || code === 2) return { kind: 'partly', label: 'Parcialmente nublado' };
  if (code === 3) return { kind: 'cloudy', label: 'Nublado' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Neblina' };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Garoa' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { kind: 'rain', label: code >= 80 ? 'Pancadas de chuva' : 'Chuva' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { kind: 'snow', label: 'Neve' };
  if (code >= 95) return { kind: 'storm', label: 'Tempestade' };
  return { kind: 'cloudy', label: 'Tempo instável' };
}

const WET_KINDS: WeatherKind[] = ['drizzle', 'rain', 'storm'];

export function parseWeather(data: OpenMeteoResponse, now: number): Weather {
  const { kind, label } = describeWeatherCode(data.current.weather_code);
  const upcoming = data.minutely_15?.precipitation ?? [];
  const rainSoon =
    WET_KINDS.includes(kind) ||
    data.current.precipitation >= RAIN_THRESHOLD_MM ||
    upcoming.some((mm) => mm != null && mm >= RAIN_THRESHOLD_MM);

  return {
    temperature: Math.round(data.current.temperature_2m),
    kind,
    label,
    isDay: data.current.is_day === 1,
    rainSoon,
    fetchedAt: now,
  };
}

/**
 * Weather does not change across a neighbourhood, and sending the rider's
 * exact position to a third party for it would be gratuitous. One decimal is
 * a cell of roughly 11 km, which also makes it a good cache key.
 */
export function weatherCell(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}
