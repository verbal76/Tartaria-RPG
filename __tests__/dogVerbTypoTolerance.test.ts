// OTA-158 — regression lock for drunk-typo tolerance on dog-apply +
// dog-call verbs. Pre-fix, the stress sweep (drunkSpelling) flagged
// `fed dog ration`, `helll dog ration`, `cll dog` all reaching the
// regex layer with an unrecognized leading verb and silently
// returning false (no log, no action). Fix: normalize the leading
// verb token through a small drunk-run-collapse + Levenshtein-1
// fuzzy match against the canonical verbs (`feed` / `heal` / `call`
// / `use`) before the regex runs.

jest.setTimeout(15000);

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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';

async function bootstrapWithDog() {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'DogTester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  // Inject a dog directly so we can test the verb-tolerance without
  // running through the full rescue flow.
  useGameStore.setState((s) => ({
    player: s.player
      ? {
          ...s.player,
          dog: {
            id: 'test_dog',
            name: 'Rocky',
            breed: 'mongrel',
            sex: { raw: 'boy', pronoun: 'he' },
            startingProfile: 'mongrel',
            hp: 10,
            hpMax: 14,
            stats: { strength: 10, dexterity: 10, intelligence: 10 },
            statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
            loyalty: 50,
            lastFedAtHour: 0,
            equipped: { vest: null },
            status: 'with_player',
          },
          inventory: [
            ...s.player.inventory,
            { id: 'ration_1', name: 'Trail Rations', kind: 'consumable', rarity: 'Common', quantity: 5 },
          ],
        }
      : s.player,
  }));
}

describe('OTA-158 — dog verbs tolerate leading-token typos', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('`fed dog Trail Rations` reaches the feed handler', async () => {
    await bootstrapWithDog();
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('fed dog Trail Rations');
    const after = useGameStore.getState().gameLog;
    const added = after.slice(before).map((e) => e.text).join('\n');
    // Pre-fix this was silent. Post-fix the feed handler logs a
    // world line about Rocky eating.
    expect(added.toLowerCase()).toMatch(/rocky|eat|ration|feed/);
  });

  it('`helll dog Trail Rations` reaches the heal handler', async () => {
    await bootstrapWithDog();
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('helll dog Trail Rations');
    const after = useGameStore.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(after.length).toBeGreaterThan(0);
  });

  it('`cll dog` opens the CallDogModal', async () => {
    await bootstrapWithDog();
    expect(useGameStore.getState().callDogModalOpen).toBe(false);
    useGameStore.getState().submitPlayerAction('cll dog');
    expect(useGameStore.getState().callDogModalOpen).toBe(true);
  });

  it('`feeed dog Trail Rations` (held-key typo) reaches feed handler', async () => {
    await bootstrapWithDog();
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('feeed dog Trail Rations');
    const after = useGameStore.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(after.toLowerCase()).toMatch(/rocky|eat|ration|feed/);
  });

  it('legitimate `feed dog Trail Rations` still works (no regression)', async () => {
    await bootstrapWithDog();
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('feed dog Trail Rations');
    const after = useGameStore.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    expect(after.toLowerCase()).toMatch(/rocky|eat|ration|feed/);
  });
});
