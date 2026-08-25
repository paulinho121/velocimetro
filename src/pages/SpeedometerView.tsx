import React, { useMemo } from 'react';
import { useTrip } from '../contexts/TripContext';
import { useGps } from '../contexts/GpsContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatSpeed, formatDistance, getHeadingName } from '../utils/geo';
import { formatTime } from '../utils/format';
import { Moon, Play, Square, Pause, RotateCcw, AlertTriangle, Compass, MapPin } from 'lucide-react';
import clsx from 'clsx';

export default function SpeedometerView() {
  const { 
    activeTrip, isActive, isPaused, startTrip, pauseTrip, resumeTrip, endTrip, 
    currentSpeedMs, isDrivingMode, toggleDrivingMode 
  } = useTrip();
  const { status, location, accuracy } = useGps();
  const { settings } = useSettings();

  const currentSpeed = parseFloat(formatSpeed(currentSpeedMs, settings.unit));
  
  // Alert logic
  const isSpeeding = settings.speedAlert !== null && currentSpeed > settings.speedAlert;

  const handleStart = () => {
    if (isActive && !isPaused) pauseTrip();
    else if (isActive && isPaused) resumeTrip();
    else startTrip(settings.defaultMode);
  };

  const getStatusColor = () => {
    if (status === 'connected') return 'text-emerald-500 bg-emerald-500/10';
    if (status === 'weak') return 'text-amber-500 bg-amber-500/10';
    if (status === 'denied') return 'text-red-500 bg-red-500/10';
    return 'text-slate-500 bg-slate-500/10';
  };

  const getStatusText = () => {
    if (status === 'waiting') return 'Aguardando...';
    if (status === 'locating') return 'Obtendo localização...';
    if (status === 'connected') return 'GPS Conectado';
    if (status === 'weak') return 'Sinal Fraco';
    if (status === 'unavailable') return 'GPS Indisponível';
    if (status === 'denied') return 'Permissão Negada';
    return 'Desconhecido';
  };

  return (
    <div className="flex flex-col h-full bg-[#050A15]">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-4 md:px-8 py-4 bg-white/5 border-b border-white/10 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-3 h-3 rounded-full",
            status === 'connected' ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" :
            status === 'weak' ? "bg-amber-500 shadow-[0_0_10px_#f59e0b]" :
            status === 'denied' ? "bg-red-500 shadow-[0_0_10px_#ef4444]" :
            "bg-slate-500 shadow-[0_0_10px_#64748b]"
          )}></div>
          <div className="flex flex-col hidden sm:flex">
            <span className={clsx(
              "text-xs font-bold uppercase tracking-widest",
              status === 'connected' ? "text-emerald-500" :
              status === 'weak' ? "text-amber-500" :
              status === 'denied' ? "text-red-500" : "text-slate-500"
            )}>{getStatusText()}</span>
            {accuracy && (
              <span className="text-[10px] text-white/40">Precisão: ± {accuracy.toFixed(0)}m</span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-xl font-black tracking-tighter italic text-cyan-400">VELOX</span>
          <span className="text-[8px] uppercase tracking-[0.3em] text-white/40">Speedometer</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col text-right hidden sm:flex">
             <span className="text-xs font-bold uppercase text-white/60">Modo</span>
             <span className="text-xs text-cyan-400 font-bold capitalize">{settings.defaultMode}</span>
          </div>
          <button 
            onClick={toggleDrivingMode}
            className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 text-white"
          >
            <Moon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative px-4 md:px-8 py-4 z-10 overflow-hidden">
        {/* Side Elements */}
        {!isDrivingMode && location?.heading !== null && (
          <div className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-2 md:p-4 bg-white/5 rounded-full border border-white/10 backdrop-blur-xl w-16 md:w-24 z-20">
            <span className="text-[8px] md:text-[10px] uppercase font-bold text-white/40">Bússola</span>
            <div className="relative w-12 h-12 md:w-16 md:h-16 border-2 border-white/20 rounded-full flex items-center justify-center">
              <div className="absolute w-1 h-full py-1" style={{ transform: `rotate(${location.heading}deg)` }}>
                <div className="w-1 h-2 bg-cyan-400 rounded-full"></div>
              </div>
              <span className="text-sm md:text-lg font-black text-white">{getHeadingName(location.heading)}</span>
            </div>
            <span className="text-[8px] md:text-[10px] font-mono text-cyan-400">{Math.round(location.heading)}°</span>
          </div>
        )}

        {!isDrivingMode && location?.alt !== null && (
          <div className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-2 md:p-4 bg-white/5 rounded-full border border-white/10 backdrop-blur-xl w-16 md:w-24 z-20">
            <span className="text-[8px] md:text-[10px] uppercase font-bold text-white/40">Altitude</span>
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
            <span className="text-sm md:text-lg font-black text-white">{location.alt.toFixed(0)}<span className="text-[10px] md:text-xs font-normal text-white/60 ml-1">m</span></span>
            <div className="flex flex-col md:flex-row gap-1 text-[8px] text-white/40 text-center">
              {activeTrip && (
                <>
                  <span className="text-emerald-400">↑ {activeTrip.totalAscent.toFixed(0)}</span>
                  <span>↓ {activeTrip.totalDescent.toFixed(0)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Speed Display */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[280px] h-[280px] sm:w-[480px] sm:h-[480px] rounded-full border-[1px] border-cyan-400/10"></div>
            <div className="absolute w-[240px] h-[240px] sm:w-[440px] sm:h-[440px] rounded-full border-[2px] border-cyan-400/20"></div>
            <div className="absolute w-[200px] h-[200px] sm:w-[400px] sm:h-[400px] rounded-full border-[4px] border-cyan-400/30 border-t-cyan-400"></div>
          </div>
          <div className="flex flex-col items-center z-10">
            <span className={clsx(
              "font-black tracking-tighter text-white transition-colors duration-300 leading-none",
              isSpeeding ? "text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]" : "drop-shadow-[0_0_30px_rgba(0,229,255,0.3)]",
              isDrivingMode ? "text-[160px] sm:text-[220px]" : "text-[120px] sm:text-[200px]"
            )}>
              {Math.floor(currentSpeed)}
            </span>
            <div className="flex items-center gap-2 -mt-2 sm:-mt-4">
              <span className={clsx(
                "font-light uppercase tracking-widest",
                isSpeeding ? "text-red-500/60" : "text-white/60",
                isDrivingMode ? "text-3xl" : "text-2xl sm:text-4xl"
              )}>
                {settings.unit === 'kmh' ? 'km/h' : settings.unit === 'mph' ? 'mph' : 'm/s'}
              </span>
            </div>
          </div>
          
          {/* Warning Indicator */}
          {isSpeeding && (
            <div className="absolute top-10 sm:top-20 animate-pulse text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              <span className="font-bold">LIMITE EXCEDIDO</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className={clsx(
          "grid gap-4 mt-6",
          isDrivingMode ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"
        )}>
          <div className="bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
            <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block mb-1">Distância</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">
                {activeTrip ? parseFloat(formatDistance(activeTrip.distance, settings.unit)).toFixed(1) : "0.0"}
              </span>
              <span className="text-xs text-white/40">{settings.unit === 'mph' ? 'mi' : 'km'}</span>
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
            <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block mb-1">Tempo Total</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white tabular-nums">
                {activeTrip ? formatTime(activeTrip.movingTime + activeTrip.stoppedTime) : '00:00:00'}
              </span>
            </div>
          </div>
          
          {!isDrivingMode && (
            <>
              <div className="bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block mb-1">Vel. Média</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">
                    {activeTrip ? parseFloat(formatSpeed(activeTrip.averageSpeed, settings.unit)).toFixed(1) : '0.0'}
                  </span>
                  <span className="text-xs text-white/40">{settings.unit === 'kmh' ? 'km/h' : settings.unit === 'mph' ? 'mph' : 'm/s'}</span>
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 block mb-1">Vel. Máxima</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-cyan-400">
                    {activeTrip ? parseFloat(formatSpeed(activeTrip.maxSpeed, settings.unit)).toFixed(1) : '0.0'}
                  </span>
                  <span className="text-xs text-white/40">{settings.unit === 'kmh' ? 'km/h' : settings.unit === 'mph' ? 'mph' : 'm/s'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Controls */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 bg-white/5 backdrop-blur-2xl border-t border-white/10">
        <div className="flex-1 h-auto md:h-16 bg-white/5 rounded-2xl flex items-center px-4 md:px-6 py-3 border border-white/10 w-full">
           <span className="text-[8px] md:text-[10px] font-bold uppercase text-white/30 mr-2 md:mr-4 shrink-0">Segurança</span>
           <p className="text-[9px] md:text-[11px] text-white/60 leading-tight">Não opere o dispositivo em movimento. Concentre-se na via.</p>
        </div>
        
        <div className="flex gap-4 w-full md:w-auto">
          {isActive && (
            <button
              onClick={() => endTrip()}
              className="flex-1 md:flex-none px-6 md:px-10 h-16 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/50 rounded-2xl font-bold uppercase tracking-widest text-sm flex items-center justify-center transition-all"
            >
              Finalizar
            </button>
          )}

          <button
            onClick={handleStart}
            className="flex-1 md:flex-none px-8 md:px-12 h-16 bg-cyan-400 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center transition-all"
          >
            {isActive && !isPaused ? 'Pausar' : isActive ? 'Continuar' : 'Iniciar'}
          </button>
        </div>
      </div>
    </div>
  );
}
