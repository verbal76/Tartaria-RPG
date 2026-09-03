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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1640 — THE VEST SAYS WHAT IT DOES, AND DOES WHAT IT SAYS.
//
// Owner, from his 02:24 inventory paste: *"why do all My different rarity dog
// armors all have the same stats. there's no use of having a legendary if it's
// got the same stats as a common or a rare."*
//
// Measured before touching anything:
//   • dogGear.json ladders AC 1 / 2 / 3 / 4 and combat PAID it (dogVestAcBonus).
//   • The Rare vest's `reflectsCorruption` had no reader. The Legendary's
//     `statBonus` (+1 STR) had no reader — the bite read dog.stats.strength raw.
//   • No surface printed any of it: getItemPreview had no dog-gear branch, so
//     every vest fell to inferArmor and printed the SAME guessed line; the
//     snapshot printed AC only for fused pieces.
// So he was right on two rungs of four and could not see the other two.

import { getItemPreview, getItemPreviewForInstance } from '../app/components/itemPreview';
import { DOG_GEAR } from '../app/engine/crafting';
import { dogVestAcBonus, dogVestStatBonus, dogVestReflect, applyEnemyCounterToDog } from '../app/state/combatResolution';
import { buildInventorySnapshot } from '../app/diagnostics/inventorySnapshot';
import type { PlayerCharacter, InventoryItem, Enemy } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const VESTS = ['Burlap Vest', 'Riveted Leather Vest', 'Aetheric Padded Vest', 'Reclaimer Pattern Vest'];

const dogWith = (vest: string | null): PlayerCharacter => ({
  name: 'Tester', inventory: [], hoursElapsed: 0,
  dog: {
    name: 'Mercy', sex: { pronoun: 'she' }, status: 'with_player', hp: 15, hpMax: 15,
    stats: { strength: 4, dexterity: 6, intelligence: 3 }, statProgress: {},
    equipped: vest ? { vest } : {},
  },
} as unknown as PlayerCharacter);

describe('OTA-1640 — the card says the ladder', () => {
  it('⚠⚠⚠ four rarities, four different AC lines — never the same guessed stats again', () => {
    const lines = VESTS.map((v) => getItemPreview(v).stats.find((s) => s.startsWith('AC +')));
    expect(lines).toEqual(['AC +1 (dog)', 'AC +2 (dog)', 'AC +3 (dog)', 'AC +4 (dog)']);
    for (const v of VESTS) expect(getItemPreview(v).kindLabel).toBe('Dog Vest');
  });

  it('⚠⚠ the Rare bites back and the Legendary adds STR — said on the card', () => {
    expect(getItemPreview('Aetheric Padded Vest').stats).toContain('Bites back: 1 aetheric to whatever hits the dog');
    expect(getItemPreview('Reclaimer Pattern Vest').stats).toContain('STR +1 (dog)');
    expect(getItemPreview('Burlap Vest').stats.some((s) => /Bites back|STR \+/.test(s))).toBe(false);
  });

  it('⚠⚠ the snapshot paste carries the same line, so a paste cannot hide the ladder', () => {
    const inv: InventoryItem[] = VESTS.map((v, i) => ({
      id: `v${i}`, name: v, kind: 'dog_armor', rarity: DOG_GEAR.find((g) => g.name === v)!.rarity, quantity: 1, tags: ['dog_armor'],
    } as InventoryItem));
    const p = { ...dogWith(null), inventory: inv, hp: 10, hpMax: 10, stamina: 5, staminaMax: 5, tc: 0 } as unknown as PlayerCharacter;
    const snap = buildInventorySnapshot(p);
    for (let i = 0; i < VESTS.length; i++) expect(snap).toContain(`AC +${i + 1} (dog)`);
  });
});

describe('OTA-1640 — the vest does what the card says', () => {
  it('⚠⚠⚠ AC, stat and bite-back read from the SAME rows the card prints', () => {
    expect(VESTS.map((v) => dogVestAcBonus(dogWith(v)))).toEqual([1, 2, 3, 4]);
    expect(dogVestStatBonus(dogWith('Reclaimer Pattern Vest'), 'strength')).toBe(1);
    expect(dogVestStatBonus(dogWith('Reclaimer Pattern Vest'), 'dexterity')).toBe(0);
    expect(dogVestStatBonus(dogWith('Burlap Vest'), 'strength')).toBe(0);
    expect(dogVestStatBonus(dogWith(null), 'strength')).toBe(0);
    expect(dogVestReflect(dogWith('Aetheric Padded Vest'))).toBe(1);
    expect(dogVestReflect(dogWith('Riveted Leather Vest'))).toBe(0);
  });

  it('⚠⚠⚠ a hit on the dog in the Aetheric Padded Vest costs the attacker 1 aetheric', () => {
    const enemy = { name: 'Mud Boar', damage: '1', hp: 6, traits: [], type: 'Mud Creature', abilityPoint: 'Strength 10' } as unknown as Enemy;
    let state: { player: PlayerCharacter; currentScene: { enemies: Enemy[]; enemyHps: number[]; activeEnemyIdx: number } } = {
      player: dogWith('Aetheric Padded Vest'),
      currentScene: { enemies: [enemy], enemyHps: [6], activeEnemyIdx: 0 },
    };
    const log: string[] = [];
    let defeats = 0;
    const get = () => ({
      ...state,
      appendLog: (_k: string, text: string) => { log.push(text); },
      resolveEnemyDefeat: () => { defeats++; },
    }) as never;
    const set = (fn: (s: never) => Partial<typeof state>) => { state = { ...state, ...fn(get()) }; };
    // Force hits: roll high by monkeypatching Math.random for the d20.
    const orig = Math.random;
    Math.random = () => 0.999; // d20 → 20 (crit → always hits)
    try {
      applyEnemyCounterToDog(enemy, get, set as never);
    } finally { Math.random = orig; }
    expect(state.currentScene.enemyHps[0]).toBe(5);
    expect(log.join('\n')).toContain("Mercy's vest hums and gives it back — Mud Boar takes 1 aetheric. (5 HP left)");
    expect(defeats).toBe(0);
  });

  it('⚠⚠ the bite-back can finish an enemy, and a finish goes through resolveEnemyDefeat', () => {
    const enemy = { name: 'Mudling', damage: '1', hp: 1, traits: [], type: 'Mud Creature', abilityPoint: 'Strength 10' } as unknown as Enemy;
    let state = {
      player: { ...dogWith('Aetheric Padded Vest'), dog: { ...dogWith('Aetheric Padded Vest').dog!, hp: 40, hpMax: 40 } } as PlayerCharacter,
      currentScene: { enemies: [enemy], enemyHps: [1], activeEnemyIdx: 0 },
    };
    let defeats = 0;
    const get = () => ({ ...state, appendLog: () => {}, resolveEnemyDefeat: () => { defeats++; } }) as never;
    const set = (fn: (s: never) => Partial<typeof state>) => { state = { ...state, ...fn(get()) }; };
    const orig = Math.random;
    Math.random = () => 0.999;
    try { applyEnemyCounterToDog(enemy, get, set as never); } finally { Math.random = orig; }
    expect(state.currentScene.enemyHps[0]).toBe(0);
    expect(defeats).toBe(1);
  });

  it('⚠⚠ the bite reads the vest STR; the nose reads the vest INT', () => {
    const G = src('app/state/gameStore.ts');
    expect(G).toContain("const vestStr = dogVestStatBonus(get().player!, 'strength');");
    expect(G).toContain('const biteStr = dog.stats.strength + vestStr;');
    expect(G).toContain('let dmg = rollDie(6) + Math.floor(biteStr / 2);');
    expect(G).toContain("dog.stats.intelligence + dogVestStatBonus(livePlayer, 'intelligence')");
    expect(G).not.toContain('const total = roll + dog.stats.strength;');
  });

  it('⚠ the preview never lies about an instance either — the same line rides the row', () => {
    const inst = { name: 'Aetheric Padded Vest', durability: { current: 20, max: 28 } };
    const stats = getItemPreviewForInstance(inst).stats;
    expect(stats).toContain('AC +3 (dog)');
    expect(stats).toContain('Durability: 20/28');
  });
});
