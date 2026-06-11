// OTA-495 — Core-4 golem-armament forge gate. The four golem-weapon recipes
// (Sledge / Greatsword / Pike / Aether-Lance) carry coresRequired:4, and the
// Arbiter fires a one-shot unlock beat the moment the 4th Core lands.

import {
  shouldFireFourCoreForge,
  fourCoreForgeLine,
  markTwistFired,
} from '../app/engine/mainQuest';
import { RECIPES } from '../app/engine/crafting';
import type { MainQuestState } from '../app/engine/types';

const state = (coreCount: number, fired: string[] = []): MainQuestState => ({
  phase: 'cores',
  coresRecovered: Array.from({ length: coreCount }, (_, i) => `capital_${i}`),
  twistsFired: fired,
} as unknown as MainQuestState);

describe('OTA-495 — Core-4 forge gate', () => {
  it('the four golem-armament recipes require 4 Cores', () => {
    const golem = RECIPES.filter((r) =>
      ['Golem Sledge', 'Golem Greatsword', 'Golem Pike', 'Golem Aether-Lance'].includes(r.result),
    );
    expect(golem).toHaveLength(4);
    for (const r of golem) expect(r.coresRequired).toBe(4);
  });

  it('no NON-golem recipe accidentally picked up a cores gate', () => {
    const gated = RECIPES.filter((r) => typeof r.coresRequired === 'number');
    expect(gated.every((r) => r.result.startsWith('Golem '))).toBe(true);
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

  it('the unlock line mentions golem armaments', () => {
    expect(fourCoreForgeLine()).toMatch(/golem armaments can now be forged/i);
  });
});
