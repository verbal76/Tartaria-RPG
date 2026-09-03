/**
 * OTA-1570 — THE REPORT MATCHES THE EVENT.
 *
 * Three items the owner picked off the log sweeps, and they are one theme: the
 * game did a thing and then described it inaccurately, or did a thing whose
 * meaning had moved out from under it.
 *
 * ⚠⚠⚠ (1) A RUNE-CASTER IS NOT SPARE GEAR ANY MORE, AND THAT HOLE IS MINE. His
 * log, two hours after OTA-1561 shipped: `Sold Earthshaker … 14 TC`, `Sold Mud
 * Shell … 13 TC`, both swept by SELL ALL COMMON GEAR. Every item in that sweep
 * was correctly Common; the button did exactly what it says. What changed is
 * what a Common rune-caster IS — 1561 made it the cheapest entry into the
 * Crucible passive system, the thing you upgrade rather than the thing you clear
 * out. The sweep had no way to know the rules moved under it.
 *
 * ⚠⚠⚠ (2) HE HAD TO ASK WHAT HE HAD JUST SOLD. After 66 sell lines he typed into
 * the game: *"did I just sell off rares and uncommons as well?"* The answer was
 * no — but the receipt never SAID so, and several Commons have Rare-sounding
 * names (`Sold Aetherium Spear … for 14 TC` reads like a robbery). One word on a
 * line that already knew the answer.
 *
 * ⚠⚠⚠ (3) "HALF THEIR FIGHT" WAS A FIXED STRING on a sentence that prints the
 * real numbers beside it. Twice in his logs it claimed half while doing 85% and
 * 87% — the only part of a combat log that was not true.
 *
 * The scene-intro starvation fix that shipped alongside these is OTA-1571; see
 * ota1571TheSlotMovesOn.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { planCommonGearSale, isGearItem } from '../app/engine/bulkSell';
import { koShare } from '../app/engine/combatProse';
import type { InventoryItem } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const row = (name: string, over: Partial<InventoryItem> = {}) => ({
  item: { id: name, name, kind: 'weapon', rarity: 'Common', quantity: 1, ...over } as InventoryItem,
  price: 14,
});

describe('OTA-1570 — SELL ALL COMMON no longer eats the Crucible’s entry ticket', () => {
  it('⚠⚠⚠ THE TWO HE ACTUALLY LOST ARE SPARED', () => {
    // Earthshaker and Mud Shell, by name, off his own receipt.
    const plan = planCommonGearSale([row('Earthshaker Wand'), row('Mud Shell Wand')]);
    expect(plan.rows).toEqual([]);
    expect(plan.count).toBe(0);
  });

  it('⚠⚠⚠ SPARED THREE WAYS, because an instance can arrive missing any one of them', () => {
    // kind, tag, or catalog name — a migrated or inferred row can carry none of
    // the first two, and the sweep must still hold its hand. This is the same
    // reason `isGearItem` keys on the catalog rather than the instance.
    expect(planCommonGearSale([row('Void Edge', { kind: 'runecaster' })]).rows).toEqual([]);
    expect(planCommonGearSale([row('Cudgel', { tags: ['weapon', 'runecaster'] })]).rows).toEqual([]);
    expect(planCommonGearSale([row('Earthshaker Wand', { kind: 'weapon', tags: [] })]).rows).toEqual([]);
  });

  it('⚠⚠ ORDINARY COMMON GEAR IS STILL SWEPT — the button still works', () => {
    // The failure mode opposite to the bug: a guard so broad the feature stops
    // doing its job. Every one of these was on his receipt and every one should
    // still go.
    const plan = planCommonGearSale([
      row('Cudgel'), row('Bone Knife'), row('Rusty Shortbow'), row('Mud-Warden\'s Vest'),
    ]);
    expect(plan.rows.map((r) => r.item.name)).toEqual([
      'Cudgel', 'Bone Knife', 'Rusty Shortbow', "Mud-Warden's Vest",
    ]);
    expect(plan.count).toBe(4);
  });

  it('⚠⚠ the older exclusions still hold — this added a rule, it did not replace one', () => {
    // Non-Common, non-gear, and forged all stay out.
    expect(planCommonGearSale([row('Cudgel', { rarity: 'Uncommon' })]).rows).toEqual([]);
    expect(planCommonGearSale([row('Aether Dust', { kind: 'misc' })]).rows).toEqual([]);
    expect(planCommonGearSale([row('Cudgel', { uniqueStats: { kind: 'weapon' } as never })]).rows).toEqual([]);
    // …and the gear predicate itself is untouched.
    expect(isGearItem({ name: 'Cudgel' })).toBe(true);
    expect(isGearItem({ name: 'Aether Dust' })).toBe(false);
  });
});

describe('OTA-1570 — the receipt answers the question he had to ask', () => {
  const VENDOR = src('app/state/slices/vendorSlice.ts');

  it('⚠⚠⚠ EVERY SELL LINE NAMES THE RARITY', () => {
    expect(VENDOR).toContain("const rarityTag = item.rarity ? ` (${item.rarity})` : '';");
    expect(VENDOR).toContain('const soldWhat = units === 1 ? `${item.name}${rarityTag}` : `${units}× ${item.name}${rarityTag}`;');
  });

  it('⚠⚠ an item with no rarity says nothing rather than "(undefined)"', () => {
    // The tag is conditional on purpose: `rarityColor`'s default branch renders
    // Common AND unknown alike, and OTA-1232 is on record that treating those as
    // the same thing is how a sweep takes something it should not.
    expect(VENDOR).toContain("item.rarity ? ` (${item.rarity})` : ''");
  });

  it('⚠ the fenced line gets it too — both branches read the same variable', () => {
    expect(VENDOR).toContain('`Fenced ${soldWhat} to ${scene.vendor.name}');
    expect(VENDOR).toContain('`Sold ${soldWhat} to ${scene.vendor.name}');
  });
});

describe('OTA-1570 — the knockout line stops claiming half', () => {
  it('⚠⚠⚠ THE TWO FROM HIS LOGS NO LONGER SAY "HALF"', () => {
    // 11 of 13 (84.6%) and 28 of 32 (87.5%) — both narrated as "half their fight".
    expect(koShare(11, 13)).not.toContain('half');
    expect(koShare(28, 32)).not.toContain('half');
    // They land in different bands, and that is the point: the two blows were
    // not the same size, and the old line could not tell you so.
    expect(koShare(11, 13)).toBe('the better part of their fight');
    expect(koShare(28, 32)).toBe('nearly the whole of their fight');
  });

  it('⚠⚠ and a blow that really was about half still says so', () => {
    // The string was not wrong in principle — it was wrong unconditionally.
    expect(koShare(6, 13)).toBe('half their fight');
    expect(koShare(5, 10)).toBe('half their fight');
  });

  it('⚠⚠ the bands are COARSE on purpose — a knockout is a beat, not a spreadsheet', () => {
    // What the line owes the player is not precision; it is not being wrong.
    // Four bands, no percentages.
    const said = new Set([1, 3, 5, 7, 9, 11, 12, 13].map((d) => koShare(d, 13)));
    expect(said.size).toBeLessThanOrEqual(4);
    for (const s of said) expect(s).not.toMatch(/\d/);
  });

  it('⚠ never divides by zero, and a full-HP hit is the top band', () => {
    expect(koShare(5, 0)).toBe('the last of their fight');
    expect(koShare(13, 13)).toBe('nearly the whole of their fight');
  });
});
