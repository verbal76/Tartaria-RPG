/**
 * "Please wait, applying update" — the apply transition is announced, painted
 * BEFORE the destructive reload, blocks a second activation, and can never be
 * left up.
 *
 * Archaeology this pins the consequence of (see the commit message for the
 * full trail): the full-screen UPDATING modal (ebe8beaa, 2026-05-16) was
 * deleted with the manual CHECK FOR OTA UPDATE button (ca764b28, v2.4.1/OTA-051).
 * Since then the only path that applies updates is the boot-front apply
 * (App.tsx, `silent: true`), which called `reloadAsync` in the same turn as its
 * status string — so the presentation was requested and destroyed in one
 * frame: "flash, freeze, startup".
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockCheckForUpdateAsync = jest.fn();
const mockFetchUpdateAsync = jest.fn();
const mockReloadAsync = jest.fn();

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: (...a: unknown[]) => mockCheckForUpdateAsync(...a),
  fetchUpdateAsync: (...a: unknown[]) => mockFetchUpdateAsync(...a),
  reloadAsync: (...a: unknown[]) => mockReloadAsync(...a),
}));
jest.mock('../app/audio/AudioManager', () => ({ disposeAudio: jest.fn(async () => {}) }));
jest.mock('../app/voice/TTSController', () => ({ stopTTSController: jest.fn() }));
jest.mock('../app/voice/TTSManager', () => ({ stopAndClear: jest.fn() }));
jest.mock('../app/voice/PiperTTSManager', () => ({ disposePiperEngine: jest.fn(async () => {}) }));
jest.mock('../app/state/gameStore', () => ({
  useGameStore: {
    getState: () => ({
      persist: jest.fn(async () => {}),
      shutdownCognitive: jest.fn(async () => {}),
      shutdownQwen: jest.fn(async () => {}),
    }),
  },
}));

import { checkAndApplyOTA } from '../app/updates/checkAndApplyOTA';
import {
  APPLY_FAILSAFE_MS,
  beginOtaApplying,
  endOtaApplying,
  isOtaApplying,
  presentedFrame,
  resetOtaApplyingForTest,
  subscribeOtaApplying,
} from '../app/updates/otaApplyingState';
import { OtaApplyingOverlay, OTA_APPLYING_MESSAGE } from '../app/components/OtaApplyingOverlay';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void; root: { findAllByType(t: unknown): unknown[] } };
};

const mount = () => {
  let t!: ReturnType<typeof renderer.create>;
  renderer.act(() => { t = renderer.create(<OtaApplyingOverlay />); });
  return t;
};

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

type G = { requestAnimationFrame?: (cb: () => void) => unknown };
const g = globalThis as unknown as G;
let realRaf: G['requestAnimationFrame'];
let frames = 0;
/** Every raise/clear of the applying state, in order, interleaved with the
 *  native-side events that matter (frames drawn, reload requested). */
let trace: string[] = [];

beforeEach(() => {
  resetOtaApplyingForTest();
  trace = [];
  frames = 0;
  realRaf = g.requestAnimationFrame;
  g.requestAnimationFrame = (cb: () => void) => {
    frames += 1;
    trace.push('frame');
    setTimeout(cb, 0);
    return 0;
  };
  subscribeOtaApplying(() => trace.push(isOtaApplying() ? 'overlay:up' : 'overlay:down'));
  mockCheckForUpdateAsync.mockReset().mockResolvedValue({ isAvailable: true });
  mockFetchUpdateAsync.mockReset().mockResolvedValue(undefined);
  mockReloadAsync.mockReset().mockImplementation(async () => { trace.push('reload'); });
});
afterEach(() => { g.requestAnimationFrame = realRaf; resetOtaApplyingForTest(); });

describe('the popup follows the real updater state', () => {
  it('no update → no applying state', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: false });
    expect(await checkAndApplyOTA({ silent: true })).toBe('noUpdate');
    expect(trace).toEqual([]);
  });

  it('a failed check never raises it', async () => {
    mockCheckForUpdateAsync.mockRejectedValue(new Error('network down'));
    expect(await checkAndApplyOTA({ silent: true })).toBe('errored');
    expect(trace).toEqual([]);
    expect(mockReloadAsync).not.toHaveBeenCalled();
  });

  it('a "nothing newer to fetch" download answer never raises it', async () => {
    mockFetchUpdateAsync.mockRejectedValue(new Error('Failed to download new update'));
    expect(await checkAndApplyOTA({ silent: true })).toBe('noUpdate');
    expect(trace).toEqual([]);
  });

  it('downloading in the background (fetchOnly) never raises it — the game stays usable', async () => {
    expect(await checkAndApplyOTA({ silent: true, fetchOnly: true })).toBe('pending');
    expect(trace).toEqual([]);
    expect(mockReloadAsync).not.toHaveBeenCalled();
  });
});

describe('the apply transition: told, painted, THEN destructive', () => {
  // The order is the whole point. If `reload` ever precedes two `frame`s after
  // `overlay:up`, the player is back to "flash, freeze, startup".
  const assertTold = () => {
    const up = trace.indexOf('overlay:up');
    const reload = trace.indexOf('reload');
    expect(up).toBeGreaterThanOrEqual(0);
    expect(reload).toBeGreaterThan(up);
    const framesBetween = trace.slice(up, reload).filter((e) => e === 'frame').length;
    expect(framesBetween).toBeGreaterThanOrEqual(2);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
  };

  it('boot-front path (silent, skipTeardown) — the path that actually applies updates', async () => {
    expect(await checkAndApplyOTA({ silent: true, skipTeardown: true })).toBe('applied');
    assertTold();
  });

  it('banner-tap path (skipFetch, full teardown)', async () => {
    expect(await checkAndApplyOTA({ skipFetch: true })).toBe('applied');
    assertTold();
  });

  it('the overlay is still up when reload is requested (a real reload destroys it, nothing else does)', async () => {
    let upAtReload: boolean | null = null;
    mockReloadAsync.mockImplementation(async () => { upAtReload = isOtaApplying(); });
    await checkAndApplyOTA({ silent: true, skipTeardown: true });
    expect(upAtReload).toBe(true);
    expect(isOtaApplying()).toBe(true); // not cleared on success
  });

  it('does not wait on an arbitrary timer — the wait is frames, bounded', async () => {
    const t0 = Date.now();
    await presentedFrame();
    expect(frames).toBe(2);
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it('a runtime that never draws a frame cannot hold the update hostage', async () => {
    g.requestAnimationFrame = () => 0; // frames never fire
    const t0 = Date.now();
    await presentedFrame(40);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    expect(Date.now() - t0).toBeLessThan(400);
  });

  it('a host with no requestAnimationFrame at all resolves immediately', async () => {
    g.requestAnimationFrame = undefined;
    await expect(presentedFrame()).resolves.toBeUndefined();
  });
});

describe('failure can never leave the overlay up', () => {
  it('reloadAsync rejects (boot-front) → cleared, errored, saves untouched', async () => {
    mockReloadAsync.mockRejectedValue(new Error('refused'));
    const errors: string[] = [];
    expect(await checkAndApplyOTA({ silent: true, skipTeardown: true, onError: (m) => errors.push(m) })).toBe('errored');
    expect(isOtaApplying()).toBe(false);
    expect(trace.slice(-1)).toEqual(['overlay:down']);
    expect(errors[0]).toMatch(/progress was saved/);
  });

  it('reloadAsync rejects (mid-session teardown path) → cleared', async () => {
    mockReloadAsync.mockRejectedValue(new Error('refused'));
    expect(await checkAndApplyOTA({ skipFetch: true })).toBe('errored');
    expect(isOtaApplying()).toBe(false);
  });
});

describe('a reload that resolves but leaves this runtime alive', () => {
  it('takes the overlay down after the failsafe bound instead of stranding the player', async () => {
    jest.useFakeTimers();
    try {
      const p = checkAndApplyOTA({ silent: true, skipTeardown: true });
      for (let i = 0; i < 30 && !trace.includes('reload'); i++) { await jest.advanceTimersByTimeAsync(5); }
      await p;
      expect(isOtaApplying()).toBe(true);
      await jest.advanceTimersByTimeAsync(APPLY_FAILSAFE_MS - 1000);
      expect(isOtaApplying()).toBe(true);
      await jest.advanceTimersByTimeAsync(2000);
      expect(isOtaApplying()).toBe(false);
    } finally { jest.useRealTimers(); }
  });
});

describe('a second activation cannot start', () => {
  it('while one is in flight a second call reports applied and does not reload again', async () => {
    let release!: () => void;
    mockReloadAsync.mockImplementation(() => new Promise<void>((r) => { trace.push('reload'); release = r; }));
    const first = checkAndApplyOTA({ silent: true, skipTeardown: true });
    // let the first call reach reloadAsync
    for (let i = 0; i < 20 && mockReloadAsync.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    const second = await checkAndApplyOTA({ skipFetch: true });
    expect(second).toBe('applied');
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(isOtaApplying()).toBe(true); // the second call did not clear the first's transition
    release();
    await first;
  });

  it('beginOtaApplying refuses a re-entry; a failed second call cannot clear the first', () => {
    expect(beginOtaApplying()).toBe(true);
    expect(beginOtaApplying()).toBe(false);
    expect(isOtaApplying()).toBe(true);
    endOtaApplying();
    expect(isOtaApplying()).toBe(false);
  });
});

describe('the overlay', () => {
  it('says exactly "Please wait, applying update"', () => {
    expect(OTA_APPLYING_MESSAGE).toBe('Please wait, applying update');
  });

  it('renders nothing when idle and the message + a spinner while applying, with no dismiss control', () => {
    const tree = mount();
    expect(tree.toJSON()).toBeNull();
    renderer.act(() => { beginOtaApplying(); });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Please wait, applying update');
    expect(json).toContain('ActivityIndicator');
    expect(json).not.toMatch(/onPress|"button"/); // nothing to press, nothing to dismiss
    renderer.act(() => { endOtaApplying(); });
    expect(tree.toJSON()).toBeNull();
    renderer.act(() => { tree.unmount(); });
  });

  it('owns the touch surface (above the splash, full-bleed, modal to accessibility)', () => {
    const tree = mount();
    renderer.act(() => { beginOtaApplying(); });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('"pointerEvents":"auto"');
    expect(json).toContain('"zIndex":2000');
    expect(json).toContain('"accessibilityViewIsModal":true');
    renderer.act(() => { tree.unmount(); });
  });
});

describe('wiring', () => {
  const app = src('App.tsx');
  it('is mounted on the pre-hydration render AND at the root, inside a SilentBoundary', () => {
    expect(app).toContain("import { OtaApplyingOverlay } from './app/components/OtaApplyingOverlay';");
    expect(app.match(/<OtaApplyingOverlay \/>/g)?.length).toBe(2);
    expect(app).toContain('<SilentBoundary tag="OtaApplyingOverlay">');
  });

  it('the apply path raises the state before any status/teardown/reload, and only after discovery', () => {
    const ota = src('app', 'updates', 'checkAndApplyOTA.ts');
    const begin = ota.indexOf('beginOtaApplying()');
    expect(begin).toBeGreaterThan(ota.indexOf('return \'pending\''));
    expect(begin).toBeLessThan(ota.indexOf("onStatus?.('Saving progress…')"));
    expect(begin).toBeLessThan(ota.indexOf('await Updates.reloadAsync()'));
    expect(ota.indexOf('await presentedFrame()')).toBeGreaterThan(begin);
    expect(ota.indexOf('await presentedFrame()')).toBeLessThan(ota.indexOf("onStatus?.('Saving progress…')"));
  });
});
