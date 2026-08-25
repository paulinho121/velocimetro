import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGps } from '../contexts/GpsContext';
import { clearAllTrips } from '../services/storage';
import { Unit, Theme, TripMode, GpsAccuracy } from '../types';
import { Trash2, Download, AlertCircle, PlaySquare } from 'lucide-react';

export default function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const { isDemoMode, toggleDemoMode } = useGps();
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearHistory = async () => {
    if (confirmClear) {
      await clearAllTrips();
      setConfirmClear(false);
      alert('Histórico apagado com sucesso.');
    } else {
      setConfirmClear(true);
    }
  };

  const handleExport = () => {
    alert('Funcionalidade de exportação em desenvolvimento.');
  };

  return (
    <div className="p-6 h-full flex flex-col bg-[#050A15] text-white">
      <h2 className="text-2xl font-black mb-6 tracking-wide">Configurações</h2>
      
      <div className="space-y-8 flex-1 overflow-y-auto pb-8 pr-2">
        
        {/* Unidade */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3 ml-2">Unidade de Velocidade</h3>
          <div className="bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl overflow-hidden">
            {[
              { id: 'kmh', label: 'km/h' },
              { id: 'mph', label: 'mph' },
              { id: 'ms', label: 'm/s' }
            ].map(u => (
              <label key={u.id} className="flex items-center p-5 border-b border-white/10 last:border-0 active:bg-white/10 transition-colors cursor-pointer">
                <input 
                  type="radio" 
                  name="unit" 
                  checked={settings.unit === u.id}
                  onChange={() => updateSettings({ unit: u.id as Unit })}
                  className="mr-4 w-5 h-5 accent-cyan-400" 
                />
                <span className="font-bold text-lg">{u.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Tema */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3 ml-2">Tema Visual</h3>
          <div className="bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl overflow-hidden">
            {[
              { id: 'auto', label: 'Automático (Sistema)' },
              { id: 'light', label: 'Claro' },
              { id: 'dark', label: 'Escuro' }
            ].map(t => (
              <label key={t.id} className="flex items-center p-5 border-b border-white/10 last:border-0 active:bg-white/10 transition-colors cursor-pointer">
                <input 
                  type="radio" 
                  name="theme" 
                  checked={settings.theme === t.id}
                  onChange={() => updateSettings({ theme: t.id as Theme })}
                  className="mr-4 w-5 h-5 accent-cyan-400" 
                />
                <span className="font-bold text-lg">{t.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Alertas */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3 ml-2">Alertas</h3>
          <div className="bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-lg">Alerta de Velocidade</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.speedAlert !== null}
                  onChange={(e) => updateSettings({ speedAlert: e.target.checked ? 80 : null })}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-400 border border-white/20"></div>
              </label>
            </div>
            {settings.speedAlert !== null && (
              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="number" 
                  value={settings.speedAlert}
                  onChange={(e) => updateSettings({ speedAlert: Number(e.target.value) })}
                  className="w-24 bg-white/10 p-3 rounded-xl text-center font-black text-xl outline-none focus:ring-2 focus:ring-cyan-400 border border-white/20 text-white"
                />
                <span className="font-bold text-white/60">{settings.unit}</span>
              </div>
            )}
          </div>
        </section>

        {/* Demo Mode */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3 ml-2">Desenvolvimento</h3>
          <div className="bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl p-5">
            <div className="flex justify-between items-center">
              <div className="flex flex-col pr-4">
                <span className="font-bold text-lg text-amber-400 flex items-center gap-2">
                  <PlaySquare className="w-5 h-5" /> Modo Demonstração
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-1">Simula movimento sem usar o GPS real.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isDemoMode}
                  onChange={toggleDemoMode}
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400 border border-white/20"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Dados */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3 ml-2">Dados e Histórico</h3>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleExport}
              className="flex items-center justify-center gap-2 p-5 bg-white/5 rounded-2xl border border-white/10 font-bold text-cyan-400 active:bg-white/10 transition-colors"
            >
              <Download className="w-5 h-5" /> Exportar Viagens (CSV)
            </button>
            <button 
              onClick={handleClearHistory}
              className={`flex items-center justify-center gap-2 p-5 rounded-2xl font-bold transition-colors border ${
                confirmClear 
                  ? 'bg-red-500/20 text-red-500 border-red-500/50' 
                  : 'bg-white/5 border-white/10 text-red-400 active:bg-white/10'
              }`}
            >
              <Trash2 className="w-5 h-5" /> 
              {confirmClear ? 'Tem certeza? Toque para confirmar' : 'Apagar Histórico'}
            </button>
          </div>
        </section>

        {/* App Info */}
        <section className="text-center py-6 opacity-50">
          <p className="font-black tracking-[0.2em] italic text-xl text-cyan-400">VELOX</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Versão 1.0.0</p>
        </section>
      </div>
    </div>
  );
}
