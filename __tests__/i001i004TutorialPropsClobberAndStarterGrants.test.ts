// I-001 (tutorial natural-finalization clobbers tutorialPropsConsumed) and
// I-004 (tutorial skip grants zero starter items) — production defect repair.
// Both share one root cause in skipTutorial() (gameStore.ts): its patch used
// to REPLACE tutorialPropsConsumed wholesale with a stale 4-key literal
// instead of merging onto the live object. That had two effects:
//
//   I-001: advanceTutorial()'s own off-the-end fallback calls skipTutorial()
//   on ordinary NATURAL completion (not just a SKIP-button tap), so a player
//   who finished every beat legitimately still lost the real vest/cap grant
//   flags a normal playthrough had just set moments earlier.
//
//   I-004: the literal stamped cudgel/rope true BEFORE the starter-grant
//   block below it ran. grantTutorialItem()'s own guard re-reads LIVE state
//   (`if (get().tutorialPropsConsumed[id]) return null;`), so by the time the
//   grant block called it, the flag already read true and every grant
//   silently no-opped — a player who tapped SKIP before collecting anything
//   started the game with none of the starter items skipTutorial() intends
//   to compensate them with.
//
// Fix: the literal now merges onto the live flags (`{ ...s.tutorialPropsConsumed,
// chestPlate: true, note: true }`), preserving any already-true flags and no
// longer pre-stamping cudgel/rope before their own grant block runs.
// chestPlate/note are left forced exactly as before (chestPlate has no grant
// step in this path — see I-005/Defect C, untouched; note is never granted on
// any current path either way) so no other current behavior changes.
//
// This test drives the real production door: skipTutorial(), the same store
// action the SKIP TUTORIAL button and the natural-finalization fallback both
// call.

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

const store = useGameStore;
const get = () => store.getState();

describe('I-001/I-004 — skipTutorial() merges onto live flags and actually grants starter items', () => {
  it('I-004: SKIP before collecting anything actually grants the Cudgel and Rope (not just the flag)', async () => {
    await get().hydrate();
    await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });

    // Immediate skip — nothing has been collected yet.
    get().skipTutorial();

    const consumed = get().tutorialPropsConsumed;
    expect(consumed.cudgel).toBe(true);
    expect(consumed.rope).toBe(true);

    const inv = get().player?.inventory ?? [];
    expect(inv.some((i) => /cudgel/i.test(i.name))).toBe(true);
    expect(inv.some((i) => /rope/i.test(i.name))).toBe(true);
  });

  it('I-001: SKIP after vest/cap were already legitimately granted preserves those flags', async () => {
    await get().hydrate();
    await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });

    // Simulate a normal playthrough having already granted the vest/cap
    // (the armor and screen_pick beats, exercised end-to-end elsewhere in
    // canonicalTutorialFidelity.test.ts) before the natural-finalization
    // fallback calls skipTutorial() on the same run.
    store.setState((s) => ({
      tutorialPropsConsumed: { ...s.tutorialPropsConsumed, vest: true, cap: true },
    }));

    get().skipTutorial();

    const consumed = get().tutorialPropsConsumed;
    expect(consumed.vest).toBe(true);
    expect(consumed.cap).toBe(true);
  });

  it('negative control: SKIP after cudgel/rope were already granted does not double-grant them', async () => {
    await get().hydrate();
    await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });

    store.setState((s) => ({
      tutorialPropsConsumed: { ...s.tutorialPropsConsumed, cudgel: true, rope: true },
    }));
    const invBefore = (get().player?.inventory ?? []).filter((i) => /cudgel/i.test(i.name)).length;

    get().skipTutorial();

    const invAfter = (get().player?.inventory ?? []).filter((i) => /cudgel/i.test(i.name)).length;
    expect(invAfter).toBe(invBefore);
  });
});
