import React from 'react';
import { useTrip } from '../contexts/TripContext';
import { useGps } from '../contexts/GpsContext';
import { useSettings } from '../contexts/SettingsContext';
import {
  convertSpeed,
  distanceParts,
  getHeadingName,
  unitLabel,
} from '../utils/geo';
import { formatTime } from '../utils/format';
import {
  Activity,
  Navigation2,
  Mountain,
  ArrowUpRight,
  ArrowDownRight,
  StopCircle,
  PlayCircle,
} from 'lucide-react';

export default function TripView() {
  const { activeTrip } = useTrip();
  const { location } = useGps();
  const { settings } = useSettings();

  if (!activeTrip) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#050A15] px-6 text-center text-white/50">
        <Activity className="mb-4 h-14 w-14 opacity-30" />
        <h2 className="mb-2 text-lg font-bold text-white">
          Nenhuma viagem em andamento
        </h2>
        <p className="text-sm">
          Inicie uma viagem na tela principal para ver os detalhes aqui.
        </p>
      </div>
    );
  }

  const heading =
    location != null && location.heading != null && !Number.isNaN(location.heading)
      ? location.heading
      : null;
  const altitude = location != null && location.alt != null ? location.alt : null;
  const label = unitLabel(settings.unit);
  const dist = distanceParts(activeTrip.distance, settings.unit);

  const stats = [
    {
      label: 'Tempo em movimento',
      value: formatTime(activeTrip.movingTime),
      icon: PlayCircle,
    },
    {
      label: 'Tempo parado',
      value: formatTime(activeTrip.stoppedTime),
      icon: StopCircle,
    },
    {
      label: 'Velocidade média',
      value: `${convertSpeed(activeTrip.averageSpeed, settings.unit).toFixed(1)} ${label}`,
      icon: Activity,
    },
    {
      label: 'Velocidade máxima',
      value: `${convertSpeed(activeTrip.maxSpeed, settings.unit).toFixed(1)} ${label}`,
      icon: Activity,
    },
    {
      label: 'Altitude atual',
      value: altitude !== null ? `${altitude.toFixed(0)} m` : '-',
      icon: Mountain,
    },
    {
      label: 'Subida acumulada',
      value: `${activeTrip.totalAscent.toFixed(0)} m`,
      icon: ArrowUpRight,
      color: 'text-emerald-400',
    },
    {
      label: 'Descida acumulada',
      value: `${activeTrip.totalDescent.toFixed(0)} m`,
      icon: ArrowDownRight,
      color: 'text-red-400',
    },
  ];

  return (
    <div className="scroll-area h-full overflow-y-auto bg-[#050A15] px-4 pt-4 pb-nav text-white">
      <h2 className="mb-4 text-xl font-black tracking-wide">
        Detalhes da viagem
      </h2>

      <div className="mb-4 flex items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-2xl border border-white/20 bg-white/10 p-3">
            <Navigation2
              className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] transition-transform duration-500"
              style={{ transform: `rotate(${heading ?? 0}deg)` }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              Direção
            </div>
            <div className="text-2xl font-black">{getHeadingName(heading)}</div>
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">
            Distância total
          </div>
          <div className="truncate text-2xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]">
            {dist.value}
            <span className="ml-1 text-sm font-normal text-white/50">
              {dist.label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <stat.icon
                className={`h-3.5 w-3.5 shrink-0 ${stat.color || 'text-white/40'}`}
              />
              <span className="truncate text-[9px] font-bold uppercase tracking-widest text-white/40">
                {stat.label}
              </span>
            </div>
            <div className="truncate text-base font-black tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
