import { describe, expect, it } from 'vitest';
import { OpenMeteoResponse, describeWeatherCode, parseWeather, weatherCell } from './weather';

const response = (
  over: Partial<OpenMeteoResponse['current']> = {},
  upcoming: (number | null)[] = [0, 0, 0, 0],
): OpenMeteoResponse => ({
  current: {
    temperature_2m: 27.6,
    weather_code: 1,
    precipitation: 0,
    is_day: 1,
    ...over,
  },
  minutely_15: { precipitation: upcoming },
});

describe('describeWeatherCode', () => {
  it.each([
    [0, 'clear', 'Céu limpo'],
    [2, 'partly', 'Parcialmente nublado'],
    [3, 'cloudy', 'Nublado'],
    [45, 'fog', 'Neblina'],
    [53, 'drizzle', 'Garoa'],
    [63, 'rain', 'Chuva'],
    [81, 'rain', 'Pancadas de chuva'],
    [75, 'snow', 'Neve'],
    [95, 'storm', 'Tempestade'],
  ])('code %i is %s', (code, kind, label) => {
    expect(describeWeatherCode(code)).toEqual({ kind, label });
  });

  it('does not crash on codes outside the table', () => {
    expect(describeWeatherCode(42).kind).toBe('cloudy');
  });
});

describe('parseWeather', () => {
  it('rounds the temperature and reads day/night', () => {
    const w = parseWeather(response({ is_day: 0 }), 123);
    expect(w).toMatchObject({ temperature: 28, isDay: false, fetchedAt: 123, rainSoon: false });
  });

  it('warns when it is raining now', () => {
    expect(parseWeather(response({ weather_code: 63 }), 0).rainSoon).toBe(true);
    expect(parseWeather(response({ precipitation: 0.4 }), 0).rainSoon).toBe(true);
  });

  it('warns when rain is forecast within the hour', () => {
    expect(parseWeather(response({}, [0, 0, 0.3, 0]), 0).rainSoon).toBe(true);
  });

  it('ignores traces too small to matter and missing values', () => {
    expect(parseWeather(response({}, [0.05, null, 0, 0]), 0).rainSoon).toBe(false);
  });

  it('copes with no short-term forecast at all', () => {
    const { minutely_15: _, ...bare } = response();
    expect(parseWeather(bare, 0).rainSoon).toBe(false);
  });
});

describe('weatherCell', () => {
  it('coarsens the position to about 11 km', () => {
    expect(weatherCell(-3.73194, -38.52671)).toBe('-3.7,-38.5');
    expect(weatherCell(-3.74, -38.53)).toBe(weatherCell(-3.7, -38.5));
  });
});
