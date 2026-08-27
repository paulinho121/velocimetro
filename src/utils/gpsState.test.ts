import { describe, expect, it } from 'vitest';
import {
  SIGNAL_LOST_AFTER,
  SLOW_FIX_AFTER,
  describeGpsState,
} from './gpsState';

const NOW = 1_000_000;

describe('describeGpsState', () => {
  it('stays quiet once a fix is arriving normally', () => {
    expect(describeGpsState('connected', null, NOW - 500, NOW - 30_000, NOW)).toBeNull();
  });

  it('says nothing before tracking has even started', () => {
    expect(describeGpsState('waiting', null, null, null, NOW)).toBeNull();
  });

  it('reassures during the first seconds of a cold start', () => {
    const n = describeGpsState('locating', null, null, NOW - 2000, NOW);
    expect(n?.tone).toBe('info');
    expect(n?.message).toMatch(/procurando/i);
  });

  it('explains itself once a cold start drags on', () => {
    // The defect this guards: the app showed "Localizando..." and 0 km/h
    // indefinitely, with the explanatory message written but never rendered.
    const n = describeGpsState('locating', null, null, NOW - 30_000, NOW);
    expect(n).not.toBeNull();
    expect(n?.tone).toBe('warn');
    expect(n?.message).toMatch(/30s/);
    expect(n?.message).toMatch(/local aberto/i);
    expect(n?.canRetry).toBe(true);
  });

  it('switches from reassurance to warning at the threshold', () => {
    const before = describeGpsState('locating', null, null, NOW - (SLOW_FIX_AFTER - 1000), NOW);
    const after = describeGpsState('locating', null, null, NOW - (SLOW_FIX_AFTER + 1000), NOW);
    expect(before?.tone).toBe('info');
    expect(after?.tone).toBe('warn');
  });

  it('reports a lost signal after having had one', () => {
    const n = describeGpsState('connected', null, NOW - SIGNAL_LOST_AFTER - 5000, NOW - 60_000, NOW);
    expect(n?.tone).toBe('warn');
    expect(n?.message).toMatch(/perdido/i);
  });

  it('tolerates a brief gap between fixes without crying wolf', () => {
    expect(describeGpsState('connected', null, NOW - 2000, NOW - 60_000, NOW)).toBeNull();
  });

  it('flags a denied permission as an error the rider must fix', () => {
    const n = describeGpsState('denied', 'Permissão negada.', null, NOW - 5000, NOW);
    expect(n?.tone).toBe('error');
    expect(n?.message).toBe('Permissão negada.');
    expect(n?.canRetry).toBe(true);
  });

  it('reports the insecure-context case, which no retry can fix by itself', () => {
    const n = describeGpsState(
      'unavailable',
      'O GPS exige uma conexão segura (https).',
      null,
      NOW - 1000,
      NOW,
    );
    expect(n?.tone).toBe('error');
    expect(n?.message).toMatch(/https/);
  });

  it('falls back to its own wording when no message came through', () => {
    expect(describeGpsState('denied', null, null, NOW, NOW)?.message).toMatch(/permiss/i);
    expect(describeGpsState('unavailable', null, null, NOW, NOW)?.message).toMatch(/localiz/i);
  });

  it('mentions weak signal without alarming', () => {
    const n = describeGpsState('weak', null, NOW - 500, NOW - 60_000, NOW);
    expect(n?.tone).toBe('info');
    expect(n?.canRetry).toBe(false);
  });

  it('never reports less than a second, which would read as broken', () => {
    const n = describeGpsState('locating', null, null, NOW - SLOW_FIX_AFTER - 100, NOW);
    expect(n?.message).not.toMatch(/\b0s\b/);
  });
});
