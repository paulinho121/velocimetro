import React from 'react';
import { useTrip } from '../contexts/TripContext';
import { useGps } from '../contexts/GpsContext';
import { useSettings } from '../contexts/SettingsContext';
import { useHazards } from '../contexts/HazardContext';
import {
  convertSpeed,
  distanceParts,
  getHeadingName,
  unitLabel,
} from '../utils/geo';
import { formatTime } from '../utils/format';
import {
  AlertTriangle,
  Camera,
  Compass,
  Expand,
  Mountain,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { HazardAhead } from '../types';
import { requestAppFullscreen } from '../components/SpeedometerFullscreen';
import { useAnimatedSpeed } from '../hooks/useAnimatedSpeed';

const STATUS_TEXT: Record<string, string> = {
  waiting: 'Aguardando',
  locating: 'Localizando...',
  connected: 'GPS OK',
  weak: 'Sinal fraco',
  unavailable: 'Indisponível',
  denied: 'Sem permissão',
};

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-emerald-500 shadow-[0_0_10px_#10b981]',
  weak: 'bg-amber-500 shadow-[0_0_10px_#f59e0b]',
  denied: 'bg-red-500 shadow-[0_0_10px_#ef4444]',
  unavailable: 'bg-red-500 shadow-[0_0_10px_#ef4444]',
  locating: 'bg-cyan-400 shadow-[0_0_10px_#00e5ff] animate-pulse',
  waiting: 'bg-slate-500 shadow-[0_0_10px_#64748b]',
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  connected: 'text-emerald-500',
  weak: 'text-amber-500',
  denied: 'text-red-500',
  unavailable: 'text-red-500',
  locating: 'text-cyan-400',
  waiting: 'text-slate-500',
};

const HAZARD_LABEL: Record<string, string> = {
  bump: 'Lombada',
  hump: 'Lombada',
  table: 'Lombada elevada',
  cushion: 'Almofada',
  rumble_strip: 'Sonorizador',
  speed_camera: 'Radar',
};

/** Compact readout used for the compass / altitude chips under the speed. */
function Chip({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: any;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-xl">
      <Icon className="h-4 w-4 shrink-0 text-cyan-400" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">
          {label}
        </span>
        <span className="truncate text-sm font-black text-white">
          {value}
          {suffix && (
            <span className="ml-0.5 text-[10px] font-normal text-white/50">
              {suffix}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function HazardBanner({
  ahead,
  currentSpeed,
  unit,
}: {
  ahead: HazardAhead;
  currentSpeed: number;
  unit: string;
}) {
  const { hazard, distance, isAlerting } = ahead;
  const isCamera = hazard.type === 'camera';
  const Icon = isCamera ? Camera : TriangleAlert;
  const label = HAZARD_LABEL[hazard.subtype] ?? 'Obstáculo';
  // Only meaningful for km/h; the limit from OSM is always km/h.
  const overLimit =
    isCamera &&
    hazard.maxspeed !== null &&
    unit === 'kmh' &&
    currentSpeed > hazard.maxspeed;

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center gap-3 border-b px-3 py-2 transition-colors',
        overLimit
          ? 'animate-pulse border-red-500/40 bg-red-500/15'
          : isAlerting
            ? 'border-amber-400/40 bg-amber-400/15'
            : 'border-white/10 bg-white/5',
      )}
    >
      <Icon
        className={clsx(
          'h-5 w-5 shrink-0',
          overLimit ? 'text-red-400' : isAlerting ? 'text-amber-400' : 'text-white/50',
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={clsx(
            'truncate text-xs font-bold uppercase tracking-widest',
            overLimit ? 'text-red-300' : isAlerting ? 'text-amber-300' : 'text-white/60',
          )}
        >
          {label}
        </span>
        {isCamera && hazard.maxspeed !== null && (
          <span className="text-[10px] text-white/50">
            Limite {hazard.maxspeed} km/h
          </span>
        )}
      </div>
      <span
        className={clsx(
          'shrink-0 text-lg font-black tabular-nums',
          overLimit ? 'text-red-300' : isAlerting ? 'text-amber-300' : 'text-white/70',
        )}
      >
        {distance < 1000
          ? `${Math.round(distance / 10) * 10} m`
          : `${(distance / 1000).toFixed(1)} km`}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-xl">
      <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={clsx(
            'text-lg font-black tabular-nums leading-none sm:text-2xl',
            accent ? 'text-cyan-400' : 'text-white',
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-[10px] text-white/40">{suffix}</span>}
      </div>
    </div>
  );
}

export default function SpeedometerView() {
  const {
    activeTrip,
    isActive,
    isPaused,
    startTrip,
    pauseTrip,
    resumeTrip,
    endTrip,
    currentSpeedMs,
    toggleDrivingMode,
  } = useTrip();
  const { status, location, accuracy, errorMessage, retry } = useGps();
  const { settings } = useSettings();
  const { next: hazardAhead } = useHazards();

  const currentSpeed = convertSpeed(currentSpeedMs, settings.unit);
  // Sweeps between the 1 Hz fixes so the digits climb instead of teleporting.
  const shownSpeed = useAnimatedSpeed(currentSpeed);
  const speedUnit = unitLabel(settings.unit);
  const isSpeeding =
    settings.speedAlert !== null && currentSpeed > settings.speedAlert;

  // `location` is null until the first fix lands, and `heading`/`alt` are null
  // on hardware that does not report them - both have to be checked before use.
  const heading =
    location != null &&
    location.heading != null &&
    !Number.isNaN(location.heading)
      ? location.heading
      : null;
  const altitude = location != null && location.alt != null ? location.alt : null;

  const dist = distanceParts(activeTrip?.distance ?? 0, settings.unit);
  const avgSpeed = convertSpeed(activeTrip?.averageSpeed ?? 0, settings.unit);
  const maxSpeed = convertSpeed(activeTrip?.maxSpeed ?? 0, settings.unit);

  const handleStart = () => {
    if (isActive && !isPaused) pauseTrip();
    else if (isActive && isPaused) resumeTrip();
    else startTrip(settings.defaultMode);
  };

  const showBanner =
    errorMessage !== null && (status === 'denied' || status === 'unavailable');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#050A15]">
      {/* ---- Header ---- */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={clsx(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              STATUS_DOT[status] ?? STATUS_DOT.waiting,
            )}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className={clsx(
                'truncate text-[10px] font-bold uppercase tracking-widest',
                STATUS_TEXT_COLOR[status] ?? 'text-slate-500',
              )}
            >
              {STATUS_TEXT[status] ?? 'Desconhecido'}
            </span>
            {accuracy !== null && (
              <span className="text-[9px] text-white/40">
                ± {accuracy.toFixed(0)} m
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center leading-none">
          <span className="text-base font-black italic tracking-tighter text-cyan-400">
            VELOX
          </span>
          <span className="text-[7px] uppercase tracking-[0.3em] text-white/40">
            Speedometer
          </span>
        </div>

        <button
          onClick={() => {
            requestAppFullscreen();
            toggleDrivingMode();
          }}
          aria-label="Abrir modo velocímetro em tela cheia"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white active:bg-white/20"
        >
          <Expand className="h-5 w-5" />
        </button>
      </header>

      {/* ---- GPS problem banner ---- */}
      {showBanner && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="flex-1 text-[11px] leading-tight text-red-200">
            {errorMessage}
          </p>
          <button
            onClick={retry}
            aria-label="Tentar novamente"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-200 active:bg-red-500/30"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ---- Next hazard on the road ---- */}
      {hazardAhead && (
        <HazardBanner
          ahead={hazardAhead}
          currentSpeed={currentSpeed}
          unit={settings.unit}
        />
      )}

      {/* ---- Speed dial ---- */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-3 py-2">
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {/* Concentric rings scale with the viewport so they never crop. */}
          <div
            className="pointer-events-none absolute flex items-center justify-center"
            style={{ width: 'min(78vw, 42vh)', height: 'min(78vw, 42vh)' }}
          >
            <div className="absolute h-full w-full rounded-full border border-cyan-400/10" />
            <div className="absolute h-[86%] w-[86%] rounded-full border-2 border-cyan-400/20" />
            <div
              className={clsx(
                'absolute h-[72%] w-[72%] rounded-full border-4',
                isSpeeding
                  ? 'border-red-500/30 border-t-red-500'
                  : 'border-cyan-400/30 border-t-cyan-400',
              )}
            />
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <span
              className={clsx(
                'font-black leading-[0.85] tracking-tighter tabular-nums transition-colors duration-300',
                isSpeeding
                  ? 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.35)]'
                  : 'text-white drop-shadow-[0_0_30px_rgba(0,229,255,0.3)]',
              )}
              style={{ fontSize: 'clamp(4rem, min(34vw, 24vh), 14rem)' }}
            >
              {shownSpeed}
            </span>
            <span
              className={clsx(
                'mt-1 text-lg font-light uppercase tracking-[0.25em] sm:text-2xl',
                isSpeeding ? 'text-red-500/70' : 'text-white/60',
              )}
            >
              {speedUnit}
            </span>
          </div>

          {isSpeeding && (
            <div className="absolute top-2 flex animate-pulse items-center gap-2 rounded-full bg-red-500/15 px-3 py-1 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-widest">
                Limite excedido
              </span>
            </div>
          )}
        </div>

        {/* ---- Compass + altitude chips (in flow, never over the dial) ---- */}
        {(heading !== null || altitude !== null) && (
          <div className="flex shrink-0 gap-2">
            {heading !== null && (
              <Chip
                icon={Compass}
                label="Direção"
                value={`${getHeadingName(heading)} ${Math.round(heading)}°`}
              />
            )}
            {altitude !== null && (
              <Chip
                icon={Mountain}
                label="Altitude"
                value={altitude.toFixed(0)}
                suffix="m"
              />
            )}
          </div>
        )}

        {/* ---- Stats ---- */}
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Distância" value={dist.value} suffix={dist.label} />
          <Stat
            label="Tempo"
            value={
              activeTrip
                ? formatTime(activeTrip.movingTime + activeTrip.stoppedTime)
                : '00:00'
            }
          />
          <Stat label="Vel. média" value={avgSpeed.toFixed(1)} suffix={speedUnit} />
          <Stat
            label="Vel. máxima"
            value={maxSpeed.toFixed(1)}
            suffix={speedUnit}
            accent
          />
        </div>
      </div>

      {/* ---- Controls ---- */}
      <div className="shrink-0 border-t border-white/10 bg-white/5 px-3 py-3 backdrop-blur-2xl">
        <div className="flex gap-2">
          {isActive && (
            <button
              onClick={() => endTrip()}
              className="h-14 flex-1 rounded-2xl border border-red-500/50 bg-red-500/20 text-sm font-bold uppercase tracking-widest text-red-400 active:bg-red-500/30"
            >
              Finalizar
            </button>
          )}

          <button
            onClick={handleStart}
            className="h-14 flex-[2] rounded-2xl bg-cyan-400 text-sm font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(0,229,255,0.4)] active:bg-cyan-300"
          >
            {isActive && !isPaused ? 'Pausar' : isActive ? 'Continuar' : 'Iniciar'}
          </button>
        </div>

        <p className="mt-2 text-center text-[9px] leading-tight text-white/30">
          Não opere o dispositivo em movimento. Concentre-se na via.
        </p>
      </div>
    </div>
  );
}
