import React, { Suspense, lazy, useMemo, useState } from 'react';
import { useTrip } from '../contexts/TripContext';
import { useGps } from '../contexts/GpsContext';
import { useHazards } from '../contexts/HazardContext';
import { LocationPoint } from '../types';
import { Map as MapIcon, WifiOff } from 'lucide-react';

// MapLibre is a large bundle; only riders who open this tab download it.
const RoadMap = lazy(() => import('../components/RoadMap'));

function SvgMap({ path }: { path: LocationPoint[] }) {
  const { minLat, maxLat, minLng, maxLng } = useMemo(() => {
    if (path.length === 0) return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
    return path.reduce(
      (acc, p) => ({
        minLat: Math.min(acc.minLat, p.lat),
        maxLat: Math.max(acc.maxLat, p.lat),
        minLng: Math.min(acc.minLng, p.lng),
        maxLng: Math.max(acc.maxLng, p.lng),
      }),
      { minLat: path[0].lat, maxLat: path[0].lat, minLng: path[0].lng, maxLng: path[0].lng }
    );
  }, [path]);

  if (path.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50">
        <MapIcon className="w-12 h-12 mb-2 opacity-20" />
        <p>Poucos dados para desenhar o mapa</p>
      </div>
    );
  }

  const dLat = maxLat - minLat;
  const dLng = maxLng - minLng;
  const padding = 0.1; // 10% padding
  
  // Calculate aspect ratio. Longitude degrees are smaller than latitude degrees depending on latitude.
  // Approximation: cos(lat)
  const avgLat = (minLat + maxLat) / 2;
  const lngScale = Math.cos(avgLat * Math.PI / 180);
  
  const width = dLng * lngScale;
  const height = dLat;
  
  const viewBox = `${minLng * lngScale - width * padding} ${-maxLat - height * padding} ${width * (1 + 2 * padding)} ${height * (1 + 2 * padding)}`;

  const points = path.map(p => `${p.lng * lngScale},${-p.lat}`).join(' ');

  return (
    <svg viewBox={viewBox} className="w-full h-full bg-[#050A15]/50 rounded-3xl" preserveAspectRatio="xMidYMid meet">
      {/* Start Point */}
      <circle cx={path[0].lng * lngScale} cy={-path[0].lat} r={(width+height)/100 || 0.0001} fill="#10b981" />
      {/* Path */}
      <polyline
        points={points}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={(width+height)/150 || 0.00005}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]"
      />
      {/* Current/End Point */}
      <circle cx={path[path.length - 1].lng * lngScale} cy={-path[path.length - 1].lat} r={(width+height)/80 || 0.00012} fill="#22d3ee" className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
    </svg>
  );
}

export default function MapView() {
  const { activeTrip } = useTrip();
  const { location } = useGps();
  const { hazards } = useHazards();
  /** Basemap could not load (offline, no WebGL): fall back to the bare trace. */
  const [basemapFailed, setBasemapFailed] = useState(false);

  const path = activeTrip?.path ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050A15] px-4 pt-4 pb-nav text-white">
      <h2 className="mb-3 shrink-0 text-xl font-black tracking-wide">Mapa</h2>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
        {!basemapFailed ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-white/50">
                Carregando mapa…
              </div>
            }
          >
            <RoadMap
              path={path}
              location={location}
              hazards={hazards}
              onUnavailable={() => setBasemapFailed(true)}
            />
          </Suspense>
        ) : activeTrip ? (
          <div className="h-full p-2">
            <SvgMap path={path} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-white/50 p-6">
            <WifiOff className="w-16 h-16 mb-4 opacity-30" />
            <h2 className="text-lg font-bold mb-2 text-white">Mapa indisponível</h2>
            <p className="text-sm">
              Sem internet não dá para carregar as ruas. Inicie uma viagem para ver ao menos o
              trajeto.
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 shrink-0 text-center text-[11px] font-bold uppercase tracking-widest text-white/55">
        {basemapFailed
          ? 'Sem mapa de fundo: exibindo só o rastro do GPS.'
          : 'Toque em uma lombada ou radar para ver detalhes.'}
      </p>
    </div>
  );
}
