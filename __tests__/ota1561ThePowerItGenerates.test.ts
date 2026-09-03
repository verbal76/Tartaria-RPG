/**
 * OTA-1561 — THE POWER IT GENERATES.
 *
 * ⚠⚠⚠ THE CRUCIBLE OPENS TO RUNE-CASTERS, which is where the whole thread that
 * started at "still cannot apply a coating to earthshaker" actually lands. The
 * owner: *"I don't want runecasters to have an edge ... a runecaster is a power
 * weapon so it can only use the power it can generate, so you cannot apply
 * coatings, but they can be upgraded at the cruciable, but it adds passive stats
 * instead that improve with character stats."*
 *
 * ⚠⚠⚠ ONE LINE WAS THE WHOLE BLOCKAGE. `crucibleUpgradeVerdict` collapsed every
 * non-coatable weapon into a single refusal — *"fires no edge to carry a
 * coating — energy weapons take no channel"* — which is TRUE, and was the entire
 * answer, so 55 rune-casters could be carried to the bench and turned away. The
 * refusal was never wrong; it was just the only thing the function could say.
 *
 * ⚠⚠ WHAT THE UPGRADE GIVES, AND WHY IT IS COMPUTED AND NOT STAMPED. The owner
 * asked for passives that *"improve with character stats"*. A number written onto
 * the weapon at the bench cannot do that — it is fixed the moment it is written.
 * So the bonus is read off the WIELDER on every swing: the same Void Edge is
 * worth +3 to a WIS 4 character and +12 to a WIS 16 one, and it keeps rising as
 * they do. That is the difference between a passive that scales and a passive
 * that merely started large.
 *
 * ⚠⚠ WHICH stat comes from OTA-1560's table (role first, damage type for plain
 * strikes, school irrelevant), so this OTA adds no new judgement about what ties
 * to what — it only spends the answer that was already agreed.
 *
 * ⚠ CAPS ARE HIS, VERBATIM: *"like coatings up to 2 passives unless it's
 * extremely rare then 3 passives."* One passive per Crucible visit, at five
 * reserved pieces a visit, so a three-slot Legendary is fifteen pieces of
 * gathered fodder — and OTA-1552's safeguard now stands between that fodder and
 * a repair bench, which is the other half of making this cost mean something.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  runecasterPassiveBonus,
  runecasterPassiveSlots,
  PASSIVE_STAT_DIVISOR,
  PASSIVE_PER_SLOT_CAP,
} from '../app/engine/runecasterPassives';
import { crucibleUpgradeVerdict } from '../app/engine/itemFusion';
import type { InventoryItem, Stats } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const stats = (over: Partial<Stats> = {}): Stats => ({
  strength: 8, dexterity: 8, intelligence: 8, wisdom: 8, charisma: 8, stealth: 8, ...over,
});
const caster = (name: string, over: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: 'rc1', name, kind: 'weapon', rarity: 'Uncommon', quantity: 1, tags: ['runecaster'], ...over } as InventoryItem);

describe('OTA-1561 — the Crucible finally takes a rune-caster', () => {
  it('⚠⚠⚠ EARTHSHAKER IS UPGRADEABLE — the piece he was refused twice', () => {
    const v = crucibleUpgradeVerdict(caster('Earthshaker Wand'));
    expect(v.kind).toBe('runecaster');
    expect(v.blocked).toBeNull();
  });

  it('⚠⚠⚠ …and it is no longer told it has no edge, because that was never the point', () => {
    const v = crucibleUpgradeVerdict(caster('Earthshaker Wand'));
    expect(v.blocked ?? '').not.toContain('no edge');
  });

  it('⚠⚠⚠ A FULL CASTER IS REFUSED BY ITS OWN LIMIT, and says the number', () => {
    const full = crucibleUpgradeVerdict(caster('Earthshaker Wand', { runePassives: 2 }));
    expect(full.kind).toBe('runecaster');
    expect(full.blocked).toContain('2');
    // A Legendary still has room at 2 — the cap is what differs, not the rule.
    const leg = crucibleUpgradeVerdict(caster('Void Edge', { rarity: 'Legendary', runePassives: 2 }));
    expect(leg.blocked).toBeNull();
    expect(crucibleUpgradeVerdict(caster('Void Edge', { rarity: 'Legendary', runePassives: 3 })).blocked)
      .toContain('3');
  });

  it('⚠⚠ AN ENERGY RANGED WEAPON STILL GETS THE COATING REFUSAL — only casters got the new door', () => {
    // A plasma thrower genuinely has no channel of any kind. Widening the weapon
    // test instead of adding a case would have handed it an upgrade it has no
    // fiction for.
    const v = crucibleUpgradeVerdict(caster('Plasma Rifle', { tags: ['weapon', 'ranged', 'firearm'] }));
    expect(v.kind).toBeNull();
    expect(v.blocked).toContain('no edge');
  });

  it('⚠⚠ a coatable weapon and a piece of armour are untouched by any of this', () => {
    expect(crucibleUpgradeVerdict(caster('Cudgel', { tags: ['weapon', 'melee'] })).kind).toBe('weapon');
    expect(crucibleUpgradeVerdict(caster("Reclaimer's Scrapplate", { kind: 'armor', tags: [] })).kind).toBe('armor');
  });

  it('⚠ the great-climb lock still outranks everything, casters included', () => {
    const v = crucibleUpgradeVerdict(caster('Beacon Rifle', { tags: ['runecaster', 'collect_only'] }));
    expect(v.kind).toBeNull();
    expect(v.blocked).toContain('great climbs');
  });
});

describe('OTA-1561 — the passive is read off the WIELDER, which is the design', () => {
  const voidEdge = { weaponKind: 'runecaster', damageType: 'aetheric', tags: ['runecaster', 'aetheric', 'unmaking', 'legendary'] };

  it('⚠⚠⚠ THE SAME WEAPON IS WORTH DIFFERENT AMOUNTS IN DIFFERENT HANDS', () => {
    // This single assertion is the whole feature. A number stamped at the bench
    // could not do it.
    const weak = runecasterPassiveBonus(voidEdge, stats({ wisdom: 4 }), 3);
    const strong = runecasterPassiveBonus(voidEdge, stats({ wisdom: 16 }), 3);
    expect(weak.stat).toBe('wisdom');
    expect(weak.total).toBe(3);    // floor(4/4) = 1 per slot × 3
    expect(strong.total).toBe(12); // floor(16/4) = 4 per slot × 3
  });

  it('⚠⚠⚠ IT KEEPS RISING AS THE CHARACTER DOES — never flat, never backwards', () => {
    let last = -1;
    for (let wis = 0; wis <= 24; wis += 1) {
      const b = runecasterPassiveBonus(voidEdge, stats({ wisdom: wis }), 2);
      expect(b.total).toBeGreaterThanOrEqual(last);
      last = b.total;
    }
  });

  it('⚠⚠⚠ IT READS THE RIGHT STAT — the one OTA-1560 assigned, not the caster stat', () => {
    // Void Edge is an `unmaking` aether strike, so it rewards WISDOM even though
    // INT is what every rune-caster rolls to hit with. If this ever fell back to
    // INT, the whole build-choice design would quietly collapse into one stat.
    expect(runecasterPassiveBonus(voidEdge, stats({ wisdom: 20, intelligence: 4 }), 1).stat).toBe('wisdom');
    const mudBlast = { weaponKind: 'runecaster', damageType: 'bludgeoning', tags: ['runecaster', 'mud_dwellers'] };
    expect(runecasterPassiveBonus(mudBlast, stats(), 1).stat).toBe('strength');
    const golem = { weaponKind: 'runecaster', damageType: 'bludgeoning', tags: ['runecaster', 'summon'] };
    expect(runecasterPassiveBonus(golem, stats(), 1).stat).toBe('charisma');
  });

  it('⚠⚠ A CAP PER SLOT, so a late-game stat cannot make one weapon the only weapon', () => {
    const huge = runecasterPassiveBonus(voidEdge, stats({ wisdom: 99 }), 3);
    expect(huge.perSlot).toBe(PASSIVE_PER_SLOT_CAP);
    expect(huge.total).toBe(PASSIVE_PER_SLOT_CAP * 3);
  });

  it('⚠⚠ NO PASSIVES → NO BONUS. An un-upgraded caster is exactly what it was', () => {
    expect(runecasterPassiveBonus(voidEdge, stats({ wisdom: 20 }), 0).total).toBe(0);
    expect(runecasterPassiveBonus(voidEdge, stats({ wisdom: 20 }), undefined).total).toBe(0);
  });

  it('⚠ it never throws on missing stats, and a non-caster gets nothing', () => {
    expect(runecasterPassiveBonus(voidEdge, null, 3).total).toBe(0);
    const melee = runecasterPassiveBonus({ weaponKind: 'melee', damageType: 'slashing' }, stats(), 3);
    expect(melee.stat).toBeNull();
    expect(melee.total).toBe(0);
  });

  it('⚠ the divisor and cap are named constants, not numbers buried in a formula', () => {
    expect(PASSIVE_STAT_DIVISOR).toBe(4);
    expect(PASSIVE_PER_SLOT_CAP).toBe(5);
    expect(runecasterPassiveSlots({ rarity: 'Rare' })).toBe(2);
    expect(runecasterPassiveSlots({ rarity: 'Legendary' })).toBe(3);
  });
});

describe('OTA-1561 — the wiring', () => {
  const STORE = src('app/state/gameStore.ts');
  const RULES = src('app/engine/combatRules.ts');
  const PICKER = src('app/components/FusionPickerModal.tsx');
  const PREVIEW = src('app/components/itemPreview.ts');

  it('⚠⚠⚠ the upgrade action grants ONE passive per visit and never exceeds the cap', () => {
    expect(STORE).toContain('{ ...i, runePassives: Math.min(runeCap, (i.runePassives ?? 0) + 1) }');
    expect(STORE).toContain("if (isRuneTarget && (piece.runePassives ?? 0) >= runeCap) {");
  });

  it('⚠⚠⚠ the passive LANDS IN COMBAT — on the damage step, off the equipped instance', () => {
    // `coatInst` is the exact instance the coating steps already read, so the
    // hand this bonus comes from is the hand that swings. A separate lookup here
    // is how a two-hand build ends up scaling off the wrong weapon.
    expect(RULES).toContain('coatInst.runePassives');
    expect(RULES).toContain('bonus: damageBonus + aetherSurge + runeBonus.total,');
  });

  it('⚠⚠⚠ the roll NAMES THE STAT, so the player can see what made the number', () => {
    // A bare "+9" teaches nobody that raising WIS is what did it — and the entire
    // point of the design is that the character grows the weapon.
    expect(RULES).toContain("rune ${runeBonus.slots === 1 ? 'passive' : 'passives'} × ${String(runeBonus.stat).slice(0, 3).toUpperCase()}");
  });

  it('⚠⚠ the picker gives rune-casters their OWN heading', () => {
    // They were classified as weapons and then permanently blocked, so 55 of them
    // sat in the WEAPONS list as refusals under copy about coating channels.
    expect(PICKER).toContain("const runeGroup = splitGroup('runecaster');");
    expect(PICKER).toContain("{ label: 'RUNE-CASTERS', group: runeGroup,");
    expect(PICKER).toContain('...upgradeableRunes');
  });

  it('⚠⚠ the item card says what it takes INSTEAD of a coating, and which stat', () => {
    expect(PREVIEW).toContain("stats.push('Power weapon — takes no coating');");
    expect(PREVIEW).toContain('Crucible: up to ${slots} passives, scaling with');
  });

  it('⚠ the reward line shows the arithmetic, not a mystery number', () => {
    expect(STORE).toContain('It draws on your ${statName}: +${bonus.perSlot} each, +${bonus.total} in all');
    expect(STORE).toContain('Raise the stat and the caster rises with it.');
  });

  it('⚠ the five-piece cost and the outpost fee are unchanged — this is a third arm, not a discount', () => {
    expect(STORE).toContain("An upgrade takes five reserved pieces");
    expect(STORE).toContain('if (!chargeOutpostCrucibleFee(get, set)) return;');
  });
});
