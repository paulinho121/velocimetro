import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { Trip, TripMode, LocationPoint } from '../types';
import { useGps } from './GpsContext';
import { SpeedSmoother } from '../utils/geo';
import {
  ActiveTripSnapshot,
  clearActiveTrip,
  getActiveTrip,
  saveActiveTrip,
  saveTrip,
} from '../services/storage';
import {
  MOVING_THRESHOLD_MS,
  applyFixToTrip,
  applyIdleTime,
  computeFixDelta,
  createTrip,
  isTripWorthKeeping,
  rawSpeedFrom,
  shouldStorePoint,
} from '../utils/trip';

interface TripContextValue {
  activeTrip: Trip | null;
  isActive: boolean;
  isPaused: boolean;
  startTrip: (mode: TripMode) => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  endTrip: () => Promise<void>;
  resetMaxSpeed: () => void;
  currentSpeedMs: number; // Smoothed speed in m/s
  isDrivingMode: boolean;
  toggleDrivingMode: () => void;
  /** A ride found unfinished on startup, awaiting the rider's decision. */
  recoverableTrip: ActiveTripSnapshot | null;
  resumeRecoveredTrip: () => void;
  discardRecoveredTrip: () => Promise<void>;
}

const TripContext = createContext<TripContextValue | undefined>(undefined);

/**
 * After this long without a fix the reading is no longer trustworthy. Kept
 * generous so a handset that only reports every couple of seconds does not see
 * its speed sag between perfectly good fixes.
 */
const FIX_STALE_AFTER = 3000;
/** How often the stale-fix watchdog runs. */
const WATCHDOG_MS = 400;
/** Fraction retained per watchdog tick once the signal is gone. */
const STALE_DECAY = 0.6;
/** How often the live ride is checkpointed to disk. */
const AUTOSAVE_MS = 5000;

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { location, status } = useGps();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeedMs, setCurrentSpeedMs] = useState(0);
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const [recoverableTrip, setRecoverableTrip] =
    useState<ActiveTripSnapshot | null>(null);

  const lastPointRef = useRef<LocationPoint | null>(null);
  const lastTickRef = useRef<number>(0);
  const lastStoredPointRef = useRef<LocationPoint | null>(null);
  const speedRef = useRef(0);
  const smootherRef = useRef(new SpeedSmoother());
  const activeTripRef = useRef<Trip | null>(null);
  activeTripRef.current = activeTrip;

  // ---- Recovery -----------------------------------------------------------
  // Look for a ride that was cut short. Nothing is resumed automatically: the
  // snapshot may be from yesterday, so the rider decides.
  useEffect(() => {
    let cancelled = false;
    getActiveTrip()
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        if (!isTripWorthKeeping(snapshot.trip)) {
          void clearActiveTrip();
          return;
        }
        setRecoverableTrip(snapshot);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const resumeRecoveredTrip = useCallback(() => {
    if (!recoverableTrip) return;
    // Time spent with the app closed belongs to neither clock, so restart the
    // accounting from now instead of billing the gap as a stop.
    lastTickRef.current = Date.now();
    lastStoredPointRef.current =
      recoverableTrip.trip.path[recoverableTrip.trip.path.length - 1] ?? null;
    setActiveTrip(recoverableTrip.trip);
    setIsActive(true);
    setIsPaused(recoverableTrip.isPaused);
    setRecoverableTrip(null);
  }, [recoverableTrip]);

  const discardRecoveredTrip = useCallback(async () => {
    const snapshot = recoverableTrip;
    setRecoverableTrip(null);
    // Discarding the prompt should not throw the ride away: file it in the
    // history so the distance is never silently lost.
    if (snapshot && isTripWorthKeeping(snapshot.trip)) {
      await saveTrip({ ...snapshot.trip, endTime: snapshot.savedAt });
    }
    await clearActiveTrip();
  }, [recoverableTrip]);

  // ---- Per-fix pipeline ---------------------------------------------------
  // The maths lives in utils/trip so it stays pure and testable; an updater
  // that mutates refs loses data whenever React invokes it twice.
  useEffect(() => {
    if (!location) {
      if (status === 'waiting') {
        setCurrentSpeedMs(0);
        speedRef.current = 0;
        smootherRef.current.reset();
        lastPointRef.current = null;
      }
      return;
    }

    const prevPoint = lastPointRef.current;
    const smoothed = smootherRef.current.update(rawSpeedFrom(prevPoint, location));
    speedRef.current = smoothed;
    setCurrentSpeedMs(smoothed);

    if (isActive && !isPaused) {
      const delta = computeFixDelta(
        prevPoint,
        location,
        smoothed,
        lastTickRef.current,
      );
      lastTickRef.current = location.timestamp;

      const storePoint = shouldStorePoint(lastStoredPointRef.current, location);
      if (storePoint) lastStoredPointRef.current = location;

      setActiveTrip((prev) =>
        prev ? applyFixToTrip(prev, delta, location, storePoint, smoothed) : prev,
      );
    }

    lastPointRef.current = location;
  }, [location, isActive, isPaused, status]);

  // ---- Stale-signal watchdog ---------------------------------------------
  // A frozen readout is worse than a falling one: losing the signal in a tunnel
  // would otherwise leave 60 km/h on screen while the bike is parked.
  useEffect(() => {
    const id = window.setInterval(() => {
      const lastFix = lastPointRef.current?.timestamp ?? 0;
      if (!lastFix || Date.now() - lastFix < FIX_STALE_AFTER) return;
      if (speedRef.current === 0) return;

      const decayed = smootherRef.current.decay(STALE_DECAY);
      speedRef.current = decayed;
      setCurrentSpeedMs(decayed);
    }, WATCHDOG_MS);

    return () => window.clearInterval(id);
  }, []);

  // ---- Clock while parked or without signal -------------------------------
  useEffect(() => {
    if (!isActive || isPaused) return;

    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed =
        lastTickRef.current > 0 ? Math.max(0, now - lastTickRef.current) : 0;
      if (elapsed <= 0) return;

      const stale = now - (lastPointRef.current?.timestamp ?? 0) > FIX_STALE_AFTER;
      const isMoving = speedRef.current > MOVING_THRESHOLD_MS;

      // While fixes keep arriving the GPS effect owns the clock.
      if (!stale && isMoving) return;

      lastTickRef.current = now;
      setActiveTrip((prev) => (prev ? applyIdleTime(prev, elapsed, isMoving) : prev));
    }, 1000);

    return () => window.clearInterval(id);
  }, [isActive, isPaused]);

  // ---- Checkpointing ------------------------------------------------------
  // Reads the trip from a ref so the timer is not rebuilt on every GPS fix.
  useEffect(() => {
    if (!isActive) return;

    const persist = () => {
      const trip = activeTripRef.current;
      if (!trip) return;
      void saveActiveTrip({ trip, isPaused, savedAt: Date.now() }).catch(() => {});
    };

    persist(); // checkpoint immediately on start/pause/resume
    const id = window.setInterval(persist, AUTOSAVE_MS);

    // Last chance to write before the page is torn down.
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persist);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [isActive, isPaused]);

  // ---- Controls -----------------------------------------------------------
  const startTrip = useCallback(
    (mode: TripMode) => {
      const now = Date.now();
      lastTickRef.current = now;
      lastStoredPointRef.current = location ?? null;
      setActiveTrip(createTrip(now.toString(), mode, now, location ?? null));
      setIsActive(true);
      setIsPaused(false);
    },
    [location],
  );

  const pauseTrip = useCallback(() => setIsPaused(true), []);

  const resumeTrip = useCallback(() => {
    lastTickRef.current = Date.now();
    setIsPaused(false);
  }, []);

  const endTrip = useCallback(async () => {
    setIsActive(false);
    setIsPaused(false);
    lastTickRef.current = 0;
    lastStoredPointRef.current = null;

    const trip = activeTripRef.current;
    setActiveTrip(null);
    await clearActiveTrip().catch(() => {});
    if (trip && isTripWorthKeeping(trip)) {
      await saveTrip({ ...trip, endTime: Date.now() });
    }
  }, []);

  const resetMaxSpeed = useCallback(() => {
    setActiveTrip((prev) => (prev ? { ...prev, maxSpeed: 0 } : prev));
  }, []);

  const toggleDrivingMode = useCallback(
    () => setIsDrivingMode((prev) => !prev),
    [],
  );

  return (
    <TripContext.Provider
      value={{
        activeTrip,
        isActive,
        isPaused,
        startTrip,
        pauseTrip,
        resumeTrip,
        endTrip,
        resetMaxSpeed,
        currentSpeedMs,
        isDrivingMode,
        toggleDrivingMode,
        recoverableTrip,
        resumeRecoveredTrip,
        discardRecoveredTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
