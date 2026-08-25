import React from 'react';
import { Route } from '../App';
import {
  Gauge,
  Map as MapIcon,
  Settings as SettingsIcon,
  Clock,
  Activity,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentRoute: Route;
  onNavigate: (route: Route) => void;
}

export default function Layout({
  children,
  currentRoute,
  onNavigate,
}: LayoutProps) {
  const navItems: { id: Route; icon: any; label: string }[] = [
    { id: 'speedometer', icon: Gauge, label: 'Velocímetro' },
    { id: 'trip', icon: Activity, label: 'Viagem' },
    { id: 'map', icon: MapIcon, label: 'Mapa' },
    { id: 'history', icon: Clock, label: 'Histórico' },
    { id: 'settings', icon: SettingsIcon, label: 'Config' },
  ];

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#050A15] pt-safe px-safe text-white">
      <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>

      <nav className="flex-shrink-0 border-t border-white/10 bg-[#050A15]/95 pb-safe backdrop-blur-xl">
        <div className="flex h-16 items-stretch justify-around">
          {navItems.map((item) => {
            const active = currentRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors active:bg-white/5 ${
                  active ? 'text-cyan-400' : 'text-white/55'
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-cyan-400 shadow-[0_0_10px_#00e5ff]" />
                )}
                <item.icon
                  className={`h-5 w-5 shrink-0 ${active ? 'stroke-[2.5px]' : 'stroke-2'}`}
                />
                <span className="max-w-full truncate px-0.5 text-[11px] font-bold uppercase tracking-wider">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
