// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RainBanner, StreetBar } from './RoadInfo';
import { Weather } from '../utils/weather';

const weather = (over: Partial<Weather> = {}): Weather => ({
  temperature: 24,
  kind: 'cloudy',
  label: 'Nublado',
  isDay: true,
  rainSoon: false,
  fetchedAt: 0,
  ...over,
});

afterEach(cleanup);

describe('RainBanner', () => {
  it('stays hidden when no rain is coming', () => {
    const { container } = render(<RainBanner weather={weather()} />);
    expect(container.innerHTML).toBe('');
  });

  it('warns about rain forecast within the hour', () => {
    render(<RainBanner weather={weather({ rainSoon: true })} />);
    expect(screen.getByRole('status').textContent).toMatch(/próxima hora/);
  });

  it('says so when it is already raining', () => {
    render(<RainBanner weather={weather({ kind: 'rain', rainSoon: true })} />);
    expect(screen.getByRole('status').textContent).toMatch(/Chovendo/);
  });

  it('calls out storms specifically', () => {
    render(<RainBanner weather={weather({ kind: 'storm', rainSoon: true })} />);
    expect(screen.getByRole('status').textContent).toMatch(/Tempestade/);
  });
});

describe('StreetBar', () => {
  it('shows the street with its neighbourhood', () => {
    render(<StreetBar place={{ street: 'Rua Santa Teresa', area: 'Glicério', city: 'São Paulo' }} />);
    expect(screen.getByText('Rua Santa Teresa')).toBeTruthy();
    expect(screen.getByText('Glicério')).toBeTruthy();
  });

  it('falls back to the neighbourhood off-road', () => {
    render(<StreetBar place={{ street: null, area: 'Centro', city: null }} />);
    expect(screen.getByText('Centro')).toBeTruthy();
  });

  it('renders nothing when there is nothing to name', () => {
    const { container } = render(<StreetBar place={{ street: null, area: null, city: 'X' }} />);
    expect(container.innerHTML).toBe('');
  });
});
