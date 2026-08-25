import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { TripMode, Unit } from '../types';
import { Bike, Car, Compass, Footprints } from 'lucide-react';
import { motion } from 'motion/react';

export default function SetupScreen({ children, onComplete }: { children: React.ReactNode, onComplete: () => void }) {
  const { settings, updateSettings, isLoading } = useSettings();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<TripMode>('car');
  const [unit, setUnit] = useState<Unit>('kmh');

  if (isLoading) return null;
  if (settings.isSetupComplete) return <>{children}</>;

  const handleNext = () => setStep(2);
  const handleFinish = async () => {
    await updateSettings({ defaultMode: mode, unit, isSetupComplete: true });
    
    // Request location permission implicitly by trying to use it if they agree
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 1000 });
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-[#050A15] text-white flex flex-col items-center justify-center p-6 z-40">
      <div className="w-full max-w-md bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-xl">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center tracking-wide">Como você pretende usar o VELOX?</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'bike', icon: Bike, label: 'Bicicleta' },
                { id: 'moto', icon: Compass, label: 'Moto' },
                { id: 'car', icon: Car, label: 'Carro' },
                { id: 'walk', icon: Footprints, label: 'Outro' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id as TripMode)}
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border transition-all ${
                    mode === item.id 
                      ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]' 
                      : 'border-white/10 bg-white/5 hover:border-white/20 text-white/60 hover:text-white'
                  }`}
                >
                  <item.icon className="w-10 h-10 mb-3" />
                  <span className="font-bold uppercase tracking-wider text-xs">{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={handleNext} className="w-full py-4 mt-4 bg-cyan-400 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center transition-all">
              Continuar
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center tracking-wide">Escolha sua unidade</h2>
            <div className="flex flex-col gap-3">
              {[
                { id: 'kmh', label: 'Quilômetros por hora (km/h)' },
                { id: 'mph', label: 'Milhas por hora (mph)' },
                { id: 'ms', label: 'Metros por segundo (m/s)' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setUnit(item.id as Unit)}
                  className={`p-4 rounded-xl border text-left font-bold transition-all ${
                    unit === item.id 
                      ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-400 drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]' 
                      : 'border-white/10 bg-white/5 hover:border-white/20 text-white/60 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-center text-white/40 mt-4 uppercase tracking-wider font-bold">
              Use o aplicativo somente quando for seguro interagir com o dispositivo. Não opere o celular enquanto estiver conduzindo.
            </p>
            <button onClick={handleFinish} className="w-full py-4 mt-2 bg-cyan-400 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center transition-all">
              Permitir localização e Iniciar
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
