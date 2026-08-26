import React, { useState, useEffect } from 'react';
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
import { useWakeLock } from './hooks/useWakeLock';

export type Route = 'speedometer' | 'trip' | 'map' | 'history' | 'settings';

function AppContent() {
  const [currentRoute, setCurrentRoute] = useState<Route>('speedometer');
  const [isBooting, setIsBooting] = useState(true);
  const { settings } = useSettings();
  const { isDrivingMode } = useTrip();

  useEffect(() => {
    const timer = setTimeout(() => setIsBooting(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Fullscreen exists to be watched while riding, so it is the one place the
  // screen must never sleep. Elsewhere the rider's setting decides.
  const wakeLock = useWakeLock(
    !isBooting && (settings.keepScreenOn || isDrivingMode),
  );

  if (isBooting) return <BootScreen />;

  return (
    <SetupScreen onComplete={() => {}}>
      {/* Sits above everything: an unfinished ride needs a decision before the
          rider starts a new one. */}
      <ResumeTripPrompt />

      {/* Fullscreen speedometer replaces the shell entirely - no nav, no map,
          nothing but speed and what is coming up on the road. */}
      {isDrivingMode ? (
        <SpeedometerFullscreen wakeLock={wakeLock} />
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
