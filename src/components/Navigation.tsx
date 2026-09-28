import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Clock,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Split,
  Undo2,
  X,
} from 'lucide-react';
import { useGps } from '../contexts/GpsContext';
import { useNavigation } from '../contexts/NavigationContext';
import { Destination } from '../types';
import { calculateDistance } from '../utils/geo';
import { Maneuver, formatDuration, instructionText } from '../utils/navigation';

/** "300 m", "1,2 km": rounded to what a rider can use at a glance. */
function shortDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(0, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function arrivalClock(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ManeuverIcon({ maneuver, className }: { maneuver: Maneuver; className?: string }) {
  const { type, modifier } = maneuver;
  const Icon =
    type === 'arrive'
      ? Flag
      : type === 'roundabout' || type === 'rotary' || type === 'roundabout turn'
        ? RotateCcw
        : type === 'fork'
          ? Split
          : modifier === 'uturn'
            ? Undo2
            : modifier === 'left' || modifier === 'sharp left'
              ? CornerUpLeft
              : modifier === 'right' || modifier === 'sharp right'
                ? CornerUpRight
                : modifier === 'slight left'
                  ? ArrowUpLeft
                  : modifier === 'slight right'
                    ? ArrowUpRight
                    : ArrowUp;
  return <Icon className={className} aria-hidden="true" />;
}

/**
 * What to do next, big enough to read on a handlebar mount. Also says what the
 * guidance is busy with (routing, rerouting, lost), so it never looks frozen.
 */
export function ManeuverBanner({ large = false }: { large?: boolean }) {
  const nav = useNavigation();
  const { location } = useGps();
  const { destination, status, next, distanceToNext } = nav;
  if (!destination) return null;

  const box = clsx(
    'flex items-center gap-3 rounded-2xl border',
    large ? 'px-4 py-3' : 'px-3 py-2.5',
  );
  const textSize = large ? 'text-[clamp(1rem,3.6vmin,1.6rem)]' : 'text-base';

  if (status === 'routing' || status === 'rerouting') {
    return (
      <div role="status" className={clsx(box, 'border-cyan-400/30 bg-cyan-400/10')}>
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-cyan-300" aria-hidden="true" />
        <p className={clsx('flex-1 font-bold text-cyan-100', textSize)}>
          {status === 'rerouting'
            ? 'Recalculando rota…'
            : location
              ? 'Calculando rota…'
              : 'Aguardando o GPS para calcular a rota…'}
        </p>
        <CancelButton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div role="alert" className={clsx(box, 'border-red-500/40 bg-red-500/15')}>
        <p className={clsx('flex-1 font-bold leading-tight text-red-100', textSize)}>
          {nav.error}
        </p>
        <button
          type="button"
          onClick={nav.retry}
          className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold text-white active:bg-white/25"
        >
          Tentar de novo
        </button>
        <CancelButton />
      </div>
    );
  }

  if (status === 'arrived') {
    return (
      <div role="status" className={clsx(box, 'border-emerald-400/40 bg-emerald-500/15')}>
        <Flag className="h-7 w-7 shrink-0 text-emerald-300" aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className={clsx('font-black text-emerald-100', textSize)}>Você chegou</p>
          <p className="truncate text-sm text-emerald-200/80">{destination.name}</p>
        </div>
        <button
          type="button"
          onClick={nav.cancel}
          className="shrink-0 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-black active:bg-emerald-300"
        >
          Concluir
        </button>
      </div>
    );
  }

  // Navigating, before the first fix has been placed on the route.
  if (!next || distanceToNext === null) {
    return (
      <div className={clsx(box, 'border-white/15 bg-white/5')}>
        <ArrowUp className="h-7 w-7 shrink-0 text-cyan-300" aria-hidden="true" />
        <p className={clsx('flex-1 font-bold', textSize)}>Siga a rota</p>
        <CancelButton />
      </div>
    );
  }

  const soon = distanceToNext < 150;
  return (
    <div
      className={clsx(
        box,
        soon ? 'border-cyan-300/60 bg-cyan-400/20' : 'border-white/15 bg-[#0B1424]',
      )}
    >
      <ManeuverIcon
        maneuver={next}
        className={clsx(
          'shrink-0 text-cyan-300',
          large ? 'h-[clamp(2.5rem,9vmin,4.5rem)] w-[clamp(2.5rem,9vmin,4.5rem)]' : 'h-10 w-10',
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={clsx(
            'font-black tabular-nums text-white',
            large ? 'text-[clamp(1.5rem,6vmin,3rem)]' : 'text-2xl',
          )}
        >
          {distanceToNext < 15 ? 'Agora' : shortDistance(distanceToNext)}
        </span>
        <span className={clsx('line-clamp-2 font-bold text-white/80', textSize)}>
          {instructionText(next)}
        </span>
        {large && <RouteTotals className="mt-1 text-sm text-white/55" />}
      </div>
      {!large && <CancelButton />}
    </div>
  );
}

function RouteTotals({ className }: { className?: string }) {
  const { remaining, remainingSec } = useNavigation();
  if (remaining === null || remainingSec === null) return null;
  return (
    <span className={clsx('tabular-nums', className)}>
      {shortDistance(remaining)} · {formatDuration(remainingSec)} · chegada{' '}
      {arrivalClock(remainingSec)}
    </span>
  );
}

function CancelButton() {
  const { cancel } = useNavigation();
  return (
    <button
      type="button"
      onClick={cancel}
      aria-label="Cancelar navegação"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/70 active:bg-white/20"
    >
      <X className="h-5 w-5" />
    </button>
  );
}

/** Where the rider is going and how long it will take. */
export function RouteSummary() {
  const { destination, remaining, remainingSec, status } = useNavigation();
  if (!destination) return null;
  const showTotals = status === 'navigating' && remaining !== null && remainingSec !== null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <MapPin className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-bold">{destination.name ?? 'Ponto no mapa'}</p>
        {destination.detail && (
          <p className="truncate text-xs text-white/55">{destination.detail}</p>
        )}
      </div>
      {showTotals && (
        <div className="shrink-0 text-right leading-tight">
          <p className="text-lg font-black tabular-nums text-cyan-300">
            {formatDuration(remainingSec!)}
          </p>
          <p className="text-xs tabular-nums text-white/55">
            {shortDistance(remaining!)} · {arrivalClock(remainingSec!)}
          </p>
        </div>
      )}
    </div>
  );
}

function DestinationRow({
  dest,
  icon,
  onPick,
  onRemove,
}: {
  dest: Destination;
  icon: 'recent' | 'result';
  onPick: () => void;
  onRemove?: () => void;
}) {
  const { location } = useGps();
  const away = location ? calculateDistance(location.lat, location.lng, dest.lat, dest.lng) : null;
  const Icon = icon === 'recent' ? Clock : MapPin;

  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-white/10"
      >
        <Icon className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold">{dest.name ?? 'Ponto no mapa'}</span>
          {dest.detail && (
            <span className="block truncate text-xs text-white/55">{dest.detail}</span>
          )}
        </span>
        {away !== null && (
          <span className="shrink-0 text-xs tabular-nums text-white/50">{shortDistance(away)}</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${dest.name ?? 'destino'} dos recentes`}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-white/40 active:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: Destination[] }
  | { status: 'error' };

/**
 * Search runs on submit, not while typing: the public geocoder's usage
 * policy forbids autocomplete.
 */
export function DestinationSearch() {
  const { navigateTo, recents, removeRecent } = useNavigation();
  const { location } = useGps();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const inFlight = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    inFlight.current?.abort();
    setOpen(false);
    setSearch({ status: 'idle' });
    inputRef.current?.blur();
  };

  const pick = (dest: Destination) => {
    close();
    setQuery('');
    navigateTo(dest);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setSearch({ status: 'loading' });
    setOpen(true);
    try {
      const { searchPlaces } = await import('../services/nominatim');
      const results = await searchPlaces(q, location, controller.signal);
      if (!controller.signal.aborted) setSearch({ status: 'done', results });
    } catch {
      if (!controller.signal.aborted) setSearch({ status: 'error' });
    }
  };

  const showRecents = search.status === 'idle' && recents.length > 0;

  return (
    <div className="relative">
      <form onSubmit={submit} role="search" className="flex gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 focus-within:border-cyan-400/60">
          <Search className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (search.status !== 'idle') setSearch({ status: 'idle' });
            }}
            onFocus={() => setOpen(true)}
            placeholder="Para onde? Endereço ou lugar"
            aria-label="Buscar destino"
            className="h-11 min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
          />
        </label>
        {open ? (
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-2xl px-3 text-sm font-bold text-white/70 active:bg-white/10"
          >
            Fechar
          </button>
        ) : null}
      </form>

      {open && (search.status !== 'idle' || showRecents) && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B1424] shadow-2xl">
          {search.status === 'loading' && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando…
            </p>
          )}
          {search.status === 'error' && (
            <p className="px-4 py-3 text-sm text-red-300">
              Não deu para buscar agora. Confira a internet e tente de novo.
            </p>
          )}
          {search.status === 'done' && search.results.length === 0 && (
            <p className="px-4 py-3 text-sm text-white/60">
              Nada encontrado. Tente incluir o bairro ou a cidade.
            </p>
          )}
          {search.status === 'done' && search.results.length > 0 && (
            <ul className="divide-y divide-white/5">
              {search.results.map((r) => (
                <DestinationRow key={r.id} dest={r} icon="result" onPick={() => pick(r)} />
              ))}
            </ul>
          )}
          {showRecents && (
            <>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-white/45">
                Recentes
              </p>
              <ul className="divide-y divide-white/5">
                {recents.map((r) => (
                  <DestinationRow
                    key={r.id}
                    dest={r}
                    icon="recent"
                    onPick={() => pick(r)}
                    onRemove={() => removeRecent(r.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
