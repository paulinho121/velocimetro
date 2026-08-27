import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { GpsStatus, LocationPoint } from '../types';
import { useSettings } from './SettingsContext';

interface GpsContextValue {
  status: GpsStatus;
  location: LocationPoint | null;
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  retry: () => void;
  accuracy: number | null;
  /** Human-readable reason why we have no fix, or null when all is well. */
  errorMessage: string | null;
  /** True while the page is not a secure context (GPS is blocked by the browser). */
  isInsecureContext: boolean;
  /** When the last usable fix arrived; null if none ever has. */
  lastFixAt: number | null;
  /** When we started watching; lets the UI say how long it has been trying. */
  trackingSince: number | null;
}

const GpsContext = createContext<GpsContextValue | undefined>(undefined);

// `maximumAge` is deliberately tiny even in the battery-saving modes: a cached
// fix is a stale speed, and a speedometer showing where you were two seconds
// ago is worse than useless.
const ACCURACY_OPTIONS = {
  high: { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  balanced: { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
  low: { enableHighAccuracy: false, maximumAge: 2000, timeout: 30000 },
} as const;

export function GpsProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useSettings();
  const [status, setStatus] = useState<GpsStatus>('waiting');
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [trackingSince, setTrackingSince] = useState<number | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Geolocation is only handed out on https:// or localhost. Phones hitting a
  // plain http:// LAN address get nothing, so we detect it and say so.
  const isInsecureContext =
    typeof window !== 'undefined' && !window.isSecureContext;

  const toggleDemoMode = useCallback(() => setIsDemoMode((prev) => !prev), []);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  const enabled = !isLoading && settings.isSetupComplete;
  const accuracyMode = settings.gpsAccuracy;

  // ---- Demo mode: synthesise a plausible drive -------------------------
  useEffect(() => {
    if (!enabled || !isDemoMode) return;

    setStatus('connected');
    setErrorMessage(null);
    setTrackingSince(Date.now());

    let speed = 0;
    let lat = -23.55052;
    let lng = -46.633308;
    let heading = 0;

    const id = window.setInterval(() => {
      speed += (Math.random() - 0.4) * 2;
      speed = Math.min(Math.max(speed, 0), 35); // cap at ~126 km/h

      heading += (Math.random() - 0.5) * 10;

      // Step the coordinates by exactly the distance the reported speed
      // implies, otherwise the simulated track and the simulated speedometer
      // disagree and the trip stats come out nonsensical.
      const rad = (heading * Math.PI) / 180;
      const metres = speed * 1; // one tick == one second
      lat += (metres * Math.cos(rad)) / 111320;
      lng += (metres * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));

      setLocation({
        lat,
        lng,
        alt: 760 + Math.random() * 10 - 5,
        speed,
        heading: (heading + 360) % 360,
        accuracy: 5,
        timestamp: Date.now(),
      });
      setLastFixAt(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(id);
      setStatus('waiting');
      setLocation(null);
    };
  }, [enabled, isDemoMode]);

  // ---- Real GPS --------------------------------------------------------
  useEffect(() => {
    if (!enabled || isDemoMode) return;

    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setErrorMessage('Este navegador não oferece geolocalização.');
      return;
    }

    if (isInsecureContext) {
      setStatus('unavailable');
      setErrorMessage(
        'O GPS exige uma conexão segura (https). Abra o app por https ou em localhost.',
      );
      return;
    }

    setStatus('locating');
    setErrorMessage(null);
    setTrackingSince(Date.now());

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setErrorMessage(null);
        setLastFixAt(Date.now());
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
          setErrorMessage(
            'Permissão de localização negada. Libere o acesso nas configurações do navegador.',
          );
        } else if (err.code === err.TIMEOUT) {
          // A timeout is not fatal — watchPosition keeps trying.
          setStatus((prev) => (prev === 'locating' ? 'locating' : prev));
          setErrorMessage('Procurando satélites… vá para um local aberto.');
        } else {
          setStatus('unavailable');
          setErrorMessage('Não foi possível obter a localização.');
        }
      },
      ACCURACY_OPTIONS[accuracyMode] ?? ACCURACY_OPTIONS.high,
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setStatus('waiting');
    };
  }, [enabled, isDemoMode, accuracyMode, isInsecureContext, retryToken]);

  // Mobile browsers freeze watchPosition while backgrounded; re-arm the watch
  // when the user comes back so the reading is never silently stale.
  const staleRef = useRef(false);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        staleRef.current = true;
      } else if (staleRef.current) {
        staleRef.current = false;
        retry();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [retry]);

  return (
    <GpsContext.Provider
      value={{
        status,
        location,
        isDemoMode,
        toggleDemoMode,
        retry,
        accuracy: location?.accuracy ?? null,
        errorMessage,
        isInsecureContext,
        lastFixAt,
        trackingSince,
      }}
    >
      {children}
    </GpsContext.Provider>
  );
}

export function useGps() {
  const ctx = useContext(GpsContext);
  if (!ctx) throw new Error('useGps must be used within GpsProvider');
  return ctx;
}
