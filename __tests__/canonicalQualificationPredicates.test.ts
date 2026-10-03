// Phase 5A, Part 5 — tests for the mechanism-specific success predicates
// (test-utils/canonical/qualificationPredicates.ts) built against the Part 4
// qualification framework (test-utils/canonical/qualify.ts).
//
// Every test below calls a predicate DIRECTLY against a controlled,
// hand-built PredicateContext<S, V> fixture — never a real production door,
// never the real gameStore. This proves each predicate's LOGIC distinguishes
// a true mechanism consequence from "merely something changed," per the
// owner's Part 5 instruction. Wiring these predicates into qualify() against
// real captureState()/execute() functions over the real store is Part 11
// work, not this file's job.
//
// This module has no runtime import of gameStore/playerWalker (unlike
// qualify.ts, which the canonicalQualificationFramework.test.ts suite must
// jest.mock() an RN/native-module boilerplate block around) — the predicates
// file only imports TYPES from qualify.ts, so no such boilerplate is needed
// here.

import {
  buyPredicate,
  sellPredicate,
  scrapPredicate,
  vendorRepairPredicate,
  benchRepairPredicate,
  bulkRepairPredicate,
  reinforcementPredicate,
  fuseReservePredicate,
  makeFuseCommitPredicate,
  makeCraftPredicate,
  ambientSalvagePredicate,
  parseAmbientSalvageSkipSignals,
  makeStoryForkPredicate,
  guardianSummonPredicate,
  makeWeaponCoatingPredicate,
  makeArmorCoatingPredicate,
  makeNpcRecruitPredicate,
  generalConsumablePredicate,
  makeHealBatchPredicate,
  makeEquipPredicate,
  unequipPredicate,
  lootAcceptancePredicate,
} from '../test-utils/canonical/qualificationPredicates';

// ── BUY ──────────────────────────────────────────────────────────────────
describe('QC-001 buyPredicate', () => {
  it('passes when tc decreases and item quantity increases', () => {
    const r = buyPredicate({ before: { tc: 100, itemQty: 0 }, after: { tc: 80, itemQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails on a no-op refusal (nothing changed)', () => {
    const r = buyPredicate({ before: { tc: 100, itemQty: 0 }, after: { tc: 100, itemQty: 0 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails when tc decreased but item did not appear (wrong-field change)', () => {
    const r = buyPredicate({ before: { tc: 100, itemQty: 0 }, after: { tc: 80, itemQty: 0 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('passes on a partially-clamped buy (fewer units than requested)', () => {
    const r = buyPredicate({ before: { tc: 50, itemQty: 2 }, after: { tc: 30, itemQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
});

// ── SELL ─────────────────────────────────────────────────────────────────
describe('QC-002 sellPredicate', () => {
  it('passes when tc increases and item quantity decreases', () => {
    const r = sellPredicate({ before: { tc: 10, itemQty: 5 }, after: { tc: 40, itemQty: 4 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails on a no-op refusal', () => {
    const r = sellPredicate({ before: { tc: 10, itemQty: 5 }, after: { tc: 10, itemQty: 5 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails when item vanished but tc did not grow (wrong-field change, not a real sell)', () => {
    const r = sellPredicate({ before: { tc: 10, itemQty: 5 }, after: { tc: 10, itemQty: 4 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── SCRAP ────────────────────────────────────────────────────────────────
describe('QC-003 scrapPredicate', () => {
  it('passes on full-output scrap (target -1, material granted)', () => {
    const r = scrapPredicate({ before: { targetQty: 1, materialTotalQty: 0 }, after: { targetQty: 0, materialTotalQty: 4 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('passes on a failed-roll consolation grant (target -1, material +1)', () => {
    const r = scrapPredicate({ before: { targetQty: 1, materialTotalQty: 2 }, after: { targetQty: 0, materialTotalQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails on a refusal (canScrap false): nothing consumed, nothing granted', () => {
    const r = scrapPredicate({ before: { targetQty: 1, materialTotalQty: 0 }, after: { targetQty: 1, materialTotalQty: 0 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails if target consumed but no material granted (the belt-and-suspenders regression case)', () => {
    const r = scrapPredicate({ before: { targetQty: 1, materialTotalQty: 0 }, after: { targetQty: 0, materialTotalQty: 0 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails if more than 1 unit was consumed (violates the always-exactly-1 semantic)', () => {
    const r = scrapPredicate({ before: { targetQty: 3, materialTotalQty: 0 }, after: { targetQty: 1, materialTotalQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── VENDOR REPAIR ────────────────────────────────────────────────────────
describe('QC-004 vendorRepairPredicate', () => {
  it('passes when a damaged item is restored to max and tc spent', () => {
    const r = vendorRepairPredicate({ before: { tc: 50, durabilityCurrent: 3, durabilityMax: 10 }, after: { tc: 40, durabilityCurrent: 10, durabilityMax: 10 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails on the already-full precondition (fixture misuse)', () => {
    const r = vendorRepairPredicate({ before: { tc: 50, durabilityCurrent: 10, durabilityMax: 10 }, after: { tc: 50, durabilityCurrent: 10, durabilityMax: 10 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when durability restored but tc NOT spent (the historical tc-only-check bug class, inverted)', () => {
    const r = vendorRepairPredicate({ before: { tc: 50, durabilityCurrent: 3, durabilityMax: 10 }, after: { tc: 50, durabilityCurrent: 10, durabilityMax: 10 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── BENCH REPAIR ─────────────────────────────────────────────────────────
describe('QC-005 benchRepairPredicate', () => {
  it("passes on verdict 'done': durability restored via materials, tc untouched", () => {
    const r = benchRepairPredicate({ before: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, after: { tc: 20, durabilityCurrent: 10, durabilityMax: 10, materialQty: 2 }, verdict: 'done' });
    expect(r.passed).toBe(true);
  });
  it("fails and classifies REFUSED on verdict 'refused'", () => {
    const r = benchRepairPredicate({ before: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, after: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, verdict: 'refused' });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('REFUSED');
  });
  it("fails and classifies REFUSED on verdict 'crucible' (guard raised, nothing consumed)", () => {
    const r = benchRepairPredicate({ before: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, after: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, verdict: 'crucible' });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('REFUSED');
  });
  it('fails if tc was spent instead of materials (wrong-currency — this would be the vendor-repair signature, not bench)', () => {
    const r = benchRepairPredicate({ before: { tc: 20, durabilityCurrent: 2, durabilityMax: 10, materialQty: 5 }, after: { tc: 15, durabilityCurrent: 10, durabilityMax: 10, materialQty: 5 }, verdict: 'done' });
    expect(r.passed).toBe(false);
  });
});

// ── BULK REPAIR ──────────────────────────────────────────────────────────
describe('QC-006 bulkRepairPredicate', () => {
  it('passes when at least one item in the batch reaches full durability', () => {
    const r = bulkRepairPredicate({
      before: { items: [{ id: 'a', durabilityCurrent: 2, durabilityMax: 10 }, { id: 'b', durabilityCurrent: 5, durabilityMax: 10 }] },
      after: { items: [{ id: 'a', durabilityCurrent: 10, durabilityMax: 10 }, { id: 'b', durabilityCurrent: 5, durabilityMax: 10 }] },
      verdict: undefined,
    });
    expect(r.passed).toBe(true);
  });
  it('passes a partial batch: item 1 repaired, item 2 legitimately short on shared materials', () => {
    const r = bulkRepairPredicate({
      before: { items: [{ id: 'a', durabilityCurrent: 2, durabilityMax: 10 }, { id: 'b', durabilityCurrent: 5, durabilityMax: 10 }, { id: 'c', durabilityCurrent: 1, durabilityMax: 10 }] },
      after: { items: [{ id: 'a', durabilityCurrent: 10, durabilityMax: 10 }, { id: 'b', durabilityCurrent: 10, durabilityMax: 10 }, { id: 'c', durabilityCurrent: 1, durabilityMax: 10 }] },
      verdict: undefined,
    });
    expect(r.passed).toBe(true);
  });
  it('fails when no item in the batch is fully repaired (all refused, e.g. crucible guard on item 1)', () => {
    const r = bulkRepairPredicate({
      before: { items: [{ id: 'a', durabilityCurrent: 2, durabilityMax: 10 }] },
      after: { items: [{ id: 'a', durabilityCurrent: 2, durabilityMax: 10 }] },
      verdict: undefined,
    });
    expect(r.passed).toBe(false);
  });
  it('fails if an item durability decreased (must never damage an item)', () => {
    const r = bulkRepairPredicate({
      before: { items: [{ id: 'a', durabilityCurrent: 5, durabilityMax: 10 }] },
      after: { items: [{ id: 'a', durabilityCurrent: 3, durabilityMax: 10 }] },
      verdict: undefined,
    });
    expect(r.passed).toBe(false);
  });
});

// ── REINFORCEMENT ────────────────────────────────────────────────────────
describe('QC-007 reinforcementPredicate', () => {
  it('passes when reinforced/max/current all grow and tc spent', () => {
    const r = reinforcementPredicate({ before: { tc: 500, reinforced: 0, durabilityMax: 20, durabilityCurrent: 20 }, after: { tc: 360, reinforced: 1, durabilityMax: 26, durabilityCurrent: 26 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE at REINFORCE_MAX_LEVEL (the legitimate cap no-op)', () => {
    const r = reinforcementPredicate({ before: { tc: 500, reinforced: 3, durabilityMax: 38, durabilityCurrent: 38 }, after: { tc: 500, reinforced: 3, durabilityMax: 38, durabilityCurrent: 38 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails the exact historical bug class: tc dropped but reinforced/max/current unchanged', () => {
    // This is the I-013/EC-001 false-positive shape: checking tc alone (179->179 in the
    // real bug, but ANY tc-only signal here) would wrongly look like a change if tc had
    // moved for an unrelated reason; the predicate must reject it regardless.
    const r = reinforcementPredicate({ before: { tc: 500, reinforced: 1, durabilityMax: 26, durabilityCurrent: 26 }, after: { tc: 500, reinforced: 1, durabilityMax: 26, durabilityCurrent: 20 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails if reinforced incremented but max did not grow (partial/wrong-field defect signature)', () => {
    const r = reinforcementPredicate({ before: { tc: 500, reinforced: 0, durabilityMax: 20, durabilityCurrent: 20 }, after: { tc: 360, reinforced: 1, durabilityMax: 20, durabilityCurrent: 20 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── FUSE RESERVE ─────────────────────────────────────────────────────────
describe('QC-008 fuseReservePredicate', () => {
  it('passes when the flag flips false->true', () => {
    const r = fuseReservePredicate({ before: { reservedForFusion: false }, after: { reservedForFusion: true }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('passes when the flag flips true->false (toggle-off)', () => {
    const r = fuseReservePredicate({ before: { reservedForFusion: true }, after: { reservedForFusion: false }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on an ineligible-item silent no-op', () => {
    const r = fuseReservePredicate({ before: { reservedForFusion: false }, after: { reservedForFusion: false }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
});

// ── FUSE COMMIT ──────────────────────────────────────────────────────────
describe('QC-009 fuseCommitPredicate (EC-004 defense)', () => {
  const predicate = makeFuseCommitPredicate(3);
  it('passes when exactly the expected inputs are consumed and one fused item appears', () => {
    const r = predicate({ before: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, after: { inputQtyTotal: 0, fusedItemCount: 1, tc: 40 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on the EC-004 empty-{}/{} refusal capture', () => {
    const r = predicate({ before: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, after: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails if output appeared but inputs were NOT consumed (fabricated/tautological output)', () => {
    const r = predicate({ before: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, after: { inputQtyTotal: 3, fusedItemCount: 1, tc: 100 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails if inputs were consumed but no output appeared (partial/wrong outcome)', () => {
    const r = predicate({ before: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, after: { inputQtyTotal: 0, fusedItemCount: 0, tc: 100 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails if fewer/more than the expected input count was consumed', () => {
    const r = predicate({ before: { inputQtyTotal: 3, fusedItemCount: 0, tc: 100 }, after: { inputQtyTotal: 1, fusedItemCount: 1, tc: 40 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── CRAFT ────────────────────────────────────────────────────────────────
describe('QC-010 craftPredicate', () => {
  const predicate = makeCraftPredicate(6, 2); // 2 units, 3 ingredient each
  it('passes when ingredients consumed and craftN items minted', () => {
    const r = predicate({ before: { ingredientQty: 10, craftedItemCount: 0 }, after: { ingredientQty: 4, craftedItemCount: 2 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a full gate refusal', () => {
    const r = predicate({ before: { ingredientQty: 10, craftedItemCount: 0 }, after: { ingredientQty: 10, craftedItemCount: 0 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails on a mid-batch materials-exhausted partial (craftMade < craftN requested)', () => {
    const r = predicate({ before: { ingredientQty: 10, craftedItemCount: 0 }, after: { ingredientQty: 7, craftedItemCount: 1 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── AMBIENT SALVAGE ──────────────────────────────────────────────────────
describe('QC-011 ambientSalvagePredicate', () => {
  const zeroSkips = { skippedAlreadyCount: 0, skippedTakeableCount: 0, skippedLeadCount: 0, unmatchedCount: 0 };
  it('passes when nouns are processed and material is granted', () => {
    const r = ambientSalvagePredicate({ before: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips }, after: { materialTotalQty: 3, searchedNounsCount: 2, ...zeroSkips }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a call-level refusal (activeEnemy present)', () => {
    const r = ambientSalvagePredicate({ before: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips }, after: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('I-052: nouns processed, no material, and NO skip-reason line accounts for it => harness-level grant failure', () => {
    const r = ambientSalvagePredicate({ before: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips }, after: { materialTotalQty: 0, searchedNounsCount: 3, ...zeroSkips }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('SUCCESS_PREDICATE_FAILED');
  });
  it.each([
    ['already-searched', { skippedAlreadyCount: 2 }],
    ['takeable-gear', { skippedTakeableCount: 1 }],
    ['quest-lead', { skippedLeadCount: 1 }],
    ['unmatched-by-any-pool', { unmatchedCount: 3 }],
  ])('I-052: a legitimate all-skip batch (%s) passes — zero yield is correct, not a failure', (_label, skip) => {
    const r = ambientSalvagePredicate({ before: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips }, after: { materialTotalQty: 0, searchedNounsCount: 0, ...zeroSkips, ...skip }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('I-052: parseAmbientSalvageSkipSignals reads salvageAllAmbient\'s real narration lines, including " and N more" overflow', () => {
    const lines = [
      { channel: 'world', text: 'Already worked over: crate, barrel and 2 more.' },
      { channel: 'world', text: 'Left whole — worth more in your pack than in pieces: iron buckler. (TAKE them.)' },
      { channel: 'world', text: '✦ Left untouched — there is something here worth understanding first: sealed door, strange idol. (INVESTIGATE.)' },
      { channel: 'world', text: 'You look the stone, dust over and find nothing your tools can break down here.' },
      { channel: 'world', text: 'an unrelated line' },
    ];
    expect(parseAmbientSalvageSkipSignals(lines)).toEqual({
      skippedAlreadyCount: 4, skippedTakeableCount: 1, skippedLeadCount: 2, unmatchedCount: 2,
    });
  });
});

// ── STORY/FORK ───────────────────────────────────────────────────────────
describe('QC-012 storyForkPredicate (EC-005 defense)', () => {
  const predicate = makeStoryForkPredicate('debt_collector', 'pay_partial');
  it('passes when the expected fork was pending and resolved to the expected option', () => {
    const r = predicate({ before: { pendingForkId: 'debt_collector', storyChoiceForFork: null }, after: { pendingForkId: null, storyChoiceForFork: 'pay_partial' }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on the EC-005 no-fork-pending false-positive scenario', () => {
    const r = predicate({ before: { pendingForkId: null, storyChoiceForFork: null }, after: { pendingForkId: null, storyChoiceForFork: null }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when a DIFFERENT fork was pending (wrong fork resolved)', () => {
    const r = predicate({ before: { pendingForkId: 'other_fork', storyChoiceForFork: null }, after: { pendingForkId: null, storyChoiceForFork: null }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails when the fork cleared but the WRONG option was recorded (wrong-field change)', () => {
    const r = predicate({ before: { pendingForkId: 'debt_collector', storyChoiceForFork: null }, after: { pendingForkId: null, storyChoiceForFork: 'refuse' }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── GUARDIAN SUMMON ──────────────────────────────────────────────────────
describe('QC-013 guardianSummonPredicate (preserve exact rigor — all three required)', () => {
  it('passes when verdict.ok, Guardian appeared, and coresRecovered unchanged', () => {
    const r = guardianSummonPredicate({ before: { guardianPresent: false, coresRecoveredCount: 1 }, after: { guardianPresent: true, coresRecoveredCount: 1 }, verdict: { ok: true } });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies REFUSED when verdict.ok is false', () => {
    const r = guardianSummonPredicate({ before: { guardianPresent: false, coresRecoveredCount: 1 }, after: { guardianPresent: false, coresRecoveredCount: 1 }, verdict: { ok: false, reason: 'hostiles_present' } });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('REFUSED');
  });
  it("fails on reason='already_present' (resumes a fight, not a fresh spawn)", () => {
    const r = guardianSummonPredicate({ before: { guardianPresent: true, coresRecoveredCount: 1 }, after: { guardianPresent: true, coresRecoveredCount: 1 }, verdict: { ok: true, reason: 'already_present' } });
    expect(r.passed).toBe(false);
  });
  it('fails if Guardian appeared and verdict.ok but coresRecovered ALSO changed (must never conflate summon with core grant)', () => {
    const r = guardianSummonPredicate({ before: { guardianPresent: false, coresRecoveredCount: 1 }, after: { guardianPresent: true, coresRecoveredCount: 2 }, verdict: { ok: true } });
    expect(r.passed).toBe(false);
  });
  it('fails if verdict.ok but no Guardian actually appeared (fabricated success)', () => {
    const r = guardianSummonPredicate({ before: { guardianPresent: false, coresRecoveredCount: 1 }, after: { guardianPresent: false, coresRecoveredCount: 1 }, verdict: { ok: true } });
    expect(r.passed).toBe(false);
  });
});

// ── WEAPON COATING ───────────────────────────────────────────────────────
describe('QC-014 weaponCoatingPredicate (coatingSlots-vs-coating defense)', () => {
  const predicate = makeWeaponCoatingPredicate('acid', '1d4', 'Acid-Etched');
  it('passes when .coating is written to the exact expected shape and source consumed', () => {
    const r = predicate({ before: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 3 }, after: { coatingKind: 'acid', coatingDice: '1d4', coatingLabel: 'Acid-Etched', coatingSourceQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal (not coatable, spec unresolved)', () => {
    const r = predicate({ before: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 3 }, after: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when source consumed but coating field unchanged (would only look right if checking coatingSlots by mistake)', () => {
    const r = predicate({ before: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 3 }, after: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
  it('fails on a wrong-kind coating (a different spec than requested)', () => {
    const r = predicate({ before: { coatingKind: null, coatingDice: null, coatingLabel: null, coatingSourceQty: 3 }, after: { coatingKind: 'fire', coatingDice: '1d6', coatingLabel: 'Ember-Kissed', coatingSourceQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── ARMOR COATING ────────────────────────────────────────────────────────
describe('QC-015 armorCoatingPredicate', () => {
  it('passes on a plain append (type absent before, present after, source consumed)', () => {
    const predicate = makeArmorCoatingPredicate('acid');
    const r = predicate({ before: { addedResists: ['fire'], coatingSourceQty: 2 }, after: { addedResists: ['fire', 'acid'], coatingSourceQty: 1 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('passes on a cap-reached replace (old type removed, new type present, length stable)', () => {
    const predicate = makeArmorCoatingPredicate('acid', 'fire');
    const r = predicate({ before: { addedResists: ['fire', 'cold', 'shock'], coatingSourceQty: 2 }, after: { addedResists: ['cold', 'shock', 'acid'], coatingSourceQty: 1 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal (already present, non-resistable type)', () => {
    const predicate = makeArmorCoatingPredicate('acid');
    const r = predicate({ before: { addedResists: ['acid'], coatingSourceQty: 2 }, after: { addedResists: ['acid'], coatingSourceQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails if source consumed but the type never appeared (partial/wrong outcome)', () => {
    const predicate = makeArmorCoatingPredicate('acid');
    const r = predicate({ before: { addedResists: [], coatingSourceQty: 2 }, after: { addedResists: [], coatingSourceQty: 1 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── NPC RECRUIT ──────────────────────────────────────────────────────────
describe('QC-016 npcRecruitPredicate', () => {
  const predicate = makeNpcRecruitPredicate('Old Marta');
  it('passes when companion is set to the expected name and vendor cleared', () => {
    const r = predicate({ before: { companionName: null, vendorPresent: true }, after: { companionName: 'Old Marta', vendorPresent: false }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal (already has a companion)', () => {
    const r = predicate({ before: { companionName: 'Existing Dog', vendorPresent: true }, after: { companionName: 'Existing Dog', vendorPresent: true }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when vendor cleared but companion was NOT set (wrong-field/partial change)', () => {
    const r = predicate({ before: { companionName: null, vendorPresent: true }, after: { companionName: null, vendorPresent: false }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── GENERAL CONSUMABLE ───────────────────────────────────────────────────
describe('QC-017 generalConsumablePredicate', () => {
  it('passes when item quantity decreases by exactly 1', () => {
    const r = generalConsumablePredicate({ before: { itemQty: 3 }, after: { itemQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('passes on a legitimate zero-visible-effect success (still consumed at full HP)', () => {
    // itemQty is the only captured field, so this is the same fixture as above —
    // the point of the contract is that hp/status/corruption are NOT captured,
    // so an already-full-HP use still reads as success via consumption alone.
    const r = generalConsumablePredicate({ before: { itemQty: 1 }, after: { itemQty: 0 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal before consumption', () => {
    const r = generalConsumablePredicate({ before: { itemQty: 3 }, after: { itemQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
});

// ── COMBAT HEAL BATCH ────────────────────────────────────────────────────
describe('QC-018 healBatchPredicate', () => {
  it('passes when itemQty decreases by exactly the expected use count', () => {
    const predicate = makeHealBatchPredicate(3);
    const r = predicate({ before: { itemQty: 5 }, after: { itemQty: 2 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('passes even when HP was already capped (quantity is the only signal, per source trace)', () => {
    const predicate = makeHealBatchPredicate(1);
    const r = predicate({ before: { itemQty: 5 }, after: { itemQty: 4 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal (item not found, no usable effect)', () => {
    const predicate = makeHealBatchPredicate(1);
    const r = predicate({ before: { itemQty: 5 }, after: { itemQty: 5 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when a different count was spent than requested (partial/wrong outcome)', () => {
    const predicate = makeHealBatchPredicate(3);
    const r = predicate({ before: { itemQty: 5 }, after: { itemQty: 3 }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── EQUIP (optional) ─────────────────────────────────────────────────────
describe('QC-019 equipPredicate', () => {
  const predicate = makeEquipPredicate('item-123');
  it('passes when the slot id is set to the expected item id', () => {
    const r = predicate({ before: { equippedId: null }, after: { equippedId: 'item-123' }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on a refusal (item not found, invalid slot)', () => {
    const r = predicate({ before: { equippedId: null }, after: { equippedId: null }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails when the WRONG item id ends up equipped', () => {
    const r = predicate({ before: { equippedId: null }, after: { equippedId: 'item-999' }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── UNEQUIP (optional) — trivial-success semantics ──────────────────────
describe('QC-020 unequipPredicate', () => {
  it('passes when the slot is empty after the call, changed from occupied', () => {
    const r = unequipPredicate({ before: { equippedId: 'item-123' }, after: { equippedId: null }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('ALSO passes when the slot was already empty (unconditional/trivial-success semantics, matching real unequipSlot)', () => {
    const r = unequipPredicate({ before: { equippedId: null }, after: { equippedId: null }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails if the slot is somehow still occupied after the call (would indicate a real defect)', () => {
    const r = unequipPredicate({ before: { equippedId: 'item-123' }, after: { equippedId: 'item-123' }, verdict: undefined });
    expect(r.passed).toBe(false);
  });
});

// ── LOOT ACCEPTANCE (optional) ───────────────────────────────────────────
describe('QC-021 lootAcceptancePredicate', () => {
  it('passes when item gained and noun marked taken', () => {
    const r = lootAcceptancePredicate({ before: { itemQty: 0, searchedNounsCount: 2 }, after: { itemQty: 1, searchedNounsCount: 3 }, verdict: undefined });
    expect(r.passed).toBe(true);
  });
  it('fails and classifies NO_STATE_CHANGE on no-match/oversized (neither field changes)', () => {
    const r = lootAcceptancePredicate({ before: { itemQty: 0, searchedNounsCount: 2 }, after: { itemQty: 0, searchedNounsCount: 2 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('NO_STATE_CHANGE');
  });
  it('fails and classifies SUCCESS_PREDICATE_FAILED on pack-full (dedup marked, item lost)', () => {
    const r = lootAcceptancePredicate({ before: { itemQty: 0, searchedNounsCount: 2 }, after: { itemQty: 0, searchedNounsCount: 3 }, verdict: undefined });
    expect(r.passed).toBe(false);
    expect(r.classification).toBe('SUCCESS_PREDICATE_FAILED');
  });
});
