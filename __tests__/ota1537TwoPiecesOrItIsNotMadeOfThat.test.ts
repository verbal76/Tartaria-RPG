/**
 * OTA-1537 — TWO PIECES, OR IT IS NOT MADE OF THAT.
 *
 * OTA-1536 bounded the Crucible's output by input quality and closed the
 * four-Commons-to-Legendary faucet. Pricing it afterwards showed the job was
 * two-thirds done, and the owner asked for both remaining levers.
 *
 * ⚠⚠⚠ THE ARITHMETIC THAT MOTIVATED THIS. Fused gear is unsellable (arb107), so
 * the real cost of a fuse is the forgone sale value of the pieces burned. Sell
 * bases: Common 12, Uncommon 35, Rare 90, Legendary 240. Buying an AC 5
 * Legendary armor off a stall runs ~220–380 TC (`rarityPrice` 140–299 plus
 * `estimatedStallValue`'s acBonus×9 + bonus×6 + durability/3 + resist×8).
 *
 *   · before OTA-1536:  4 Common (48) + 25 fee  =  ~73 TC   — 3-5x under buying
 *   · after  OTA-1536:  1 Rare + 3 Common (126) + 25  = ~151 TC — still ~2x under
 *   · after  OTA-1537:  2 Rare + 2 Common (204) + 150 = ~354 TC — inside the band
 *
 * ⚠⚠⚠ LEVER ONE — THE TIER MUST BE SUPPORTED, NOT MERELY TOUCHED. OTA-1536 let
 * the single BEST input set the ceiling, so one Rare sliver carried three
 * Commons. Taking the SECOND-highest rarity is the entire change. The reason
 * 1536 chose the best-of was real and still holds: the diversity gate FORCES
 * odd materials into every pack, so a player topping up a strong core with the
 * scrap it demands must not be punished for obeying it. Two is the smallest
 * number that can mean "this pack is actually made of that" — and it leaves
 * room for the gate's mandatory oddments.
 *
 * ⚠⚠ LEVER TWO — THE FIRE IS PRICED BY WHAT IT FORGES. OTA-967 met the faucet
 * with a flat 25 TC, and its own note names the faucet exactly: *"an infinite
 * guaranteed-Legendary faucet (3 material types = Rare, 4+ = Legendary, junk
 * inputs accepted, no fee/cooldown)"*. A fee was the wrong lever — it prices
 * the FIRE, and the faucet was in the rarity rule — and it never bound anyway,
 * being ~10% of a fuse's real cost and a smaller share every hour the player
 * got richer. Scaling it by tier makes it stay meaningful at the top of the
 * game. The scrap-floor fuse still costs exactly the 25 it always did.
 *
 * ⚠ EVERY OTA-967 EXEMPTION SURVIVES. A pre-paid wild bench (fusionPending) and
 * the Hidden Market cauldron still fire free, and the charge still lands AFTER
 * every gate and BEFORE any consume — a refusal costs neither coin nor item.
 */
import {
  FUSION_FEE_BY_TIER,
  fusionOutputRarity,
  synthesizeFusionDeterministic,
} from '../app/engine/itemFusion';
import type { InventoryItem, Rarity } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

let seq = 0;
const item = (name: string, rarity: Rarity | undefined, tags: string[]): InventoryItem =>
  ({ id: `t${seq++}`, name, kind: 'misc', quantity: 1, rarity, tags }) as unknown as InventoryItem;

const FOUR_TAGS = ['metal', 'organic', 'cloth', 'aether'];
const THREE_TAGS = ['metal', 'organic', 'cloth'];

/** A pack of four distinct materials, `n` of them at `good` and the rest Common. */
const packWith = (n: number, good: Rarity): InventoryItem[] =>
  ['metal', 'organic', 'cloth', 'aether'].map((t, i) => item(`Piece ${t}`, i < n ? good : 'Common', [t]));

describe('OTA-1537 — the tier has to be supported by two pieces', () => {
  it('⚠⚠⚠ ONE Rare among Commons no longer reaches Legendary', () => {
    // The exact softness left by OTA-1536: a single sliver carrying a junk pack.
    expect(fusionOutputRarity(packWith(1, 'Rare'), FOUR_TAGS)).toBe('Uncommon');
  });

  it('⚠⚠⚠ …and TWO Rare does', () => {
    // The tier is still reachable. It now costs two real pieces, not one.
    expect(fusionOutputRarity(packWith(2, 'Rare'), FOUR_TAGS)).toBe('Legendary');
  });

  it('⚠⚠⚠ it is the SECOND-highest rarity, not the average and not a majority', () => {
    // An average would drag a strong pack down for carrying the odd scrap the
    // diversity gate demands; a majority rule would make a 3-input fuse need
    // two matching pieces AND punish the 4th. Second-highest is the smallest
    // rule that means "supported".
    const twoLegendaryTwoJunk = [
      item('Core A', 'Legendary', ['metal']),
      item('Core B', 'Legendary', ['organic']),
      item('Filler', 'Common', ['cloth']),
      item('Filler2', 'Common', ['aether']),
    ];
    expect(fusionOutputRarity(twoLegendaryTwoJunk, THREE_TAGS)).toBe('Legendary');
  });

  it('⚠⚠ the diversity gate\'s mandatory oddments still do not cost you the tier', () => {
    // OTA-1536's reason for best-of, preserved: the gate REQUIRES 3+ distinct
    // materials, so a strong core plus the scrap that satisfies it must still
    // forge what the core is worth.
    const corePlusMandatoryScrap = [
      item('Rare Core A', 'Rare', ['metal']),
      item('Rare Core B', 'Rare', ['organic']),
      item('Gate Filler', 'Common', ['cloth']),
    ];
    expect(fusionOutputRarity(corePlusMandatoryScrap, THREE_TAGS)).toBe('Rare');
  });

  it('⚠⚠ the 4+ material bonus still rides on top of the supported tier', () => {
    expect(fusionOutputRarity(packWith(2, 'Uncommon'), THREE_TAGS)).toBe('Uncommon');
    expect(fusionOutputRarity(packWith(2, 'Uncommon'), FOUR_TAGS)).toBe('Rare');
  });

  it('⚠⚠ the floor still holds under the new rule', () => {
    expect(fusionOutputRarity(packWith(0, 'Rare'), THREE_TAGS)).toBe('Uncommon');
    expect(fusionOutputRarity(packWith(0, 'Rare'), FOUR_TAGS)).toBe('Uncommon');
  });

  it('⚠ a pack the gate would never admit does not throw', () => {
    // gateFusion enforces 3 inputs (2 with a catalyst), but a direct caller can
    // hand over anything. One piece grades on the piece it has; none floors.
    expect(fusionOutputRarity([item('Lone', 'Legendary', ['metal'])], THREE_TAGS)).toBe('Legendary');
    expect(fusionOutputRarity([], THREE_TAGS)).toBe('Uncommon');
  });

  it('⚠ missing rarities still grade as Common under the second-best rule', () => {
    const bare = [
      item('Bare A', undefined, ['metal']),
      item('Bare B', undefined, ['organic']),
      item('Rare One', 'Rare', ['cloth']),
    ];
    expect(fusionOutputRarity(bare, FOUR_TAGS)).toBe('Uncommon');
  });

  it('⚠⚠ the forged stats follow the supported tier, not the best piece', () => {
    // The whole point, measured where the player feels it: AC.
    const one = synthesizeFusionDeterministic(packWith(1, 'Rare'), FOUR_TAGS, 'armor');
    expect(one.stats.acBonus).toBe(2);
    const two = synthesizeFusionDeterministic(packWith(2, 'Rare'), FOUR_TAGS, 'armor');
    expect(two.stats.acBonus).toBe(5);
  });
});

describe('OTA-1537 — the fire is priced by what it forges', () => {
  it('⚠⚠⚠ the toll scales with the tier', () => {
    expect(FUSION_FEE_BY_TIER.Uncommon).toBe(25);
    expect(FUSION_FEE_BY_TIER.Rare).toBe(60);
    expect(FUSION_FEE_BY_TIER.Legendary).toBe(150);
  });

  it('⚠⚠ the scrap-floor fuse costs exactly what it always cost', () => {
    // A new player fusing junk must not be taxed for a rebalance aimed at the
    // top of the ladder.
    expect(FUSION_FEE_BY_TIER[fusionOutputRarity(packWith(0, 'Rare'), FOUR_TAGS)]).toBe(25);
  });

  it('⚠⚠ …and the Legendary forge pays six times that', () => {
    expect(FUSION_FEE_BY_TIER[fusionOutputRarity(packWith(2, 'Rare'), FOUR_TAGS)]).toBe(150);
  });

  it('⚠⚠⚠ the fuse path quotes the tier it is about to forge', () => {
    // Quoting a flat rate and then forging a Legendary is the bug this replaces.
    // selGate is resolved before the charge, so the tier is knowable in time.
    const code = codeOnly(src('app', 'state', 'slices', 'craftingSlice.ts'));
    expect(code).toContain('fusion.fusionOutputRarity(selGate.inputs, selGate.tagProfile),');
    const charge = code.indexOf('deps.chargeOutpostCrucibleFee(');
    const gate = code.indexOf('const selGate = fusion.gateFusion(');
    expect(gate).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(gate);
  });

  it('⚠⚠ OTA-967\'s ordering is intact — the fee lands after the gates, before any consume', () => {
    // A refusal, a cancelled picker or an empty purse must never cost a coin or
    // an item. The charge sits between the gate check and the synth.
    const code = codeOnly(src('app', 'state', 'slices', 'craftingSlice.ts'));
    const charge = code.indexOf('deps.chargeOutpostCrucibleFee(');
    const synth = code.indexOf('fusion.synthesizeFusionDeterministic(');
    expect(charge).toBeGreaterThan(-1);
    expect(synth).toBeGreaterThan(charge);
  });

  it('⚠⚠ every OTA-967 exemption survives untouched', () => {
    // Pre-paid wild benches and the Hidden Market cauldron still fire free.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain("if (p.fusionPending || get().activeBuildingId === 'market') return true;");
  });

  it('⚠⚠ a caller with no tier — the extra-channel upgrade — still pays the flat 25', () => {
    // That channel does not forge a tiered item, so it has no tier to be
    // priced by. Defaulting it to 25 keeps OTA-967's contract for it exactly.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('const FEE = tier ? (FUSION_FEE_BY_TIER[tier] ?? 25) : 25;');
    expect(code).toContain('if (!chargeOutpostCrucibleFee(get, set)) return;');
  });

  it('⚠ the player is told WHY the price is 150, not just that it is', () => {
    // An unexplained six-fold price reads as a bug to the person paying it.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('TC to fire a ${tier} piece');
    expect(code).toContain('takes its fee for a ${tier} forge');
  });
});
