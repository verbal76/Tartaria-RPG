// OTA-1100 — two tuning changes ported from the sibling line (parts B + C; the
// Guardian-scaling part A is HAL/golem-only, no Guardians here):
//   B. The dodge stance no longer grants true invulnerability: an enemy NATURAL 20
//      lands through a dodge (the same 5% floor the AC path honors) — "never
//      invulnerable, a high miss rate is fine".
//   C. Returning a faction SIGIL establishes trade rapport (the CHA vendor discount),
//      replacing the bespoke fetch-a-relic rapport quest.

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
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore, runEnemyGroupCounters } from '../app/state/gameStore';
import { hasFactionRapport, rapportQuestId } from '../app/engine/factionRapport';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1100 B — dodge is not invulnerability: a NAT 20 lands through it', () => {
  it('an enemy natural 20 hits a dodging, sky-high-AC player', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Ghost', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    const p0 = useGameStore.getState().player!;
    const scene = useGameStore.getState().currentScene!;
    const enemy = { name: 'Reaver', damage: '1d6', abilityPoint: 'Strength 4', hp: 50, type: 'brute', loot: [], rarity: 'Common', traits: [] };
    useGameStore.setState({
      player: {
        ...p0, hp: 100, hpMax: 100, ac: 900,
        stats: { ...p0.stats, dexterity: 99 },
        statusEffects: [{ kind: 'dodging', remainingRounds: 2, label: 'dodging' } as never],
      },
      currentScene: {
        ...scene, enemies: [enemy as never], enemyHps: [50], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      },
    });

    const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.9999);
    try {
      runEnemyGroupCounters(
        useGameStore.getState,
        (fn) => useGameStore.setState(fn as never),
        useGameStore.getState().player!,
      );
    } finally {
      rnd.mockRestore();
    }

    const after = useGameStore.getState().player!;
    expect(after.hp).toBeLessThan(100);
  });
});

describe('OTA-1100 C — returning a sigil unlocks that faction\'s CHA trade rapport', () => {
  it('turnInSigil marks rapport complete so the vendor discount can apply', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Trader', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    const p0 = useGameStore.getState().player!;
    const sigil: InventoryItem = {
      id: 'sig_fo', name: 'Forgotten Order Sigil', kind: 'misc', quantity: 1, rarity: 'Common',
      description: 'A slain initiate\'s crest.', tags: ['sigil', 'forgotten_order'],
    };
    useGameStore.setState({
      player: {
        ...p0, currentLocationId: 'hidden_market',
        inventory: [...p0.inventory, sigil],
        completedFactionQuestIds: [],
      },
    });

    expect(hasFactionRapport(useGameStore.getState().player!.completedFactionQuestIds, 'forgotten_order')).toBe(false);

    useGameStore.getState().turnInSigil('sig_fo');

    const after = useGameStore.getState().player!;
    expect(after.completedFactionQuestIds).toContain(rapportQuestId('forgotten_order'));
    expect(hasFactionRapport(after.completedFactionQuestIds, 'forgotten_order')).toBe(true);
    expect(after.inventory.find((i) => i.id === 'sig_fo')).toBeFalsy();
  });
});
