import React, { useState, useEffect, useRef } from 'react';
import { GpsProvider } from './contexts/GpsContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { TripProvider, useTrip } from './contexts/TripContext';
import Layout from './components/Layout';
import SpeedometerView from './pages/SpeedometerView';
import TripView from './pages/TripView';
import MapView from './pages/MapView';
import HistoryView from './pages/HistoryView';
import SettingsView from './pages/SettingsView';
import BootScreen from './components/BootScreen';
import SetupScreen from './components/SetupScreen';
import ErrorBoundary from './components/ErrorBoundary';
import SpeedometerFullscreen from './components/SpeedometerFullscreen';
import { HazardProvider } from './contexts/HazardContext';
import ResumeTripPrompt from './components/ResumeTripPrompt';

export type Route = 'speedometer' | 'trip' | 'map' | 'history' | 'settings';

function AppContent() {
  const [currentRoute, setCurrentRoute] = useState<Route>('speedometer');
  const [isBooting, setIsBooting] = useState(true);
  const { settings } = useSettings();
  const { isDrivingMode } = useTrip();
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!settings.keepScreenOn || isBooting || !('wakeLock' in navigator)) return;

    let released = false;

    const requestWakeLock = async () => {
      // The browser rejects the request whenever the page is not visible;
      // that is expected, not an error worth surfacing.
      if (document.visibilityState !== 'visible') return;
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        /* screen lock unavailable - the app still works */
      }
    };

    const handleVisibilityChange = () => {
      if (!released && document.visibilityState === 'visible') requestWakeLock();
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [settings.keepScreenOn, isBooting]);

  if (isBooting) return <BootScreen />;

  return (
    <SetupScreen onComplete={() => {}}>
      {/* Sits above everything: an unfinished ride needs a decision before the
          rider starts a new one. */}
      <ResumeTripPrompt />

      {/* Fullscreen speedometer replaces the shell entirely - no nav, no map,
          nothing but speed and what is coming up on the road. */}
      {isDrivingMode ? (
        <SpeedometerFullscreen />
      ) : (
        <Layout currentRoute={currentRoute} onNavigate={setCurrentRoute}>
          {currentRoute === 'speedometer' && <SpeedometerView />}
          {currentRoute === 'trip' && <TripView />}
          {currentRoute === 'map' && <MapView />}
          {currentRoute === 'history' && <HistoryView />}
          {currentRoute === 'settings' && <SettingsView />}
        </Layout>
      )}
    </SetupScreen>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <GpsProvider>
          <TripProvider>
            <HazardProvider>
              <AppContent />
            </HazardProvider>
          </TripProvider>
        </GpsProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
