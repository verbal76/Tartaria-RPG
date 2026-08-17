// ⚠ OTA-1337 — THE SIX-LINE STANDING WALL IS ONE LINE NOW.
//
// Owner: replace the wall with *"one vague Tartarian line — 'many people view you
// differently now'"* plus *"threshold-only lines when a tier is actually
// crossed"* — and he explicitly dropped "just organize the wall better" (*"we
// still get a wall of text, it's just more organized"*). The rules this pins:
//   · a SINGLE-faction change keeps its one precise line (one line ≠ a wall);
//   · a multi-faction burst collapses to the one vague line — no per-faction rows;
//   · an OTA-1336 ladder-tier crossing is ALWAYS named, both directions, with the
//     hostile crossing keeping OTA-1181's "they hunt you now" warning.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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

import { useGameStore, logRepChanges } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Shiftline', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  // The OTA-877 one-time intro must not pollute the assertions below.
  store.setState((s) => ({ worldMemory: { ...s.worldMemory, factionRepIntroShown: true } }));
  return store;
}

const linesSince = (from: number) =>
  useGameStore.getState().gameLog.slice(from).map((e) => String((e as { text: string }).text));

describe('OTA-1337 — one vague line, named thresholds', () => {
  it('⚠⚠ a multi-faction burst is ONE line, not a wall', async () => {
    const store = await boot();
    const from = store.getState().gameLog.length;
    logRepChanges(() => store.getState(), [
      // 8 → 14 crosses the Known line; the two dips stay inside neutral.
      { factionId: 'reclaimers_guild', delta: 6, newStanding: 14 },
      { factionId: 'forgotten_order', delta: -2, newStanding: -12 },
      { factionId: 'conspiracy_architects', delta: -2, newStanding: -14 },
    ]);
    const lines = linesSince(from);
    expect(lines.filter((l) => l.includes('many people view you differently now')).length).toBe(1);
    // No per-faction "standing +N (now M)" rows in a burst.
    expect(lines.some((l) => /standing [+-−]?\d+ \(now/.test(l))).toBe(false);
    // 14 crosses into Known — that threshold IS named.
    expect(lines.some((l) => l.includes('KNOWN'))).toBe(true);
  });

  it('⚠ a single-faction change keeps its one precise line', async () => {
    const store = await boot();
    const from = store.getState().gameLog.length;
    logRepChanges(() => store.getState(), [
      { factionId: 'reclaimers_guild', delta: 3, newStanding: 5 },
    ]);
    const lines = linesSince(from);
    expect(lines.some((l) => l.includes('standing +3 (now 5)'))).toBe(true);
    expect(lines.some((l) => l.includes('many people view you differently'))).toBe(false);
  });

  it('⚠⚠ the hostile crossing keeps its teeth — "they hunt you" is said out loud', async () => {
    const store = await boot();
    const from = store.getState().gameLog.length;
    logRepChanges(() => store.getState(), [
      { factionId: 'forgotten_order', delta: -4, newStanding: -26 },
      { factionId: 'reclaimers_guild', delta: 2, newStanding: 2 },
    ]);
    const lines = linesSince(from);
    expect(lines.some((l) => l.includes('HOSTILE') && l.toLowerCase().includes('hunt'))).toBe(true);
  });

  it('⚠ climbing back out of hostility is named too', async () => {
    const store = await boot();
    const from = store.getState().gameLog.length;
    logRepChanges(() => store.getState(), [
      { factionId: 'forgotten_order', delta: 6, newStanding: -22 },
    ]);
    expect(linesSince(from).some((l) => l.includes('no longer hunts you'))).toBe(true);
  });

  it('no tier crossed, no threshold line — the burst stays a single sentence', async () => {
    const store = await boot();
    const from = store.getState().gameLog.length;
    logRepChanges(() => store.getState(), [
      { factionId: 'reclaimers_guild', delta: 2, newStanding: 6 },
      { factionId: 'forgotten_order', delta: -1, newStanding: -6 },
    ]);
    const lines = linesSince(from);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('many people view you differently now');
  });
});
