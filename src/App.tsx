import React, { useState, useEffect, useRef } from 'react';
import { GpsProvider } from './contexts/GpsContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { TripProvider } from './contexts/TripContext';
import Layout from './components/Layout';
import SpeedometerView from './pages/SpeedometerView';
import TripView from './pages/TripView';
import MapView from './pages/MapView';
import HistoryView from './pages/HistoryView';
import SettingsView from './pages/SettingsView';
import BootScreen from './components/BootScreen';
import SetupScreen from './components/SetupScreen';

export type Route = 'speedometer' | 'trip' | 'map' | 'history' | 'settings';

function AppContent() {
  const [currentRoute, setCurrentRoute] = useState<Route>('speedometer');
  const [isBooting, setIsBooting] = useState(true);
  const { settings } = useSettings();
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    // Simulate boot screen
    const timer = setTimeout(() => {
      setIsBooting(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (settings.keepScreenOn && !isBooting && 'wakeLock' in navigator) {
      const requestWakeLock = async () => {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.error(err);
        }
      };
      requestWakeLock();
      
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        if (wakeLockRef.current) wakeLockRef.current.release();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [settings.keepScreenOn, isBooting]);

  if (isBooting) {
    return <BootScreen />;
  }

  return (
    <Layout currentRoute={currentRoute} onNavigate={setCurrentRoute}>
      <SetupScreen onComplete={() => {}}>
        {currentRoute === 'speedometer' && <SpeedometerView />}
        {currentRoute === 'trip' && <TripView />}
        {currentRoute === 'map' && <MapView />}
        {currentRoute === 'history' && <HistoryView />}
        {currentRoute === 'settings' && <SettingsView />}
      </SetupScreen>
    </Layout>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <GpsProvider>
        <TripProvider>
          <AppContent />
        </TripProvider>
      </GpsProvider>
    </SettingsProvider>
  );
}
