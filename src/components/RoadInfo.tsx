import React from 'react';
import clsx from 'clsx';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Moon,
  Navigation,
  Snowflake,
  Sun,
  Umbrella,
} from 'lucide-react';
import { Place } from '../utils/place';
import { Weather } from '../utils/weather';

export function weatherIcon(w: Weather) {
  switch (w.kind) {
    case 'clear':
      return w.isDay ? Sun : Moon;
    case 'partly':
      return w.isDay ? CloudSun : CloudMoon;
    case 'fog':
      return CloudFog;
    case 'drizzle':
      return CloudDrizzle;
    case 'rain':
      return CloudRain;
    case 'snow':
      return Snowflake;
    case 'storm':
      return CloudLightning;
    default:
      return Cloud;
  }
}

/** Street being ridden on, with the neighbourhood for context. */
export function StreetBar({ place, large }: { place: Place; large?: boolean }) {
  if (!place.street && !place.area) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Navigation
        className={clsx('shrink-0 text-cyan-400', large ? 'h-5 w-5' : 'h-4 w-4')}
        aria-hidden="true"
      />
      <p className="min-w-0 truncate leading-tight">
        <span
          className={clsx(
            'font-bold text-white',
            large ? 'text-[clamp(1rem,3.6vmin,1.6rem)]' : 'text-sm',
          )}
        >
          {place.street ?? place.area}
        </span>
        {place.street && place.area && (
          <span
            className={clsx(
              'ml-2 text-white/50',
              large ? 'text-[clamp(0.8rem,2.6vmin,1.1rem)]' : 'text-xs',
            )}
          >
            {place.area}
          </span>
        )}
      </p>
    </div>
  );
}

/** Temperature and sky, sized to sit among the compass/altitude chips. */
export function WeatherChip({ weather }: { weather: Weather }) {
  const Icon = weatherIcon(weather);
  return (
    <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-xl">
      <Icon className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/55">
          {weather.label}
        </span>
        <span className="text-sm font-black text-white">{weather.temperature}°C</span>
      </div>
    </div>
  );
}

/** Rain now or within the hour: matters most on two wheels. */
export function RainBanner({ weather, large }: { weather: Weather; large?: boolean }) {
  if (!weather.rainSoon) return null;
  const raining = weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm';
  return (
    <div
      role="status"
      className={clsx(
        'flex shrink-0 items-center gap-2 border-sky-400/30 bg-sky-400/10',
        large ? 'mx-3 mb-1 rounded-2xl border px-3 py-2' : 'border-b px-3 py-2',
      )}
    >
      <Umbrella
        className={clsx('shrink-0 text-sky-300', large ? 'h-5 w-5' : 'h-4 w-4')}
        aria-hidden="true"
      />
      <p
        className={clsx(
          'flex-1 leading-tight text-sky-100',
          large ? 'text-[clamp(0.75rem,2.6vmin,1rem)]' : 'text-[11px]',
        )}
      >
        {weather.kind === 'storm'
          ? 'Tempestade na região. Redobre a atenção.'
          : raining
            ? 'Chovendo na região. Pista pode estar escorregadia.'
            : 'Chuva prevista para a próxima hora na região.'}
      </p>
    </div>
  );
}
