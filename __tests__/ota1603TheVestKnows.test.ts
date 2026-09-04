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

// ⚠⚠⚠ OTA-1603 — THE VEST KNOWS WHAT IT IS.
//
// Owner: "inha e a piece of dog armor called woven stride and the only option
// I have is use or drop." 'Woven Stride' is a Crucible dog-vest name — the
// noun 'Stride' exists ONLY in the dog_armor forge pool — so the item IS dog
// armor. But the game held FOUR different answers to "is this dog armor?":
//
//   pack section   — canonical kind OR 'dog_armor' tag OR DOG_GEAR name
//   equip button   — item.kind === 'dog_armor' || uniqueStats.kind exactly
//   gold stripe    — item.kind === 'dog_armor', raw, nothing else
//   [fits dog] chip— item.kind === 'dog_armor', raw, nothing else
//
// A legacy forge whose stored kind drifted (pre-OTA-688 forges carry no
// uniqueStats at all, and OTA-1001's catalog kind-heal deliberately skips
// 'fused' items — so nothing ever corrected them) files under DOG ARMOR and
// gets no dog affordance anywhere. OTA-956 hit this exact class on the
// worn-vest badge and widened one site; this OTA finishes it: ONE predicate,
// a fifth-catalog fix in findCatalogItem, a load-time heal keyed on the
// forge's own noun (the OTA-955 pattern), and a modal that SAYS why a vest
// can't be worn when no dog is at your side instead of hiding the button.

import { readFileSync } from 'fs';
import { join } from 'path';
import { itemIsDogArmor, healLegacyDogVest, UNAMBIGUOUS_DOG_VEST_NOUNS, wornDogVestInstanceId } from '../app/engine/dogCompanion';
import { findCatalogItem, canonicalItemKind, DOG_GEAR } from '../app/engine/crafting';
import { validSlotsForItem } from '../app/engine/equipment';
import { dogVestAcBonus } from '../app/state/combatResolution';
import type { InventoryItem } from '../app/engine/types';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// The owner's item, as a pre-OTA-688 forge persists it: fused tag, no
// uniqueStats, and a kind that drifted to something a vest is not.
const wovenStride = (): InventoryItem => ({
  id: 'fused_owner_vest',
  name: 'Woven Stride',
  kind: 'relic',
  quantity: 1,
  tags: ['fused', 'unique'],
  rarity: 'Rare',
} as never);

describe('OTA-1603 — one predicate answers "is this dog armor?"', () => {
  it('⚠⚠⚠ every shape a real vest can be persisted in says YES', () => {
    // Modern forge: kind stamped.
    expect(itemIsDogArmor({ name: 'Patched Barding', kind: 'dog_armor', tags: ['fused'] })).toBe(true);
    // OTA-688-era: kind drifted, uniqueStats survived.
    expect(itemIsDogArmor({ name: 'Quilted Saddle', kind: 'relic', tags: ['fused'], uniqueStats: { kind: 'dog_armor' } as never })).toBe(true);
    // Tag-only instance (a grant path that copied catalog tags but not kind).
    expect(itemIsDogArmor({ name: 'Odd Vest', kind: 'misc', tags: ['dog_armor'] })).toBe(true);
    // Catalog vest whose stored kind drifted: the name is authoritative.
    expect(itemIsDogArmor({ name: 'Burlap Vest', kind: 'misc', tags: [] })).toBe(true);
    // And a fused PLAYER armor is not dragged in.
    expect(itemIsDogArmor({ name: 'Loom-Bound Mantle', kind: 'armor', tags: ['fused'], uniqueStats: { kind: 'armor' } as never })).toBe(false);
  });

  it('⚠⚠⚠ findCatalogItem knows the FIFTH catalog — canonical readers stop calling catalog vests misc', () => {
    for (const g of DOG_GEAR) {
      expect(findCatalogItem(g.name, { aliases: false })?.kind).toBe('dog_armor');
      expect(canonicalItemKind({ name: g.name, kind: 'misc' })).toBe('dog_armor');
    }
    expect(DOG_GEAR.length).toBeGreaterThanOrEqual(4);
  });
});

describe('OTA-1603 — the owner\'s exact item, healed on load', () => {
  it('⚠⚠⚠ Woven Stride gets its kind and a working uniqueStats back from its own forge noun', () => {
    const healed = healLegacyDogVest(wovenStride());
    expect(healed.kind).toBe('dog_armor');
    expect(healed.uniqueStats?.kind).toBe('dog_armor');
    expect(healed.uniqueStats?.acBonus).toBe(3); // Rare
    // Idempotent — a second load changes nothing.
    expect(healLegacyDogVest(healed)).toEqual(healed);
    // And every affordance now agrees:
    expect(itemIsDogArmor(healed)).toBe(true);
    expect(validSlotsForItem(healed)).toEqual([]); // never a player slot
  });

  it('⚠⚠ a drifted uniqueStats-era vest gets only its outer kind corrected', () => {
    const it2 = { ...wovenStride(), uniqueStats: { kind: 'dog_armor', rarity: 'Rare', acBonus: 5, durability: { current: 20, max: 30 } } } as InventoryItem;
    const healed = healLegacyDogVest(it2);
    expect(healed.kind).toBe('dog_armor');
    expect(healed.uniqueStats?.acBonus).toBe(5); // instance-authoritative, untouched
  });

  it('⚠⚠ the heal refuses everything that is not a legacy dog forge', () => {
    // Catalog names heal through OTA-1001's catalog path, not this one.
    const cat = { id: 'c', name: 'Burlap Vest', kind: 'misc', quantity: 1, tags: [] } as never as InventoryItem;
    expect(healLegacyDogVest(cat)).toBe(cat);
    // A fused ARMOR noun is not a vest.
    const mantle = { id: 'm', name: 'Loom-Bound Mantle', kind: 'relic', quantity: 1, tags: ['fused'] } as never as InventoryItem;
    expect(healLegacyDogVest(mantle)).toBe(mantle);
    // An unfused stray named like a vest is not touched (no forge provenance).
    const stray = { id: 's', name: 'Odd Stride', kind: 'misc', quantity: 1, tags: [] } as never as InventoryItem;
    expect(healLegacyDogVest(stray)).toBe(stray);
    // uniqueStats that says armor is authoritative — never overridden.
    const armored = { id: 'a', name: 'Iron-Bound Stride', kind: 'relic', quantity: 1, tags: ['fused'], uniqueStats: { kind: 'armor' } } as never as InventoryItem;
    expect(healLegacyDogVest(armored)).toBe(armored);
  });

  it('⚠⚠ THE NOUN RATCHET — every heal noun lives ONLY in the dog_armor forge pool', () => {
    const FUSION = src('app/engine/itemFusion.ts');
    const slice = (from: string, to: string, s: string) => {
      const a = s.indexOf(from);
      expect(a).toBeGreaterThan(-1);
      const b = s.indexOf(to, a);
      expect(b).toBeGreaterThan(a);
      return s.slice(a, b);
    };
    const suffixPool = slice('const suffixPool', 'const ARMOR_SLOT_NOUNS', FUSION);
    const dogPool = slice('dog_armor: [', ']', suffixPool);
    const armorPool = slice('armor: [', ']', suffixPool.slice(suffixPool.indexOf('armor: [')));
    const slotNouns = slice('const ARMOR_SLOT_NOUNS', 'const hash', FUSION);
    const weaponNouns = slice('const WEAPON_NOUNS_MELEE', 'export', FUSION.slice(FUSION.indexOf('const WEAPON_NOUNS_MELEE')));
    for (const noun of UNAMBIGUOUS_DOG_VEST_NOUNS) {
      const q = `'${noun}'`;
      expect(dogPool).toContain(q);
      expect(slotNouns).not.toContain(q);
      expect(weaponNouns).not.toContain(q);
      // the shared armor pool must not carry it (Vigil/Harness are excluded
      // from the heal list for exactly this reason)
      expect(armorPool).not.toContain(q);
    }
    expect(UNAMBIGUOUS_DOG_VEST_NOUNS).not.toContain('Vigil');
    expect(UNAMBIGUOUS_DOG_VEST_NOUNS).not.toContain('Harness');
  });
});

describe('OTA-1603 — the downstream sites all ask the one predicate', () => {
  it('⚠⚠ a drifted vest the dog is wearing still resolves as worn, and still pays its AC', () => {
    const vest = { ...wovenStride(), uniqueStats: { kind: 'dog_armor', rarity: 'Rare', acBonus: 4 } } as never as InventoryItem;
    const player = {
      dog: { status: 'with_player', equipped: { vest: 'Woven Stride', vestId: null } },
      inventory: [vest],
    };
    expect(wornDogVestInstanceId(player as never)).toBe(vest.id);
    expect(dogVestAcBonus(player as never)).toBe(4);
  });

  it('⚠⚠ the load chain heals, and the screen asks itemIsDogArmor everywhere', () => {
    // ⚠ OTA-1654 — this used to pin the literal line inside gameStore's inventory
    // walk. That whole per-item chain moved to `itemBackfill.healSavedItem`, and
    // a source pin would only have to be moved again next time. Ask the BEHAVIOUR
    // instead: a drifted legacy vest comes out of the load chain as dog armour.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { healSavedItem } = require('../app/engine/itemBackfill') as typeof import('../app/engine/itemBackfill');
    const drifted = { ...wovenStride(), kind: 'armor' } as never as InventoryItem;
    expect(healSavedItem(drifted).kind).toBe('dog_armor');
    // …and the walk that runs it is still the one the loader calls.
    const GS = src('app/state/gameStore.ts');
    expect(GS).toContain('const inventory = (p.inventory ?? []).map(healSavedItem);');
    const SCREEN = src('app/screens/InventoryScreen.tsx');
    expect(SCREEN).toContain('const pendingIsDogArmor = itemIsDogArmor(pending.item);');
    expect(SCREEN).toContain("(item.kind === 'consumable' || itemIsDogArmor(item))");
    // ⚠⚠ OTA-1671 — THE `[fits dog]` CHIP LINE THAT USED TO BE PINNED HERE IS
    // GONE, on the owner's instruction ("if it didn't it wouldn't be sorted into
    // the dog armor area"), so the pin moves to the fact it was protecting: the
    // ROW-level answer to "is this dog gear" must still survive a kind drift.
    // That answer is now the section heading alone, and `categorizeItem` gives
    // it — stated as behaviour on the drifted vest rather than as a line of
    // source, the same move OTA-1654 made two lines above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { categorizeItem } = require('../app/components/InventoryCategorize') as typeof import('../app/components/InventoryCategorize');
    expect(categorizeItem(healSavedItem(drifted))).toBe('dog_armor');
  });

  it('⚠⚠ no active dog ≠ no affordance — the modal says who the vest is for (B15: refusals speak)', () => {
    const SCREEN = src('app/screens/InventoryScreen.tsx');
    expect(SCREEN).toContain('} else if (pendingIsDogArmor) {');
    expect(SCREEN).toContain('Dog armor — no dog walks beside you yet');
    expect(SCREEN).toContain('is gone');
  });
});
