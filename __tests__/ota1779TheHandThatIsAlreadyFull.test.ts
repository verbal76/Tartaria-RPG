/**
 * OTA-1779 — THE HAND THAT IS ALREADY FULL.
 *
 * Reported from play: *"Take & wield Rust Dagger — your off hand is free"* with
 * a weapon already equipped. The first trace read that as evidence the game had
 * outgrown a hand-slot model, and the owner's punch list framed it that way. It
 * had not, and the owner ruled after seeing the trace:
 *
 *     *"KEEP dual wield. Your trace supersedes my earlier assumption. OTA-1252
 *     establishes this as an intentional shipped feature. Do not remove off-hand
 *     logic or convert the game to one active weapon. Close the Rust Dagger /
 *     free-off-hand item unless you find a separate state/offer bug under the
 *     actual dual-wield rules."*
 *
 * ⚠⚠⚠ THERE IS ONE, AND IT IS THE TWO-HANDED CASE. Equipping a two-hander
 * DISPLACES the off hand, so `resolveEquippedItem(player, 'off')` returns null
 * while both hands are full — and the free-hand branch read that as a free hand.
 * All three `two_handed` reads on the equip path asked about the CANDIDATE
 * weapon; not one asked what the main hand was already holding. That is exactly
 * the owner's own expected case: *"two-handed weapon equipped → no
 * second-weapon/free-off-hand offer."*
 *
 * ⚠⚠ AND THE SECOND HALF IS WORSE THAN THE FIRST. `upgradeEquipSlot` routed a
 * ranged pickup to `'off'` on the same reasoning, so ACCEPTING the offer would
 * have produced a two-hander AND an off-hand weapon — a state the two-handed
 * rule forbids. The wrong sentence was the visible half; the wrong destination
 * was the real one.
 *
 * ⚠ WHAT IS DELIBERATELY NOT CHANGED: dual wield. Every test below that involves
 * a ONE-handed main hand asserts the offer still fires, because the off hand
 * really is free then and really does swing. The fix removes a shortcut in one
 * state, not a feature.
 */
import {
  isUpgradeOverEquipped, upgradeEquipSlot, upgradeReasonClause,
} from '../app/engine/gatherSort';
import { WEAPONS } from '../app/engine/crafting';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';

interface CatalogWeapon {
  name: string;
  style?: string;
  weaponKind?: string;
  damageDice: string;
}
const W = WEAPONS as unknown as CatalogWeapon[];

/** ⚠ Chosen from the catalog rather than invented, so the fixture cannot drift
 *  from what the game actually ships. */
const TWO_HANDER = W.find((w) => w.style === 'two_handed')!;
const ONE_MELEE = W.find((w) => w.style !== 'two_handed' && w.weaponKind !== 'ranged')!;
const ONE_RANGED = W.find((w) => w.style !== 'two_handed' && w.weaponKind === 'ranged')!;

const item = (name: string): InventoryItem =>
  ({ id: `id-${name}`, name, kind: 'weapon', quantity: 1 } as unknown as InventoryItem);

/** A player holding `main` (and optionally `off`). */
function holding(main: string | null, off: string | null = null): PlayerCharacter {
  const inv: InventoryItem[] = [];
  if (main) inv.push(item(main));
  if (off) inv.push(item(off));
  return {
    inventory: inv,
    equipped: { main, off, mainId: main ? `id-${main}` : null, offId: off ? `id-${off}` : null },
  } as unknown as PlayerCharacter;
}

describe('the catalog gives us the three shapes this is about', () => {
  test('⚠ a two-hander, a one-handed melee and a one-handed ranged all exist', () => {
    for (const [label, w] of [['two-hander', TWO_HANDER], ['one-handed melee', ONE_MELEE],
      ['one-handed ranged', ONE_RANGED]] as const) {
      expect([label, !!w?.name]).toEqual([label, true]);
    }
    expect(TWO_HANDER.style).toBe('two_handed');
    expect(ONE_MELEE.style).not.toBe('two_handed');
    expect(ONE_RANGED.style).not.toBe('two_handed');
  });
});

// ═══ 1. THE DEFECT, EXERCISED ════════════════════════════════════════════════
describe('⚠⚠⚠ a two-hander fills BOTH hands, and the offer now knows it', () => {
  test('no free-hand offer while a two-hander is held', () => {
    /* The owner's expected case, run rather than read. Before the fix this
     * returned true and the chip appeared. */
    const p = holding(TWO_HANDER.name);
    expect(isUpgradeOverEquipped(p, ONE_MELEE.name)).toBe(false);
    expect(isUpgradeOverEquipped(p, ONE_RANGED.name)).toBe(false);
  });

  test('⚠⚠ and no clause claims the off hand is free', () => {
    /* The visible half of the bug — the sentence the player read. It is derived
     * from the verdict, so it can only be right if the verdict is. */
    const p = holding(TWO_HANDER.name);
    for (const w of [ONE_MELEE, ONE_RANGED]) {
      const clause = upgradeReasonClause(p, w.name);
      expect([w.name, clause === null || !clause.includes('off hand is free')])
        .toEqual([w.name, true]);
    }
  });

  test('⚠⚠⚠ and nothing routes a pickup INTO the hand the two-hander holds', () => {
    /* The half that mattered more. A ranged pickup used to land in `off` and
     * produce a two-hander plus an off-hand weapon. The only legal destination
     * when both hands are committed is the one that displaces. */
    const p = holding(TWO_HANDER.name);
    for (const w of [ONE_MELEE, ONE_RANGED]) {
      const slot = upgradeEquipSlot(p, w.name)?.slot;
      expect([w.name, slot]).not.toEqual([w.name, 'off']);
    }
    expect(upgradeEquipSlot(p, ONE_RANGED.name)?.slot).toBe('main');
  });
});

// ═══ 2. DUAL WIELD IS UNTOUCHED — THE OWNER'S RULING ═════════════════════════
describe('⚠⚠⚠ dual wield still works exactly as OTA-1252 built it', () => {
  test('a ONE-handed main with an empty off hand still offers the free hand', () => {
    /* The regression this fix must not cause, and the reason the guard asks
     * about the main hand's STYLE rather than simply "is something equipped".
     * If this ever goes red, the fix has eaten the feature. */
    const p = holding(ONE_MELEE.name);
    expect(isUpgradeOverEquipped(p, ONE_RANGED.name)).toBe(true);
    expect(upgradeReasonClause(p, ONE_RANGED.name)).toBe('your off hand is free');
  });

  test('⚠⚠ and the ranged pickup still goes to the OFF hand, per the owner\'s rule', () => {
    /* OTA-1512: *"always melee in main and ranged in off, for auto equips."*
     * Preserved — the new guard only redirects when both hands are committed. */
    const p = holding(ONE_MELEE.name);
    expect(upgradeEquipSlot(p, ONE_RANGED.name)?.slot).toBe('off');
  });

  test('⚠ an empty main hand still takes anything, including a two-hander', () => {
    const p = holding(null);
    expect(isUpgradeOverEquipped(p, ONE_MELEE.name)).toBe(true);
    expect(upgradeEquipSlot(p, TWO_HANDER.name)?.slot).toBe('main');
    expect(upgradeEquipSlot(p, ONE_MELEE.name)?.slot).toBe('main');
  });

  test('⚠⚠ a FULL pair still compares on merit rather than claiming a free hand', () => {
    /* Both hands genuinely occupied by one-handers: the free-hand shortcut must
     * not fire, and the clause must never say "free". Whether the chip appears
     * at all is the damage comparison's business, which this pass did not
     * touch — so this asserts the CLAUSE, which is the thing that can lie. */
    const p = holding(ONE_MELEE.name, ONE_RANGED.name);
    const clause = upgradeReasonClause(p, ONE_MELEE.name);
    expect(clause === null || !clause.includes('off hand is free')).toBe(true);
  });
});

// ═══ 3. THE PREDICATE MATCHES THE ONE THAT ALREADY EXISTED ═══════════════════
describe('⚠⚠ two implementations, and they must not give two answers', () => {
  test('the guard is catalog-only, exactly like equipment.takesBothHands', () => {
    /* `equipment.ts` already had this predicate and says why it is catalog-only:
     * a FUSED weapon carries no style and is treated as one-handed EVERYWHERE,
     * and *"getting that wrong in only this one place would be worse than being
     * uniformly wrong."* So the new one matches rather than improves.
     * ⚠ A fused weapon has no catalog entry, so it reads one-handed here — the
     * off-hand offer still fires beside it. That is the existing convention,
     * asserted so it is a recorded choice rather than an accident. */
    const fused = holding('Ashfall Composite Cleaver');   // not in the catalog
    expect(isUpgradeOverEquipped(fused, ONE_RANGED.name)).toBe(true);
  });

  test('⚠ and the duplication is written down as a legacy-hunt item', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const src = readFileSync(join(__dirname, '..', 'app', 'engine', 'gatherSort.ts'), 'utf8');
    expect(src).toContain('legacy-hunt item');
    expect(src).toContain('takesBothHands');
  });
});

// ═══ 4. THE SHAPE OF THE FIX ═════════════════════════════════════════════════
describe('the fix removed a shortcut, not a feature', () => {
  test('⚠⚠ the free-hand branch now asks THREE questions, not two', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const src = readFileSync(join(__dirname, '..', 'app', 'engine', 'gatherSort.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toContain("!resolveEquippedItem(player, 'off')");
    expect(code).toContain('!mainHandTakesBothHands(player)');
    // and the damage-comparison path below it is untouched, so a better
    // one-hander still displaces a two-hander on merit
    expect(code).toContain('averageDamage(weapon.damageDice) > averageDamage(heldWeapon.damageDice)');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    expect(readFileSync(join(__dirname, '..', 'app', 'buildInfo.ts'), 'utf8'))
      .toContain("'2026-09-09-1779-the-hand-that-is-already-full'");
  });
});
