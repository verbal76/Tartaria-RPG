/**
 * OTA-1536 — THE CRUCIBLE'S CEILING IS WHAT YOU FEED IT.
 *
 * Owner: *"maybe we should tier the rarity of what can be built at the fuse
 * cruciable, since I have legendary gear that is useless the minute I see a
 * cruciable. might as well not even have it. fuse just keeps spitting out AC5
 * gear and kills it. the only good natural gear are ones that have effects and
 * scale with stats. but no one reads that, they all go for the fuse gear
 * because high AC is almost unbearable."*
 *
 * ⚠⚠⚠ HE IS MEASURABLY RIGHT, AND ONLY ABOUT ARMOR. Counted off the shipped
 * catalog: Legendary armor is acBonus 4–5 across 67 rows; Rare armor is 1–3
 * across 60. A fused Legendary was AC 5 and a fused Rare was AC 3 — each tying
 * the CEILING of its entire tier. Weapons never had the defect: fused Legendary
 * is 2d8 where catalog Legendary weapons run 2d8→3d10/2d20, so a fused weapon
 * already sits at the BOTTOM of its tier. His sentence named the symptom
 * exactly: "AC5 gear."
 *
 * ⚠⚠⚠ THE ROOT CAUSE WAS WRITTEN DOWN AND NEVER QUESTIONED. `synthesizeFusion-
 * Deterministic` chose the tier with `tagProfile.length >= 4 ? 'Legendary' :
 * 'Rare'`, and the file's own doc comment stated the rule out loud: rarity is
 * driven by distinct materials, *"NOT by the inputs' own rarity."* Four COMMON
 * scraps spanning four materials therefore minted the best armor in the game,
 * for free, forever. Found Legendary gear could not compete with trash.
 *
 * ⚠⚠ IT WAS AN ERROR CLASS, NOT A LINE — THREE SITES SHARED IT.
 *   · the deterministic synth (the live path),
 *   · craftingSlice's faction-catalyst rarity, which duplicated the expression
 *     verbatim — and in doing so made arb107's documented contract untrue,
 *     since computing the SAME value as the synth is not "one tier above" it,
 *   · the Qwen synth path, whose validator takes the raw model row alone and so
 *     cannot see the inputs at all. It has no production caller today; it is
 *     capped anyway, because leaving it would re-open the hole the moment
 *     anyone re-wires it.
 *
 * ⚠⚠ THE FIX IS A RULE THIS FILE ALREADY CONTAINED. arb107 wrote it for the
 * catalyst — "ONE tier above the inputs' natural fusion rarity (capped at
 * Legendary)". The base path never got the same discipline. Material variety
 * still earns the +1; input QUALITY now decides what the +1 is added to.
 *
 * ⚠ AND NOTHING AN EARNED FUSION PRODUCES CHANGED. Rare and Legendary keep
 * OTA-445's exact numbers. Legendary simply can no longer be REACHED from four
 * Commons.
 */
import {
  FUSION_RARITY_LADDER,
  bumpRarity,
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
const item = (name: string, rarity: Rarity, tags: string[]): InventoryItem =>
  ({
    id: `i${seq++}`,
    name,
    kind: 'misc',
    quantity: 1,
    rarity,
    tags,
  }) as unknown as InventoryItem;

/** Four inputs spanning four canonical materials — the pack that used to mint a
 *  free Legendary. Rarity of the pack is the parameter under test. */
const fourMaterialPack = (rarity: Rarity): InventoryItem[] => [
  item('Scrap Plate', rarity, ['metal']),
  item('Bone Shard', rarity, ['organic']),
  item('Torn Wrap', rarity, ['cloth']),
  item('Aether Sliver', rarity, ['aether']),
];
const FOUR_TAGS = ['metal', 'organic', 'cloth', 'aether'];
const THREE_TAGS = ['metal', 'organic', 'cloth'];

describe('OTA-1536 — the output tier is bounded by the input tier', () => {
  it('⚠⚠⚠ four COMMON scraps across four materials no longer forge a Legendary', () => {
    // The exact pack from the complaint. Before this OTA it returned Legendary.
    expect(fusionOutputRarity(fourMaterialPack('Common'), FOUR_TAGS)).toBe('Uncommon');
  });

  it('⚠⚠⚠ …and the AC that came with it is gone with it', () => {
    // "fuse just keeps spitting out AC5 gear and kills it." Catalog Legendary
    // armor tops out at 5 and catalog Rare armor at 3; a scrap fuse must clear
    // neither.
    const r = synthesizeFusionDeterministic(fourMaterialPack('Common'), FOUR_TAGS, 'armor');
    expect(r.stats.rarity).toBe('Uncommon');
    expect(r.stats.acBonus).toBe(2);
  });

  it('⚠⚠⚠ feeding it RARE material earns the Legendary it used to give away', () => {
    // The tier is reachable — it just costs something now.
    expect(fusionOutputRarity(fourMaterialPack('Rare'), FOUR_TAGS)).toBe('Legendary');
    const r = synthesizeFusionDeterministic(fourMaterialPack('Rare'), FOUR_TAGS, 'armor');
    expect(r.stats.acBonus).toBe(5);
  });

  it('⚠⚠ ONE good piece no longer carries a junk pack — see OTA-1537', () => {
    // ⚠ SUPERSEDED WITHIN THE SAME BATCH, ON PURPOSE. OTA-1536 shipped this as
    // "the BEST input sets the ceiling" so that a player topping up a strong
    // core with the odd scrap the diversity gate DEMANDS would not be punished
    // for obeying it. Pricing it out afterwards showed the softness: one Rare
    // sliver plus three Commons still forged an AC 5 for ~151 TC of forgone
    // value against ~220-380 to buy one. OTA-1537 takes the SECOND-highest
    // rarity instead — a tier must be supported, not merely touched — and the
    // original concern is still answered, because two is the smallest number
    // that can mean "this pack is actually made of that."
    const mixed = [
      item('Scrap Plate', 'Common', ['metal']),
      item('Bone Shard', 'Common', ['organic']),
      item('Torn Wrap', 'Common', ['cloth']),
      item('Warden Sliver', 'Rare', ['aether']),
    ];
    expect(fusionOutputRarity(mixed, FOUR_TAGS)).toBe('Uncommon');
  });

  it('⚠⚠ material variety still pays — it is a BONUS on quality now, not the whole rule', () => {
    // OTA-445's reward for a broad pack survives; it just has something to be
    // added to. Same inputs, three tags vs four.
    expect(fusionOutputRarity(fourMaterialPack('Uncommon'), THREE_TAGS)).toBe('Uncommon');
    expect(fusionOutputRarity(fourMaterialPack('Uncommon'), FOUR_TAGS)).toBe('Rare');
  });

  it('⚠⚠ the floor holds — the Crucible never hands back a Common', () => {
    // It costs a fee, a walk and three reserved pieces. A Common result would
    // make the whole bench pointless, which is the opposite failure.
    expect(fusionOutputRarity(fourMaterialPack('Common'), THREE_TAGS)).toBe('Uncommon');
    expect(bumpRarity('Common', 0)).toBe('Uncommon');
    expect(bumpRarity('Common', -5)).toBe('Uncommon');
  });

  it('⚠⚠ …and the ceiling holds — nothing steps past Legendary', () => {
    expect(bumpRarity('Legendary', 1)).toBe('Legendary');
    expect(fusionOutputRarity(fourMaterialPack('Legendary'), FOUR_TAGS)).toBe('Legendary');
  });

  it('⚠ an input with NO rarity grades as Common rather than inheriting a free tier', () => {
    // Old saves and inferred loot both carry sparse fields. Reading a missing
    // rarity as anything but the bottom would hand the exploit straight back.
    const bare = FOUR_TAGS.map((t, i) => {
      const it = item(`Bare ${t}`, 'Common', [t]);
      delete (it as unknown as Record<string, unknown>).rarity;
      return { ...it, id: `bare${i}` } as InventoryItem;
    });
    expect(fusionOutputRarity(bare, FOUR_TAGS)).toBe('Uncommon');
  });
});

describe('OTA-1536 — an earned fusion forges exactly what it always forged', () => {
  it('⚠⚠⚠ Legendary keeps OTA-445\'s numbers: AC 5 / 2d8 / +2 / 45', () => {
    // The complaint was about REACHABILITY, not about the reward being too
    // strong once earned. Changing both would be two fixes wearing one name.
    const armor = synthesizeFusionDeterministic(fourMaterialPack('Rare'), FOUR_TAGS, 'armor');
    expect(armor.stats.rarity).toBe('Legendary');
    expect(armor.stats.acBonus).toBe(5);
    expect(armor.stats.durability.max).toBe(45);
    expect(armor.stats.statBonus?.amount).toBe(2);
    const weapon = synthesizeFusionDeterministic(fourMaterialPack('Rare'), FOUR_TAGS, 'weapon');
    expect(weapon.stats.damageDice).toBe('2d8');
  });

  it('⚠⚠ Rare keeps OTA-445\'s numbers too: AC 3 / 2d6 / +1 / 35', () => {
    const armor = synthesizeFusionDeterministic(fourMaterialPack('Rare'), THREE_TAGS, 'armor');
    expect(armor.stats.rarity).toBe('Rare');
    expect(armor.stats.acBonus).toBe(3);
    expect(armor.stats.durability.max).toBe(35);
    expect(armor.stats.statBonus?.amount).toBe(1);
    const weapon = synthesizeFusionDeterministic(fourMaterialPack('Rare'), THREE_TAGS, 'weapon');
    expect(weapon.stats.damageDice).toBe('2d6');
  });

  it('⚠⚠ the new floor tier is a real reward, and stays under catalog Rare armor', () => {
    // Catalog Rare armor tops out at acBonus 3. An Uncommon fuse at 2 is worth
    // the fee without erasing anything found.
    const armor = synthesizeFusionDeterministic(fourMaterialPack('Common'), FOUR_TAGS, 'armor');
    expect(armor.stats.acBonus).toBe(2);
    expect(armor.stats.durability.max).toBe(25);
    expect(armor.stats.statBonus?.amount).toBe(1);
  });

  it('⚠ every tier still carries a stat bonus — a fused piece is never inert', () => {
    // OTA-445's promise ("a fused piece always carries a real perk") predates
    // this OTA and must survive the new tiers.
    for (const r of FUSION_RARITY_LADDER) {
      const out = synthesizeFusionDeterministic(fourMaterialPack(r), THREE_TAGS, 'weapon');
      expect(out.stats.statBonus?.amount).toBeGreaterThanOrEqual(1);
    }
  });

  it('⚠ the forge stays deterministic — same pack, same result', () => {
    const a = synthesizeFusionDeterministic(fourMaterialPack('Rare'), FOUR_TAGS, 'weapon');
    const b = synthesizeFusionDeterministic(fourMaterialPack('Rare'), FOUR_TAGS, 'weapon');
    expect(a.name).toBe(b.name);
    expect(a.stats.rarity).toBe(b.stats.rarity);
  });
});

describe('OTA-1536 — all three sites of the error class are closed', () => {
  it('⚠⚠⚠ the deterministic synth no longer derives the tier from tag count alone', () => {
    const code = codeOnly(src('app', 'engine', 'itemFusion.ts'));
    expect(code).not.toContain("const rarity: 'Rare' | 'Legendary' = tagProfile.length >= 4 ? 'Legendary' : 'Rare';");
    expect(code).toContain('const rarity: Rarity = fusionOutputRarity(inputs, tagProfile);');
  });

  it('⚠⚠⚠ the faction-catalyst site no longer duplicates the old expression', () => {
    // This is the one that made arb107's own contract untrue: it computed the
    // SAME value as the synth and called it "one tier above".
    const code = codeOnly(src('app', 'state', 'slices', 'craftingSlice.ts'));
    expect(code).not.toContain("selGate.tagProfile.length >= 4 ? 'Legendary' : 'Rare'");
    expect(code).toContain('fusion.fusionOutputRarity(selGate.inputs, selGate.tagProfile)');
    expect(code).toContain('fusion.bumpRarity(');
  });

  it('⚠⚠ the catalyst genuinely confers the tier ABOVE the natural one now', () => {
    // arb107's written contract, finally true. A catalyst on a scrap pack gives
    // Rare — a real bump, and not the Legendary it used to hand over.
    expect(bumpRarity(fusionOutputRarity(fourMaterialPack('Common'), FOUR_TAGS), 1)).toBe('Rare');
    expect(bumpRarity(fusionOutputRarity(fourMaterialPack('Rare'), FOUR_TAGS), 1)).toBe('Legendary');
  });

  it('⚠⚠ the Qwen path is capped even though nothing calls it', () => {
    // It cannot see the inputs (validateFusionResponse takes the raw row), and
    // the prompt still tells the model to answer Legendary at 4+ tags. Capping
    // it costs four lines and stops the class returning through the back door.
    const code = codeOnly(src('app', 'engine', 'itemFusion.ts'));
    expect(code).toContain('const ceiling = fusionOutputRarity(inputs, tagProfile);');
  });

  it('⚠⚠ the doc comment that stated the old rule out loud is gone', () => {
    // "NOT by the inputs' own rarity" was the bug, written down as intent. A
    // reader who trusts it would re-introduce this.
    expect(src('app', 'engine', 'itemFusion.ts')).not.toContain("NOT by the inputs' own rarity");
  });

  it('⚠ the fused-stats type carries the full ladder, not the old two-tier union', () => {
    expect(codeOnly(src('app', 'engine', 'types.ts'))).not.toContain("rarity: 'Rare' | 'Legendary';");
  });
});
