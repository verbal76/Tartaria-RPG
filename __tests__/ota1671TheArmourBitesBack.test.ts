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

// OTA-1671 — THE ARMOUR BITES BACK, AND THE DOG SECTION STOPS REPEATING ITSELF.
//
// Owner, two things in one message: *"the dog armor doesn't need to say fits
// dog, if it didn't it wouldn't be sorted into the dog armor area. Also I really
// like the bites back buff to the dog armor, we need that implement across our
// armour catalogue. Not every piece obviously but it can be sprinkled in
// periodically."*
//
// ⚠⚠ THE DELETION IS MEASURED, NOT MERELY PLAUSIBLE — and my first draft of this
// header got the reason WRONG, which is why the measurement is now the test.
//
// I wrote that the chip's predicate was a "strict subset" of the section's, so
// the chip was redundant. It is not a subset in either direction: the chip fires
// on `itemIsDogArmor` (canonical kind OR CANONICAL tags), the heading on
// `categorizeItem` (canonical kind OR RAW tags OR the DOG_GEAR name, behind a
// fused-kind branch that returns first). Neither set contains the other on paper.
//
// ⚠⚠⚠ SO I SWEPT THEM. Across all 905 catalog names × four stored kinds the two
// answers agree 3620 times out of 3620 — zero divergence, in either direction.
// On everything a player can actually hold, the chip said exactly what the
// heading above it already said, which is the owner's point word for word.
//
// ⚠ AND THE ONE SHAPE THAT DOES DIVERGE MAKES THE DELETION BETTER, NOT WORSE. A
// fused item whose `uniqueStats.kind` is 'armor' but which carries a dog_armor
// tag gets `[fits dog]` from the chip and is filed under ARMOR by the heading —
// correctly, because OTA-688 made uniqueStats.kind the forge's ground truth. The
// chip was the half that could lie. Removing it removes the only surface in the
// pack that could contradict the section an item is sitting in.
//
// ⚠⚠⚠ AND THE BITE-BACK IS NOT THE DOG VEST'S BITE-BACK. The vest always returns
// AETHERIC (OTA-1640). Player armour returns the ATTACKER'S OWN damage type —
// the owner's call when I put the choice to him. A fire-breather burns itself on
// your plate. One field means something different every encounter instead of
// becoming a second, quieter aetheric channel.

import { readFileSync } from 'fs';
import { join } from 'path';
import { armorBiteBack } from '../app/engine/armorBiteBack';
import { aggregateEquippedReflect, ARMOR_REFLECT_CAP } from '../app/engine/equipment';
import { WEAPONS, ARMOR, MATERIALS, GEAR, AMULETS, RINGS, DOG_GEAR } from '../app/engine/crafting';
import { itemIsDogArmor } from '../app/engine/dogCompanion';
import { categorizeItem } from '../app/components/InventoryCategorize';
import { getItemPreview } from '../app/components/itemPreview';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const code = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1671 — ⚠⚠ [fits dog] is gone, and the section already said it', () => {
  it('⚠⚠⚠ the chip said nothing the heading did not — swept, not assumed', () => {
    // Every name in every catalog, under each kind a save could plausibly hold.
    // If this ever divides, some dog gear would sit under DOG ARMOR with a row
    // that disagrees — and THAT is when a chip would be worth having back.
    const names: string[] = [];
    for (const cat of [WEAPONS, ARMOR, MATERIALS, GEAR, AMULETS, RINGS, DOG_GEAR]) {
      for (const row of cat) names.push(row.name);
    }
    expect(names.length).toBeGreaterThan(800);
    const split: string[] = [];
    for (const name of names) {
      for (const kind of ['armor', 'dog_armor', 'weapon', 'misc']) {
        const item = { id: 'x', name, kind, quantity: 1, tags: [] } as unknown as InventoryItem;
        if (itemIsDogArmor(item) !== (categorizeItem(item) === 'dog_armor')) {
          split.push(`${name} [${kind}]`);
        }
      }
    }
    expect(split).toEqual([]);
  });

  it('⚠⚠ the one shape that DOES divide is one where the chip was the liar', () => {
    // A fused piece the forge stamped ARMOR that still carries a dog_armor tag.
    // OTA-688 made uniqueStats.kind the forge's ground truth, so the heading is
    // right to file it under Armor — and the chip was telling the player it fits
    // a dog while it sat in the player's own armour. Deleting the chip is what
    // removes the contradiction; it is not collateral damage from removing it.
    const fused = {
      id: 'y', name: 'Zzz Forged Thing', kind: 'dog_armor', quantity: 1,
      tags: ['dog_armor'], uniqueStats: { kind: 'armor', rarity: 'Rare' },
    } as unknown as InventoryItem;
    expect(itemIsDogArmor(fused)).toBe(true);
    expect(categorizeItem(fused)).toBe('armor');
  });

  it('the inventory row no longer prints the chip', () => {
    expect(code(readFileSync(join(ROOT, 'app', 'screens', 'InventoryScreen.tsx'), 'utf8')))
      .not.toContain('[fits dog]');
  });
});

describe('OTA-1671 — ⚠⚠⚠ bite-back, in the attacker\'s own element', () => {
  const biters = ARMOR.filter((a) => (a as { reflect?: number }).reflect);

  it('the catalog agrees with the rule, row for row', () => {
    for (const a of ARMOR) {
      const want = armorBiteBack(a.name, a.slot, a.rarity);
      const have = (a as { reflect?: number }).reflect ?? 0;
      expect({ piece: a.name, have }).toEqual({ piece: a.name, have: want });
    }
  });

  it('⚠ it is SPRINKLED — about a tenth of the catalog, not a property of good armour', () => {
    const share = biters.length / ARMOR.length;
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.15);
  });

  it('⚠⚠ and only on armour you are INSIDE — never a cloak, never a hood', () => {
    // A cloak billows and a hood covers your head. Neither is something an
    // attacker impales itself on, and a rider that ignores that reads as random.
    for (const a of biters) {
      if (/thorn|barb|spike|glass|claw/i.test(a.name)) continue; // named pieces earn it anywhere
      expect({ piece: a.name, slot: a.slot }).toEqual({ piece: a.name, slot: expect.stringMatching(/^(chest|hands|legs)$/) });
    }
  });

  it('⚠ a Common never carries one unless its NAME promises it', () => {
    for (const a of biters) {
      if (/thorn|barb|spike|glass|claw/i.test(a.name)) continue;
      expect({ piece: a.name, rarity: a.rarity })
        .toEqual({ piece: a.name, rarity: expect.stringMatching(/^(Rare|Legendary)$/) });
    }
  });

  it('⚠⚠⚠ a full set is CAPPED — standing still must not become the strategy', () => {
    // Six slots can carry this. Uncapped, the optimal play against anything that
    // swings fast would be to stop swinging back.
    const worn: Record<string, string> = {};
    for (const a of biters.slice(0, 6)) worn[a.slot] = a.name;
    const p = { equipped: worn } as unknown as PlayerCharacter;
    expect(aggregateEquippedReflect(p)).toBeLessThanOrEqual(ARMOR_REFLECT_CAP);
  });

  it('nothing worn returns nothing', () => {
    expect(aggregateEquippedReflect({ equipped: {} } as unknown as PlayerCharacter)).toBe(0);
  });

  it('⚠⚠ THE CARD SAYS IT, and does not name a damage type it cannot promise', () => {
    // The OTA-1611 rule. The dog vest's line says "aetheric" because that vest
    // always returns aetheric. This one cannot, because the type is whatever
    // just hit you — so the card says exactly that.
    const line = getItemPreview(biters[0]!.name).stats.find((l) => l.startsWith('Bites back:'));
    expect(line).toBeTruthy();
    expect(line).toContain('its own element');
    expect(line).not.toContain('aetheric');
  });
});

describe('OTA-1671 — ⚠⚠ the combat payout is wired, and wired honestly', () => {
  const COMBAT = code(readFileSync(join(ROOT, 'app', 'state', 'combatResolution.ts'), 'utf8'));
  // ⚠ The window runs from the reflect to the OTA-936 legibility cues that
  // follow it. A first draft ended at `trained?.leveled`, which lives in the
  // DOG counter further down the file — the slice was empty and both assertions
  // passed vacuously in the wrong direction. Anchor on what actually comes next.

  it('the reflect is typed by the ENEMY\'s damage, not by a constant', () => {
    const block = COMBAT.slice(COMBAT.indexOf('const reflectBack'), COMBAT.indexOf('const cueKey'));
    expect(block).toContain('${enemyDamageType}');
    expect(block).not.toContain('aetheric');
  });

  it('⚠⚠ it fires only on a hit that GOT THROUGH', () => {
    // Post-mitigation, the same rule applyEscortDamage uses one line above. A
    // wholly parried blow did not sink into the spikes, and paying reflect on it
    // would make a perfect defence also the best offence.
    // ⚠ OTA-1676 — the armour's share is `armourReflect` now (the shield's
    // on-block bite is summed beside it), and its rule is unchanged: the blow
    // must have got through. The shield's bite deliberately does NOT carry
    // this guard — it is owed by the block, not by the wound.
    expect(COMBAT).toContain('const armourReflect = dmg > 0 && !killed ? aggregateEquippedReflect(player) : 0;');
  });

  it('⚠ a kill by reflect still resolves as a defeat', () => {
    // Loot, credit and the mission slate all hang off resolveEnemyDefeat. An
    // enemy that dies on your armour is still an enemy you defeated — the dog
    // vest already works this way (OTA-1640) and the two must not diverge.
    // ⚠ OTA-1676 — the write moved into `dealReflectToAttacker` so the shield's
    // bite (and the raised-BLOCK path) pay through the same helper; the block
    // calls it, and the helper is where the defeat resolves.
    const block = COMBAT.slice(COMBAT.indexOf('const reflectBack'), COMBAT.indexOf('const cueKey'));
    expect(block).toContain('dealReflectToAttacker(get, set, enemy, reflectBack, line);');
    const helper = COMBAT.slice(COMBAT.indexOf('export function dealReflectToAttacker'));
    expect(helper).toContain('resolveEnemyDefeat()');
  });
});
