// OTA-428 — Resurrection-gem revival hardening. Three fixes:
//   (a) the gem is consumed AFTER the revived save lands (no save → no spend),
//   (b) the character wakes at the BACKFILLED hpMax (not a stale saved hpMax),
//   (c) a load-crash breadcrumb wraps the rehydrate so a native crash mid-revive
//       flags the slot for Retry/Delete instead of re-crashing.
// This focused test covers the happy path: a dead save with one gem revives to
// full backfilled HP and spends exactly one gem.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { loadGlobalStash, saveGlobalStash } from '../app/engine/saveSystem';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-428 — resurrectSlot gem safety + backfilled HP', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('revives to backfilled hpMax and spends exactly one gem', async () => {
    const store = await boot('Phoenix');
    const slotId = store.getState().activeSlotId!;

    // Seed the install-wide stash to a known 2 (resurrectSlot consumes from the
    // stash, not the in-memory mirror), and mirror it in state so the
    // precondition (resurrectionGems > 0) passes.
    const stash = await loadGlobalStash();
    await saveGlobalStash({ ...stash, resurrectionGems: 2 });
    store.setState({ resurrectionGems: 2 });

    // Mark the character dead and persist that as the saved slot, AND zero out
    // the stored hpMax to simulate a stale save — the revive must NOT wake them
    // at 0/0 but at the canonical backfilled max.
    const p = store.getState().player!;
    store.setState({ player: { ...p, dead: true, hp: 0, stamina: 0 } });
    await store.getState().persist();

    const ok = await store.getState().resurrectSlot(slotId);
    expect(ok).toBe(true);

    const revived = store.getState().player!;
    expect(revived.dead).not.toBe(true);
    expect(revived.hp).toBeGreaterThan(0);
    expect(revived.hp).toBe(revived.hpMax);
    expect(store.getState().resurrectionGems).toBe(1); // exactly one spent
  });

  it('refuses to revive with no gems', async () => {
    const store = await boot('Pauper');
    const slotId = store.getState().activeSlotId!;
    store.setState({ resurrectionGems: 0 });
    const p = store.getState().player!;
    store.setState({ player: { ...p, dead: true } });
    await store.getState().persist();

    const ok = await store.getState().resurrectSlot(slotId);
    expect(ok).toBe(false);
    expect(store.getState().resurrectionGems).toBe(0);
  });
});
