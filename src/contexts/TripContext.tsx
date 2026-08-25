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
import { calculateDistance, SpeedSmoother } from '../utils/geo';
import { saveTrip } from '../services/storage';

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
}

const TripContext = createContext<TripContextValue | undefined>(undefined);

/** Below this the reading is treated as standing still. */
const MOVING_THRESHOLD_MS = 0.5;
/** Keep a path point only every N metres so long rides stay light on RAM. */
const PATH_MIN_DISTANCE = 8;
/** ...but never let more than this go by without recording one. */
const PATH_MAX_INTERVAL = 10000;
/** Hard ceiling on stored points; a phone should not hold an unbounded array. */
const PATH_MAX_POINTS = 5000;
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

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { location, status } = useGps();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeedMs, setCurrentSpeedMs] = useState(0);
  const [isDrivingMode, setIsDrivingMode] = useState(false);

  const lastPointRef = useRef<LocationPoint | null>(null);
  const lastTickRef = useRef<number>(0);
  const lastStoredPointRef = useRef<LocationPoint | null>(null);
  const speedRef = useRef(0);
  const smootherRef = useRef(new SpeedSmoother());

  // Everything below is computed *outside* the setState updater. React may call
  // an updater more than once, so an updater that mutates refs (or reads a ref
  // it just wrote) silently loses data.
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

    // Prefer the GPS-reported speed; fall back to distance over time.
    let rawSpeed = 0;
    if (location.speed !== null && location.speed >= 0) {
      rawSpeed = location.speed;
    } else if (prevPoint) {
      const d = calculateDistance(
        prevPoint.lat,
        prevPoint.lng,
        location.lat,
        location.lng,
      );
      const dt = (location.timestamp - prevPoint.timestamp) / 1000;
      if (dt > 0) rawSpeed = d / dt;
    }

    const smoothed = smootherRef.current.update(rawSpeed);
    speedRef.current = smoothed;
    setCurrentSpeedMs(smoothed);

    if (isActive && !isPaused) {
      let distAdded = 0;
      if (prevPoint) {
        distAdded = calculateDistance(
          prevPoint.lat,
          prevPoint.lng,
          location.lat,
          location.lng,
        );
        // GPS jitter while parked would otherwise inflate the odometer.
        if (distAdded < 2 && smoothed < 1) distAdded = 0;
      }

      let ascentAdded = 0;
      let descentAdded = 0;
      if (prevPoint && location.alt !== null && prevPoint.alt !== null) {
        const dAlt = location.alt - prevPoint.alt;
        if (dAlt > 1) ascentAdded = dAlt;
        else if (dAlt < -1) descentAdded = Math.abs(dAlt);
      }

      const now = location.timestamp;
      const elapsed =
        lastTickRef.current > 0 ? Math.max(0, now - lastTickRef.current) : 0;
      lastTickRef.current = now;
      const isMoving = smoothed > MOVING_THRESHOLD_MS;

      // Decide here whether this point is worth storing, then hand the updater
      // a plain boolean.
      const stored = lastStoredPointRef.current;
      const shouldStore =
        !stored ||
        now - stored.timestamp >= PATH_MAX_INTERVAL ||
        calculateDistance(stored.lat, stored.lng, location.lat, location.lng) >=
          PATH_MIN_DISTANCE;
      if (shouldStore) lastStoredPointRef.current = location;

      setActiveTrip((prev) => {
        if (!prev) return prev;
        const distance = prev.distance + distAdded;
        const movingTime = prev.movingTime + (isMoving ? elapsed : 0);
        const stoppedTime = prev.stoppedTime + (isMoving ? 0 : elapsed);
        const path =
          shouldStore && prev.path.length < PATH_MAX_POINTS
            ? [...prev.path, location]
            : prev.path;

        return {
          ...prev,
          distance,
          maxSpeed: Math.max(prev.maxSpeed, smoothed),
          path,
          movingTime,
          stoppedTime,
          totalAscent: prev.totalAscent + ascentAdded,
          totalDescent: prev.totalDescent + descentAdded,
          averageSpeed: movingTime > 0 ? distance / (movingTime / 1000) : 0,
        };
      });
    }

    lastPointRef.current = location;
  }, [location, isActive, isPaused, status]);

  // A frozen readout is worse than a falling one: losing the signal in a tunnel
  // would otherwise leave 60 km/h on screen while the bike is parked. Pull the
  // number down whenever fixes stop arriving.
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

  // Keeps the clock honest while standing still or when the GPS stops
  // delivering fixes. Reads speed from a ref so the interval is not rebuilt on
  // every reading.
  useEffect(() => {
    if (!isActive || isPaused) return;

    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed =
        lastTickRef.current > 0 ? Math.max(0, now - lastTickRef.current) : 0;
      if (elapsed <= 0) return;

      const stale = now - (lastPointRef.current?.timestamp ?? 0) > 3000;
      const isMoving = speedRef.current > MOVING_THRESHOLD_MS;

      // While fixes keep arriving the GPS effect owns the clock; only step in
      // when parked or when the signal has gone quiet.
      if (!stale && isMoving) return;

      lastTickRef.current = now;
      setActiveTrip((prev) =>
        prev
          ? {
              ...prev,
              movingTime: prev.movingTime + (isMoving ? elapsed : 0),
              stoppedTime: prev.stoppedTime + (isMoving ? 0 : elapsed),
            }
          : prev,
      );
    }, 1000);

    return () => window.clearInterval(id);
  }, [isActive, isPaused]);

  const startTrip = useCallback(
    (mode: TripMode) => {
      const now = Date.now();
      lastTickRef.current = now;
      lastStoredPointRef.current = location ?? null;
      setActiveTrip({
        id: now.toString(),
        startTime: now,
        endTime: null,
        mode,
        distance: 0,
        maxSpeed: 0,
        averageSpeed: 0,
        movingTime: 0,
        stoppedTime: 0,
        totalAscent: 0,
        totalDescent: 0,
        path: location ? [location] : [],
      });
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
    if (activeTrip) {
      // Only worth keeping if something actually happened.
      if (activeTrip.distance > 0 || activeTrip.movingTime > 0) {
        await saveTrip({ ...activeTrip, endTime: Date.now() });
      }
      setActiveTrip(null);
    }
  }, [activeTrip]);

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
