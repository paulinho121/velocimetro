import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { location, status } = useGps();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeedMs, setCurrentSpeedMs] = useState(0);
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  
  const lastLocationRef = useRef<LocationPoint | null>(null);
  const lastTimeRef = useRef<number>(0);
  const smootherRef = useRef(new SpeedSmoother(0.4));
  const tripIntervalRef = useRef<number | null>(null);

  // Smooth speed updates even without active trip (for the dashboard)
  useEffect(() => {
    if (location) {
      let speed = 0;
      if (location.speed !== null && location.speed >= 0) {
        // GPS provided speed
        speed = location.speed;
      } else if (lastLocationRef.current) {
        // Calculate from coordinates if speed is null
        const d = calculateDistance(
          lastLocationRef.current.lat,
          lastLocationRef.current.lng,
          location.lat,
          location.lng
        );
        const dt = (location.timestamp - lastLocationRef.current.timestamp) / 1000;
        if (dt > 0) speed = d / dt;
      }
      
      const smoothed = smootherRef.current.update(speed);
      setCurrentSpeedMs(smoothed);
      
      // Update active trip
      if (isActive && !isPaused && activeTrip) {
        setActiveTrip(prev => {
          if (!prev) return prev;
          
          let distAdded = 0;
          if (lastLocationRef.current) {
            distAdded = calculateDistance(
              lastLocationRef.current.lat,
              lastLocationRef.current.lng,
              location.lat,
              location.lng
            );
            // Ignore noise (e.g., less than 2 meters jumping)
            if (distAdded < 2 && smoothed < 1) distAdded = 0;
          }
          
          const newPath = [...prev.path, location];
          // Don't keep all points indefinitely in memory to avoid lag, maybe subsample?
          // For now, keeping them all is fine for moderate trips. We'll store every N seconds if needed, but GPS is ~1Hz.
          
          const timeSinceLast = location.timestamp - lastTimeRef.current;
          let newMoving = prev.movingTime;
          let newStopped = prev.stoppedTime;
          
          if (smoothed > 0.5) { // moving
             newMoving += timeSinceLast;
          } else {
             newStopped += timeSinceLast;
          }
          lastTimeRef.current = location.timestamp;

          let newAscent = prev.totalAscent;
          let newDescent = prev.totalDescent;
          if (lastLocationRef.current && location.alt !== null && lastLocationRef.current.alt !== null) {
            const dAlt = location.alt - lastLocationRef.current.alt;
            if (dAlt > 1) newAscent += dAlt;
            else if (dAlt < -1) newDescent += Math.abs(dAlt);
          }

          return {
            ...prev,
            distance: prev.distance + distAdded,
            maxSpeed: Math.max(prev.maxSpeed, smoothed),
            path: newPath,
            movingTime: newMoving,
            stoppedTime: newStopped,
            averageSpeed: newMoving > 0 ? ((prev.distance + distAdded) / (newMoving / 1000)) : 0
          };
        });
      }
      
      lastLocationRef.current = location;
    } else {
      if (status === 'waiting') {
        setCurrentSpeedMs(0);
        smootherRef.current.reset();
      }
    }
  }, [location, isActive, isPaused, status]);

  // Handle time updates when standing still but active
  useEffect(() => {
    if (isActive && !isPaused) {
      tripIntervalRef.current = window.setInterval(() => {
        const now = Date.now();
        setActiveTrip(prev => {
          if (!prev) return prev;
          const timeSinceLast = now - lastTimeRef.current;
          if (currentSpeedMs <= 0.5) {
             lastTimeRef.current = now;
             return {
               ...prev,
               stoppedTime: prev.stoppedTime + timeSinceLast
             };
          }
          // If moving, we let the GPS effect handle it for accuracy, but if GPS drops, we need this
          if (now - (lastLocationRef.current?.timestamp || 0) > 3000) {
             lastTimeRef.current = now;
             return {
                ...prev,
                movingTime: prev.movingTime + timeSinceLast
             }
          }
          return prev;
        });
      }, 1000);
    }
    return () => {
      if (tripIntervalRef.current !== null) {
        clearInterval(tripIntervalRef.current);
      }
    };
  }, [isActive, isPaused, currentSpeedMs]);

  const startTrip = useCallback((mode: TripMode) => {
    const now = Date.now();
    setActiveTrip({
      id: Date.now().toString(),
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
      path: location ? [location] : []
    });
    lastTimeRef.current = now;
    setIsActive(true);
    setIsPaused(false);
  }, [location]);

  const pauseTrip = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeTrip = useCallback(() => {
    lastTimeRef.current = Date.now();
    setIsPaused(false);
  }, []);

  const endTrip = useCallback(async () => {
    setIsActive(false);
    setIsPaused(false);
    if (activeTrip) {
      const finalTrip = { ...activeTrip, endTime: Date.now() };
      await saveTrip(finalTrip);
      setActiveTrip(null);
    }
  }, [activeTrip]);

  const resetMaxSpeed = useCallback(() => {
    setActiveTrip(prev => prev ? { ...prev, maxSpeed: 0 } : prev);
  }, []);

  const toggleDrivingMode = useCallback(() => {
    setIsDrivingMode(prev => !prev);
  }, []);

  return (
    <TripContext.Provider value={{
      activeTrip, isActive, isPaused, startTrip, pauseTrip, resumeTrip, endTrip, resetMaxSpeed, currentSpeedMs, isDrivingMode, toggleDrivingMode
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
