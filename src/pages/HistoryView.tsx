import React, { useEffect, useState } from 'react';
import { getTrips } from '../services/storage';
import { Trip } from '../types';
import { convertSpeed, distanceParts, unitLabel } from '../utils/geo';
import { formatTime, formatDate } from '../utils/format';
import { useSettings } from '../contexts/SettingsContext';
import { Clock, Map, ChevronRight, MapPin } from 'lucide-react';
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
              <span className="font-black text-lg text-white">{formatDate(trip.startTime)}</span>
              <span className="text-[10px] font-bold px-2 py-1 bg-white/10 border border-white/20 rounded-md uppercase tracking-widest text-cyan-400">
                {trip.mode}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Distância</span>
                <span className="truncate text-base font-bold">
                  {distanceParts(trip.distance, settings.unit).value}
                  <span className="ml-1 text-xs font-normal text-white/50">
                    {distanceParts(trip.distance, settings.unit).label}
                  </span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Tempo</span>
                <span className="truncate text-base font-bold tabular-nums">{formatTime(trip.movingTime + trip.stoppedTime)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Média</span>
                <span className="truncate text-base font-bold text-cyan-400">
                  {convertSpeed(trip.averageSpeed, settings.unit).toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-white/50">{unitLabel(settings.unit)}</span>
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-white/40 tracking-widest">
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
