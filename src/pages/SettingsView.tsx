import React, { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGps } from '../contexts/GpsContext';
import { clearAllTrips } from '../services/storage';
import { Unit, Theme, GpsAccuracy } from '../types';
import { unitLabel } from '../utils/geo';
import { Trash2, Download, PlaySquare, TriangleAlert, Volume2 } from 'lucide-react';

export default function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const { isDemoMode, toggleDemoMode } = useGps();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cachedCells, setCachedCells] = useState(0);

  // Imported on demand so the Overpass client stays out of the initial bundle.
  useEffect(() => {
    import('../services/roadData')
      .then(({ hazardCacheSize }) => hazardCacheSize())
      .then(setCachedCells)
      .catch(() => setCachedCells(0));
  }, []);

  const handleClearHazards = async () => {
    const { clearHazardCache } = await import('../services/roadData');
    await clearHazardCache();
    setCachedCells(0);
  };

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
    <div className="flex h-full min-h-0 flex-col bg-[#050A15] px-4 pt-4 text-white">
      <h2 className="mb-4 shrink-0 text-xl font-black tracking-wide">Configurações</h2>
      
      <div className="scroll-area min-h-0 flex-1 space-y-6 overflow-y-auto pb-nav">
        
        {/* Unidade */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-3 ml-2">Unidade de Velocidade</h3>
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
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-3 ml-2">Tema Visual</h3>
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
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-3 ml-2">Alertas</h3>
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
                <span className="font-bold text-white/60">{unitLabel(settings.unit)}</span>
              </div>
            )}
          </div>
        </section>

        {/* Alertas na via */}
        <section>
          <h3 className="mb-3 ml-2 text-[10px] font-bold uppercase tracking-widest text-white/55">Alertas na via</h3>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col pr-2">
                <span className="flex items-center gap-2 text-base font-bold">
                  <TriangleAlert className="h-5 w-5 shrink-0 text-amber-400" /> Lombadas e radares
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-wider text-white/55">
                  Avisa o que vem pela frente usando dados do OpenStreetMap
                </span>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={settings.hazardAlerts}
                  onChange={(e) => updateSettings({ hazardAlerts: e.target.checked })}
                />
                <div className="peer h-6 w-11 rounded-full border border-white/20 bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-400 peer-checked:after:translate-x-full peer-focus:outline-none"></div>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <div className="flex min-w-0 flex-col pr-2">
                <span className="flex items-center gap-2 text-base font-bold">
                  <Volume2 className="h-5 w-5 shrink-0 text-cyan-400" /> Aviso sonoro
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-wider text-white/55">
                  Toca um bipe ao se aproximar
                </span>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={settings.audioAlerts}
                  onChange={(e) => updateSettings({ audioAlerts: e.target.checked })}
                />
                <div className="peer h-6 w-11 rounded-full border border-white/20 bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-cyan-400 peer-checked:after:translate-x-full peer-focus:outline-none"></div>
              </label>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-[10px] leading-relaxed text-white/55">
                Dados colaborativos do OpenStreetMap (ODbL). Podem estar
                incompletos ou desatualizados — sempre siga a sinalização da via.
              </p>
              <button
                onClick={handleClearHazards}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold uppercase tracking-widest text-white/60 active:bg-white/10"
              >
                Limpar cache do mapa ({cachedCells} {cachedCells === 1 ? 'área' : 'áreas'})
              </button>
            </div>
          </div>
        </section>

        {/* Precisão do GPS */}
        <section>
          <h3 className="mb-3 ml-2 text-[10px] font-bold uppercase tracking-widest text-white/55">Precisão do GPS</h3>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
            {[
              { id: 'high', label: 'Alta', hint: 'Mais precisa, consome mais bateria' },
              { id: 'balanced', label: 'Equilibrada', hint: 'Boa precisão com menos bateria' },
              { id: 'low', label: 'Econômica', hint: 'Menor precisão, poupa bateria' },
            ].map((g) => (
              <label
                key={g.id}
                className="flex cursor-pointer items-center border-b border-white/10 p-4 transition-colors last:border-0 active:bg-white/10"
              >
                <input
                  type="radio"
                  name="gpsAccuracy"
                  checked={settings.gpsAccuracy === g.id}
                  onChange={() => updateSettings({ gpsAccuracy: g.id as GpsAccuracy })}
                  className="mr-4 h-5 w-5 shrink-0 accent-cyan-400"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-bold">{g.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/55">{g.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Demo Mode */}
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-3 ml-2">Desenvolvimento</h3>
          <div className="bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl p-5">
            <div className="flex justify-between items-center">
              <div className="flex flex-col pr-4">
                <span className="font-bold text-lg text-amber-400 flex items-center gap-2">
                  <PlaySquare className="w-5 h-5" /> Modo Demonstração
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/55 mt-1">Simula movimento sem usar o GPS real.</span>
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
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/55 mb-3 ml-2">Dados e Histórico</h3>
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
