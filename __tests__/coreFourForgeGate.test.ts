// OTA-495 — Core-4 golem-armament forge gate. The four golem-weapon recipes
// (Sledge / Greatsword / Pike / Aether-Lance) carry coresRequired:4, and the
// Arbiter fires a one-shot unlock beat the moment the 4th Core lands.

import {
  shouldFireFourCoreForge,
  fourCoreForgeLine,
  markTwistFired,
} from '../app/engine/mainQuest';
import { RECIPES, lookupCraftedItem } from '../app/engine/crafting';
import type { MainQuestState } from '../app/engine/types';

const state = (coreCount: number, fired: string[] = []): MainQuestState => ({
  phase: 'cores',
  coresRecovered: Array.from({ length: coreCount }, (_, i) => `capital_${i}`),
  twistsFired: fired,
} as unknown as MainQuestState);

describe('OTA-495 — Core-4 forge gate', () => {
  it('every golem-armament recipe requires 4 Cores (3 types × 3 tiers = 9)', () => {
    // OTA-720 — the armaments are now tiered (Crude/base/Elder for Sledge/
    // Greatsword/Pike). Aether-Lance was retired. All 9 sit behind the same gate.
    const golem = RECIPES.filter((r) => (lookupCraftedItem(r.result).tags ?? []).includes('golem_weapon'));
    expect(golem).toHaveLength(9);
    for (const r of golem) expect(r.coresRequired).toBe(4);
  });

  it('no NON-golem recipe accidentally picked up a cores gate', () => {
    const gated = RECIPES.filter((r) => typeof r.coresRequired === 'number');
    expect(gated.every((r) => (lookupCraftedItem(r.result).tags ?? []).includes('golem_weapon'))).toBe(true);
  });

  it('the forge beat fires exactly once, at the 4th Core', () => {
    expect(shouldFireFourCoreForge(state(3))).toBe(false); // too early
    expect(shouldFireFourCoreForge(state(4))).toBe(true);  // the moment
    expect(shouldFireFourCoreForge(state(5))).toBe(false); // past it
    // already fired → never again
    expect(shouldFireFourCoreForge(state(4, ['four_core_forge']))).toBe(false);
  });

  it('markTwistFired latches the flag idempotently', () => {
    const once = markTwistFired(state(4), 'four_core_forge');
    expect(once.twistsFired).toContain('four_core_forge');
    const twice = markTwistFired(once, 'four_core_forge');
    expect(twice.twistsFired!.filter((t) => t === 'four_core_forge')).toHaveLength(1);
  });

  it('the unlock line announces the basics + hints at stronger ones in the world', () => {
    const line = fourCoreForgeLine();
    expect(line).toMatch(/golem armaments can now be forged/i);
    expect(line).toMatch(/basic patterns are yours/i);
    expect(line).toMatch(/uncover stronger ones|master schematics/i);
  });
});
