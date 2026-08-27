import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  Camera,
  Minimize2,
  Pause,
  Play,
  Square,
  Sun,
  TriangleAlert,
} from 'lucide-react';
import { useGps } from '../contexts/GpsContext';
import { useHazards } from '../contexts/HazardContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTrip } from '../contexts/TripContext';
import { convertSpeed, distanceParts, unitLabel } from '../utils/geo';
import { formatTime } from '../utils/format';
import { HazardAhead } from '../types';
import { useAnimatedSpeed } from '../hooks/useAnimatedSpeed';
import { useClock } from '../hooks/useClock';
import { useNow } from '../hooks/useNow';
import { describeGpsState } from '../utils/gpsState';
import { WakeLockStatus } from '../hooks/useWakeLock';

const HAZARD_LABEL: Record<string, string> = {
  bump: 'Lombada',
  hump: 'Lombada',
  table: 'Lombada elevada',
  cushion: 'Almofada',
  rumble_strip: 'Sonorizador',
  speed_camera: 'Radar',
};

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-emerald-500',
  weak: 'bg-amber-500',
  denied: 'bg-red-500',
  unavailable: 'bg-red-500',
  locating: 'bg-cyan-400 animate-pulse',
  waiting: 'bg-slate-500',
};

function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

/** The familiar red-ring limit sign - readable at a glance, no text needed. */
function LimitSign({ value, alarm }: { value: number; alarm: boolean }) {
  return (
    <div
      className={clsx(
        'flex aspect-square shrink-0 items-center justify-center rounded-full border-[6px] bg-white',
        'w-[clamp(3.5rem,11vmin,5.5rem)]',
        alarm ? 'animate-pulse border-red-500' : 'border-red-600',
      )}
    >
      <span className="text-[clamp(1.25rem,4.5vmin,2.25rem)] font-black leading-none text-black">
        {value}
      </span>
    </div>
  );
}

/**
 * The warning is the whole point of this screen, so it gets real estate rather
 * than a strip: the driver should read it without looking for it.
 */
function HazardPanel({
  ahead,
  currentSpeed,
  isKmh,
}: {
  ahead: HazardAhead;
  currentSpeed: number;
  isKmh: boolean;
}) {
  const { hazard, distance, isAlerting } = ahead;
  const isCamera = hazard.type === 'camera';
  const Icon = isCamera ? Camera : TriangleAlert;
  const overLimit =
    isCamera && hazard.maxspeed !== null && isKmh && currentSpeed > hazard.maxspeed;

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center gap-3 rounded-2xl border px-3 py-2 transition-colors sm:gap-4 sm:px-4 sm:py-3',
        overLimit
          ? 'animate-pulse border-red-500/60 bg-red-500/20'
          : isAlerting
            ? 'border-amber-400/60 bg-amber-400/20'
            : 'border-white/15 bg-white/5',
      )}
    >
      <Icon
        className={clsx(
          'h-[clamp(1.5rem,5vmin,2.5rem)] w-[clamp(1.5rem,5vmin,2.5rem)] shrink-0',
          overLimit ? 'text-red-400' : isAlerting ? 'text-amber-400' : 'text-white/60',
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={clsx(
            'truncate text-[clamp(0.9rem,3.2vmin,1.5rem)] font-black uppercase tracking-wide',
            overLimit ? 'text-red-200' : isAlerting ? 'text-amber-200' : 'text-white/80',
          )}
        >
          {HAZARD_LABEL[hazard.subtype] ?? 'Obstáculo'}
        </span>
        <span
          className={clsx(
            'text-[clamp(1.1rem,4vmin,2rem)] font-black tabular-nums',
            overLimit ? 'text-red-300' : isAlerting ? 'text-amber-300' : 'text-white/60',
          )}
        >
          {formatDistance(distance)}
        </span>
      </div>

      {isCamera && hazard.maxspeed !== null && (
        <LimitSign value={hazard.maxspeed} alarm={overLimit} />
      )}
    </div>
  );
}

/**
 * Must be called synchronously from a tap handler: the Fullscreen API only
 * works while the user gesture is still active. Silently unavailable on
 * iPhone Safari, where the fixed overlay is as close as we get.
 */
export function requestAppFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

const WAKE_LABEL: Record<WakeLockStatus, string> = {
  active: 'Tela sempre ligada',
  idle: 'Tela pode apagar',
  blocked: 'Bloqueado pelo sistema',
  unsupported: 'Sem suporte no navegador',
};

export default function SpeedometerFullscreen({
  wakeLock,
}: {
  wakeLock: WakeLockStatus;
}) {
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
  const { status, errorMessage, lastFixAt, trackingSince } = useGps();
  const { settings } = useSettings();
  const { next: hazardAhead } = useHazards();
  const clock = useClock();

  // Only ticks while the GPS is unhappy; a good signal leaves the screen idle.
  const gpsUnhealthy =
    lastFixAt === null || Date.now() - lastFixAt > 3000 || status === 'denied';
  const now = useNow(gpsUnhealthy);
  const notice = describeGpsState(status, errorMessage, lastFixAt, trackingSince, now);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentSpeed = convertSpeed(currentSpeedMs, settings.unit);
  // Sweeps between the 1 Hz fixes so the digits climb instead of teleporting.
  const shownSpeed = useAnimatedSpeed(currentSpeed);
  const speedUnit = unitLabel(settings.unit);
  const isKmh = settings.unit === 'kmh';
  const dist = distanceParts(activeTrip?.distance ?? 0, settings.unit);

  const overSetLimit =
    settings.speedAlert !== null && currentSpeed > settings.speedAlert;
  const overCameraLimit =
    hazardAhead?.hazard.type === 'camera' &&
    hazardAhead.hazard.maxspeed !== null &&
    isKmh &&
    currentSpeed > hazardAhead.hazard.maxspeed;
  const isSpeeding = overSetLimit || overCameraLimit;

  // Only tracks and releases fullscreen. Entering it has to happen inside the
  // tap handler (see requestAppFullscreen) because browsers reject the request
  // once the user gesture has expired.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    onChange();

    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const handleTripButton = () => {
    if (isActive && !isPaused) pauseTrip();
    else if (isActive && isPaused) resumeTrip();
    else startTrip(settings.defaultMode);
  };

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex flex-col pt-safe pb-safe px-safe transition-colors duration-300',
        // One bg class only: two of them collide and CSS order, not string
        // order, picks the winner.
        isSpeeding ? 'bg-[#1A0508]' : 'bg-[#050A15]',
      )}
    >
      {/* ---- Top strip: status + clock + exit ---- */}
      {/* The two flanking groups are flex-1 so the clock stays optically
          centred whatever the status text says. */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={clsx(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              STATUS_DOT[status] ?? STATUS_DOT.waiting,
            )}
          />
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/55">
            {isFullscreen ? 'Tela cheia' : 'Velocímetro'}
          </span>

          {/* A rider needs to know the screen will stay on *before* setting
              off, so say it rather than failing silently later. */}
          <span
            title={WAKE_LABEL[wakeLock]}
            className={clsx(
              'flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5',
              wakeLock === 'active'
                ? 'border-emerald-400/40 text-emerald-400'
                : 'border-amber-400/40 text-amber-400',
            )}
          >
            <Sun className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">{WAKE_LABEL[wakeLock]}</span>
          </span>
        </div>

        <time
          dateTime={clock}
          className="shrink-0 text-[clamp(1.25rem,5vmin,2.25rem)] font-black leading-none tracking-tight tabular-nums text-white/80"
        >
          {clock}
        </time>

        <div className="flex flex-1 justify-end">
          <button
            onClick={toggleDrivingMode}
            aria-label="Sair do modo velocímetro"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/70 active:bg-white/20"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ---- GPS trouble, said out loud ---- */}
      {/* Without this the rider just sees a grey dot and a zero, which is
          indistinguishable from a broken app. */}
      {notice && notice.tone !== 'info' && (
        <div
          role="status"
          className={clsx(
            'mx-3 mb-1 flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2',
            notice.tone === 'error'
              ? 'border-red-500/40 bg-red-500/15'
              : 'border-amber-400/40 bg-amber-400/15',
          )}
        >
          <AlertTriangle
            className={clsx(
              'h-5 w-5 shrink-0',
              notice.tone === 'error' ? 'text-red-400' : 'text-amber-400',
            )}
            aria-hidden="true"
          />
          <p
            className={clsx(
              'flex-1 text-[clamp(0.75rem,2.6vmin,1rem)] leading-tight',
              notice.tone === 'error' ? 'text-red-200' : 'text-amber-200',
            )}
          >
            {notice.message}
          </p>
        </div>
      )}

      {/* ---- Hazard warning ---- */}
      {hazardAhead && (
        <div className="shrink-0 px-3 pb-1">
          <HazardPanel
            ahead={hazardAhead}
            currentSpeed={currentSpeed}
            isKmh={isKmh}
          />
        </div>
      )}

      {/* ---- The speed, as big as the screen allows ---- */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3">
        <span
          className={clsx(
            'font-black leading-[0.82] tracking-tighter tabular-nums transition-colors duration-300',
            isSpeeding
              ? 'text-red-500 drop-shadow-[0_0_40px_rgba(239,68,68,0.4)]'
              : 'text-white drop-shadow-[0_0_40px_rgba(0,229,255,0.25)]',
          )}
          style={{ fontSize: 'clamp(5rem, min(52vw, 58vh), 26rem)' }}
        >
          {shownSpeed}
        </span>
        <span
          className={clsx(
            'mt-2 font-light uppercase tracking-[0.35em]',
            isSpeeding ? 'text-red-400/70' : 'text-white/50',
          )}
          style={{ fontSize: 'clamp(0.9rem, 3.5vmin, 2rem)' }}
        >
          {speedUnit}
        </span>
      </div>

      {/* ---- Bottom strip: trip readout + control ---- */}
      <div className="flex shrink-0 items-center gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
              Distância
            </span>
            <span className="truncate text-lg font-black tabular-nums text-white/80">
              {dist.value}
              <span className="ml-1 text-xs font-normal text-white/55">
                {dist.label}
              </span>
            </span>
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
              Tempo
            </span>
            <span className="truncate text-lg font-black tabular-nums text-white/80">
              {activeTrip
                ? formatTime(activeTrip.movingTime + activeTrip.stoppedTime)
                : '00:00'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {isActive && (
            <button
              onClick={() => endTrip()}
              aria-label="Finalizar viagem"
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/15 text-red-400 active:bg-red-500/25"
            >
              <Square className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={handleTripButton}
            aria-label={
              isActive && !isPaused ? 'Pausar viagem' : 'Iniciar viagem'
            }
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 text-black shadow-[0_0_20px_rgba(0,229,255,0.35)] active:bg-cyan-300"
          >
            {isActive && !isPaused ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
