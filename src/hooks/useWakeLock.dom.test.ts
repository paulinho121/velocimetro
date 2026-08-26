// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

/** Minimal stand-in for a WakeLockSentinel, faithful to the release semantics. */
class FakeSentinel {
  released = false;
  private listeners: (() => void)[] = [];

  addEventListener(_type: 'release', fn: () => void) {
    this.listeners.push(fn);
  }
  removeEventListener(_type: 'release', fn: () => void) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  async release() {
    this.dropByPlatform();
  }
  /** Simulates the platform taking the lock away without any page event. */
  dropByPlatform() {
    if (this.released) return;
    this.released = true;
    this.listeners.forEach((l) => l());
  }
}

let granted: FakeSentinel[] = [];
let shouldReject = false;

function installWakeLock() {
  granted = [];
  shouldReject = false;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: vi.fn(async () => {
        if (shouldReject) throw new Error('denied by platform');
        const s = new FakeSentinel();
        granted.push(s);
        return s;
      }),
    },
  });
}

function removeWakeLock() {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: undefined,
  });
  delete (navigator as any).wakeLock;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const live = () => granted.filter((s) => !s.released);

beforeEach(() => {
  installWakeLock();
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('takes the lock when enabled', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));
    expect(live()).toHaveLength(1);
  });

  it('takes nothing when switched off', async () => {
    const { result } = renderHook(() => useWakeLock(false));
    await waitFor(() => expect(result.current).toBe('idle'));
    expect(granted).toHaveLength(0);
  });

  it('re-arms when the platform drops the lock on its own', async () => {
    // This is the failure the old implementation could not see: a release with
    // no visibilitychange to go with it, and the screen quietly goes dark.
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));

    granted[0].dropByPlatform();

    await waitFor(() => expect(granted).toHaveLength(2));
    await waitFor(() => expect(result.current).toBe('active'));
    expect(live()).toHaveLength(1);
  });

  it('re-arms when the app comes back to the foreground', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));

    // Order matters: the platform drops the lock *because* the page went
    // away, so hide first and let the release follow, as it does on a phone.
    setVisibility('hidden');
    granted[0].dropByPlatform();
    await waitFor(() => expect(result.current).toBe('idle'));

    setVisibility('visible');
    await waitFor(() => expect(result.current).toBe('active'));
    expect(live()).toHaveLength(1);
  });

  it('re-arms across a fullscreen transition', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));

    granted[0].dropByPlatform();
    document.dispatchEvent(new Event('fullscreenchange'));

    await waitFor(() => expect(result.current).toBe('active'));
    expect(live()).toHaveLength(1);
  });

  it('never stacks more than one lock', async () => {
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));

    // A burst of events must not leak sentinels.
    for (let i = 0; i < 5; i++) {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('fullscreenchange'));
    }

    await waitFor(() => expect(live()).toHaveLength(1));
    expect(granted).toHaveLength(1);
  });

  it('releases when switched off', async () => {
    const { result, rerender } = renderHook(
      ({ on }) => useWakeLock(on),
      { initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current).toBe('active'));

    rerender({ on: false });
    await waitFor(() => expect(result.current).toBe('idle'));
    await waitFor(() => expect(live()).toHaveLength(0));
  });

  it('releases on unmount, so the screen is not held hostage', async () => {
    const { result, unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('active'));

    unmount();
    await waitFor(() => expect(live()).toHaveLength(0));
  });

  it('reports when the platform refuses instead of failing silently', async () => {
    shouldReject = true;
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('blocked'));
  });

  it('reports when the browser has no Wake Lock API at all', async () => {
    removeWakeLock();
    const { result } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(result.current).toBe('unsupported'));
  });
});
