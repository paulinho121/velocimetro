import { GpsStatus } from '../types';

/**
 * Turns the raw GPS state into something to say to the rider.
 *
 * This exists because of a defect that made the app look dead: on a timeout —
 * routine on a cold start, indoors, or between tall buildings — the code set a
 * helpful message but left the status at `locating`, while the banner only
 * rendered for `denied` and `unavailable`. The message was written and never
 * shown, so the screen sat at "Localizando..." and 0 km/h with no explanation.
 *
 * Anything the rider cannot act on is worse than silence, so every state that
 * blocks a reading now says so, and says how long it has been that way.
 */

export type GpsTone = 'info' | 'warn' | 'error';

export interface GpsNotice {
  tone: GpsTone;
  message: string;
  /** Whether retrying the watch could plausibly help. */
  canRetry: boolean;
}

/** Waiting longer than this without a first fix deserves reassurance. */
export const SLOW_FIX_AFTER = 8000;
/** Having had a fix and then losing it for this long is worth flagging. */
export const SIGNAL_LOST_AFTER = 10000;

function seconds(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

export function describeGpsState(
  status: GpsStatus,
  errorMessage: string | null,
  lastFixAt: number | null,
  startedAt: number | null,
  now: number,
): GpsNotice | null {
  if (status === 'denied') {
    return {
      tone: 'error',
      message:
        errorMessage ??
        'Permissão de localização negada. Libere o acesso nas configurações do navegador.',
      canRetry: true,
    };
  }

  if (status === 'unavailable') {
    return {
      tone: 'error',
      message: errorMessage ?? 'Não foi possível obter a localização.',
      canRetry: true,
    };
  }

  // Never had a fix: the app looks identical to a broken one, so explain.
  if (lastFixAt === null) {
    if (status === 'waiting') return null;
    const waiting = startedAt !== null ? now - startedAt : 0;
    if (waiting < SLOW_FIX_AFTER) {
      return { tone: 'info', message: 'Procurando sinal de GPS...', canRetry: false };
    }
    return {
      tone: 'warn',
      message: `Sem sinal há ${seconds(waiting)}. Vá para um local aberto — a primeira leitura pode levar um minuto.`,
      canRetry: true,
    };
  }

  // Had a fix and lost it: tunnels, garages, dense city.
  const silence = now - lastFixAt;
  if (silence >= SIGNAL_LOST_AFTER) {
    return {
      tone: 'warn',
      message: `Sinal perdido há ${seconds(silence)}.`,
      canRetry: true,
    };
  }

  if (status === 'weak') {
    return { tone: 'info', message: 'Sinal fraco — precisão reduzida.', canRetry: false };
  }

  return null;
}
