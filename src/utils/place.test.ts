import { describe, expect, it } from 'vitest';
import {
  PhotonFeature,
  parsePhotonFeature,
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

describe('parsePhotonFeature', () => {
  const feature = (properties: Partial<PhotonFeature['properties']>): PhotonFeature => ({
    properties: { osm_type: 'N', osm_id: 1, ...properties },
    geometry: { coordinates: [-38.53, -3.73] },
  });

  it('shows a named place with its address underneath', () => {
    expect(
      parsePhotonFeature(
        feature({
          name: 'Iguatemi Bosque',
          street: 'Avenida Washington Soares',
          housenumber: '85',
          district: 'Edson Queiroz',
          city: 'Fortaleza',
        }),
      ),
    ).toEqual({
      id: 'osm:N1',
      name: 'Iguatemi Bosque',
      detail: 'Avenida Washington Soares, 85 · Edson Queiroz · Fortaleza',
      lat: -3.73,
      lng: -38.53,
    });
  });

  it('names a bare address by its street and number', () => {
    const dest = parsePhotonFeature(
      feature({ street: 'Rua Senador Pompeu', housenumber: '1547', district: 'Centro', city: 'Fortaleza' }),
    );
    expect(dest.name).toBe('Rua Senador Pompeu, 1547');
    expect(dest.detail).toBe('Centro · Fortaleza');
  });
});
