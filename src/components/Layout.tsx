import React from 'react';
import { Route } from '../App';
import { Gauge, Map as MapIcon, Settings as SettingsIcon, Clock, Activity } from 'lucide-react';
import { useTrip } from '../contexts/TripContext';

interface LayoutProps {
  children: React.ReactNode;
  currentRoute: Route;
  onNavigate: (route: Route) => void;
}

export default function Layout({ children, currentRoute, onNavigate }: LayoutProps) {
  const { isDrivingMode } = useTrip();

  const navItems: { id: Route; icon: any; label: string }[] = [
    { id: 'speedometer', icon: Gauge, label: 'Velocímetro' },
    { id: 'trip', icon: Activity, label: 'Viagem' },
    { id: 'map', icon: MapIcon, label: 'Mapa' },
    { id: 'history', icon: Clock, label: 'Histórico' },
    { id: 'settings', icon: SettingsIcon, label: 'Config' },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#050A15] text-white font-sans overflow-hidden">
      
      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
        {children}
      </main>

      {/* Bottom Navigation */}
      {!isDrivingMode && (
        <nav className="flex-shrink-0 bg-[#050A15] border-t border-white/10 pb-safe">
          <div className="flex justify-around items-center h-20">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                  currentRoute === item.id 
                    ? 'text-cyan-400' 
                    : 'text-white/40 hover:text-white'
                }`}
              >
                <item.icon className={`w-5 h-5 ${currentRoute === item.id ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
