jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * QOL #218 — the multi-investigation narration order.
 *
 * INVESTIGATE ALL fires several `investigate <noun>` submissions back to
 * back. Each one has its own chance at an unsolicited Arbiter aside (the
 * "flavor" line every template-path narration can produce). Printed as it
 * happened, a mid-batch aside lands BETWEEN two investigate results — the
 * sweep looks interrupted rather than delivering N results in a row.
 *
 * The fix does not touch the aside itself: same budget gate
 * (`takeArbiterFlavorBudget`, one per tile, 25s apart), same odds of it
 * being produced at all, same text. It only changes WHERE a deferred call's
 * line ends up — `gameStore.pendingArbiterLines` instead of the log,
 * appended for real only once `flushPendingArbiterLines()` runs (which
 * ExplorationScreen's sweep calls once, after its last step).
 *
 * This suite exercises the real pipeline end to end at the
 * `narrateViaArbiter` / `speakArbiterFlavor` level — the one door every
 * unsolicited aside goes through (per narration.ts's own comment on
 * `speakArbiterFlavor`) — rather than re-deriving it from source text, so a
 * refactor that kept the words but broke the wiring would still fail this.
 */

import { useGameStore } from '../app/state/gameStore';
import { narrateViaArbiter, _resetArbiterFlavorBudget } from '../app/ai/narration';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(60_000);

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  // Each test in this file re-launches its own game against the ONE
  // module-level store singleton. `pendingArbiterLines` is not itself
  // under test here — reset it so a prior test's queue can't leak into
  // this one, the same isolation `_resetArbiterFlavorBudget()` gives the
  // budget clock below.
  store.setState({ pendingArbiterLines: [] });
  return store;
}

function lastArbiterLine(store: typeof useGameStore): string | undefined {
  const log = store.getState().gameLog;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i]!.channel === 'arbiter') return log[i]!.text;
  }
  return undefined;
}

describe('QOL #218 — a deferred Arbiter aside queues instead of printing mid-batch', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  beforeEach(() => { _resetArbiterFlavorBudget(); });

  it('deferArbiter:true queues the line on pendingArbiterLines, not the log', async () => {
    const store = await boot('Investigator One');
    const get = () => store.getState();
    const set = (partial: any) => store.setState(partial);
    const before = lastArbiterLine(store);

    await narrateViaArbiter(get, set, 'ⓆⓁ218 marker line A', 'investigate', { deferArbiter: true });

    // The gate this hits is deterministic in-test: qwen is never booted, so
    // isReady() is false and every call takes the template/flavor path —
    // the exact path `speakArbiterFlavor` exists to gate.
    expect(store.getState().pendingArbiterLines).toContain('ⓆⓁ218 marker line A');
    // Nothing reached the visible log yet — the whole point of deferring.
    expect(lastArbiterLine(store)).toBe(before);
  });

  it('flushPendingArbiterLines() then prints the queued line, in order, once', async () => {
    const store = await boot('Investigator Two');
    const get = () => store.getState();
    const set = (partial: any) => store.setState(partial);

    await narrateViaArbiter(get, set, 'ⓆⓁ218 marker line B', 'investigate', { deferArbiter: true });
    expect(store.getState().pendingArbiterLines).toEqual(['ⓆⓁ218 marker line B']);

    store.getState().flushPendingArbiterLines();

    expect(store.getState().pendingArbiterLines).toEqual([]);
    expect(lastArbiterLine(store)).toBe('ⓆⓁ218 marker line B');
  });

  it('flushing an empty queue is a silent no-op — nothing prints, nothing throws', async () => {
    const store = await boot('Investigator Three');
    const before = lastArbiterLine(store);

    expect(store.getState().pendingArbiterLines).toEqual([]);
    expect(() => store.getState().flushPendingArbiterLines()).not.toThrow();
    expect(lastArbiterLine(store)).toBe(before);
    expect(store.getState().pendingArbiterLines).toEqual([]);
  });

  it('without deferArbiter, the same call still appends immediately — ordinary play is untouched', async () => {
    const store = await boot('Investigator Four');
    const get = () => store.getState();
    const set = (partial: any) => store.setState(partial);

    await narrateViaArbiter(get, set, 'ⓆⓁ218 marker line C (undeferred)', 'investigate');

    expect(lastArbiterLine(store)).toBe('ⓆⓁ218 marker line C (undeferred)');
    // The queue this feature added is not a shadow copy of everything the
    // Arbiter ever says — an undeferred call never touches it.
    expect(store.getState().pendingArbiterLines).toEqual([]);
  });

  it('the per-tile budget still gates a deferred call exactly as it gates a live one', async () => {
    const store = await boot('Investigator Five');
    const get = () => store.getState();
    const set = (partial: any) => store.setState(partial);

    await narrateViaArbiter(get, set, 'ⓆⓁ218 marker line D', 'investigate', { deferArbiter: true });
    expect(store.getState().pendingArbiterLines).toEqual(['ⓆⓁ218 marker line D']);

    // Same tile, budget already spent (ARBITER_FLAVOR_PER_TILE === 1) — a
    // second call within the 25s gap must be held, deferred or not.
    await narrateViaArbiter(get, set, 'ⓆⓁ218 marker line E', 'investigate', { deferArbiter: true });
    expect(store.getState().pendingArbiterLines).toEqual(['ⓆⓁ218 marker line D']);
  });
});
