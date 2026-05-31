// OTA 047 — Regression for the apply-button ERR_UPDATES_FETCH bug.
// The boot pass downloads the bundle via fetchOnly=true and sets
// pendingOTAUpdate. The title-screen apply tap then ran a redundant
// check+fetch which failed on transient network hiccups even though
// the bundle was already staged. Fix: tap path passes skipFetch=true
// and the helper goes straight to teardown + mockReloadAsync.
//
// This test verifies the function-shape contract:
//   - skipFetch=true never calls mockCheckForUpdateAsync / mockFetchUpdateAsync
//   - skipFetch=false (default) still calls both (no regression)
//   - mockReloadAsync is invoked in both happy paths
//   - fetch failure during the non-skipFetch path is caught and
//     surfaced via onError as 'errored'

const mockCheckForUpdateAsync = jest.fn();
const mockFetchUpdateAsync = jest.fn();
const mockReloadAsync = jest.fn();

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: (...args: unknown[]) => mockCheckForUpdateAsync(...args),
  fetchUpdateAsync: (...args: unknown[]) => mockFetchUpdateAsync(...args),
  reloadAsync: (...args: unknown[]) => mockReloadAsync(...args),
}));

// Stub out everything checkAndApplyOTA touches during teardown so
// the test stays focused on the fetch+reload sequencing.
jest.mock('../app/audio/AudioManager', () => ({
  disposeAudio: jest.fn(async () => {}),
}));
jest.mock('../app/voice/TTSController', () => ({
  stopTTSController: jest.fn(),
}));
jest.mock('../app/voice/TTSManager', () => ({
  stopAndClear: jest.fn(),
}));
jest.mock('../app/voice/PiperTTSManager', () => ({
  disposePiperEngine: jest.fn(async () => {}),
}));
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

describe('OTA 047 — checkAndApplyOTA skipFetch path', () => {
  beforeEach(() => {
    mockCheckForUpdateAsync.mockReset();
    mockFetchUpdateAsync.mockReset();
    mockReloadAsync.mockReset();
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockFetchUpdateAsync.mockResolvedValue(undefined);
    mockReloadAsync.mockResolvedValue(undefined);
  });

  it('skipFetch=true: bypasses check + fetch, runs mockReloadAsync directly', async () => {
    const result = await checkAndApplyOTA({ skipFetch: true });
    expect(mockCheckForUpdateAsync).not.toHaveBeenCalled();
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(result).toBe('applied');
  });

  it('default path (no skipFetch): calls check + fetch + reload in order', async () => {
    const result = await checkAndApplyOTA({});
    expect(mockCheckForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockFetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    expect(result).toBe('applied');
  });

  it('default path with mockFetchUpdateAsync failure surfaces ERR_UPDATES_FETCH via onError', async () => {
    mockFetchUpdateAsync.mockRejectedValue(
      Object.assign(new Error('Failed to download new update'), { code: 'ERR_UPDATES_FETCH' }),
    );
    const onError = jest.fn();
    const result = await checkAndApplyOTA({ onError });
    expect(result).toBe('errored');
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const msg = onError.mock.calls[0]![0] as string;
    expect(msg).toMatch(/Failed to download new update/);
    expect(msg).toMatch(/ERR_UPDATES_FETCH/);
  });

  it('skipFetch=true survives a fetch-side failure mode by never calling fetch', async () => {
    // Even if expo-updates is rigged to fail on fetch, skipFetch
    // sidesteps it entirely — this is the actual fix for the
    // ERR_UPDATES_FETCH the player hit on the apply tap.
    mockFetchUpdateAsync.mockRejectedValue(new Error('Failed to download new update'));
    const onError = jest.fn();
    const result = await checkAndApplyOTA({ skipFetch: true, onError });
    expect(mockFetchUpdateAsync).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result).toBe('applied');
  });
});
