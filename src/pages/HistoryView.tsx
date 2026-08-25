import React, { useEffect, useState } from 'react';
import { getTrips } from '../services/storage';
import { Trip } from '../types';
import { formatDistance, formatSpeed } from '../utils/geo';
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
    return <div className="p-4 text-center text-white/50 bg-[#050A15] h-full">Carregando...</div>;
  }

  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-white/50 bg-[#050A15]">
        <Clock className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="text-xl font-bold text-white mb-2">Nenhum histórico</h2>
        <p>Suas viagens finalizadas aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col bg-[#050A15] text-white">
      <h2 className="text-2xl font-black mb-6 tracking-wide">Histórico de Viagens</h2>
      
      <div className="flex-1 overflow-y-auto space-y-4 pb-8 pr-2">
        {trips.map(trip => (
          <div key={trip.id} className="bg-white/5 rounded-3xl p-5 border border-white/10 backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4">
              <span className="font-black text-lg text-white">{formatDate(trip.startTime)}</span>
              <span className="text-[10px] font-bold px-2 py-1 bg-white/10 border border-white/20 rounded-md uppercase tracking-widest text-cyan-400">
                {trip.mode}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Distância</span>
                <span className="font-bold text-lg">{formatDistance(trip.distance, settings.unit)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Tempo</span>
                <span className="font-bold text-lg tabular-nums">{formatTime(trip.movingTime + trip.stoppedTime)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Média</span>
                <span className="font-bold text-lg text-cyan-400">{formatSpeed(trip.averageSpeed, settings.unit)}</span>
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
