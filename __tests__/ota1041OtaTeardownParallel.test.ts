/**
 * OTA-1041 — the OTA teardown ran its four native disposes in series.
 *
 * Each dispose gets its own 3-second deadline (OTA-243, added because one of
 * them could hang forever). In series that is a 12-second worst case on a
 * screen showing nothing but a static "Releasing resources…" — which is the
 * leading suspect for the reported FabricUIManager.markActiveTouchForTag NPE:
 * the player taps what looks like a dead screen, the touch dispatches into a
 * surface teardown has already destroyed, SurfaceMountingManager is null.
 *
 * The four subsystems (expo-av, ONNX Runtime, llama.rn, executorch) are
 * independent, so they now race their deadlines concurrently. This test holds
 * that property: it gives each mocked dispose a real delay and asserts the
 * wall-clock is one delay, not four.
 */
const mockOrder: string[] = [];
const MOCK_DELAY = 150;

const mockSlow = (label: string) =>
  jest.fn(async () => {
    mockOrder.push(`start:${label}`);
    await new Promise((r) => setTimeout(r, MOCK_DELAY));
    mockOrder.push(`end:${label}`);
  });

const mockDisposeAudio = mockSlow('audio');
const mockShutdownCognitive = mockSlow('cognitive');
const mockShutdownQwen = mockSlow('qwen');
const mockDisposePiper = mockSlow('piper');
const mockStopController = jest.fn(() => { mockOrder.push('sync:controller'); });
const mockStopTTS = jest.fn(() => { mockOrder.push('sync:tts'); });
const mockReload = jest.fn(async () => { mockOrder.push('reload'); });

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-updates', () => ({
  get isEnabled() { return true; },
  reloadAsync: (...a: unknown[]) => mockReload(...(a as [])),
}));
jest.mock('../app/audio/AudioManager', () => ({ disposeAudio: () => mockDisposeAudio() }));
jest.mock('../app/voice/TTSController', () => ({ stopTTSController: () => mockStopController() }));
jest.mock('../app/voice/TTSManager', () => ({ stopAndClear: () => mockStopTTS() }));
jest.mock('../app/voice/PiperTTSManager', () => ({ disposePiperEngine: () => mockDisposePiper() }));
jest.mock('../app/state/gameStore', () => ({
  useGameStore: {
    getState: () => ({
      persist: async () => {},
      shutdownCognitive: () => mockShutdownCognitive(),
      shutdownQwen: () => mockShutdownQwen(),
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkAndApplyOTA } = require('../app/updates/checkAndApplyOTA');

describe('OTA-1041 — native teardown runs concurrently', () => {
  beforeEach(() => { mockOrder.length = 0; jest.clearAllMocks(); });

  it('completes in about one dispose delay, not four', async () => {
    const t0 = Date.now();
    // skipFetch goes straight to persist -> teardown -> mockReload, which is
    // exactly the sequence under test.
    const result = await checkAndApplyOTA({ skipFetch: true });
    const elapsed = Date.now() - t0;

    expect(result).toBe('applied');
    // Series would be >= 4 * 150 = 600ms. Parallel is ~150ms. 400ms sits well
    // clear of both, so this fails loudly if the awaits go back to sequential.
    expect(elapsed).toBeLessThan(400);
  });

  it('starts all four disposes before any of them finishes', async () => {
    await checkAndApplyOTA({ skipFetch: true });

    const firstEnd = mockOrder.findIndex((e) => e.startsWith('end:'));
    const starts = mockOrder.slice(0, firstEnd).filter((e) => e.startsWith('start:'));
    expect(starts).toHaveLength(4);
  });

  it('calls every dispose exactly once', async () => {
    await checkAndApplyOTA({ skipFetch: true });
    expect(mockDisposeAudio).toHaveBeenCalledTimes(1);
    expect(mockShutdownCognitive).toHaveBeenCalledTimes(1);
    expect(mockShutdownQwen).toHaveBeenCalledTimes(1);
    expect(mockDisposePiper).toHaveBeenCalledTimes(1);
  });

  it('stops the TTS controller and player before audio teardown begins', async () => {
    // mockStopTTS releases the expo-av Sound that playPcm created; running it
    // after mockDisposeAudio had already started would race a live clip.
    await checkAndApplyOTA({ skipFetch: true });
    expect(mockOrder.indexOf('sync:controller')).toBeLessThan(mockOrder.indexOf('start:audio'));
    expect(mockOrder.indexOf('sync:tts')).toBeLessThan(mockOrder.indexOf('start:audio'));
  });

  it('reloads only after every dispose has settled', async () => {
    await checkAndApplyOTA({ skipFetch: true });
    const reloadIdx = mockOrder.indexOf('reload');
    for (const label of ['audio', 'cognitive', 'qwen', 'piper']) {
      expect(mockOrder.indexOf(`end:${label}`)).toBeLessThan(reloadIdx);
    }
  });
});
