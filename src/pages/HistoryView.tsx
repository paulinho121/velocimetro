import React, { useEffect, useState } from 'react';
import { getTrips, saveTrip } from '../services/storage';
import { Trip } from '../types';
import { convertSpeed, distanceParts, unitLabel } from '../utils/geo';
import { formatTime, formatDate } from '../utils/format';
import { useSettings } from '../contexts/SettingsContext';
import { Clock, MapPin } from 'lucide-react';
import { placeSummary } from '../utils/place';

/** Older rides are named on demand, oldest last; this bounds the backlog. */
const NAME_AT_MOST = 20;

async function nameTrip(trip: Trip, signal: AbortSignal): Promise<Trip> {
  const { reverseGeocode } = await import('../services/nominatim');
  const first = trip.path[0];
  const last = trip.path[trip.path.length - 1];
  const start = await reverseGeocode(first.lat, first.lng, signal);
  const end = await reverseGeocode(last.lat, last.lng, signal);
  return { ...trip, startPlace: placeSummary(start), endPlace: placeSummary(end) };
}
import clsx from 'clsx';

export default function HistoryView() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTrips().then(data => {
      setTrips(data);
      setLoading(false);
    });
  }, []);

  // Name the rides that have no place yet, one at a time: the geocoder
  // allows a request per second, and the result is saved so it is asked once.
  const tripsLoaded = !loading;
  useEffect(() => {
    if (!tripsLoaded || !settings.streetName) return;
    const controller = new AbortController();
    const pending = trips
      .filter(t => t.startPlace === undefined && t.path.length > 0)
      .slice(0, NAME_AT_MOST);

    (async () => {
      for (const trip of pending) {
        if (controller.signal.aborted) return;
        try {
          const named = await nameTrip(trip, controller.signal);
          await saveTrip(named);
          setTrips(list => list.map(t => (t.id === named.id ? named : t)));
        } catch {
          return; // offline or rate limited: try again next visit
        }
      }
    })();

    return () => controller.abort();
    // Runs once per visit; the named trips it writes must not restart it.
  }, [tripsLoaded, settings.streetName]);

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-[#050A15] text-white/50">Carregando...</div>;
  }

  if (trips.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#050A15] px-6 text-center text-white/50">
        <Clock className="mb-4 h-14 w-14 opacity-30" />
        <h2 className="mb-2 text-lg font-bold text-white">Nenhum histórico</h2>
        <p className="text-sm">Suas viagens finalizadas aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050A15] px-4 pt-4 text-white">
      <h2 className="mb-4 shrink-0 text-xl font-black tracking-wide">Histórico de viagens</h2>
      
      <div className="scroll-area min-h-0 flex-1 space-y-3 overflow-y-auto pb-nav">
        {trips.map(trip => (
          <div key={trip.id} className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4">
              <div className="flex min-w-0 flex-col">
                <span className="font-black text-lg text-white">{formatDate(trip.startTime)}</span>
                {(trip.startPlace || trip.endPlace) && (
                  <span className="truncate text-xs text-white/60">
                    {trip.startPlace === trip.endPlace || !trip.endPlace
                      ? trip.startPlace
                      : `${trip.startPlace ?? '?'} → ${trip.endPlace}`}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-white/10 border border-white/20 rounded-md uppercase tracking-widest text-cyan-400">
                {trip.mode}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/55">Distância</span>
                <span className="truncate text-base font-bold">
                  {distanceParts(trip.distance, settings.unit).value}
                  <span className="ml-1 text-xs font-normal text-white/50">
                    {distanceParts(trip.distance, settings.unit).label}
                  </span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/55 tracking-widest">Tempo</span>
                <span className="truncate text-base font-bold tabular-nums">{formatTime(trip.movingTime + trip.stoppedTime)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/55 tracking-widest">Média</span>
                <span className="truncate text-base font-bold text-cyan-400">
                  {convertSpeed(trip.averageSpeed, settings.unit).toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-white/50">{unitLabel(settings.unit)}</span>
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-white/55 tracking-widest">
                <MapPin className="w-4 h-4 text-cyan-400" />
                {trip.path.length} pontos
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
