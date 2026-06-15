// OTA-614 — rest must never REDUCE stamina.
//
// Bug: the live rest path computed stamGain = Math.min(stamRoom, hours), where
// stamRoom = effectiveStaminaMax - stamina and effectiveStaminaMax is the raw
// cap MINUS the hunger penalty. When hunger shrank the effective cap below
// current stamina, stamRoom went negative and rest DRAINED stamina down to the
// hunger cap (e.g. 13 -> 10), which read as "rest restored nothing / took
// stamina". Fix: clamp stamGain to >= 0, and refuse a pointless rest with a
// hunger-aware reason instead of the misleading "your wind is full".

jest.setTimeout(20000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { useGameStore } from '../app/state/gameStore';

async function boot() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'P', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}

async function restFrom(patch: { stamina: number; hungerStaminaPenalty: number; corruption: number }) {
  useGameStore.setState((s) => ({ player: s.player ? { ...s.player, ...patch } : s.player }));
  const before = useGameStore.getState().player!.stamina;
  await useGameStore.getState().submitPlayerAction('rest');
  return { before, after: useGameStore.getState().player!.stamina };
}

describe('OTA-614 — rest never reduces stamina', () => {
  it('restores stamina normally when not hungry and below max', async () => {
    await boot();
    const max = useGameStore.getState().player!.staminaMax;
    const { before, after } = await restFrom({ stamina: Math.max(1, max - 5), hungerStaminaPenalty: 0, corruption: 0 });
    expect(after).toBeGreaterThan(before);
  });

  it('does NOT drain stamina when hunger has shrunk the cap below current stamina (corruption keeps the rest active)', async () => {
    await boot();
    const max = useGameStore.getState().player!.staminaMax;
    // stamina above the hunger-reduced cap (max-5), but below the raw max; corruption>0 so rest proceeds.
    const { before, after } = await restFrom({ stamina: max - 2, hungerStaminaPenalty: 5, corruption: 2 });
    expect(after).toBeGreaterThanOrEqual(before); // never negative
  });

  it('refuses a pointless rest (hunger-capped, no corruption) without changing stamina', async () => {
    await boot();
    const max = useGameStore.getState().player!.staminaMax;
    const { before, after } = await restFrom({ stamina: max - 2, hungerStaminaPenalty: 5, corruption: 0 });
    expect(after).toBe(before);
  });
});
