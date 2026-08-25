import React from 'react';
import { History, Play, Save } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useTrip } from '../contexts/TripContext';
import { distanceParts } from '../utils/geo';
import { formatTime } from '../utils/format';

function agoLabel(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

/**
 * Shown when the app finds a ride that was never finished - the phone locked,
 * the tab was reclaimed, the browser was killed. Nothing resumes on its own:
 * the snapshot could be from yesterday, so the rider chooses. Either way the
 * distance is kept, which is the whole point.
 */
export default function ResumeTripPrompt() {
  const { recoverableTrip, resumeRecoveredTrip, discardRecoveredTrip } = useTrip();
  const { settings } = useSettings();

  if (!recoverableTrip) return null;

  const { trip, savedAt } = recoverableTrip;
  const dist = distanceParts(trip.distance, settings.unit);
  const elapsed = formatTime(trip.movingTime + trip.stoppedTime);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-safe backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-title"
        className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0B1220] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-400">
            <History className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="resume-title" className="text-base font-black text-white">
              Viagem não finalizada
            </h2>
            <p className="text-xs text-white/60">
              Interrompida {agoLabel(savedAt)}
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/55">
              Distância
            </span>
            <span className="text-xl font-black tabular-nums text-white">
              {dist.value}
              <span className="ml-1 text-xs font-normal text-white/55">
                {dist.label}
              </span>
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/55">
              Tempo
            </span>
            <span className="text-xl font-black tabular-nums text-white">
              {elapsed}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={resumeRecoveredTrip}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 text-sm font-black uppercase tracking-[0.15em] text-black active:bg-cyan-300"
          >
            <Play className="h-5 w-5" /> Continuar viagem
          </button>
          <button
            onClick={() => void discardRecoveredTrip()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 text-xs font-bold uppercase tracking-widest text-white/70 active:bg-white/10"
          >
            <Save className="h-4 w-4" /> Finalizar e salvar no histórico
          </button>
        </div>
      </div>
    </div>
  );
}
