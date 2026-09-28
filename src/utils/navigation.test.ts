import { describe, expect, it } from 'vitest';
import {
  Maneuver,
  OsrmResponse,
  announceStage,
  announcementText,
  formatDuration,
  instructionText,
  isOffRoute,
  locateOnRoute,
  nextManeuverIndex,
  onto,
  parseOsrmRoute,
  remainingSeconds,
  spokenDistance,
} from './navigation';
import type { LngLat } from './mapData';

// ~111 m per 0.001 degree near the equator (Fortaleza is at -3.7).
const LAT = -3.73;
const LNG = -38.52;
const east = (m: number): LngLat => [LNG + m / 111_000, LAT];
const eastThenNorth = (e: number, n: number): LngLat => [LNG + e / 111_000, LAT + n / 110_540];

type Step = NonNullable<OsrmResponse['routes']>[number]['legs'][number]['steps'][number];
const step = (
  coordinates: LngLat[],
  maneuver: Partial<Step['maneuver']> & { type: string },
  name = '',
): Step => ({
  name,
  geometry: { coordinates },
  maneuver: { location: coordinates[0], ...maneuver },
});

/** 500 m east along Rua A, left onto Avenida B for 300 m, arrive. */
const L_SHAPE: OsrmResponse = {
  code: 'Ok',
  routes: [
    {
      duration: 120,
      legs: [
        {
          steps: [
            step([east(0), east(250), east(500)], { type: 'depart' }, 'Rua A'),
            step(
              [east(500), eastThenNorth(500, 150), eastThenNorth(500, 300)],
              { type: 'turn', modifier: 'left' },
              'Avenida B',
            ),
            step([eastThenNorth(500, 300)], { type: 'arrive' }, 'Avenida B'),
          ],
        },
      ],
    },
  ],
};

const maneuver = (over: Partial<Maneuver>): Maneuver => ({
  type: 'turn',
  modifier: 'right',
  exit: null,
  street: null,
  along: 0,
  lat: LAT,
  lng: LNG,
  ...over,
});

describe('parseOsrmRoute', () => {
  const route = parseOsrmRoute(L_SHAPE)!;

  it('joins the steps into one line without repeating the joints', () => {
    expect(route.coords).toHaveLength(5);
    expect(route.length).toBeGreaterThan(790);
    expect(route.length).toBeLessThan(810);
  });

  it('places each maneuver where its step starts, skipping the departure', () => {
    expect(route.maneuvers.map((m) => m.type)).toEqual(['turn', 'arrive']);
    expect(route.maneuvers[0].along).toBeCloseTo(500, -1);
    expect(route.maneuvers[0].street).toBe('Avenida B');
    expect(route.maneuvers[1].along).toBeCloseTo(route.length, 5);
  });

  it('drops a road that merely changes name', () => {
    const body: OsrmResponse = {
      code: 'Ok',
      routes: [
        {
          duration: 60,
          legs: [
            {
              steps: [
                step([east(0), east(200)], { type: 'depart' }),
                step([east(200), east(400)], { type: 'new name', modifier: 'straight' }),
                step([east(400)], { type: 'arrive' }),
              ],
            },
          ],
        },
      ],
    };
    expect(parseOsrmRoute(body)!.maneuvers.map((m) => m.type)).toEqual(['arrive']);
  });

  it('returns null when the router found nothing', () => {
    expect(parseOsrmRoute({ code: 'NoRoute' })).toBeNull();
    expect(parseOsrmRoute({ code: 'Ok', routes: [] })).toBeNull();
  });
});

describe('locateOnRoute', () => {
  const route = parseOsrmRoute(L_SHAPE)!;

  it('measures how far along and how far off the route the rider is', () => {
    const [lng, lat] = east(100);
    const pos = locateOnRoute(route, lat + 20 / 110_540, lng);
    expect(pos.along).toBeCloseTo(100, -1);
    expect(pos.offset).toBeCloseTo(20, 0);
  });

  it('follows the rider round the corner', () => {
    const [lng, lat] = eastThenNorth(500, 100);
    const pos = locateOnRoute(route, lat, lng);
    expect(pos.along).toBeCloseTo(600, -1);
    expect(pos.offset).toBeLessThan(1);
  });
});

describe('nextManeuverIndex / remainingSeconds', () => {
  const route = parseOsrmRoute(L_SHAPE)!;

  it('points at the turn before it and at the arrival after it', () => {
    expect(nextManeuverIndex(route, 100)).toBe(0);
    expect(nextManeuverIndex(route, 520)).toBe(1);
    expect(nextManeuverIndex(route, route.length + 1)).toBeNull();
  });

  it('scales the estimate by the distance left', () => {
    expect(remainingSeconds(route, 0)).toBeCloseTo(120);
    expect(remainingSeconds(route, route.length / 2)).toBeCloseTo(60);
    expect(remainingSeconds(route, route.length * 2)).toBe(0);
  });
});

describe('isOffRoute', () => {
  it('tolerates the usual GPS wobble', () => {
    expect(isOffRoute(20, 8)).toBe(false);
    expect(isOffRoute(60, 8)).toBe(true);
  });

  it('allows as much slack as the fix itself claims', () => {
    expect(isOffRoute(60, 70)).toBe(false);
  });

  it('refuses to judge from a very vague fix', () => {
    expect(isOffRoute(500, 200)).toBeNull();
  });
});

describe('instructionText', () => {
  it('uses the right preposition for the street', () => {
    expect(onto('Rua A')).toBe('na Rua A');
    expect(onto('Viaduto do Chá')).toBe('no Viaduto do Chá');
    expect(onto('BR-116')).toBe('em BR-116');
  });

  it('words turns, roundabouts and forks', () => {
    expect(instructionText(maneuver({ modifier: 'left', street: 'Avenida B' }))).toBe(
      'Vire à esquerda na Avenida B',
    );
    expect(instructionText(maneuver({ type: 'roundabout', exit: 2, street: 'Rua C' }))).toBe(
      'Na rotatória, pegue a 2ª saída para a Rua C',
    );
    expect(instructionText(maneuver({ type: 'fork', modifier: 'slight right' }))).toBe(
      'Na bifurcação, mantenha-se à direita',
    );
    expect(instructionText(maneuver({ modifier: 'uturn' }))).toBe('Faça o retorno');
    expect(instructionText(maneuver({ type: 'arrive', modifier: 'right' }))).toBe(
      'Destino à direita',
    );
  });
});

describe('spokenDistance / formatDuration', () => {
  it('rounds to what is worth saying', () => {
    expect(spokenDistance(42)).toBe('40 metros');
    expect(spokenDistance(318)).toBe('300 metros');
    expect(spokenDistance(990)).toBe('1 quilômetro');
    expect(spokenDistance(1540)).toBe('1,5 quilômetro');
    expect(spokenDistance(12_300)).toBe('12,3 quilômetros');
  });

  it('reads like a clock over an hour', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3900)).toBe('1 h 05 min');
  });
});

describe('announceStage', () => {
  it('warns early, then right at the turn', () => {
    expect(announceStage(600, 10)).toBeNull();
    expect(announceStage(240, 10)).toBe('prepare');
    expect(announceStage(40, 10)).toBe('now');
  });

  it('warns earlier the faster the rider goes', () => {
    // 100 km/h: 20 s is ~555 m.
    expect(announceStage(500, 27.8)).toBe('prepare');
    expect(announceStage(500, 5)).toBeNull();
  });
});

describe('announcementText', () => {
  const route = parseOsrmRoute(L_SHAPE)!;

  it('gives the distance in the early warning', () => {
    expect(announcementText(route, 0, 'prepare', 300)).toBe(
      'Em 300 metros, vire à esquerda na Avenida B.',
    );
  });

  it('chains a turn that follows right after', () => {
    const tight = {
      ...route,
      maneuvers: [
        maneuver({ modifier: 'left', street: 'Rua A', along: 100 }),
        maneuver({ modifier: 'right', street: 'Rua B', along: 150 }),
        maneuver({ type: 'arrive', along: 400 }),
      ],
    };
    expect(announcementText(tight, 0, 'now', 30)).toBe(
      'Vire à esquerda na Rua A, e depois vire à direita na Rua B.',
    );
  });
});
