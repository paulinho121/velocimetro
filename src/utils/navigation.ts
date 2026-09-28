import { calculateDistance } from './geo';
import type { LngLat } from './mapData';

/**
 * Turn-by-turn guidance, kept pure so it can be tested without a network, a
 * GPS or a speech engine: reading the router's answer, placing the rider on
 * the route, wording the directions in Portuguese and deciding when to say
 * them.
 */

// ---- The route --------------------------------------------------------------

/** One decision point along the route. */
export interface Maneuver {
  /** OSRM maneuver type: turn, fork, roundabout, arrive... */
  type: string;
  /** left, slight right, uturn, straight... */
  modifier: string | null;
  /** Roundabout exit to take, counted from 1. */
  exit: number | null;
  /** Road the rider will be on after the maneuver. */
  street: string | null;
  /** Metres from the start of the route to this maneuver. */
  along: number;
  lat: number;
  lng: number;
}

export interface NavRoute {
  /** The line to follow, [lng, lat] as the map wants it. */
  coords: LngLat[];
  /** Metres from the start to each point of `coords`. */
  cumulative: number[];
  /** Total length in metres, measured on `coords`. */
  length: number;
  /** Router's estimate for the whole route, in seconds. */
  duration: number;
  /** Decisions in order; the last one is the arrival. */
  maneuvers: Maneuver[];
}

/** The slice of an OSRM /route answer we read. */
export interface OsrmResponse {
  code: string;
  routes?: {
    duration: number;
    legs: {
      steps: {
        name?: string;
        ref?: string;
        geometry: { coordinates: LngLat[] };
        maneuver: {
          type: string;
          modifier?: string;
          exit?: number;
          location: LngLat;
        };
      }[];
    }[];
  }[];
}

/**
 * Maneuvers that are not decisions: carrying on along the same road, a road
 * that merely changes name, leaving a roundabout (already said on entering).
 * Announcing them would bury the real turns in chatter.
 */
function isSilent(type: string, modifier: string | null): boolean {
  if (type === 'depart' || type === 'notification') return true;
  if (type === 'exit roundabout' || type === 'exit rotary') return true;
  if (type === 'continue' || type === 'new name') {
    return !modifier || modifier === 'straight' || modifier.startsWith('slight');
  }
  return false;
}

export function parseOsrmRoute(body: OsrmResponse): NavRoute | null {
  const route = body.code === 'Ok' ? body.routes?.[0] : undefined;
  if (!route) return null;

  const coords: LngLat[] = [];
  const cumulative: number[] = [];
  const maneuvers: Maneuver[] = [];

  const push = (c: LngLat) => {
    const prev = coords[coords.length - 1];
    if (prev && prev[0] === c[0] && prev[1] === c[1]) return;
    cumulative.push(
      prev ? cumulative[cumulative.length - 1] + calculateDistance(prev[1], prev[0], c[1], c[0]) : 0,
    );
    coords.push(c);
  };

  for (const leg of route.legs) {
    for (const step of leg.steps) {
      // The step's first point is where its maneuver happens.
      const first = step.geometry.coordinates[0] ?? step.maneuver.location;
      push(first);
      const along = cumulative[cumulative.length - 1];
      step.geometry.coordinates.slice(1).forEach(push);

      const { type, modifier = null, exit = null, location } = step.maneuver;
      if (isSilent(type, modifier)) continue;
      maneuvers.push({
        type,
        modifier,
        exit,
        street: step.name?.trim() || step.ref?.trim() || null,
        along,
        lat: location[1],
        lng: location[0],
      });
    }
  }

  if (coords.length < 2) return null;
  return {
    coords,
    cumulative,
    length: cumulative[cumulative.length - 1],
    duration: route.duration,
    maneuvers,
  };
}

// ---- Where the rider is on it ---------------------------------------------

export interface RoutePosition {
  /** Segment (coords[i] -> coords[i + 1]) the rider was matched to. */
  segment: number;
  /** Metres from the start of the route to the matched point. */
  along: number;
  /** Metres between the rider and the route. */
  offset: number;
}

/** Metres per degree, close enough for the few hundred metres we compare. */
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/**
 * Nearest point of the route to the rider.
 *
 * Only looks a little behind `fromSegment`, the last match: where a route
 * doubles back on itself (a return along the same avenue) a global search
 * would jump the rider to the wrong pass and skip every turn in between.
 */
export function locateOnRoute(
  route: NavRoute,
  lat: number,
  lng: number,
  fromSegment = 0,
): RoutePosition {
  const kx = M_PER_DEG_LNG_EQUATOR * Math.cos((lat * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  const start = Math.max(0, fromSegment - 5);

  let best: RoutePosition = { segment: start, along: route.cumulative[start], offset: Infinity };
  for (let i = start; i < route.coords.length - 1; i++) {
    const [ax, ay] = route.coords[i];
    const [bx, by] = route.coords[i + 1];
    // Plane centred on the rider, in metres.
    const x1 = (ax - lng) * kx;
    const y1 = (ay - lat) * ky;
    const dx = (bx - ax) * kx;
    const dy = (by - ay) * ky;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(x1 * dx + y1 * dy) / len2));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const offset = Math.hypot(px, py);
    if (offset < best.offset) {
      const segLength = route.cumulative[i + 1] - route.cumulative[i];
      best = { segment: i, along: route.cumulative[i] + t * segLength, offset };
    }
  }
  return best;
}

/** Index of the first maneuver still ahead of `along`, or null past the last. */
export function nextManeuverIndex(route: NavRoute, along: number): number | null {
  const i = route.maneuvers.findIndex((m) => m.along > along);
  return i === -1 ? null : i;
}

/** Seconds left, scaling the router's estimate by the distance still to go. */
export function remainingSeconds(route: NavRoute, along: number): number {
  if (route.length <= 0) return 0;
  const left = Math.max(0, route.length - along);
  return (route.duration * left) / route.length;
}

/** Off the route by more than this (or the GPS error, if worse) counts as lost. */
export const OFF_ROUTE_METRES = 45;
/** Fixes this vague say nothing about which road the rider is on. */
export const MAX_USEFUL_ACCURACY = 80;
/** Consecutive off-route fixes before asking for a new route. */
export const OFF_ROUTE_FIXES = 3;
/** Never ask the public router for a new route more often than this. */
export const MIN_REROUTE_MS = 15_000;
/** Within this of the end of the route, the rider has arrived. */
export const ARRIVAL_METRES = 30;

/** Whether a fix puts the rider off the route; null when the fix is too vague to tell. */
export function isOffRoute(offset: number, accuracy: number): boolean | null {
  if (accuracy > MAX_USEFUL_ACCURACY) return null;
  return offset > Math.max(OFF_ROUTE_METRES, accuracy);
}

// ---- Words ------------------------------------------------------------------

const FEMININE = new Set([
  'rua', 'r.', 'avenida', 'av.', 'av', 'estrada', 'rodovia', 'travessa', 'alameda', 'praça',
  'ladeira', 'via', 'vila', 'marginal', 'ponte', 'rampa', 'passarela', 'ciclovia', 'ciclofaixa',
  'servidão', 'quadra', 'rotatória', 'avenida.', 'trav.', 'estr.', 'rod.',
]);
const MASCULINE = new Set([
  'viaduto', 'túnel', 'tunel', 'largo', 'acesso', 'anel', 'elevado', 'beco', 'contorno',
  'boulevard', 'corredor', 'caminho', 'parque', 'trevo', 'complexo', 'rodoanel', 'retorno',
]);

function gender(street: string): 'f' | 'm' | null {
  const first = street.split(/\s+/)[0].toLowerCase();
  if (FEMININE.has(first)) return 'f';
  if (MASCULINE.has(first)) return 'm';
  return null;
}

/** "na Rua X", "no Viaduto Y", "em BR-116". */
export function onto(street: string): string {
  const g = gender(street);
  return `${g === 'f' ? 'na' : g === 'm' ? 'no' : 'em'} ${street}`;
}

/** "para a Rua X", "para o Viaduto Y", "para BR-116". */
function towards(street: string): string {
  const g = gender(street);
  return `para ${g === 'f' ? 'a ' : g === 'm' ? 'o ' : ''}${street}`;
}

function side(modifier: string | null): string {
  if (modifier?.includes('left')) return 'à esquerda';
  if (modifier?.includes('right')) return 'à direita';
  return 'em frente';
}

function turnPhrase(modifier: string | null): string {
  switch (modifier) {
    case 'left':
      return 'Vire à esquerda';
    case 'right':
      return 'Vire à direita';
    case 'slight left':
      return 'Vire levemente à esquerda';
    case 'slight right':
      return 'Vire levemente à direita';
    case 'sharp left':
      return 'Vire acentuadamente à esquerda';
    case 'sharp right':
      return 'Vire acentuadamente à direita';
    case 'uturn':
      return 'Faça o retorno';
    default:
      return 'Siga em frente';
  }
}

/** The direction as the rider should read or hear it. */
export function instructionText(m: Maneuver): string {
  const street = m.street;
  const withOnto = (base: string) => (street ? `${base} ${onto(street)}` : base);
  const withTowards = (base: string) => (street ? `${base} ${towards(street)}` : base);

  switch (m.type) {
    case 'arrive':
      return m.modifier?.includes('left')
        ? 'Destino à esquerda'
        : m.modifier?.includes('right')
          ? 'Destino à direita'
          : 'Você chegou ao destino';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return withTowards(
        m.exit ? `Na rotatória, pegue a ${m.exit}ª saída` : 'Entre na rotatória',
      );
    case 'end of road':
      return withOnto(`No fim da via, ${turnPhrase(m.modifier).toLowerCase()}`);
    case 'fork':
      return withOnto(`Na bifurcação, mantenha-se ${side(m.modifier)}`);
    case 'merge':
      return street ? `Entre ${onto(street)}` : 'Entre na via';
    case 'on ramp':
      return withTowards(`Pegue o acesso ${side(m.modifier)}`);
    case 'off ramp':
      return withTowards(`Pegue a saída ${side(m.modifier)}`);
    case 'continue':
    case 'new name':
      return m.modifier === 'uturn'
        ? withOnto('Faça o retorno')
        : withOnto(`Mantenha-se ${side(m.modifier)}`);
    default:
      return withOnto(turnPhrase(m.modifier));
  }
}

/** "300 metros", "1,5 quilômetro" - how a distance is said out loud. */
export function spokenDistance(metres: number): string {
  if (metres < 1000) {
    const step = metres < 100 ? 10 : 50;
    const rounded = Math.max(step, Math.round(metres / step) * step);
    if (rounded < 1000) return `${rounded} metros`;
  }
  const km = Math.round(metres / 100) / 10;
  const text = km.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${text} ${km < 2 ? 'quilômetro' : 'quilômetros'}`;
}

/** "1 h 05 min", "12 min", "1 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Said once, when a route first comes in. */
export function routeSummaryPhrase(route: NavRoute): string {
  const minutes = Math.max(1, Math.round(route.duration / 60));
  const time =
    minutes < 60
      ? `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
      : `${Math.floor(minutes / 60)} hora${minutes >= 120 ? 's' : ''} e ${minutes % 60} minutos`;
  return `Rota calculada. ${spokenDistance(route.length)}, cerca de ${time}.`;
}

// ---- When to speak ---------------------------------------------------------

export type AnnounceStage = 'prepare' | 'now';

/**
 * Each maneuver is announced twice: once early enough to change lanes, once
 * right before it. Both distances grow with speed, so the rider always gets
 * roughly the same time to react.
 */
export function announceStage(distance: number, speedMs: number): AnnounceStage | null {
  const now = Math.max(40, speedMs * 5);
  const prepare = Math.min(1000, Math.max(250, speedMs * 20));
  if (distance <= now) return 'now';
  if (distance <= prepare) return 'prepare';
  return null;
}

/** Two turns this close together are said as one sentence. */
const CHAIN_METRES = 80;

export function announcementText(
  route: NavRoute,
  index: number,
  stage: AnnounceStage,
  distance: number,
): string {
  const m = route.maneuvers[index];
  if (stage === 'prepare') {
    if (m.type === 'arrive') return `Em ${spokenDistance(distance)}, você chega ao destino.`;
    const text = instructionText(m);
    return `Em ${spokenDistance(distance)}, ${text[0].toLowerCase()}${text.slice(1)}.`;
  }
  const following = route.maneuvers[index + 1];
  if (following && following.type !== 'arrive' && following.along - m.along < CHAIN_METRES) {
    const then = instructionText(following);
    return `${instructionText(m)}, e depois ${then[0].toLowerCase()}${then.slice(1)}.`;
  }
  return `${instructionText(m)}.`;
}
