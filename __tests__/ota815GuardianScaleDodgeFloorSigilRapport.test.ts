// OTA-815 — three tuning changes from the playtest conversation:
//   A. Core Guardians now scale to the player's actual POWER, not just kill-count,
//      so an over-leveled side-quester can't mash an early Guardian.
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
import {
  spawnGuardianForCapital,
  guardianPlayerPower,
  guardianOverLevel,
} from '../app/engine/coreGuardians';
import { hasFactionRapport, rapportQuestId } from '../app/engine/factionRapport';
import type { PlayerCharacter, InventoryItem, Stats } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const STATS = (over: Partial<Stats> = {}): Stats => ({
  strength: 8, dexterity: 8, intelligence: 8, wisdom: 8, charisma: 8, stealth: 8, ...over,
} as Stats);

// A minimal player good enough for the pure Guardian spawner (reads stats, hpMax,
// mainQuest.coresRecovered).
const mkPlayer = (stats: Stats, hpMax: number): PlayerCharacter =>
  ({ stats, hpMax, mainQuest: { coresRecovered: [] } } as unknown as PlayerCharacter);

describe('OTA-815 A — Guardians scale to player power, not just kill-count', () => {
  it('an over-leveled player faces a tougher Tier-1 Guardian than a fresh arrival', () => {
    const fresh = mkPlayer(STATS(), 30);
    const endgame = mkPlayer(STATS({ strength: 25 }), 90);

    // The over-level factor is 1.0 at/under the curve and climbs (capped 1.9) above it.
    expect(guardianOverLevel(fresh, 1)).toBeCloseTo(1.0, 5);
    expect(guardianOverLevel(endgame, 1)).toBeGreaterThan(1.5);
    expect(guardianPlayerPower(endgame)).toBeGreaterThan(guardianPlayerPower(fresh));

    const gFresh = spawnGuardianForCapital(fresh, 'asgardar')!;
    const gEnd = spawnGuardianForCapital(endgame, 'asgardar')!;
    expect(gFresh).toBeTruthy();
    expect(gEnd).toBeTruthy();

    // More HP so it doesn't melt...
    expect(gEnd.hp).toBeGreaterThan(gFresh.hp);
    // ...and a higher ability-point number (drives both the Guardian's AC and its
    // attack) so an over-geared player neither auto-hits nor is untouchable.
    const apNum = (e: { abilityPoint: string | number }) =>
      parseInt(String(e.abilityPoint).match(/(\d+)/)?.[1] ?? '0', 10);
    expect(apNum(gEnd)).toBeGreaterThan(apNum(gFresh));
  });

  it('a kitted fresh arrival still meets the authored Tier-1 (over-level never drops below 1.0)', () => {
    // Good gear but modest stats/HP reads as "at curve", not over — authored fight stands.
    const kitted = mkPlayer(STATS({ strength: 11, dexterity: 10 }), 35);
    expect(guardianOverLevel(kitted, 1)).toBeCloseTo(1.0, 5);
  });
});

describe('OTA-815 B — dodge is not invulnerability: a NAT 20 lands through it', () => {
  it('an enemy natural 20 hits a dodging, sky-high-AC player', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Ghost', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    const p0 = useGameStore.getState().player!;
    const scene = useGameStore.getState().currentScene!;
    // A close-range melee enemy. Player is dodging with absurd AC + DEX — without the
    // fix a nat-20 dodge roll would WIN the contest and the player would be untouchable.
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

    // Force every d20 to a natural 20 (rollDie = 1 + floor(random*sides)).
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
    expect(after.hp).toBeLessThan(100); // the perfect strike landed through the dodge
  });
});

describe('OTA-815 C — returning a sigil unlocks that faction\'s CHA trade rapport', () => {
  it('turnInSigil marks rapport complete so the vendor discount can apply', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Trader', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();

    const p0 = useGameStore.getState().player!;
    const sigil: InventoryItem = {
      id: 'sig_fo', name: 'Forgotten Order Sigil', kind: 'misc', quantity: 1, rarity: 'Common',
      description: 'A slain initiate\'s crest.', tags: ['sigil', 'forgotten_order'],
    };
    // hidden_market accepts ANY faction's sigil (neutral broker), so no travel needed.
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
    // Rapport now established for the Forgotten Order...
    expect(after.completedFactionQuestIds).toContain(rapportQuestId('forgotten_order'));
    expect(hasFactionRapport(after.completedFactionQuestIds, 'forgotten_order')).toBe(true);
    // ...and the sigil was spent.
    expect(after.inventory.find((i) => i.id === 'sig_fo')).toBeFalsy();
  });
});
