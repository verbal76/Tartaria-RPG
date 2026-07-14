// OTA-1093 — Parley (two-button social) + hard lock-and-key + Menace loop.
//   - pure: temperament keys, DC, verb detection, menace math
//   - store: right-key succeeds, wrong-key auto-fails into its downside, intimidate
//     raises menace + costs standing, generic opener stages the modal

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
  rightChoiceFor, isRightKey, choicesFor, parleyDC, detectParleyChoice,
  deriveAnimalTemperament, revealsTemperament,
} from '../app/engine/parley';
import { raiseMenace, decayedMenace, menaceIntimidateDcBonus, menaceTier } from '../app/engine/menace';
import { makeWanderer } from '../app/engine/wanderers';
import type { Enemy } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1093 — parley helpers (lock-and-key)', () => {
  it('the right key fits exactly one temperament', () => {
    expect(rightChoiceFor('skittish')).toBe('calm');
    expect(rightChoiceFor('aggressive')).toBe('intimidate');
    expect(rightChoiceFor('reasonable')).toBe('persuade');
    expect(rightChoiceFor('greedy')).toBe('intimidate');
    expect(isRightKey('calm', 'skittish')).toBe(true);
    expect(isRightKey('calm', 'aggressive')).toBe(false);
  });
  it('offers the right two buttons per kind', () => {
    expect(choicesFor('animal')).toEqual(['calm', 'intimidate']);
    expect(choicesFor('person')).toEqual(['persuade', 'intimidate']);
  });
  it('detects a committed choice, or null for a generic opener', () => {
    expect(detectParleyChoice('intimidate the wolf', 'animal')).toBe('intimidate');
    expect(detectParleyChoice('calm the beast', 'animal')).toBe('calm');
    expect(detectParleyChoice('persuade her', 'person')).toBe('persuade');
    expect(detectParleyChoice('soothe it', 'animal')).toBe('calm');
    expect(detectParleyChoice('talk to Corin', 'person')).toBeNull(); // generic → modal
    expect(detectParleyChoice('greet them', 'person')).toBeNull();
  });
  it('DC: intimidate is harder and scales with the passed bonus', () => {
    expect(parleyDC('persuade')).toBe(10);
    expect(parleyDC('intimidate')).toBe(11);
    expect(parleyDC('intimidate', 3)).toBe(14);
  });
  it('animal temperament derivation is keyword-biased and stable', () => {
    expect(deriveAnimalTemperament('Ash Wolf')).toBe('aggressive');
    expect(deriveAnimalTemperament('Field Rat')).toBe('skittish');
    expect(deriveAnimalTemperament('Zzyx')).toBe(deriveAnimalTemperament('Zzyx')); // deterministic
  });
  it('WIS reveal gates the readout', () => {
    expect(revealsTemperament(12)).toBe(true);
    expect(revealsTemperament(11)).toBe(false);
  });
});

describe('OTA-1093 — menace math', () => {
  it('rises per attempt, more for people', () => {
    expect(raiseMenace(0, 'animal')).toBe(4);
    expect(raiseMenace(0, 'person')).toBe(8);
  });
  it('decays over game-hours and never below 0', () => {
    expect(decayedMenace(10, 0, 10)).toBeCloseTo(6); // 10 - 10*0.4
    expect(decayedMenace(10, 0, 100)).toBe(0);
  });
  it('self-blunts the intimidate DC and tiers up', () => {
    expect(menaceIntimidateDcBonus(0)).toBe(0);
    expect(menaceIntimidateDcBonus(40)).toBe(2);
    expect(menaceTier(0)).toBe('Unremarkable');
    expect(menaceTier(80)).toBe('Dreaded');
  });
});

function beast(temperament: Enemy['temperament']): Enemy {
  return {
    name: 'Ash Wolf', type: 'Beast', abilityPoint: '', attack: 'bite', damage: '1d4',
    hp: 8, rarity: 'Common', loot: [], temperament,
  };
}
async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Silvertongue', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}
function armAnimal(store: ReturnType<typeof useGameStore>, temperament: Enemy['temperament'], cha: number) {
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [beast(temperament)], enemyHps: [8], enemyKnockedOut: [false], enemyAmbushUsed: [false], activeEnemyIdx: 0, range: 'close', vendor: null, wanderer: null } as any,
    player: { ...s.player!, hp: 30, stamina: 20, corruption: 0, stats: { ...s.player!.stats, charisma: cha, wisdom: 8 } },
  }));
}
function armPerson(store: ReturnType<typeof useGameStore>, temperament: 'reasonable' | 'greedy', cha: number) {
  const w = { ...makeWanderer(5), temperament, faction: 'reclaimers_guild' };
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: null, wanderer: w } as any,
    player: { ...s.player!, hp: 30, stamina: 20, corruption: 0, menace: 0, stats: { ...s.player!.stats, charisma: cha, wisdom: 8 } },
  }));
}

describe('OTA-1093 — parley in the store', () => {
  it('right key on an animal (calm a skittish beast) ends the fight, keeps the tile', async () => {
    const store = await boot();
    armAnimal(store, 'skittish', 30);
    store.getState().submitPlayerAction('soothe the wolf');
    expect(store.getState().currentScene!.enemies.length).toBe(0);
  });

  it('wrong key auto-fails into its downside (intimidate a skittish beast → vicious hit, fight stays)', async () => {
    const store = await boot();
    armAnimal(store, 'skittish', 30);
    const hpBefore = store.getState().player!.hp;
    store.getState().submitPlayerAction('intimidate the wolf');
    expect(store.getState().currentScene!.enemies.length).toBe(1);        // still fighting
    expect(store.getState().player!.hp).toBeLessThan(hpBefore);           // took the hit
    expect((store.getState().player!.menace ?? 0)).toBeGreaterThan(0);    // menace rose on the attempt
  });

  it('extorting a greedy person yields TC, raises menace, costs standing', async () => {
    const store = await boot();
    armPerson(store, 'greedy', 30);
    const tcBefore = store.getState().player!.tc;
    const repBefore = (store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing) ?? 0;
    store.getState().submitPlayerAction('intimidate them');
    expect(store.getState().currentScene!.wanderer ?? null).toBeNull();   // done
    expect(store.getState().player!.tc).toBeGreaterThan(tcBefore);        // shook loose TC
    expect((store.getState().player!.menace ?? 0)).toBe(8);               // person intimidation
    const repAfter = (store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing) ?? 0;
    expect(repAfter).toBeLessThan(repBefore);                              // standing cost
  });

  it('wrong key on a person (intimidate a reasonable one) turns them hostile', async () => {
    const store = await boot();
    armPerson(store, 'reasonable', 30);
    store.getState().submitPlayerAction('intimidate them');
    expect(store.getState().currentScene!.wanderer ?? null).toBeNull();
    expect(store.getState().currentScene!.enemies.length).toBe(1);        // now a fight
  });

  it('a generic opener stages the two-button modal without resolving', async () => {
    const store = await boot();
    armPerson(store, 'reasonable', 30);
    store.getState().submitPlayerAction('talk to them');
    expect(store.getState().pendingParley).toBeTruthy();                  // modal armed
    expect(store.getState().currentScene!.wanderer ?? null).toBeTruthy(); // not consumed yet
    // Committing via the modal action resolves it.
    store.getState().resolveParley('persuade');
    expect(store.getState().pendingParley).toBeNull();
  });
});
