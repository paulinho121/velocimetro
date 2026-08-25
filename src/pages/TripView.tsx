import React from 'react';
import { useTrip } from '../contexts/TripContext';
import { useGps } from '../contexts/GpsContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatSpeed, formatDistance, getHeadingName } from '../utils/geo';
import { formatTime } from '../utils/format';
import { Activity, Navigation2, Mountain, ArrowUpRight, ArrowDownRight, Clock, StopCircle, PlayCircle } from 'lucide-react';

export default function TripView() {
  const { activeTrip } = useTrip();
  const { location } = useGps();
  const { settings } = useSettings();

  if (!activeTrip) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-white/50 bg-[#050A15]">
        <Activity className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="text-xl font-bold text-white mb-2">Nenhuma viagem em andamento</h2>
        <p>Inicie uma viagem na tela principal para ver os detalhes aqui.</p>
      </div>
    );
  }

  const heading = location?.heading ?? null;
  const altitude = location?.alt ?? null;

  const stats = [
    { label: 'Tempo em movimento', value: formatTime(activeTrip.movingTime), icon: PlayCircle },
    { label: 'Tempo parado', value: formatTime(activeTrip.stoppedTime), icon: StopCircle },
    { label: 'Velocidade Média', value: `${formatSpeed(activeTrip.averageSpeed, settings.unit)} ${settings.unit}`, icon: Activity },
    { label: 'Velocidade Máxima', value: `${formatSpeed(activeTrip.maxSpeed, settings.unit)} ${settings.unit}`, icon: Activity },
    { label: 'Altitude Atual', value: altitude !== null ? `${altitude.toFixed(0)} m` : '-', icon: Mountain },
    { label: 'Subida Acumulada', value: `${activeTrip.totalAscent.toFixed(0)} m`, icon: ArrowUpRight, color: 'text-emerald-400' },
    { label: 'Descida Acumulada', value: `${activeTrip.totalDescent.toFixed(0)} m`, icon: ArrowDownRight, color: 'text-red-400' },
  ];

  return (
    <div className="p-6 h-full flex flex-col bg-[#050A15] text-white">
      <h2 className="text-2xl font-black mb-6 tracking-wide">Detalhes da Viagem</h2>
      
      {/* Compass / Direction */}
      <div className="bg-white/5 rounded-3xl p-6 mb-6 border border-white/10 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-4 rounded-2xl border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            <Navigation2 
              className="w-8 h-8 text-cyan-400 transition-transform duration-500 drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]" 
              style={{ transform: `rotate(${heading ?? 0}deg)` }}
            />
          </div>
          <div>
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Direção</div>
            <div className="text-3xl font-black">{getHeadingName(heading)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Distância Total</div>
          <div className="text-3xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]">
            {formatDistance(activeTrip.distance, settings.unit)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white/5 rounded-3xl p-4 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color || 'text-white/40'}`} />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest line-clamp-1">{stat.label}</span>
            </div>
            <div className="text-xl font-black">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
