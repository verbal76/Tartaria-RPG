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

// ⚠⚠⚠ OTA-1649 — WHAT A RING IS FOR.
//
// Owner: *"do the ring and amulet recipes, and give the diadem a route. again
// better effects with rarity and ingredient quality. they should give
// combinations of stat buffs, moderate resists and let's get some special AOE
// effects… each ring doesn't need to have all three things. the combinations of
// 1, 2 or three things should scale with rarity."*
//
// And, by example: *"a ring could do 50 frost damage to anything in 2 rings of
// range once per combat encounter. or a ring could give fire resist that
// mitigates 50% of incoming fire damage and boosts fire coated weapons damage
// by 25%. or a thieves ring could increase stealth damage by 60% or maybe a
// scribes ring grants +2 int."*
//
// ⚠⚠ THE DEFECT THIS OPENED ON. Before any of the new work: fifteen of the
// thirty-two shipped accessories carried a `resistances` list, the item card
// printed it, and combat had NEVER SEEN ONE. `aggregateArmor`'s resist walk
// covered ARMOR_SLOTS only, so a Legendary aetheric amulet arrived at the
// damage math as `[]` with a mitigation fraction of 0. That was measured with a
// throwaway probe before a line was changed; the first test below IS that
// probe, kept, so the field can never go quiet again.
import ringsJson from '../app/data/items/rings.json';
import amuletsJson from '../app/data/items/amulets.json';
import recipesJson from '../app/data/items/recipes.json';
import materialsJson from '../app/data/items/materials.json';
import gearJson from '../app/data/items/gear.json';
import weaponsJson from '../app/data/items/weapons.json';
import armorJson from '../app/data/items/armor.json';
import explorationJson from '../app/data/items/exploration.json';
import { aggregateArmor } from '../app/state/combatResolution';
import { armorResistanceFraction, applyArmorResistance, MAX_ARMOR_RESIST, ARMOR_SLOT_RESIST_WEIGHT } from '../app/engine/crafting';
import type { CatalogAccessory } from '../app/engine/crafting';
import {
  FAMILY_RULE, ACCESSORY_RESIST_WEIGHT, COATED_BOOST_PCT, STEALTH_DAMAGE_PCT, BURST_DAMAGE,
  accessoryFamilies, accessoryLadderViolation, accessoryResistWeight, accessoryStatBonuses,
  equippedAccessoryPowers, coatedBoostPct, applyStealthDamage,
} from '../app/engine/accessoryEffects';
import { RING_SLOTS } from '../app/engine/equipment';
import { buildCombatSteps } from '../app/engine/combatRules';
import { getItemPreview } from '../app/components/itemPreview';
import type { PlayerCharacter, Rarity } from '../app/engine/types';

const RINGS = (ringsJson as unknown as { rings: CatalogAccessory[] }).rings;
const AMULETS = (amuletsJson as unknown as { amulets: CatalogAccessory[] }).amulets;
const ALL: CatalogAccessory[] = [...RINGS, ...AMULETS];
const RECIPES = (recipesJson as unknown as { recipes: { result: string; ingredients: { name: string; quantity: number }[] }[] }).recipes;
const RARITIES: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const RANK: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };

const byName = (n: string): CatalogAccessory => {
  const r = ALL.find((x) => x.name === n);
  if (!r) throw new Error(`no accessory named ${n}`);
  return r;
};

const mk = (equipped: Record<string, string>): PlayerCharacter =>
  ({ name: 'T', ac: 10, equipped, inventory: [], statusEffects: [] } as unknown as PlayerCharacter);

describe('OTA-1649 — the accessory overhaul', () => {
  // ══ THE DEAD FIELD ════════════════════════════════════════════════════════
  describe('the resist list that combat never saw', () => {
    it('an accessory resistance now reaches the damage math', () => {
      // ⚠ THE PROBE, KEPT. Every one of these read `resistances=[] fraction=0`
      // before this OTA. If this test ever goes green-to-red, the jewellery has
      // been dropped out of aggregateArmor again.
      const cases: [string, Record<string, string>, string][] = [
        ['Heart of the Aetherstorm', { amulet: 'Heart of the Aetherstorm' }, 'aetheric'],
        ['Ring of the Deep Current', { ring: 'Ring of the Deep Current' }, 'aetheric'],
        ['Behemoth-Heart Talisman', { amulet: 'Behemoth-Heart Talisman' }, 'bludgeoning'],
        ['Tartarian Stoneband', { ring: 'Tartarian Stoneband' }, 'bludgeoning'],
      ];
      for (const [label, eq, dt] of cases) {
        const agg = aggregateArmor(mk(eq));
        expect(agg.resistances).toContain(dt);
        expect(armorResistanceFraction(dt, agg.resistSlots)).toBeGreaterThan(0);
        expect(label).toBeTruthy();
      }
    });

    it('every shipped resistance entry is live, on every one of the 15 rows that has one', () => {
      const withResists = ALL.filter((a) => (a.resistances ?? []).length > 0);
      expect(withResists.length).toBeGreaterThanOrEqual(15);
      for (const row of withResists) {
        const slot = RINGS.includes(row) ? 'ring' : 'amulet';
        const agg = aggregateArmor(mk({ [slot]: row.name }));
        for (const t of row.resistances) {
          expect(armorResistanceFraction(t, agg.resistSlots)).toBeGreaterThan(0);
        }
      }
    });

    it('a resist a piece does NOT carry stays at zero', () => {
      // The complement of the fix: wiring the list must not have wired ALL types.
      const agg = aggregateArmor(mk({ ring: 'Tartarian Stoneband' }));   // bludgeoning only
      expect(armorResistanceFraction('burn', agg.resistSlots)).toBe(0);
    });

    it('jewellery joins the armour stack — same diminishing returns, same ceiling', () => {
      // ⚠ NOT A PARALLEL SYSTEM. A trinket is worth less on top of armour that
      // already resists the type than it is worn alone; that is the whole reason
      // it goes into resistSlots rather than getting its own multiplier.
      const slots = [
        { type: 'burn', slot: 'chest' },                              // 0.35 from the slot table
        { type: 'burn', slot: 'ring', weight: ACCESSORY_RESIST_WEIGHT.ring.Legendary },
      ];
      const chestOnly = armorResistanceFraction('burn', [slots[0]!]);
      const both = armorResistanceFraction('burn', slots);
      const ringOnly = armorResistanceFraction('burn', [slots[1]!]);
      expect(chestOnly).toBeCloseTo(0.35, 5);
      expect(ringOnly).toBeCloseTo(0.20, 5);
      expect(both).toBeCloseTo(1 - 0.65 * 0.80, 5);          // 0.48, not 0.55
      expect(both).toBeLessThan(chestOnly + ringOnly);       // diminishing, always
    });

    it('a full jewellery build is never immunity', () => {
      const many = RANGE_TYPES.map((_, i) => ({ type: 'aetheric', slot: `ring${i}`, weight: 0.9 }));
      expect(armorResistanceFraction('aetheric', many)).toBeLessThanOrEqual(MAX_ARMOR_RESIST);
      expect(applyArmorResistance(100, 'aetheric', many).damage).toBeGreaterThan(0);
    });

    it('armour entries without a weight still read the slot table — nothing regressed', () => {
      // ⚠ The `weight` field is OPTIONAL and armour never sets it. Every
      // pre-OTA-1649 caller must behave exactly as it did.
      for (const [slot, w] of Object.entries(ARMOR_SLOT_RESIST_WEIGHT)) {
        expect(armorResistanceFraction('burn', [{ type: 'burn', slot }])).toBeCloseTo(w, 5);
      }
    });

    it('each ring slot counts separately — four aetheric rings are four entries', () => {
      // The stack counts a SLOT once per type, so the four fingers must arrive
      // under four different keys or three of them vanish.
      const aetheric = RINGS.filter((r) => (r.resistances ?? []).includes('aetheric'));
      expect(aetheric.length).toBeGreaterThanOrEqual(3);
      const eq: Record<string, string> = {};
      RING_SLOTS.forEach((k, i) => { eq[k] = aetheric[i % aetheric.length]!.name; });
      const powers = equippedAccessoryPowers(mk(eq));
      const slots = new Set(powers.resistSlots.map((s) => s.slot));
      expect(slots.size).toBe(RING_SLOTS.length);
      const one = armorResistanceFraction('aetheric', equippedAccessoryPowers(mk({ ring: aetheric[0]!.name })).resistSlots);
      const four = armorResistanceFraction('aetheric', powers.resistSlots);
      expect(four).toBeGreaterThan(one);
    });
  });

  // ══ THE LADDER ════════════════════════════════════════════════════════════
  describe('1, 2 or 3 things, scaling with rarity', () => {
    it('every accessory in the game sits on the ladder', () => {
      const bad = ALL.map((r) => ({ name: r.name, why: accessoryLadderViolation(r) })).filter((x) => x.why);
      expect(bad).toEqual([]);
    });

    it('the special effect IS the rarity gate', () => {
      // ⚠ THE RULE'S TEETH. The count alone could not be the gate: two COMMON
      // amulets shipped years ago already carrying two families, and holding an
      // exact-count line would have meant deleting a resist off items sitting in
      // players' packs. So the gate moved to the thing the owner's sentence
      // actually points at — a Legendary always does something; a Common never
      // does. That is what makes "scales with rarity" checkable.
      expect(FAMILY_RULE.Common.special).toBe('forbidden');
      expect(FAMILY_RULE.Uncommon.special).toBe('forbidden');
      expect(FAMILY_RULE.Rare.special).toBe('allowed');
      expect(FAMILY_RULE.Legendary.special).toBe('required');
      for (const row of ALL) {
        const hasSpecial = accessoryFamilies(row).includes('special');
        if (RANK[row.rarity] < RANK.Rare) expect(hasSpecial).toBe(false);
        if (row.rarity === 'Legendary') expect(hasSpecial).toBe(true);
      }
    });

    it('the floors and ceilings rise, and never cross', () => {
      for (let i = 1; i < RARITIES.length; i++) {
        const lo = FAMILY_RULE[RARITIES[i - 1]!];
        const hi = FAMILY_RULE[RARITIES[i]!];
        expect(hi.min).toBeGreaterThanOrEqual(lo.min);
        expect(hi.max).toBeGreaterThanOrEqual(lo.max);
        expect(hi.min).toBeLessThanOrEqual(hi.max);
      }
      expect(FAMILY_RULE.Legendary.min).toBe(3);
      expect(FAMILY_RULE.Legendary.max).toBe(3);
    });

    it('every magnitude table is strictly better at every step up', () => {
      // ⚠ THE OTHER HALF OF "BETTER EFFECTS WITH RARITY". The family COUNT
      // cannot separate a two-family Uncommon from a two-family Rare — the
      // numbers have to, and they do, on all five tables.
      const tables: [string, Record<Rarity, number>][] = [
        ['ring resist', ACCESSORY_RESIST_WEIGHT.ring],
        ['amulet resist', ACCESSORY_RESIST_WEIGHT.amulet],
        ['coated boost', COATED_BOOST_PCT],
        ['stealth damage', STEALTH_DAMAGE_PCT],
        ['burst damage', BURST_DAMAGE],
      ];
      for (const [label, t] of tables) {
        for (let i = 1; i < RARITIES.length; i++) {
          expect(`${label} ${RARITIES[i]}>${RARITIES[i - 1]}: ${t[RARITIES[i]!] > t[RARITIES[i - 1]!]}`)
            .toBe(`${label} ${RARITIES[i]}>${RARITIES[i - 1]}: true`);
        }
      }
    });

    it('an amulet outweighs a ring at equal rarity, and neither out-armours the chest', () => {
      // One neck, four fingers: pricing them the same makes the neck the worst
      // slot on the body. And a trinket must never beat a breastplate.
      for (const r of RARITIES) {
        expect(ACCESSORY_RESIST_WEIGHT.amulet[r]).toBeGreaterThan(ACCESSORY_RESIST_WEIGHT.ring[r]);
        expect(ACCESSORY_RESIST_WEIGHT.amulet[r]).toBeLessThan(ARMOR_SLOT_RESIST_WEIGHT.chest!);
      }
    });
  });

  // ══ THE OWNER'S FOUR EXAMPLES ═════════════════════════════════════════════
  describe('the four things he asked for by name', () => {
    it('"a scribes ring grants +2 int"', () => {
      const r = byName("Scribe's Signet");
      const bonuses = accessoryStatBonuses(r);
      expect(bonuses).toContainEqual({ stat: 'intelligence', amount: 2 });
      // And it shows the SECOND stat too — the row carries statBonuses, which is
      // new; a card that printed only the primary would under-state the item.
      expect(bonuses.length).toBe(2);
      expect(getItemPreview("Scribe's Signet")?.stats).toContain('WIS +1');
    });

    it('"a thieves ring could increase stealth damage by 60%"', () => {
      const powers = equippedAccessoryPowers(mk({ ring: 'Ring of the Quiet Hand' }));
      expect(powers.stealthPct).toBeCloseTo(0.60, 5);
      expect(applyStealthDamage(20, powers.stealthPct)).toBe(32);
    });

    it('"boosts fire coated weapons damage by 25%"', () => {
      const powers = equippedAccessoryPowers(mk({ ring: 'Cinderward Ring' }));
      expect(coatedBoostPct(powers, 'burn')).toBeCloseTo(0.25, 5);
      // ⚠ AND ONLY fire. A boost that leaked onto every coating would make one
      // Rare ring the best ring in the game for every build.
      expect(coatedBoostPct(powers, 'poison')).toBe(0);
      expect(coatedBoostPct(powers, 'cold')).toBe(0);
    });

    it('"fire resist that mitigates 50% of incoming fire damage"', () => {
      // ⚠ HIS NUMBER, AND WHAT IT COSTS. Half of incoming fire is not one ring —
      // it is three slots given over to the one element. Measured here rather
      // than asserted in a comment, because the whole design rests on it: a
      // Legendary amulet + a Legendary ring + a Rare ring.
      const fraction = armorResistanceFraction('burn', [
        { type: 'burn', slot: 'amulet', weight: ACCESSORY_RESIST_WEIGHT.amulet.Legendary },
        { type: 'burn', slot: 'ring', weight: ACCESSORY_RESIST_WEIGHT.ring.Legendary },
        { type: 'burn', slot: 'ring2', weight: ACCESSORY_RESIST_WEIGHT.ring.Rare },
      ]);
      expect(fraction).toBeGreaterThan(0.45);
      expect(fraction).toBeLessThan(0.55);
      // One Legendary ring on its own buys a fifth, not a half.
      expect(ACCESSORY_RESIST_WEIGHT.ring.Legendary).toBeCloseTo(0.20, 5);
    });

    it('"50 frost damage to anything in 2 rings of range once per combat encounter"', () => {
      const powers = equippedAccessoryPowers(mk({ ring: "Rimebinder's Ring" }));
      expect(powers.bursts.length).toBe(1);
      const b = powers.bursts[0]!;
      expect(b.amount).toBe(50);
      expect(b.damageType).toBe('cold');
      expect(b.bands).toEqual(['mid', 'close']);   // two rings out from the wearer
      expect(BURST_DAMAGE.Legendary).toBe(50);
    });
  });

  // ══ THE THREE NEW FAMILIES, AS MACHINERY ══════════════════════════════════
  describe('stat buffs, moderate resists, special effects', () => {
    it('all three families exist somewhere in the catalog, in both kinds', () => {
      for (const pool of [RINGS, AMULETS]) {
        const fams = new Set(pool.flatMap((r) => accessoryFamilies(r)));
        expect([...fams].sort()).toEqual(['resist', 'special', 'stat']);
      }
    });

    it('every special kind is actually authored on something', () => {
      expect(ALL.filter((r) => r.coatedBoost).length).toBeGreaterThanOrEqual(3);
      expect(ALL.filter((r) => r.stealthDamage).length).toBeGreaterThanOrEqual(3);
      expect(ALL.filter((r) => r.burst).length).toBeGreaterThanOrEqual(3);
    });

    it('the boost and the stealth multiplier take the BEST, never the sum', () => {
      // ⚠ Two burn rings are a redundancy, not a doubling. Summing would let
      // four fingers turn a 1d6 coating into a finisher.
      const two = equippedAccessoryPowers(mk({ ring: 'Cinderward Ring', ring2: 'Emberheart Locket' }));
      expect(coatedBoostPct(two, 'burn')).toBeCloseTo(COATED_BOOST_PCT.Rare, 5);
      const stealthy = equippedAccessoryPowers(mk({
        ring: 'Ring of the Quiet Hand', ring2: "Cutpurse's Band", amulet: 'Nightglass Pendant',
      }));
      expect(stealthy.stealthPct).toBeCloseTo(STEALTH_DAMAGE_PCT.Legendary, 5);
      expect(stealthy.stealthPct).toBeLessThan(1);
    });

    it('bursts DO stack — that is the one thing that does', () => {
      // Each is a separate object spending a separate slot, and each fires once.
      // Four burst rings buy one very loud opening round and four dead fingers
      // for the rest of the fight.
      const powers = equippedAccessoryPowers(mk({
        ring: "Rimebinder's Ring", ring2: 'Thunderclap Ring', amulet: 'Amulet of the Cold Star',
      }));
      expect(powers.bursts.length).toBe(3);
      expect(new Set(powers.bursts.map((b) => b.source)).size).toBe(3);
    });

    it('the stealth multiplier never lowers a number and is a no-op unworn', () => {
      expect(applyStealthDamage(17, 0)).toBe(17);
      expect(applyStealthDamage(1, 0.6)).toBeGreaterThanOrEqual(1);
      expect(equippedAccessoryPowers(mk({})).stealthPct).toBe(0);
      expect(equippedAccessoryPowers(null).bursts).toEqual([]);
    });

    it('the swing carries `fromStealth` because the status is gone by damage time', () => {
      // ⚠ THE BUG THIS PREVENTS. `stealthed` is stripped by consumeOnResolve the
      // instant the ATTACK step resolves, and pendingRolls is nulled before
      // concludeRolls runs — so a damage-time read of the player would miss the
      // very swing the ring was bought for. The flag is stamped at build time.
      const base = {
        name: 'T', ac: 10, hp: 20, hpMax: 20, level: 1, stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 10 },
        equipped: {}, inventory: [], statusEffects: [],
      } as unknown as PlayerCharacter;
      const enemy = { name: 'Mark', hp: 20, ac: 10, damage: '1d6', type: 'Human', traits: [] } as never;
      const plain = buildCombatSteps('attack', base, enemy);
      expect(plain.find((s) => s.id === 'damage')?.fromStealth).toBeUndefined();
      const sneaking = {
        ...base,
        statusEffects: [{ kind: 'stealthed', remainingRounds: 2, label: 'unseen' }],
      } as unknown as PlayerCharacter;
      expect(buildCombatSteps('attack', sneaking, enemy).find((s) => s.id === 'damage')?.fromStealth).toBe(true);
    });
  });

  // ══ THE ROUTES ════════════════════════════════════════════════════════════
  describe('every ring and amulet can be made', () => {
    const CATALOG_NAMES = new Set<string>([
      ...(materialsJson as unknown as { materials: { name: string; rarity?: Rarity }[] }).materials.map((m) => m.name),
      ...(gearJson as unknown as { gear: { name: string }[] }).gear.map((g) => g.name),
      ...(weaponsJson as unknown as { weapons: { name: string }[] }).weapons.map((w) => w.name),
      ...(armorJson as unknown as { armor: { name: string }[] }).armor.map((a) => a.name),
      ...(explorationJson as unknown as { name: string }[]).map((e) => e.name),
      ...ALL.map((a) => a.name),
    ]);
    const RARITY_OF = new Map<string, Rarity>();
    for (const m of (materialsJson as unknown as { materials: { name: string; rarity?: Rarity }[] }).materials) {
      RARITY_OF.set(m.name, m.rarity ?? 'Common');
    }
    for (const a of ALL) RARITY_OF.set(a.name, a.rarity);

    it('the Aetheric Diadem has a route — it was the only unobtainable item in the game', () => {
      // ⚠ Audited before this OTA: no recipe, no loot table, no vendor, no quest
      // reward. It was in the catalog and reachable by nothing.
      expect(RECIPES.some((r) => r.result === 'Aetheric Diadem')).toBe(true);
    });

    it('nothing in the category is loot-only any more', () => {
      const have = new Set(RECIPES.map((r) => r.result));
      const missing = ALL.map((a) => a.name).filter((n) => !have.has(n));
      expect(missing).toEqual([]);
      expect(ALL.length).toBe(48);
    });

    it('every ingredient of every accessory recipe exists in a catalog', () => {
      // The OTA-1639 rule, applied to this OTA's own authoring.
      const bad: string[] = [];
      const accNames = new Set(ALL.map((a) => a.name));
      for (const r of RECIPES) {
        if (!accNames.has(r.result)) continue;
        for (const ing of r.ingredients) {
          if (!CATALOG_NAMES.has(ing.name)) bad.push(`${r.result} ← ${ing.name}`);
          expect(ing.quantity).toBeGreaterThan(0);
        }
      }
      expect(bad).toEqual([]);
    });

    it('ingredient QUALITY scales with rarity — you cannot reach a Legendary from scrap', () => {
      // ⚠ Owner: *"better effects with rarity AND INGREDIENT QUALITY."* Made
      // mechanical: every accessory recipe must contain at least one ingredient
      // of the result's own rarity or higher.
      //
      // ⚠ ONE SHIPPED RECIPE FAILED THIS and was repaired rather than
      // grandfathered: Reclaimer's Aegis Pendant is Rare and asked for Scrap
      // Metal / Aetheric Shard / Spider Silk — top ingredient Uncommon. A Rare
      // you could make out of common scrap is the same defect the owner is
      // asking us to fix.
      const accRarity = new Map(ALL.map((a) => [a.name, a.rarity] as const));
      const bad: string[] = [];
      for (const r of RECIPES) {
        const want = accRarity.get(r.result);
        if (!want) continue;
        const top = Math.max(...r.ingredients.map((i) => RANK[RARITY_OF.get(i.name) ?? 'Common']));
        if (top < RANK[want]) bad.push(`${r.result} (${want}) — best ingredient rank ${top}`);
      }
      expect(bad).toEqual([]);
    });

    it("Reclaimer's Aegis Pendant specifically", () => {
      const r = RECIPES.find((x) => x.result === "Reclaimer's Aegis Pendant")!;
      expect(r.ingredients.map((i) => i.name)).toContain('Hardened Mudstone');   // Rare
    });

    it('⚠⚠⚠ no accessory recipe names an ingredient no recipe used before', () => {
      // ⚠ THE MISTAKE THIS OTA MADE AND HAD TO UNDO, kept as a rule.
      //
      // `isRecipeIngredientName` bars any recipe ingredient from the Crucible, so
      // naming a NEW material in a recipe silently takes it OUT of the fusion
      // fodder pool. The first draft of these 38 recipes claimed 22 fresh
      // materials — Aetheric Blood, Spirit Residue, Warden Stone, Aetheric Cog
      // and eighteen others — and broke SEVEN shipped fusion suites, which were
      // right: the Crucible had genuinely lost its fodder.
      //
      // The fix was not to repoint those suites. It was to re-author every
      // recipe out of the 96 names recipes ALREADY used, so the fodder pool
      // after this OTA is bit-identical to the pool before it. This pins that:
      // a future accessory recipe reaching for a fresh material has to answer
      // for the Crucible first.
      const accNames = new Set(ALL.map((a) => a.name));
      const usedByOthers = new Set<string>();
      for (const r of RECIPES) {
        if (accNames.has(r.result)) continue;
        for (const i of r.ingredients) usedByOthers.add(i.name);
      }
      // Every accessory ingredient must ALSO be used by some non-accessory
      // recipe — i.e. it was already out of the fusion pool before this OTA.
      const claimed: string[] = [];
      for (const r of RECIPES) {
        if (!accNames.has(r.result)) continue;
        for (const i of r.ingredients) {
          if (!usedByOthers.has(i.name)) claimed.push(`${r.result} ← ${i.name}`);
        }
      }
      expect(claimed).toEqual([]);
    });

    it('no recipe lists the same ingredient twice', () => {
      // A row with two entries for one material is malformed, and the blind
      // ingredient-substitution pass that fixed the fusion regression produced
      // exactly that in seven recipes before this caught them.
      const dupes = RECIPES
        .filter((r) => new Set(r.ingredients.map((i) => i.name)).size !== r.ingredients.length)
        .map((r) => r.result);
      expect(dupes).toEqual([]);
    });
  });

  // ══ THE CARD ══════════════════════════════════════════════════════════════
  describe('the item card says what the thing does', () => {
    it('the resist line names a NUMBER, off the same table combat reads', () => {
      // It said a bare "Resists: aetheric" while the game charged nothing.
      const stats = getItemPreview('Heart of the Aetherstorm')?.stats ?? [];
      const line = stats.find((s) => s.startsWith('Resists '));
      expect(line).toBeDefined();
      expect(line).toContain(`−${Math.round(accessoryResistWeight('amulet', 'Legendary') * 100)}%`);
    });

    it('a discharge card admits it is once per fight', () => {
      const stats = getItemPreview("Rimebinder's Ring")?.stats ?? [];
      expect(stats.some((s) => /50 cold/.test(s) && /once per fight/.test(s))).toBe(true);
    });

    it('the coating boost and the stealth multiplier are both on their cards', () => {
      expect((getItemPreview('Cinderward Ring')?.stats ?? []).some((s) => /burn coatings bite \+25%/.test(s))).toBe(true);
      expect((getItemPreview('Ring of the Quiet Hand')?.stats ?? []).some((s) => /stealth deal \+60%/.test(s))).toBe(true);
    });
  });

  // ══ NOTHING OLD BROKE ═════════════════════════════════════════════════════
  describe('the shipped catalog is intact', () => {
    it('no accessory lost a stat, an AC point or a resist', () => {
      // ⚠ THE LADDER NEVER REMOVES. Seven rows were off it and all seven GAINED
      // something; this pins the shape of that promise for the rows that carried
      // value before the OTA.
      const KEPT: [string, number, number][] = [
        // name, stat bonuses, resist entries
        ['Minor Aetheric Amulet', 1, 1],
        ['Aetheric Locket', 1, 1],
        ['Mud Warden Amulet', 1, 2],
        ['Lich Phylactery', 1, 1],
        ['Behemoth-Heart Talisman', 1, 2],
        ['Heart of the Aetherstorm', 1, 2],
        ['Ring of the Deep Current', 1, 1],
      ];
      for (const [name, stats, resists] of KEPT) {
        const r = byName(name);
        expect(accessoryStatBonuses(r).length).toBeGreaterThanOrEqual(stats);
        expect((r.resistances ?? []).length).toBe(resists);
      }
      expect(byName('Heart of the Aetherstorm').acBonus).toBe(1);
      expect(byName("Titan's Iron Band").acBonus).toBe(1);
    });

    it('accessory AC is untouched by any of this', () => {
      const acRings = RINGS.filter((r) => (r.acBonus ?? 0) > 0);
      expect(acRings.length).toBeGreaterThan(0);
      expect(aggregateArmor(mk({ ring: acRings[0]!.name })).acBonus).toBe(acRings[0]!.acBonus);
      expect(aggregateArmor(mk({})).acBonus).toBe(0);
    });

    it('wearing nothing is still nothing', () => {
      const p = equippedAccessoryPowers(mk({}));
      expect(p.resistSlots).toEqual([]);
      expect(p.resistances).toEqual([]);
      expect(p.coated).toEqual({});
      expect(p.stealthPct).toBe(0);
      expect(p.bursts).toEqual([]);
    });
  });
});

// Small helper so the immunity test reads as a stack of many, not a magic list.
const RANGE_TYPES = [0, 1, 2, 3, 4, 5, 6, 7];
