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

// ⚠⚠⚠ OTA-1650 — THE COMPANIONS' GEAR IS REAL GEAR.
//
// Owner: *"In the expanded character view when you tap your portrait, it needs
// to show weapons and armor equipped on your companions. and a small symbol
// next to the golems name in the shrunk character screen so we know if they are
// armed or not. i dont know when thiewr weapon breaks. and we should be able to
// repair the dogs armor, and the golems weapons when we craft."*
//
// ⚠⚠ WHAT THE MEASUREMENT FOUND, and it is bigger than the missing glyphs:
//
//   1. THE DOG'S VEST HAS NEVER BEEN DURABLE. `lookupBaseDurability` walked
//      weapons, armour, amulets, rings, gear and exploration — and never
//      dogGear.json. Every vest declares a baseDurability (18/24/28/32); no
//      instance was ever stamped with one; nothing wore one; and the owner's
//      "repair the dogs armor" had nothing to repair.
//   2. THE GOLEM'S WEAPON WORE AND DIED SILENTLY — a point a strike, then
//      "shatters in Bob's grip". The player's own gear has warned at 3 points
//      since OTA-959. That IS "i dont know when their weapon breaks".
//   3. AND IT COULD NOT BE MENDED BY ANY PATH IN THE GAME. `armGolem` moves the
//      instance OUT of player.inventory onto player.golem.weapon; the bench's
//      repair list and repairWithVendor both walk player.inventory.
import { readFileSync } from 'node:fs';
import dogGearJson from '../app/data/items/dogGear.json';
import { stampDurability, wearItemById } from '../app/engine/durability';
import {
  GOLEM_ARMED_GLYPH, DOG_ARMORED_GLYPH, COMPANION_FRAY_AT,
  gearCondition, conditionColor, durabilityLabel,
  golemWeapon, dogVestInstance, golemIsArmed, dogIsArmored,
  companionGearRows, offInventoryRepairables, findCompanionGearById, wearGolemWeapon,
} from '../app/engine/companionGear';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const VESTS = (dogGearJson as unknown as { dogGear: { name: string; baseDurability?: number; acBonus?: number }[] }).dogGear;

const item = (over: Partial<InventoryItem>): InventoryItem =>
  ({ id: 'i1', name: 'Thing', kind: 'misc', rarity: 'Common', quantity: 1, tags: [], ...over } as InventoryItem);

const withDog = (vest: InventoryItem | null, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({
    name: 'T', ac: 10, equipped: {}, inventory: vest ? [vest] : [], statusEffects: [],
    dog: vest
      ? { id: 'd', name: 'Scrap', breed: 'mutt', status: 'with_player', hp: 10, hpMax: 10, loyalty: 50,
          stats: { strength: 1, dexterity: 1, intelligence: 1 }, sex: { pronoun: 'they' },
          equipped: { vest: vest.name, vestId: vest.id } }
      : null,
    ...extra,
  } as unknown as PlayerCharacter);

const withGolem = (weapon: InventoryItem | null): PlayerCharacter =>
  ({
    name: 'T', ac: 10, equipped: {}, inventory: [], statusEffects: [],
    golem: { kind: 'mud_golem', name: 'Bob', hp: 20, hpMax: 20, attackDie: '1d8', attackMod: 0,
             damageType: 'bludgeoning', hitBonus: 0, summonedAt: 0, weapon },
  } as unknown as PlayerCharacter);

describe('OTA-1650 — the companions’ gear is real gear', () => {
  // ══ THE DEAD FIELD ════════════════════════════════════════════════════════
  describe('the dog’s vest was never durable', () => {
    it('every vest in the catalog declares a durability — and now gets one', () => {
      // ⚠ THE PROBE, KEPT. Before this OTA every one of these stamped NOTHING:
      // lookupBaseDurability never walked the dog-gear catalog, so four authored
      // numbers sat in the JSON that the game had never once read.
      expect(VESTS.length).toBeGreaterThanOrEqual(4);
      for (const v of VESTS) {
        expect(v.baseDurability).toBeGreaterThan(0);
        const inst = stampDurability(item({ name: v.name, kind: 'dog_armor' }));
        expect(inst.durability).toEqual({ current: v.baseDurability, max: v.baseDurability });
      }
    });

    it('a vest gets its printed value, NOT a tempered roll', () => {
      // ⚠ `kind` is 'dog_armor', not 'armor', so stampDurability's temper gate
      // (base × [0.4, 1.8], weapons and armour only) does not apply — and that
      // is the right side of the gate: a companion's ONLY armour slot should not
      // arrive at 40% of its printed value on a hidden bad roll. Stamping the
      // same vest a hundred times must give the same answer every time.
      const seen = new Set<number>();
      for (let i = 0; i < 100; i++) {
        seen.add(stampDurability(item({ name: VESTS[0]!.name, kind: 'dog_armor' })).durability!.max);
      }
      expect([...seen]).toEqual([VESTS[0]!.baseDurability]);
    });

    it('a vest wears and breaks like the armour it is', () => {
      const vest = stampDurability(item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor' }));
      let inv = [vest];
      let broken = false;
      for (let i = 0; i < (VESTS[0]!.baseDurability ?? 0) + 2 && !broken; i++) {
        const r = wearItemById(inv, 'v');
        inv = r.inventory;
        broken = r.broken;
      }
      expect(broken).toBe(true);
    });
  });

  // ══ KNOWING WHEN IT BREAKS ════════════════════════════════════════════════
  describe('"i dont know when thiewr weapon breaks"', () => {
    it('the fraying point matches the player’s own gear', () => {
      // OTA-959 gave the player's armour and weapons a warning at 3 points. A
      // companion's gear speaks up at the same point in its life — one constant,
      // so the two can never drift apart.
      expect(COMPANION_FRAY_AT).toBe(3);
    });

    it('the condition ladder names the moment that matters', () => {
      expect(gearCondition({ current: 28, max: 28 })).toBe('sound');
      expect(gearCondition({ current: 12, max: 28 })).toBe('worn');
      expect(gearCondition({ current: COMPANION_FRAY_AT, max: 28 })).toBe('failing');
      expect(gearCondition({ current: 1, max: 28 })).toBe('failing');
      expect(gearCondition(null)).toBe('none');
      expect(gearCondition(undefined)).toBe('none');
    });

    it('the readout says the number AND the word', () => {
      // A bare "(12/28)" is a number you have to interpret. This is the answer.
      expect(durabilityLabel({ current: 12, max: 28 })).toBe('12/28 · worn');
      expect(durabilityLabel({ current: 2, max: 28 })).toBe('2/28 · failing');
      // ⚠ A full piece says only its numbers — no "· sound" noise on a card
      // that has nothing to warn about.
      expect(durabilityLabel({ current: 28, max: 28 })).toBe('28/28');
      expect(durabilityLabel(null)).toBeNull();
    });

    it('failing wears the same red the HP bars use at their lowest band', () => {
      expect(conditionColor('failing')).toBe('#e07a5f');
      expect(conditionColor('worn')).toBe('#c9a86a');
      expect(conditionColor('sound')).toBe('#9ec96a');
    });

    it('the golem’s weapon warns before it shatters', () => {
      // ⚠ THE BEHAVIOUR, NOT A GREP. The old wear block had no fray branch at
      // all: it decremented, and at 0 it logged a shatter — nothing in between.
      // Now the rule is `wearGolemWeapon`, so it can be exercised directly
      // instead of asserted about, which is the point of having moved it.
      const start = 6;
      let g = { name: 'Bob', weapon: item({ name: 'Mud Maul', durability: { current: start, max: 20 } }) };
      const warned: string[] = [];
      const shattered: string[] = [];
      for (let i = 0; i < start + 1; i++) {
        const r = wearGolemWeapon(g);
        g = r.golem;
        for (const l of r.logs) (l.channel === 'system' ? warned : shattered).push(l.text);
      }
      // Exactly one warning, at the fray point, naming the golem and the weapon.
      expect(warned).toHaveLength(1);
      expect(warned[0]).toMatch(/Bob's Mud Maul is failing/);
      // And then it goes — the warning came BEFORE the shatter, which is the
      // whole ask.
      expect(shattered).toHaveLength(1);
      expect(shattered[0]).toMatch(/shatters in Bob's grip/);
      expect(g.weapon).toBeNull();
    });

    it('a golem with nothing in its hands wears nothing', () => {
      expect(wearGolemWeapon({ name: 'Bob', weapon: null })).toEqual({ golem: { name: 'Bob', weapon: null }, logs: [] });
      const noDur = { name: 'Bob', weapon: item({ name: 'Mud Maul' }) };
      expect(wearGolemWeapon(noDur).logs).toEqual([]);
      expect(wearGolemWeapon(noDur).golem.weapon).toBe(noDur.weapon);
    });

    it('the swing handler actually calls it', () => {
      const src = readFileSync('app/state/gameStore.ts', 'utf8');
      expect(src).toContain('wearGolemWeapon(workingGolem)');
    });

    it('the dog’s vest warns before it falls apart', () => {
      const src = readFileSync('app/state/combatResolution.ts', 'utf8');
      expect(src).toContain('COMPANION_FRAY_AT');
      expect(src).toMatch(/is coming apart/);
    });
  });

  // ══ THE GLYPHS ════════════════════════════════════════════════════════════
  describe('the two symbols he asked for by name', () => {
    it('a weapon beside the golem, a shield beside the dog', () => {
      expect(GOLEM_ARMED_GLYPH).toBe('⚔');
      expect(DOG_ARMORED_GLYPH).toBe('🛡');
      // ⚠ NEITHER COLLIDES with a glyph the game has already taught. ⚒ is
      // SALVAGE, ✦ is "worth a look", ★ is the weakness star (OTA-1638) — a
      // glyph that means two things means neither.
      expect([GOLEM_ARMED_GLYPH, DOG_ARMORED_GLYPH]).not.toContain('⚒');
      expect([GOLEM_ARMED_GLYPH, DOG_ARMORED_GLYPH]).not.toContain('✦');
      expect([GOLEM_ARMED_GLYPH, DOG_ARMORED_GLYPH]).not.toContain('★');
    });

    it('armed / armoured is true only when something is actually carried', () => {
      expect(golemIsArmed(withGolem(item({ name: 'Mud Maul' })))).toBe(true);
      expect(golemIsArmed(withGolem(null))).toBe(false);
      expect(golemIsArmed(null)).toBe(false);
      const vest = item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor' });
      expect(dogIsArmored(withDog(vest))).toBe(true);
      expect(dogIsArmored(withDog(null))).toBe(false);
      expect(dogIsArmored(null)).toBe(false);
    });

    it('a dead or abandoned companion is not "armed"', () => {
      // The compact panel hides those rows; the helpers must agree, or a stale
      // glyph outlives the companion wearing it.
      const vest = item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor' });
      const gone = withDog(vest);
      (gone.dog as unknown as { status: string }).status = 'dead';
      expect(dogIsArmored(gone)).toBe(false);
      expect(dogVestInstance(gone)).toBeNull();
      const downed = withGolem(item({ name: 'Mud Maul' }));
      (downed.golem as unknown as { hp: number }).hp = 0;
      expect(golemIsArmed(downed)).toBe(false);
    });

    it('a legacy save with an unresolvable vest row still reads as armoured', () => {
      // ⚠ `dogIsArmored` reads the DOG's own equipped name, not the resolved
      // instance. A save whose inventory row cannot be matched still has a dog
      // wearing a vest, and the glyph must not lie about that.
      const p = withDog(item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor' }));
      (p as unknown as { inventory: InventoryItem[] }).inventory = [];
      expect(dogIsArmored(p)).toBe(true);
      expect(dogVestInstance(p)).toBeNull();
    });

    it('the compact panel actually renders them', () => {
      const src = readFileSync('app/components/StatsPanel.tsx', 'utf8');
      expect(src).toContain('GOLEM_ARMED_GLYPH');
      expect(src).toContain('DOG_ARMORED_GLYPH');
      // And tints them when the piece is failing — the glyph answers "armed?",
      // the colour answers "for how much longer?".
      expect(src).toContain('gearGlyphFailing');
    });
  });

  // ══ SEEING IT ═════════════════════════════════════════════════════════════
  describe('the expanded view shows what the companions carry', () => {
    it('the character screen prints both pieces with their condition', () => {
      const src = readFileSync('app/screens/CharacterScreen.tsx', 'utf8');
      expect(src).toContain('durabilityLabel');
      expect(src).toContain('conditionColor');
      // The dog's vest row printed a bare name before this OTA — no AC, no wear.
      expect(src).toContain('dogVestAcBonus');
      expect(src).toMatch(/armWear/);
      expect(src).toMatch(/vestWear/);
    });

    it('one list covers both homes', () => {
      const vest = item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor' });
      const p = withDog(vest);
      (p as unknown as { golem: unknown }).golem = withGolem(item({ id: 'w', name: 'Mud Maul' })).golem;
      const rows = companionGearRows(p);
      expect(rows.map((r) => r.home).sort()).toEqual(['dog', 'golem']);
      expect(rows.find((r) => r.home === 'golem')?.slotLabel).toBe('Arm');
      expect(rows.find((r) => r.home === 'dog')?.slotLabel).toBe('Vest');
      expect(companionGearRows(null)).toEqual([]);
    });
  });

  // ══ MENDING IT ════════════════════════════════════════════════════════════
  describe('"repair the dogs armor, and the golems weapons when we craft"', () => {
    it('the golem’s weapon is the piece the bench could never see', () => {
      // ⚠ THE ROOT CAUSE. armGolem moves the instance OUT of player.inventory,
      // and the bench's repair list is player.inventory.filter(damaged). So a
      // golem weapon wore a point a swing and could never be mended by anything.
      const weapon = item({ id: 'w', name: 'Mud Maul', durability: { current: 4, max: 20 } });
      const p = withGolem(weapon);
      expect(p.inventory.some((i) => i.id === 'w')).toBe(false);   // not in the pack
      const off = offInventoryRepairables(p);
      expect(off.map((r) => r.item.id)).toEqual(['w']);
      expect(findCompanionGearById(p, 'w')?.home).toBe('golem');
    });

    it('a FULL companion weapon is not offered', () => {
      const p = withGolem(item({ id: 'w', name: 'Mud Maul', durability: { current: 20, max: 20 } }));
      expect(offInventoryRepairables(p)).toEqual([]);
    });

    it('the dog’s vest is NOT double-listed — it is already in the pack', () => {
      // ⚠ It lives in the inventory with `vestId` pointing at it, so the bench's
      // ordinary filter already finds it. Handing it back here too would put two
      // identical rows on the screen with no way to tell which one the button
      // mends.
      const vest = item({ id: 'v', name: VESTS[0]!.name, kind: 'dog_armor', durability: { current: 2, max: 18 } });
      expect(offInventoryRepairables(withDog(vest))).toEqual([]);
      expect(findCompanionGearById(withDog(vest), 'v')).toBeNull();
    });

    it('the bench asks for both homes, and writes each one back where it lives', () => {
      const screen = readFileSync('app/screens/CraftingScreen.tsx', 'utf8');
      expect(screen).toContain('offInventoryRepairables');
      const slice = readFileSync('app/state/slices/inventorySlice.ts', 'utf8');
      expect(slice).toContain('findCompanionGearById');
      // The write-back: a mended golem weapon goes to the golem, not the pack.
      expect(slice).toMatch(/companionHome === 'golem'/);
    });

    it('nothing is claimed for a player with no companions at all', () => {
      const bare = { name: 'T', ac: 10, equipped: {}, inventory: [], statusEffects: [] } as unknown as PlayerCharacter;
      expect(companionGearRows(bare)).toEqual([]);
      expect(offInventoryRepairables(bare)).toEqual([]);
      expect(findCompanionGearById(bare, 'anything')).toBeNull();
      expect(golemWeapon(bare)).toBeNull();
      expect(dogVestInstance(bare)).toBeNull();
    });
  });
});
