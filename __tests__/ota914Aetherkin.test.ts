// OTA-914 — the Aetherkin (mud-mummified flood-dead).
//   - pure: revering factions, isAetherkin matcher, randomized encounter beats
//   - data: the two defensive variants exist, carry the aetherkin marker + a
//     skittish temperament so "calm" is the talk-down key
//   - store: killing an Aetherkin lowers standing with the revering factions;
//     talking one down raises it

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
import {
  AETHERKIN_REVERING_FACTIONS, AETHERKIN_VARIANT_NAMES, isAetherkin, buildAetherkinEncounter,
} from '../app/engine/aetherkin';
import enemiesData from '../app/data/enemies/enemies.json';
import type { Enemy } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-914 — aetherkin module', () => {
  it('the revering bloc is the four legacy-loyal factions', () => {
    expect([...AETHERKIN_REVERING_FACTIONS].sort()).toEqual(
      ['eternal_dynasty', 'servants_of_giants', 'tartarian_revivalists', 'true_tartarians'],
    );
  });

  it('isAetherkin matches on the marker trait, the name, and the legacy power-hall Aetherkin', () => {
    expect(isAetherkin({ traits: ['aetherkin', 'slow'] })).toBe(true);
    expect(isAetherkin({ name: 'Drowned Aetherkin' })).toBe(true);
    expect(isAetherkin({ name: 'Aetherkin' })).toBe(true); // the legacy Rare, no trait
    expect(isAetherkin({ name: 'Ash Wolf', traits: ['savage'] })).toBe(false);
    expect(isAetherkin(null)).toBe(false);
  });

  it('an encounter names one of the variants and always tells you what they are', () => {
    let seed = 0;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 50; i++) {
      const enc = buildAetherkinEncounter(i % 2 === 0 ? 'building' : 'mud', rng);
      expect(AETHERKIN_VARIANT_NAMES).toContain(enc.enemyName);
      // four ordered beats: emergence → identification → identity → character
      expect(enc.lines).toEqual([enc.emergence, enc.identification, enc.identity, enc.character]);
      // the identification beat names them as the Aetherkin you've heard about
      expect(enc.identification.toLowerCase()).toContain('aetherkin');
      expect(enc.identity).toMatch(/^In life it was /);
    }
  });

  it('building vs mud emergence beats differ (sealed in a home vs clawing up out of silt)', () => {
    const fixed = () => 0.42;
    expect(buildAetherkinEncounter('building', fixed).emergence)
      .not.toEqual(buildAetherkinEncounter('mud', fixed).emergence);
  });
});

describe('OTA-914 — enemy data', () => {
  const byName = (n: string) => (enemiesData as Enemy[]).find((e) => e.name === n);

  it('the two defensive variants exist as Etheric Undead, marked + skittish', () => {
    for (const name of ['Drowned Aetherkin', 'Mud-Wracked Aetherkin']) {
      const e = byName(name);
      expect(e).toBeDefined();
      expect(e!.type).toBe('Etheric Undead');
      expect(e!.traits ?? []).toContain('aetherkin');
      expect(e!.temperament).toBe('skittish'); // "calm" is the talk-down key
      expect(isAetherkin(e!)).toBe(true);
    }
  });

  it('the drowned variant is the weaker Common; the mud-wracked one is tougher', () => {
    expect(byName('Drowned Aetherkin')!.hp).toBeLessThan(byName('Mud-Wracked Aetherkin')!.hp);
    expect(byName('Drowned Aetherkin')!.rarity).toBe('Common');
  });
});

// ── store: standing consequences ────────────────────────────────────────────

function aetherkin(): Enemy {
  return {
    name: 'Drowned Aetherkin', type: 'Etheric Undead', abilityPoint: 'Strength 3',
    attack: 'Frightened Lash', damage: '2D6 Aetheric', hp: 45, rarity: 'Common',
    loot: [], traits: ['aetherkin', 'slow'], temperament: 'skittish',
  };
}

const REVERING = ['true_tartarians', 'servants_of_giants', 'tartarian_revivalists', 'eternal_dynasty'];

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Silt-Walker', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  // Track the revering bloc (plus the player's own guild) at a known baseline.
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 40, stamina: 20, corruption: 0,
      factionStanding: [
        ...REVERING.map((factionId) => ({ factionId, standing: 20 })),
        { factionId: 'reclaimers_guild', standing: 0 },
      ],
    },
  }));
  return store;
}
function standingOf(store: typeof useGameStore, fid: string): number {
  return store.getState().player!.factionStanding.find((r) => r.factionId === fid)?.standing ?? 0;
}
function armAetherkin(store: typeof useGameStore, cha: number) {
  store.setState((s) => ({
    currentScene: {
      ...s.currentScene!, enemies: [aetherkin()], enemyHps: [45], enemyKnockedOut: [false],
      enemyAmbushUsed: [false], activeEnemyIdx: 0, range: 'close', vendor: null, wanderer: null,
    } as any,
    player: { ...s.player!, stats: { ...s.player!.stats, charisma: cha, wisdom: 8 } },
  }));
}

describe('OTA-914 — standing consequences', () => {
  it('killing an Aetherkin lowers standing with every revering faction', async () => {
    const store = await boot();
    armAetherkin(store, 10);
    const before = REVERING.map((f) => standingOf(store, f));
    store.getState().resolveEnemyDefeat();
    for (const f of REVERING) expect(standingOf(store, f)).toBeLessThan(20);
    // untracked non-revering guild is unaffected by reverence
    expect(standingOf(store, 'reclaimers_guild')).toBe(0);
    expect(before.every((v) => v === 20)).toBe(true);
  });

  it('talking an Aetherkin down (calm) raises standing with every revering faction', async () => {
    const store = await boot();
    armAetherkin(store, 30); // high CHA so the calm check lands
    store.getState().submitPlayerAction('soothe the aetherkin');
    expect(store.getState().currentScene!.enemies.length).toBe(0); // disengaged, tile kept
    for (const f of REVERING) expect(standingOf(store, f)).toBeGreaterThan(20);
    expect(standingOf(store, 'reclaimers_guild')).toBe(0);
  });
});
