// OTA-1218 — PUNCHLIST P16: the rules from OTA-1214 now have a caller. This suite pins the
// parts that are pure (fuel order, acquisition gates, pricing) and the parts of the wiring
// that are structural (order of operations, the guards).
//
// ⚠ The behavioural proof is in ota1218ChannelLive, which drives the real store. Nothing
// here should be read as evidence that a player can channel anything — that was exactly
// the gap OTA-1214 shipped with.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AETHER_TECHNIQUES, TECHNIQUE_FUEL_PREFERENCE, TECHNIQUE_TEXT_PREFIX,
  findTechniqueByTextName, techniqueForFaction, techniqueTextName, techniqueTextOfferFor,
  techniqueTextPrice,
} from '../app/engine/aetherTechniques';
import { statusAcAdjustment } from '../app/engine/statusEffects';

const STORE = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');

/** Landmark-anchored slice. ⚠ Deliberately NOT a fixed number of lines: this session has
 *  retargeted seven fixed-size source windows that aged, and every one of them was a test
 *  that stopped guarding what it was written for without ever going red. */
function between(from: string, to: string): string {
  const i = STORE.indexOf(from);
  expect(i).toBeGreaterThan(-1);
  const j = STORE.indexOf(to, i);
  expect(j).toBeGreaterThan(i);
  return STORE.slice(i, j);
}

describe('OTA-1218 / P16 — fuel', () => {
  test('⚠ the technique fuel list is the SHAPE discipline\'s list, in the same order', () => {
    // The order carries OTA-970's fix (cheapest-first, after a playtester's equipped
    // Aetheric Locket was eaten). A technique that reached differently would re-open it.
    expect([...TECHNIQUE_FUEL_PREFERENCE]).toEqual([
      'Aether Residue', 'Aether Mud', 'Aether Crystal', 'Aetheric Shard', 'Golem Core',
    ]);
  });

  test('⚠ the Aetheric Locket is NOT fuel — it is a detection relic', () => {
    expect(TECHNIQUE_FUEL_PREFERENCE).not.toContain('Aetheric Locket');
  });

  test('the runner walks that list rather than inventory order', () => {
    const body = between('function runAetherTechnique(', 'function applyTechniqueEffect(');
    expect(body).toContain('AT.TECHNIQUE_FUEL_PREFERENCE');
  });
});

describe('OTA-1218 / P16 — acquisition', () => {
  const FAC = 'mud_monarchs';

  test('every technique has a text name that round-trips', () => {
    for (const t of AETHER_TECHNIQUES) {
      expect(techniqueTextName(t).startsWith(TECHNIQUE_TEXT_PREFIX)).toBe(true);
      expect(findTechniqueByTextName(techniqueTextName(t))?.id).toBe(t.id);
    }
  });

  test('a name that is not a procedure text resolves to null', () => {
    expect(findTechniqueByTextName('Aether Shield')).toBeNull();
    expect(findTechniqueByTextName('Procedure Text: Nothing At All')).toBeNull();
    expect(findTechniqueByTextName('Iron Golem Core')).toBeNull();
  });

  test('price rises with tier', () => {
    const uncommon = AETHER_TECHNIQUES.find((t) => t.tier === 'Uncommon')!;
    const rare = AETHER_TECHNIQUES.find((t) => t.tier === 'Rare')!;
    const legendary = AETHER_TECHNIQUES.find((t) => t.tier === 'Legendary')!;
    expect(techniqueTextPrice(uncommon)).toBeLessThan(techniqueTextPrice(rare));
    expect(techniqueTextPrice(rare)).toBeLessThan(techniqueTextPrice(legendary));
  });

  test('⚠⚠ a faction always keeps the SAME procedure — no die roll on the only route in', () => {
    const first = techniqueForFaction(FAC);
    for (let i = 0; i < 50; i++) expect(techniqueForFaction(FAC).id).toBe(first.id);
    expect(AETHER_TECHNIQUES.some((t) => t.id === first.id)).toBe(true);
  });

  const base = {
    vendorFaction: FAC,
    hasRapport: true,
    knownTechniques: [] as string[],
    effectiveInt: 20,
  };

  test('the happy path produces one row at the tier price', () => {
    const tech = techniqueForFaction(FAC);
    expect(techniqueTextOfferFor(base)).toEqual({
      itemName: techniqueTextName(tech), price: techniqueTextPrice(tech), quantity: 1,
    });
  });

  test('⚠ no rapport, no row', () => {
    expect(techniqueTextOfferFor({ ...base, hasRapport: false })).toBeNull();
  });

  test('⚠ a factionless vendor never carries one', () => {
    expect(techniqueTextOfferFor({ ...base, vendorFaction: null })).toBeNull();
  });

  test('⚠ already known, no row — a shop does not sell you what you carry', () => {
    expect(techniqueTextOfferFor({ ...base, knownTechniques: [techniqueForFaction(FAC).id] })).toBeNull();
  });

  test('⚠⚠ INT short, no row — a text you cannot run is a purchase that ends in nothing', () => {
    const tech = techniqueForFaction(FAC);
    expect(techniqueTextOfferFor({ ...base, effectiveInt: tech.intRequired - 1 })).toBeNull();
    expect(techniqueTextOfferFor({ ...base, effectiveInt: tech.intRequired })).not.toBeNull();
  });

  test('⚠ the offer is appended to the vendor OUTSIDE the two-return IIFE', () => {
    // A stamp inside would silently skip whichever return it was not on — the OTA-1210
    // accept-cell defect, one file over.
    expect(STORE).toContain('withTechniqueTextOffer(((): VendorInstance | null => {');
    expect(STORE).toContain('})(), player);');
  });

  test('⚠⚠ the buy path requires the vendor to actually be OFFERING it', () => {
    const buy = between('PROCEDURE TEXTS (PUNCHLIST P16)', 'OTA-726 — RECIPE offers');
    expect(buy).toContain('scene.vendor.offers.find(');
    expect(buy).toMatch(/if \(!row\)/);
    // And it teaches rather than minting an object.
    expect(buy).toContain('knownTechniques: [...(s.player.knownTechniques ?? []), tech.id]');
    expect(buy).not.toContain('grantItem');
  });

  test('⚠ the vendor\'s NATIVE faction decides, not the skin OTA-1209 paints on it', () => {
    const fn = between('export function withTechniqueTextOffer(', 'if (!offer) return vendor;');
    expect(fn).toContain('vendor.nativeFaction ?? vendor.faction');
  });
});

describe('OTA-1218 / P16 — the effects land in machinery that already existed', () => {
  test('Aether Shield is read by statusAcAdjustment, +3', () => {
    expect(statusAcAdjustment([{ kind: 'aether_shield', remainingRounds: 3 }])).toBe(3);
    // An expired field contributes nothing.
    expect(statusAcAdjustment([{ kind: 'aether_shield', remainingRounds: 0 }])).toBe(0);
  });

  test('⚠ it stacks with cover the way every other AC status does', () => {
    expect(statusAcAdjustment([
      { kind: 'aether_shield', remainingRounds: 3 },
      { kind: 'in_cover', remainingRounds: 1 },
    ])).toBe(7);
  });

  test('Veil of Ether reuses the SHIPPED stealth status, not a parallel kind', () => {
    const fx = between('function applyTechniqueEffect(', "if (tech.id === 'resonance_cascade')");
    expect(fx).toContain("kind: 'stealthed'");
    expect(fx).not.toContain("kind: 'veiled'");
  });

  test('⚠⚠ Resonance Cascade routes its dead through the SHARED sweep', () => {
    const fx = between("if (tech.id === 'resonance_cascade')", 'Unreachable while AETHER_TECHNIQUES');
    expect(fx).toContain('sweepDeadEnemies(get, set)');
    // It must not re-implement kill bookkeeping.
    expect(fx).not.toContain('resolveEnemyDefeat()');
  });

  test('⚠ the sweep is EXTRACTED, and the DOT tick now calls the same one', () => {
    expect(STORE).toContain('function sweepDeadEnemies(');
    expect(between('function tickEnemyDotsAndMaybeEndFight(', 'function sweepDeadEnemies('))
      .toContain('return sweepDeadEnemies(get, set);');
  });

  test('the kickback hurts but cannot kill — a forbidden procedure is not a suicide', () => {
    const fx = between("if (tech.id === 'resonance_cascade')", 'Unreachable while AETHER_TECHNIQUES');
    expect(fx).toContain('Math.max(1, live.hp - back)');
  });
});

describe('OTA-1218 / P16 — Temporal Slip', () => {
  test('⚠⚠ it does NOT stop a natural 20 — nothing buys immunity (the OTA-815 rule)', () => {
    const verdict = between('const wouldHit = dodgeWin === true', 'const outcomeTag = slipped');
    expect(verdict).toContain('wouldHit && !enemyCrit && slipHeld');
  });

  test('it is spent when it fires', () => {
    const verdict = between('const wouldHit = dodgeWin === true', 'const outcomeTag = slipped');
    expect(verdict).toContain("filter((e) => e.kind !== 'temporal_slip')");
  });

  test('⚠ it sits at the to-hit verdict, so nothing downstream runs on a slipped blow', () => {
    // If it were folded into the damage stack the blow would still have "landed" — armor,
    // resists and wards would all fire and the technique's own claim would be false.
    expect(STORE.indexOf('const slipHeld =')).toBeLessThan(STORE.indexOf('let shieldTag ='));
  });

  test('⚠ the data no longer promises "once per encounter", which is not what shipped', () => {
    const slip = AETHER_TECHNIQUES.find((t) => t.id === 'temporal_slip')!;
    expect(slip.effect).not.toMatch(/once per encounter/i);
    expect(slip.effect).toMatch(/3 rounds/);
  });
});

describe('OTA-1218 / P16 — the costs', () => {
  const RUNNER = () => between('function runAetherTechnique(', 'function applyTechniqueEffect(');

  test('⚠⚠ channelling in a fight COSTS THE TURN (owner call, 2026-08-09)', () => {
    expect(RUNNER()).toContain('runSurvivorVolley(get, set,');
  });

  test('⚠⚠ the dose is charged BEFORE the effect, so it can never be skipped by a branch', () => {
    const body = RUNNER();
    expect(body.indexOf('AT.dosageFor(tech,')).toBeGreaterThan(-1);
    expect(body.indexOf('AT.dosageFor(tech,')).toBeLessThan(body.indexOf('applyTechniqueEffect(tech'));
  });

  test('⚠ fuel is spent before the dose and before the effect — no free attempts', () => {
    const body = RUNNER();
    expect(body.indexOf('consumed.)')).toBeLessThan(body.indexOf('AT.dosageFor(tech,'));
  });

  test('⚠⚠ growth runs through practiceCounts, never on a bare success', () => {
    const body = RUNNER();
    expect(body).toContain('AT.practiceCounts({ success, underPressure })');
    expect(body).not.toMatch(/if \(success\)[^\n]*techniqueProficiency/);
  });

  test('the technique route runs AFTER the three disciplines, never before', () => {
    const cast = between('OTA 039 — Aethercraft branch', 'OTA 192 — effect-driven consumable use');
    expect(cast.indexOf('runAethercraft(discipline')).toBeLessThan(cast.indexOf('runAetherTechnique('));
  });
});

// ─── THE AETHERIC TAB ───────────────────────────────────────────────────────────────────
//
// ⚠ This project has no React render harness — screens are covered by driving their engine
// helpers and by reading the source. So these are SOURCE assertions, and they are here
// because the OTA's write-up makes claims about the tab ("locked rows are listed, not
// hidden") that would otherwise have nothing guarding them at all.
describe('OTA-1218 / P16 — the Aetheric tab', () => {
  const SCREEN = readFileSync(join(__dirname, '../app/screens/CraftingScreen.tsx'), 'utf8');

  test('⚠⚠ ALL FOUR are listed — locked ones are dimmed, not filtered out', () => {
    expect(SCREEN).toContain('AETHER_TECHNIQUES.map((t) => {');
    // A `.filter(known)` before the map would be the hidden-list design this rejects.
    expect(SCREEN).not.toMatch(/AETHER_TECHNIQUES\s*\n?\s*\.filter/);
    expect(SCREEN).toContain('techCardLocked');
  });

  test('an untaught row cannot be tapped, and says where the procedure is sold', () => {
    expect(SCREEN).toContain('disabled={!known}');
    expect(SCREEN).toMatch(/rapport you have earned sells this procedure/);
  });

  test('⚠ the confirm says CHANNEL, not CAST — nothing here is a spell', () => {
    expect(SCREEN).toContain("label: disciplineConfirm?.technique ? 'Channel' : 'Cast'");
  });

  test('⚠ and it states the dose before the player commits', () => {
    const build = between2(SCREEN, 'function buildTechniqueConfirm(', 'function evaluateRepair(');
    expect(build).toContain('Dose ${tech.baseDose} corruption');
    expect(build).toContain('channel ${tech.name.toLowerCase()}');
  });

  test('the card shows the RANK-ADJUSTED DC, not the base one', () => {
    // Showing baseDc would mean a practised operator reads a number they never roll against.
    expect(SCREEN).toContain('dcForRank(t.baseDc, rank)');
  });
});

/** Same landmark-anchored slice, for a second file. */
function between2(src: string, from: string, to: string): string {
  const i = src.indexOf(from);
  expect(i).toBeGreaterThan(-1);
  const j = src.indexOf(to, i);
  expect(j).toBeGreaterThan(i);
  return src.slice(i, j);
}
