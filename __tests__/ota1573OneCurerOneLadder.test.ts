/**
 * OTA-1573 — ONE CURER, ONE LADDER. Two owner reports from the same session,
 * and both turned out to be the same shape: a rule that existed in one place
 * and was contradicted everywhere else.
 *
 * ⚠⚠⚠ (1) "I JUST USED A FIELD DRESSING TO CURE BLEED, BUT IT STILL SAYS I HAVE
 * BLEED ON MY PORTRAIT." His log, exactly:
 *
 *     18:34:16 parser: intent=use_relic … resolved=Field Dressing
 *     18:34:16 [world] You use one Field Dressing. +10 HP.
 *     18:35:31 [system] bleeding fades.      ← 75s later. NATURAL EXPIRY.
 *
 * The card says "stops the bleeding". The catalog says `cureBleed: true`. Both
 * were right; nothing read them — because there are THREE implementations of
 * "use a consumable" and only one had ever learned about the cures. The one he
 * hit, `use_relic`, is the route a tapped item takes IN COMBAT, which is exactly
 * when a dressing matters.
 *
 * ⚠⚠⚠ (2) "ALL THE COATINGS LISTED UNDER CRAFTING ALL STILL SAY 1d4, I THOUGHT
 * WE TOOK CARE OF THAT LAST NIGHT." The screen was telling the truth and I was
 * wrong to imply otherwise. The STAT-BONUS half of the coating differentiation
 * shipped (+1 STE, +1 CHA, +1 STR, +1 INT, all visible on his cards); the DICE
 * half was never built. Nine coatings sat at 1d4 and a RARE ticked no harder
 * than two Uncommons. Not stale text — an unprincipled table.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import { applyConsumableCures, consumableDoesSomething } from '../app/engine/consumableCures';
import { coatingDiceFor, coatingHasSecondPayload, RIDER_COATING_KINDS } from '../app/engine/weaponCoating';
import type { StatusEffect } from '../app/engine/types';
import GEAR from '../app/data/items/gear.json';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const eff = (kind: string, rounds = 3): StatusEffect =>
  ({ kind, remainingRounds: rounds, label: kind } as StatusEffect);

interface CoatingRow {
  name: string;
  rarity?: string;
  tags?: string[];
  description?: string;
  effect?: { coating?: { kind?: string; dice?: string; statBonus?: unknown } };
}
const coatings: CoatingRow[] = (GEAR as unknown as { gear: CoatingRow[] }).gear
  .filter((g) => (g.tags ?? []).map((t) => t.toLowerCase()).includes('weapon_coating'));

describe('OTA-1573 — the Field Dressing actually stops the bleeding', () => {
  it('⚠⚠⚠ THE EXACT CASE FROM HIS LOG: a dressing on a bleeding player clears it', () => {
    const r = applyConsumableCures([eff('bleed')], { cureBleed: true });
    expect(r.cured).toBe(true);
    expect(r.effects.some((e) => e.kind === 'bleed')).toBe(false);
    expect(r.messages).toEqual(['bleeding stopped']);
  });

  it('⚠⚠⚠ ALL THREE CONSUME PATHS CALL THE ONE CURER — this is the whole fix', () => {
    // A cure implemented three times is how two of them come to disagree; here
    // two of them simply never got written. The pin is on the CALL, not on the
    // behaviour, because the behaviour is already covered above and what rots is
    // a path quietly growing its own copy again.
    const GS = src('app/state/gameStore.ts');
    const INV = src('app/state/slices/inventorySlice.ts');
    // path 1 + 2 both live in the store and must both call it
    expect(GS.match(/applyConsumableCures\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // path 3
    expect(INV).toContain('applyConsumableCures(player.statusEffects');
    // …and nobody filters a cured kind by hand any more.
    expect(GS).not.toContain("filter((e) => e.kind !== 'bleed')");
    expect(GS).not.toContain("filter((e) => e.kind !== 'poisoned')");
  });

  it('⚠⚠⚠ THE use_relic PATH — the one he hit, in combat — applies them', () => {
    // This is the path a TAPPED consumable takes mid-fight. It healed and
    // restored and coated and buffed, and dropped the cures on the floor.
    const GS = src('app/state/gameStore.ts');
    const at = GS.indexOf('const cures = applyConsumableCures(p.statusEffects, fx);');
    expect(at).toBeGreaterThan(0);
    // It must be inside the same block that pushes into `messages`, so the line
    // the player reads names the cure alongside the heal.
    expect(GS).toContain('messages.push(...cures.messages);');
  });

  it('⚠⚠ curePoison rides the same road, and both can land on one item', () => {
    const r = applyConsumableCures([eff('bleed'), eff('poisoned'), eff('chilled')], {
      cureBleed: true, curePoison: true,
    });
    expect(r.messages).toEqual(['bleeding stopped', 'poison neutralized']);
    // …and it takes nothing it was not asked to take.
    expect(r.effects.map((e) => e.kind)).toEqual(['chilled']);
  });

  it('⚠⚠ SILENT WHEN THERE WAS NOTHING TO CURE — no untrue line', () => {
    // A dressing used while unwounded must not announce "bleeding stopped".
    // That is the same class of false statement this OTA removes.
    const r = applyConsumableCures([eff('chilled')], { cureBleed: true });
    expect(r.cured).toBe(false);
    expect(r.messages).toEqual([]);
    expect(r.effects.map((e) => e.kind)).toEqual(['chilled']);
  });

  it('⚠⚠ A PURE CURE IS NO LONGER REFUSED BY THE INVENTORY SCREEN', () => {
    // The second defect in the same report: `useConsumableOnTarget` gated on
    // healHP alone, so an antivenom that only cleanses was rejected there —
    // "That won't mend anything in bulk." — while working from the combat bar.
    expect(consumableDoesSomething({ curePoison: true })).toBe(true);
    expect(consumableDoesSomething({ cureBleed: true })).toBe(true);
    expect(consumableDoesSomething({ healHP: 10 })).toBe(true);
    expect(consumableDoesSomething({ restoreStamina: 3 })).toBe(true);
    expect(consumableDoesSomething({ reduceCorruption: 2 })).toBe(true);
    // …but a thing that does nothing is still refused.
    expect(consumableDoesSomething({})).toBe(false);
    expect(consumableDoesSomething(null)).toBe(false);
    expect(src('app/state/slices/inventorySlice.ts')).toContain('if (!consumableDoesSomething(');
  });

  it('⚠ no cure flags means the list comes back untouched', () => {
    const before = [eff('bleed'), eff('poisoned')];
    const r = applyConsumableCures(before, null);
    expect(r.effects.map((e) => e.kind)).toEqual(['bleed', 'poisoned']);
    expect(r.cured).toBe(false);
  });
});

describe('OTA-1573 — the coating ladder he could not see', () => {
  it('⚠⚠⚠ RARITY SETS THE BASE, A SECOND PAYLOAD COSTS ONE DIE STEP', () => {
    expect(coatingDiceFor('Uncommon', false)).toBe('1d6');
    expect(coatingDiceFor('Uncommon', true)).toBe('1d4');
    expect(coatingDiceFor('Rare', false)).toBe('1d10');
    expect(coatingDiceFor('Rare', true)).toBe('1d8');
  });

  it('⚠⚠⚠ A RARE NOW BEATS EVERY UNCOMMON, which it did not before', () => {
    // Rime Draught was Rare at 1d6 — the same die as Uncommon Frost Paste and
    // Viper Venom Vial. A rarity that buys you nothing is a lie on the card.
    const face = (d: string) => parseInt(d.split('d')[1]!, 10);
    const worstRare = Math.min(face(coatingDiceFor('Rare', true)), face(coatingDiceFor('Rare', false)));
    const bestUncommon = Math.max(face(coatingDiceFor('Uncommon', true)), face(coatingDiceFor('Uncommon', false)));
    expect(worstRare).toBeGreaterThan(bestUncommon);
  });

  it('⚠⚠⚠ EVERY COATING IN THE CATALOG OBEYS THE LADDER — data and rule cannot drift', () => {
    expect(coatings.length).toBeGreaterThanOrEqual(14);
    for (const c of coatings) {
      const spec = c.effect?.coating;
      expect(spec).toBeDefined();
      expect(spec!.dice).toBe(coatingDiceFor(c.rarity, coatingHasSecondPayload(spec)));
    }
  });

  it('⚠⚠⚠ AND THE DESCRIPTION QUOTES THE DIE IT ACTUALLY ROLLS', () => {
    // The whole reason he raised this is that he read the number off a card.
    // A card carrying a die the engine does not roll is exactly the defect the
    // weapon-effects program has been closing all week, one screen over.
    for (const c of coatings) {
      const d = c.effect!.coating!.dice!;
      const quoted = (c.description ?? '').match(/\b1d\d+\b/g) ?? [];
      for (const q of quoted) expect(q).toBe(d);
    }
  });

  it('⚠⚠ NOTHING WAS NERFED — the ladder was chosen so every coating held or rose', () => {
    // His table before this OTA, verbatim. The rule had to explain the shape
    // rather than fight it, because taking damage off a coating he already owns
    // is not a fix, it is a tax.
    const BEFORE: Record<string, string> = {
      'Poison Vial': '1d4', 'Acid Flask': '1d4', 'Corruption Tonic': '1d4',
      'Plague Tonic': '1d8', 'Plague Vial': '1d8', 'Viper Venom Vial': '1d6',
      'Static Paste': '1d4', 'Galvanic Paste': '1d4', 'Resonant Paste': '1d4',
      'Incendiary Paste': '1d4', 'Searing Paste': '1d4', 'Smoldering Paste': '1d4',
      'Frost Paste': '1d6', 'Rime Draught': '1d6',
    };
    const face = (d: string) => parseInt(d.split('d')[1]!, 10);
    for (const c of coatings) {
      const was = BEFORE[c.name];
      if (!was) continue;
      expect(face(c.effect!.coating!.dice!)).toBeGreaterThanOrEqual(face(was));
    }
  });

  it('⚠⚠ the nine-at-one-value pile is broken up', () => {
    // Nine of fourteen coatings reading 1d4 is what he was actually looking at.
    const counts = new Map<string, number>();
    for (const c of coatings) {
      const d = c.effect!.coating!.dice!;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(6);
    expect(counts.size).toBe(4);
  });

  it('⚠ a FOUND coating stays below the crafted ladder, on purpose', () => {
    // It cost nothing and carries no rarity of its own.
    expect(src('app/engine/weaponCoating.ts')).toContain("dice: '1d4', label: LOOT_COATING_LABELS[kind]");
  });
});

describe('OTA-1573 — a rider is a payload, and the cards stopped lying about their dice', () => {
  it('⚠⚠⚠ ACID AND CORRUPTION PAY THE SAME STEP A STAT BONUS PAYS', () => {
    // The first draft of this ladder counted only stat bonuses and left SEVEN
    // coatings piled on 1d6 — the same failure as the 1d4 pile, one notch
    // quieter. Acid shreds armour every hit (enemyArmorShred) and corruption
    // stacks so tough foes rot faster (coatingDotPerTurn). Those are worth what
    // a +1 stat is worth, so they cost what a +1 stat costs.
    expect(RIDER_COATING_KINDS.has('acid')).toBe(true);
    expect(RIDER_COATING_KINDS.has('corruption')).toBe(true);
    expect(RIDER_COATING_KINDS.has('poison')).toBe(false);
    expect(coatingHasSecondPayload({ kind: 'acid' })).toBe(true);
    expect(coatingHasSecondPayload({ kind: 'corruption' })).toBe(true);
    expect(coatingHasSecondPayload({ kind: 'burn' })).toBe(false);
    expect(coatingHasSecondPayload({ kind: 'burn', statBonus: { stat: 'strength' } })).toBe(true);
    expect(coatingHasSecondPayload(null)).toBe(false);
  });

  it('⚠⚠⚠ THE ELEMENT CHOICE IS A REAL CHOICE, not a strict upgrade', () => {
    // Acid Flask trades a die step for armour shred against Poison Vial's raw
    // tick. Before this, acid was simply Poison Vial plus a free rider.
    const byName = (n: string) => coatings.find((c) => c.name === n)!;
    expect(byName('Acid Flask').effect!.coating!.dice).toBe('1d4');
    expect(byName('Poison Vial').effect!.coating!.dice).toBe('1d6');
    expect(byName('Corruption Tonic').effect!.coating!.dice).toBe('1d4');
  });

  it('⚠⚠⚠ FOUR CARDS WERE ALREADY QUOTING A DIE THEY DID NOT ROLL', () => {
    // Found by this suite, and they pre-date this OTA: Plague Tonic and Plague
    // Vial both said 1d6 while rolling 1d8, and Frost Paste said 1d4 while
    // rolling 1d6. Exactly the defect the weapon-effects program has been
    // closing all week — a card making a promise the engine does not keep —
    // sitting on the crafting screen the whole time.
    const byName = (n: string) => coatings.find((c) => c.name === n)!;
    for (const n of ['Plague Tonic', 'Plague Vial', 'Frost Paste', 'Rime Draught']) {
      const c = byName(n);
      const d = c.effect!.coating!.dice!;
      const quoted = (c.description ?? '').match(/\b1d\d+\b/g) ?? [];
      expect(quoted.length).toBeGreaterThan(0);
      for (const q of quoted) expect(q).toBe(d);
    }
  });
});
