// engine_Dev-834 — title ids were genericized off Tartaria. Old saves carry the legacy
// ids in earnedTitles; backfillPlayer must remap them so an earned title keeps its display
// + perk after the rename (and not double-count).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: { createAsync: jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })) } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { backfillPlayer } from '../app/state/gameStore';
import { titlePerkModifiers } from '../app/engine/titles';
import type { PlayerCharacter } from '../app/engine/types';

// Minimal player with enough shape for backfillPlayerInner to run to completion
// (mirrors equippedHandsCloakSurvivesLoad.test.ts — backfill reads stats/equipped/
// inventory downstream, so a too-thin player throws and degrades to the raw save).
const mk = (earnedTitles: string[]): PlayerCharacter =>
  ({
    stats: { strength: 6, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 2 },
    hp: 20, hpMax: 20, stamina: 10, staminaMax: 15,
    inventory: [], equipped: {},
    currentLocationId: 'tartarian_outskirts',
    raceId: 'mud_dweller', factionId: 'reclaimers', dead: false,
    corruption: 0, earnedTitles,
  } as unknown as PlayerCharacter);

describe('engine_Dev — legacy title-id save migration', () => {
  it('remaps every legacy Tartaria id to its genericized form', () => {
    const out = backfillPlayer(mk([
      'aetheric_attuned', 'aetherborn_awakened', 'etheric_explorer', 'etherbound_survivor',
      'survivor_of_aetherstone', 'golem_whisperer', 'master_of_aethercraft', 'bane_of_sentinels',
    ]));
    expect(out.earnedTitles).toEqual([
      'arcane_attuned', 'inner_awakening', 'far_explorer', 'stormbound_survivor',
      'survivor_of_the_stones', 'sidekick_whisperer', 'master_of_spellcraft', 'bane_of_constructs',
    ]);
  });

  it('keeps the perk after migration (golem_whisperer → sidekick_whisperer still grants the construct edge)', () => {
    const out = backfillPlayer(mk(['golem_whisperer']));
    expect(out.earnedTitles).toContain('sidekick_whisperer');
    expect(titlePerkModifiers(out).golemEdge).toBe(true);
  });

  it('leaves already-migrated ids untouched + does not duplicate', () => {
    const out = backfillPlayer(mk(['bane_of_constructs', 'bane_of_sentinels']));
    expect(out.earnedTitles).toEqual(['bane_of_constructs']);
  });
});
