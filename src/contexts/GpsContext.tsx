import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { GpsStatus, LocationPoint } from '../types';

interface GpsContextValue {
  status: GpsStatus;
  location: LocationPoint | null;
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  startTracking: (highAccuracy: boolean) => void;
  stopTracking: () => void;
  accuracy: number | null;
}

const GpsContext = createContext<GpsContextValue | undefined>(undefined);

export function GpsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GpsStatus>('waiting');
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const demoIntervalRef = useRef<number | null>(null);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (demoIntervalRef.current !== null) {
      window.clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
    setStatus('waiting');
  }, []);

  const startTracking = useCallback((highAccuracy: boolean = true) => {
    stopTracking();
    if (isDemoMode) {
      setStatus('connected');
      let speed = 0;
      let lat = -23.55052;
      let lng = -46.633308;
      let heading = 0;
      demoIntervalRef.current = window.setInterval(() => {
        // Simulate some movement
        speed += (Math.random() - 0.4) * 2; // Accel/decel bias
        if (speed < 0) speed = 0;
        if (speed > 35) speed = 35; // max ~126 km/h
        
        heading += (Math.random() - 0.5) * 10;
        lat += 0.0001 * Math.cos(heading * Math.PI / 180);
        lng += 0.0001 * Math.sin(heading * Math.PI / 180);

        setLocation({
          lat,
          lng,
          alt: 760 + Math.random() * 10 - 5,
          speed,
          heading: (heading + 360) % 360,
          accuracy: 5,
          timestamp: Date.now(),
        });
      }, 1000);
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setStatus('locating');
    
    const options = {
      enableHighAccuracy: highAccuracy,
      maximumAge: 0,
      timeout: 10000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus(pos.coords.accuracy > 30 ? 'weak' : 'connected');
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
        } else {
          setStatus('unavailable');
        }
      },
      options
    );
  }, [isDemoMode, stopTracking]);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => !prev);
  }, []);

  // Restart tracking if demo mode changes
  useEffect(() => {
    if (status !== 'waiting' && status !== 'denied') {
      startTracking();
    }
  }, [isDemoMode]); // Intentionally not including startTracking to avoid loops, it's stable enough.

  // Clean up on unmount
  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  return (
    <GpsContext.Provider value={{
      status,
      location,
      isDemoMode,
      toggleDemoMode,
      startTracking,
      stopTracking,
      accuracy: location?.accuracy ?? null
    }}>
      {children}
    </GpsContext.Provider>
  );
}

export function useGps() {
  const ctx = useContext(GpsContext);
  if (!ctx) throw new Error('useGps must be used within GpsProvider');
  return ctx;
}
