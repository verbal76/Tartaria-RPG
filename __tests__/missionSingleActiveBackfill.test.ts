// HaL2001 single-active mission port — old-save backfill.
//
// The single-active feature added a `tracked` flag to faction-quest records
// (absent/true = active, false = parked). Saves written BEFORE the feature have
// no `tracked` on any record, so every accepted contract would read as active
// until the player taps SET ACTIVE. backfillPlayer (the load-time migration EVERY
// save passes through) establishes single-active on load: the first contract is
// active, the rest are parked. Records that already carry `tracked` (post-feature
// saves) pass through untouched.

// Mocks required to import gameStore in jest (mirrors equippedHandsCloakSurvivesLoad).
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

import { backfillPlayer } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

function quest(id: string, over: Record<string, unknown> = {}) {
  return { id, stage: 0, postedByFaction: 'reclaimers', acceptedAt: 1, ...over };
}

function makePlayer(over: Partial<PlayerCharacter>): PlayerCharacter {
  return {
    stats: { strength: 6, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 2 },
    hp: 20, hpMax: 20,
    stamina: 10, staminaMax: 15,
    inventory: [],
    equipped: {},
    currentLocationId: 'tartarian_outskirts',
    factionId: 'reclaimers',
    raceId: 'mud_dweller',
    dead: false,
    ...over,
  } as unknown as PlayerCharacter;
}

describe('single-active mission port — old-save backfill', () => {
  it('legacy save with 2+ contracts (no tracked) → first active, rest parked', () => {
    const p = makePlayer({
      activeFactionQuestIds: ['q_a', 'q_b', 'q_c'],
      activeFactionQuests: [quest('q_a'), quest('q_b'), quest('q_c')] as any,
    });
    const out = backfillPlayer(p);
    const qs = out.activeFactionQuests as any[];
    expect(qs).toHaveLength(3);
    expect(qs[0].tracked).toBe(true);   // the one you're on
    expect(qs[1].tracked).toBe(false);  // parked
    expect(qs[2].tracked).toBe(false);  // parked
    // Exactly one active — the single-active invariant holds immediately on load.
    expect(qs.filter((q) => q.tracked !== false)).toHaveLength(1);
  });

  it('modern save with tracked already set → passes through untouched', () => {
    const p = makePlayer({
      activeFactionQuestIds: ['q_a', 'q_b'],
      activeFactionQuests: [
        quest('q_a', { tracked: false }),
        quest('q_b', { tracked: true }),
      ] as any,
    });
    const out = backfillPlayer(p);
    const qs = out.activeFactionQuests as any[];
    // The player's explicit choice (q_b active, q_a parked) is preserved — the
    // backfill must NOT re-pick the first record as active.
    expect(qs[0].tracked).toBe(false);
    expect(qs[1].tracked).toBe(true);
    expect(qs.filter((q) => q.tracked !== false)).toHaveLength(1);
  });

  it('single legacy contract → reads as active', () => {
    const p = makePlayer({
      activeFactionQuestIds: ['q_solo'],
      activeFactionQuests: [quest('q_solo')] as any,
    });
    const out = backfillPlayer(p);
    const qs = out.activeFactionQuests as any[];
    expect(qs[0].tracked).toBe(true);
  });

  it('no contracts → no crash, empty list', () => {
    const p = makePlayer({ activeFactionQuestIds: [], activeFactionQuests: [] as any });
    const out = backfillPlayer(p);
    expect(out.activeFactionQuests).toEqual([]);
  });
});
