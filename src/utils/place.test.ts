import { describe, expect, it } from 'vitest';
import {
  parseSearchResult,
  STREET_REFETCH_METRES,
  STREET_REFETCH_MS,
  parsePlace,
  placeCacheKey,
  placeSummary,
  shouldRefetchStreet,
} from './place';

describe('parsePlace', () => {
  it('reads street, neighbourhood and city', () => {
    expect(
      parsePlace({ road: 'Avenida Beira Mar', suburb: 'Meireles', city: 'Fortaleza' }),
    ).toEqual({ street: 'Avenida Beira Mar', area: 'Meireles', city: 'Fortaleza' });
  });

  it('falls back through the alternative field names', () => {
    expect(
      parsePlace({ cycleway: 'Ciclovia X', neighbourhood: 'Centro', town: 'Aquiraz' }),
    ).toEqual({ street: 'Ciclovia X', area: 'Centro', city: 'Aquiraz' });
  });

  it('returns nulls for an empty answer', () => {
    expect(parsePlace(undefined)).toEqual({ street: null, area: null, city: null });
  });
});

describe('placeSummary', () => {
  it('prefers the neighbourhood over the street', () => {
    expect(placeSummary({ street: 'Rua A', area: 'Aldeota', city: 'Fortaleza' })).toBe(
      'Aldeota, Fortaleza',
    );
  });

  it('uses the street when there is no neighbourhood', () => {
    expect(placeSummary({ street: 'CE-040', area: null, city: 'Aquiraz' })).toBe(
      'CE-040, Aquiraz',
    );
  });

  it('does not repeat the same name', () => {
    expect(placeSummary({ street: null, area: 'Fortaleza', city: 'Fortaleza' })).toBe(
      'Fortaleza',
    );
  });

  it('is null when nothing is known', () => {
    expect(placeSummary({ street: null, area: null, city: null })).toBeNull();
  });
});

describe('shouldRefetchStreet', () => {
  it('asks the first time', () => {
    expect(shouldRefetchStreet(null, null)).toBe(true);
  });

  it('waits for both distance and time', () => {
    expect(shouldRefetchStreet(STREET_REFETCH_METRES, STREET_REFETCH_MS - 1)).toBe(false);
    expect(shouldRefetchStreet(STREET_REFETCH_METRES - 1, STREET_REFETCH_MS)).toBe(false);
    expect(shouldRefetchStreet(STREET_REFETCH_METRES, STREET_REFETCH_MS)).toBe(true);
  });
});

describe('placeCacheKey', () => {
  it('groups positions a few metres apart', () => {
    expect(placeCacheKey(-3.731941, -38.526712)).toBe(placeCacheKey(-3.731949, -38.526704));
    expect(placeCacheKey(-3.7319, -38.5267)).not.toBe(placeCacheKey(-3.7329, -38.5267));
  });
});

describe('parseSearchResult', () => {
  it('shows a named place with its address underneath', () => {
    const dest = parseSearchResult({
      place_id: 1,
      lat: '-3.755',
      lon: '-38.488',
      name: 'Iguatemi Bosque',
      display_name: 'Iguatemi Bosque, 85, Avenida Washington Soares, Fortaleza',
      address: {
        road: 'Avenida Washington Soares',
        house_number: '85',
        suburb: 'Edson Queiroz',
        municipality: 'Fortaleza',
      },
    });
    expect(dest).toEqual({
      id: 'osm:1',
      name: 'Iguatemi Bosque',
      detail: 'Avenida Washington Soares, 85 · Edson Queiroz · Fortaleza',
      lat: -3.755,
      lng: -38.488,
    });
  });

  it('names a bare address by its street and number', () => {
    const dest = parseSearchResult({
      place_id: 2,
      lat: '0',
      lon: '0',
      name: '',
      display_name: '120, Rua Solon Pinheiro, Centro, Fortaleza',
      address: { road: 'Rua Solon Pinheiro', house_number: '120', suburb: 'Centro', city: 'Fortaleza' },
    });
    expect(dest.name).toBe('Rua Solon Pinheiro, 120');
    expect(dest.detail).toBe('Centro · Fortaleza');
  });
});
