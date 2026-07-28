// OTA-841 [did-you-mean] — when the parser can't confidently resolve an input it
// already shows a "Try: …" text hint; this surfaces the SAME runnable commands as a
// store-backed list (parseSuggestions) the UI renders as a tappable chip row, so the
// player taps instead of retyping. These lock the state contract: a low-confidence
// parse populates it, and the next action clears it.

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

async function freshGame(name: string) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name, raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}

it('OTA-841 — starts with no disambiguation chips', async () => {
  await freshGame('Parser');
  expect(useGameStore.getState().parseSuggestions).toEqual([]);
});

it('OTA-841 — an unresolvable input populates parseSuggestions (runnable commands)', async () => {
  await freshGame('Parser2');
  await useGameStore.getState().submitPlayerAction('florble the quux zzzt');
  const sugg = useGameStore.getState().parseSuggestions;
  expect(Array.isArray(sugg)).toBe(true);
  expect(sugg.length).toBeGreaterThan(0);
  expect(sugg.length).toBeLessThanOrEqual(3);
  // Each suggestion is a non-empty command string.
  expect(sugg.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
});

it('OTA-841 — the next action clears the stale chips', async () => {
  await freshGame('Parser3');
  await useGameStore.getState().submitPlayerAction('florble the quux zzzt');
  expect(useGameStore.getState().parseSuggestions.length).toBeGreaterThan(0);
  // A subsequent submit (e.g. a real look) must clear the previous suggestions.
  await useGameStore.getState().submitPlayerAction('look around');
  expect(useGameStore.getState().parseSuggestions).toEqual([]);
});
