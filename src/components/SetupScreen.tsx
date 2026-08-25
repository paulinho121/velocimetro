import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { TripMode, Unit } from '../types';
import { Bike, Car, Compass, Footprints } from 'lucide-react';
import { motion } from 'motion/react';

export default function SetupScreen({
  children,
  onComplete,
}: {
  children: React.ReactNode;
  onComplete: () => void;
}) {
  const { settings, updateSettings, isLoading } = useSettings();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<TripMode>('car');
  const [unit, setUnit] = useState<Unit>('kmh');

  if (isLoading) return null;
  if (settings.isSetupComplete) return <>{children}</>;

  const handleNext = () => setStep(2);
  const handleFinish = async () => {
    // Ask for the permission from inside the tap handler: iOS Safari only
    // grants the prompt while a user gesture is still on the stack.
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { timeout: 10000 },
      );
    }
    await updateSettings({ defaultMode: mode, unit, isSetupComplete: true });
    onComplete();
  };

  return (
    <div className="scroll-area fixed inset-0 z-40 overflow-y-auto bg-[#050A15] text-white">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-8 pt-safe pb-nav">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-8">
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black italic tracking-tighter text-cyan-400">
                  VELOX
                </span>
                <h2 className="text-center text-lg font-bold tracking-wide sm:text-2xl">
                  Como você pretende usar o VELOX?
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'bike', icon: Bike, label: 'Bicicleta' },
                  { id: 'moto', icon: Compass, label: 'Moto' },
                  { id: 'car', icon: Car, label: 'Carro' },
                  { id: 'walk', icon: Footprints, label: 'Outro' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setMode(item.id as TripMode)}
                    aria-pressed={mode === item.id}
                    className={`flex min-h-[104px] flex-col items-center justify-center rounded-2xl border p-4 transition-all ${
                      mode === item.id
                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                        : 'border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                    }`}
                  >
                    <item.icon className="mb-2 h-8 w-8" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleNext}
                className="h-14 w-full rounded-2xl bg-cyan-400 text-sm font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(0,229,255,0.4)] active:bg-cyan-300"
              >
                Continuar
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5"
            >
              <h2 className="text-center text-lg font-bold tracking-wide sm:text-2xl">
                Escolha sua unidade
              </h2>
              <div className="flex flex-col gap-3">
                {[
                  { id: 'kmh', label: 'Quilômetros por hora (km/h)' },
                  { id: 'mph', label: 'Milhas por hora (mph)' },
                  { id: 'ms', label: 'Metros por segundo (m/s)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setUnit(item.id as Unit)}
                    aria-pressed={unit === item.id}
                    className={`min-h-[56px] rounded-xl border p-4 text-left text-sm font-bold transition-all ${
                      unit === item.id
                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                        : 'border-white/10 bg-white/5 text-white/60 active:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-center text-[10px] font-bold uppercase leading-relaxed tracking-wider text-white/40">
                Use o aplicativo somente quando for seguro interagir com o
                dispositivo. Não opere o celular enquanto estiver conduzindo.
              </p>
              <button
                onClick={handleFinish}
                className="h-14 w-full rounded-2xl bg-cyan-400 px-2 text-xs font-black uppercase leading-tight tracking-[0.15em] text-black shadow-[0_0_20px_rgba(0,229,255,0.4)] active:bg-cyan-300 sm:text-sm"
              >
                Permitir localização e iniciar
              </button>
              <button
                onClick={() => setStep(1)}
                className="text-[11px] font-bold uppercase tracking-widest text-white/40 active:text-white"
              >
                Voltar
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
