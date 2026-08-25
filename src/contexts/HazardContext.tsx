import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { HazardAhead, LocationPoint, RoadHazard } from '../types';
import { useGps } from './GpsContext';
import { useSettings } from './SettingsContext';
import { useTrip } from './TripContext';
import {
  angularDifference,
  calculateBearing,
  calculateDistance,
} from '../utils/geo';

export type HazardStatus = 'off' | 'idle' | 'loading' | 'ready' | 'error';

/** Refresh the cell once the driver has moved this far from the last fetch. */
const REFETCH_DISTANCE = 2000;
/** Ignore anything further out than this; it is not actionable yet. */
const CONSIDER_RADIUS = 1200;
/** A hazard counts as "ahead" within this cone of the direction of travel. */
const AHEAD_CONE = 50;
/** Warn this many seconds before arrival... */
const LEAD_SECONDS = 9;
/** ...but never later than this, so it still works at walking pace. */
const MIN_ALERT_DISTANCE = 120;

function alertDistanceFor(speedMs: number): number {
  return Math.max(MIN_ALERT_DISTANCE, speedMs * LEAD_SECONDS);
}

/** Short rising beep for cameras, single low beep for bumps. */
function playAlertTone(kind: 'bump' | 'camera') {
  try {
    const Ctx =
      window.AudioContext ?? (window as any).webkitAudioContext ?? null;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const beep = (at: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Ramp instead of a hard stop, otherwise it clicks.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.25, at + 0.01);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    };

    if (kind === 'camera') {
      beep(now, 880, 0.12);
      beep(now + 0.16, 1180, 0.16);
    } else {
      beep(now, 560, 0.18);
    }

    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* audio is a nicety, never a hard failure */
  }
}

interface HazardContextValue {
  next: HazardAhead | null;
  hazards: RoadHazard[];
  status: HazardStatus;
  refresh: () => void;
}

const HazardContext = createContext<HazardContextValue | undefined>(undefined);

/**
 * One fetch loop and one alert tone for the whole app. Two components consume
 * this (the normal view and the fullscreen one); mounting the hook twice would
 * duplicate every Overpass request and beep each warning twice.
 */
export function HazardProvider({ children }: { children: React.ReactNode }) {
  const { location, isDemoMode } = useGps();
  const { settings } = useSettings();
  const { currentSpeedMs } = useTrip();

  const [hazards, setHazards] = useState<RoadHazard[]>([]);
  const [status, setStatus] = useState<HazardStatus>('idle');
  const [next, setNext] = useState<HazardAhead | null>(null);

  const lastFetchPointRef = useRef<LocationPoint | null>(null);
  const prevPointRef = useRef<LocationPoint | null>(null);
  /** Hazard we have already sounded for, so each one beeps exactly once. */
  const announcedRef = useRef<string | null>(null);
  const enabled = settings.hazardAlerts;

  // ---- Load the cell the driver is in -------------------------------------
  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setHazards([]);
      setNext(null);
      return;
    }
    if (!location) return;

    const last = lastFetchPointRef.current;
    const moved =
      !last ||
      calculateDistance(last.lat, last.lng, location.lat, location.lng) >
        REFETCH_DISTANCE;
    if (!moved) return;

    lastFetchPointRef.current = location;
    let cancelled = false;
    setStatus('loading');

    // Imported lazily so the Overpass client is not in the initial bundle.
    import('../services/roadData')
      .then(({ getHazardsNear }) => getHazardsNear(location.lat, location.lng))
      .then((result) => {
        if (cancelled) return;
        setHazards(result);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, location, isDemoMode]);

  // ---- Resolve the nearest hazard ahead on every fix -----------------------
  useEffect(() => {
    if (!enabled || !location || hazards.length === 0) {
      setNext(null);
      return;
    }

    // GPS heading is null while stationary and on some hardware, so fall back
    // to the bearing between the last two fixes.
    let heading: number | null =
      location.heading != null && !Number.isNaN(location.heading)
        ? location.heading
        : null;
    const prev = prevPointRef.current;
    if (heading === null && prev) {
      const travelled = calculateDistance(
        prev.lat,
        prev.lng,
        location.lat,
        location.lng,
      );
      // Under a few metres the bearing is just GPS noise.
      if (travelled > 5) {
        heading = calculateBearing(prev.lat, prev.lng, location.lat, location.lng);
      }
    }
    prevPointRef.current = location;

    if (heading === null) {
      setNext(null);
      return;
    }

    let best: HazardAhead | null = null;
    for (const hazard of hazards) {
      const distance = calculateDistance(
        location.lat,
        location.lng,
        hazard.lat,
        hazard.lng,
      );
      if (distance > CONSIDER_RADIUS) continue;

      const bearing = calculateBearing(
        location.lat,
        location.lng,
        hazard.lat,
        hazard.lng,
      );
      if (angularDifference(bearing, heading) > AHEAD_CONE) continue;

      if (!best || distance < best.distance) {
        best = {
          hazard,
          distance,
          isAlerting: distance <= alertDistanceFor(currentSpeedMs),
        };
      }
    }

    setNext(best);

    if (best?.isAlerting) {
      if (announcedRef.current !== best.hazard.id) {
        announcedRef.current = best.hazard.id;
        if (settings.audioAlerts) playAlertTone(best.hazard.type);
      }
    } else if (!best) {
      announcedRef.current = null;
    }
  }, [enabled, location, hazards, currentSpeedMs, settings.audioAlerts]);

  const refresh = useCallback(() => {
    lastFetchPointRef.current = null;
    setStatus('idle');
  }, []);

  return (
    <HazardContext.Provider value={{ next, hazards, status, refresh }}>
      {children}
    </HazardContext.Provider>
  );
}

export function useHazards() {
  const ctx = useContext(HazardContext);
  if (!ctx) throw new Error('useHazards must be used within HazardProvider');
  return ctx;
}
