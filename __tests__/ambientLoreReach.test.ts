// Lore-reach probe (OTA 185). The ambient-flavor branch in
// narrateAmbientFind should surface a Tartarian lore beat on ~25%
// of searches — vs the pre-fix ~3% rate (which was 12% × the
// narrow isSearchable subset of nouns most players don't type).
//
// This test drives a large batch of searches against varied nouns
// and asserts at least 20% of them produce something beyond the
// generic 5-line flavor pool.

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
import { isSearchable } from '../app/engine/interactionTags';

describe('ambient lore reach (OTA 185)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("searches across varied nouns surface lore on ~20%+ of attempts", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'LoreProbe', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Force a known scene with the nouns the playtester actually
    // typed (chain, lever, spike, emitter, portcullis) so we hit
    // the widened searchable + the new ambient-flavor branch.
    const scene = store.getState().currentScene!;
    const testNouns = ['broken chain', 'lever', 'spike', 'pulse emitter', 'portcullis'];
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: testNouns,
        displayedAmbientNouns: testNouns,
        hooks: [], // no hook plant to dilute the signal
      },
    });

    // Pre-fix lore reach was ~3% per search (12% × narrow searchable
    // subset which excluded all 5 of these nouns). Post-OTA-185,
    // ambient-flavor fires at 25% on any noun + hidden-text at 25%
    // on the now-widened searchable subset (4 of 5 qualify), so
    // expected reach is ~40%. Lower floor at 20% leaves headroom
    // for binomial variance across 100 samples.
    let lorelines = 0;
    const totalSamples = 100;

    for (let i = 0; i < totalSamples; i++) {
      const noun = testNouns[i % testNouns.length]!;
      const beforeCount = store.getState().gameLog.length;
      store.getState().submitPlayerAction(`search the ${noun}`);
      const newEntries = store.getState().gameLog.slice(beforeCount);
      // Generic flavor lines start with "You examine / study / inspect /
      // look closer / crouch beside". A lore beat is any 'world' entry
      // that doesn't match those prefixes AND isn't an Arbiter / system
      // / debug line. Hidden-text reveals start with "You run a hand /
      // crouch low / feel the / catch a glint / tilt your head / wipe
      // the". Either is a lore reveal for the purposes of this probe.
      const worldLines = newEntries.filter((e) => e.channel === 'world').map((e) => e.text);
      const hasLore = worldLines.some((t) =>
        !/^You (?:examine|study|inspect|look closer at|crouch beside)/.test(t)
        || /Reclaimer|Aetherstone|Tartarian|Aether|Forgotten Order|Mud Dweller|Drakova|flood|buried|mud-glass|Sentinel|wraith|Etheric Undead/i.test(t),
      );
      if (hasLore) lorelines++;
    }

    expect(lorelines / totalSamples).toBeGreaterThan(0.20);
  });

  it("widened isSearchable covers the playtester's nouns", () => {
    // Pre-OTA-185, lever / chain / spike / emitter / portcullis all
    // returned false. Each one disqualified them from the hidden-text
    // reveal entirely. Post-fix all five qualify.
    expect(isSearchable('lever')).toBe(true);
    expect(isSearchable('broken chain')).toBe(true);
    expect(isSearchable('spike')).toBe(true);
    expect(isSearchable('pulse emitter')).toBe(true);
    expect(isSearchable('portcullis')).toBe(true);
  });
});
