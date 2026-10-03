// Phase 5A, Part 5 — mechanism-specific success predicates.
//
// Each predicate below is a `(ctx: PredicateContext<S, V>) => PredicateResult`
// compatible with qualify()'s `predicate` field (test-utils/canonical/qualify.ts).
// They are PURE: no RNG, no clock read, no store access, no logging, no
// persistence, no production-action invocation. Each takes only the compact,
// mechanism-specific state shape a real captureState() would need to expose —
// never a whole-GameStore diff (the owner's explicit anti-noise instruction
// carried over from Part 4).
//
// Every predicate here is derived from traced production semantics recorded
// in docs/cartography/qualification-contracts.json (source file/line cited
// per contract), not from assumed/expected behavior. Where a mechanism has a
// documented historical false-positive bug class, the state shape is chosen
// so that bug class is STRUCTURALLY excluded (e.g. WeaponCoatingState has no
// coatingSlots field at all — the coatingSlots-vs-coating confusion cannot
// recur because the field the old bug checked isn't even captured).
//
// Part 5 does not call qualify() against any real production door — see
// __tests__/canonicalQualificationPredicates.test.ts, which exercises every
// predicate below directly against controlled before/after fixtures only.
// Wiring these into qualify() against real gameStore state is Part 11 work.

import type { PredicateContext, PredicateResult } from './qualify';

// ── BUY (buyFromVendor, app/state/slices/vendorSlice.ts:77,143) ───────────

export interface BuyState {
  tc: number;
  itemQty: number;
}

export function buyPredicate(ctx: PredicateContext<BuyState, void>): PredicateResult {
  const tcSpent = ctx.before.tc > ctx.after.tc;
  const itemGained = ctx.after.itemQty > ctx.before.itemQty;
  if (tcSpent && itemGained) {
    return { passed: true, reason: 'tc decreased and item quantity increased', observed: { tcDelta: ctx.after.tc - ctx.before.tc, itemQtyDelta: ctx.after.itemQty - ctx.before.itemQty } };
  }
  return { passed: false, reason: `expected tc to decrease and itemQty to increase; got tcDelta=${ctx.after.tc - ctx.before.tc}, itemQtyDelta=${ctx.after.itemQty - ctx.before.itemQty}` };
}

// ── SELL (sellToVendor, app/state/slices/vendorSlice.ts:87,713) ───────────

export interface SellState {
  tc: number;
  itemQty: number;
}

export function sellPredicate(ctx: PredicateContext<SellState, void>): PredicateResult {
  const tcGained = ctx.after.tc > ctx.before.tc;
  const itemLost = ctx.after.itemQty < ctx.before.itemQty;
  if (tcGained && itemLost) {
    return { passed: true, reason: 'tc increased and item quantity decreased', observed: { tcDelta: ctx.after.tc - ctx.before.tc, itemQtyDelta: ctx.after.itemQty - ctx.before.itemQty } };
  }
  return { passed: false, reason: `expected tc to increase and itemQty to decrease; got tcDelta=${ctx.after.tc - ctx.before.tc}, itemQtyDelta=${ctx.after.itemQty - ctx.before.itemQty}` };
}

// ── SCRAP (scrapInventoryItem, app/state/slices/inventorySlice.ts:98,989) ─
// canScrap-refused items never reach here (reachability/precondition gate).
// RNG affects output QUALITY, never whether the target item is consumed —
// success signal is target-consumed AND at-least-one-material-granted
// (fullOutput vs consolation-output both grant >=1 material, per source trace).

export interface ScrapState {
  targetQty: number;
  materialTotalQty: number;
}

export function scrapPredicate(ctx: PredicateContext<ScrapState, void>): PredicateResult {
  const consumedExactlyOne = ctx.before.targetQty - ctx.after.targetQty === 1;
  const materialGranted = ctx.after.materialTotalQty > ctx.before.materialTotalQty;
  if (consumedExactlyOne && materialGranted) {
    return { passed: true, reason: 'target item consumed by exactly 1 and material output granted', observed: { targetDelta: ctx.after.targetQty - ctx.before.targetQty, materialDelta: ctx.after.materialTotalQty - ctx.before.materialTotalQty } };
  }
  return { passed: false, reason: `expected targetQty to drop by exactly 1 and materialTotalQty to increase; got targetDelta=${ctx.after.targetQty - ctx.before.targetQty}, materialDelta=${ctx.after.materialTotalQty - ctx.before.materialTotalQty}` };
}

// ── VENDOR REPAIR (repairWithVendor, app/state/slices/vendorSlice.ts:1137-1200) ─

export interface VendorRepairState {
  tc: number;
  durabilityCurrent: number;
  durabilityMax: number;
}

export function vendorRepairPredicate(ctx: PredicateContext<VendorRepairState, void>): PredicateResult {
  const wasDamaged = ctx.before.durabilityCurrent < ctx.before.durabilityMax;
  const nowFull = ctx.after.durabilityCurrent === ctx.after.durabilityMax;
  const tcSpent = ctx.after.tc < ctx.before.tc;
  if (wasDamaged && nowFull && tcSpent) {
    return { passed: true, reason: 'durability.current restored to durability.max and tc spent', observed: { tcDelta: ctx.after.tc - ctx.before.tc } };
  }
  if (!wasDamaged) {
    return { passed: false, reason: 'precondition fixture error: item was already at max durability before the call', classification: 'NO_STATE_CHANGE' };
  }
  return { passed: false, reason: `expected durability.current===durability.max and tc spent; got current=${ctx.after.durabilityCurrent}, max=${ctx.after.durabilityMax}, tcDelta=${ctx.after.tc - ctx.before.tc}` };
}

// ── BENCH REPAIR (repairInventoryItem, app/state/slices/inventorySlice.ts:1180-1310) ─
// Materials-only cost — no TC change (this is the field that distinguishes
// bench repair from vendor repair; a predicate checking tc here would be
// checking the wrong mechanism's cost currency).

export interface BenchRepairState {
  tc: number;
  durabilityCurrent: number;
  durabilityMax: number;
  materialQty: number;
}

export function benchRepairPredicate(ctx: PredicateContext<BenchRepairState, 'done' | 'refused' | 'crucible'>): PredicateResult {
  if (ctx.verdict === 'refused' || ctx.verdict === 'crucible') {
    return { passed: false, reason: `repairInventoryItem returned verdict '${ctx.verdict}'`, classification: 'REFUSED' };
  }
  const wasDamaged = ctx.before.durabilityCurrent < ctx.before.durabilityMax;
  const nowFull = ctx.after.durabilityCurrent === ctx.after.durabilityMax;
  const materialsSpent = ctx.after.materialQty < ctx.before.materialQty;
  const tcUnchanged = ctx.after.tc === ctx.before.tc;
  if (wasDamaged && nowFull && materialsSpent && tcUnchanged) {
    return { passed: true, reason: 'durability.current restored to durability.max via materials only, tc untouched', observed: { materialDelta: ctx.after.materialQty - ctx.before.materialQty } };
  }
  return { passed: false, reason: `expected durability restored via materials with tc unchanged; got current=${ctx.after.durabilityCurrent}, max=${ctx.after.durabilityMax}, materialDelta=${ctx.after.materialQty - ctx.before.materialQty}, tcDelta=${ctx.after.tc - ctx.before.tc}` };
}

// ── BULK REPAIR (repairInventoryItems, app/state/slices/inventorySlice.ts:1324-1338) ─
// A sequential loop over single-item repairs against a SHARED, draining
// material pool (OTA-1098/1102) — partial per-item outcomes are legitimate
// (item 3 of 3 can honestly run out of shared stock). The batch predicate
// therefore requires only that at least one damaged item got fully repaired
// and that no item's durability ever moved the wrong direction.

export interface BulkRepairItemState {
  id: string;
  durabilityCurrent: number;
  durabilityMax: number;
}

export interface BulkRepairState {
  items: readonly BulkRepairItemState[];
}

export function bulkRepairPredicate(ctx: PredicateContext<BulkRepairState, void>): PredicateResult {
  const beforeById = new Map(ctx.before.items.map((i) => [i.id, i]));
  let anyFullyRepaired = false;
  for (const after of ctx.after.items) {
    const before = beforeById.get(after.id);
    if (!before) continue;
    if (after.durabilityCurrent < before.durabilityCurrent) {
      return { passed: false, reason: `item ${after.id} durability.current decreased (${before.durabilityCurrent} -> ${after.durabilityCurrent}) — bulk repair must never damage an item` };
    }
    if (after.durabilityMax !== before.durabilityMax) {
      return { passed: false, reason: `item ${after.id} durability.max changed unexpectedly (${before.durabilityMax} -> ${after.durabilityMax}) — repair does not alter max` };
    }
    if (before.durabilityCurrent < before.durabilityMax && after.durabilityCurrent === after.durabilityMax) {
      anyFullyRepaired = true;
    }
  }
  if (anyFullyRepaired) {
    return { passed: true, reason: 'at least one damaged item in the batch reached full durability with no item damaged or capped incorrectly' };
  }
  return { passed: false, reason: 'no item in the batch transitioned from damaged to full durability' };
}

// ── REINFORCEMENT (reinforceWithVendor, app/state/slices/vendorSlice.ts:1057-1135) ─
// Historical false positive (EC-001-class): checking only player.tc (179->179)
// misses that a refusal returns before set() — tc, reinforced, and max all
// stay identical on refusal. The real success signal is durability.reinforced
// (0..REINFORCE_MAX_LEVEL=3), NOT tc.

export interface ReinforcementState {
  tc: number;
  reinforced: number;
  durabilityMax: number;
  durabilityCurrent: number;
}

export function reinforcementPredicate(ctx: PredicateContext<ReinforcementState, void>): PredicateResult {
  const levelUp = ctx.after.reinforced === ctx.before.reinforced + 1;
  const maxGrew = ctx.after.durabilityMax > ctx.before.durabilityMax;
  const currentGrew = ctx.after.durabilityCurrent > ctx.before.durabilityCurrent;
  const tcSpent = ctx.after.tc < ctx.before.tc;
  if (levelUp && maxGrew && currentGrew && tcSpent) {
    return { passed: true, reason: 'durability.reinforced incremented, durability.max and .current grew, tc spent', observed: { reinforcedDelta: ctx.after.reinforced - ctx.before.reinforced, maxDelta: ctx.after.durabilityMax - ctx.before.durabilityMax } };
  }
  if (ctx.before.reinforced >= 3 && ctx.after.reinforced === ctx.before.reinforced && ctx.after.tc === ctx.before.tc) {
    return { passed: false, reason: 'item already at REINFORCE_MAX_LEVEL (3) — legitimate no-op, not a defect', classification: 'NO_STATE_CHANGE' };
  }
  return { passed: false, reason: `expected reinforced+1, max/current growth, and tc spent; got reinforcedDelta=${ctx.after.reinforced - ctx.before.reinforced}, maxDelta=${ctx.after.durabilityMax - ctx.before.durabilityMax}, currentDelta=${ctx.after.durabilityCurrent - ctx.before.durabilityCurrent}, tcDelta=${ctx.after.tc - ctx.before.tc}` };
}

// ── FUSE RESERVE (toggleReserveForFusion, app/state/gameStore.ts:29398-29489) ─
// An ineligible/non-catalyst item's call is a genuine silent no-op (line
// 29421) — the flag never flips. A real, eligible toggle always flips the
// boolean (it is a toggle, never an explicit set), so "flipped" is both
// necessary and sufficient.

export interface FuseReserveState {
  reservedForFusion: boolean;
}

export function fuseReservePredicate(ctx: PredicateContext<FuseReserveState, void>): PredicateResult {
  if (ctx.after.reservedForFusion !== ctx.before.reservedForFusion) {
    return { passed: true, reason: 'reservedForFusion flag flipped', observed: { before: ctx.before.reservedForFusion, after: ctx.after.reservedForFusion } };
  }
  return { passed: false, reason: 'reservedForFusion did not flip — item was ineligible (isForgeReservableItem false, not a faction catalyst, not already reserved) and the call silently no-op\'d', classification: 'NO_STATE_CHANGE' };
}

// ── FUSE COMMIT (fuseAtCrucible, app/state/slices/craftingSlice.ts:90-327) ─
// EC-004 correction: a valid predicate must see BOTH input removal AND
// output presence — never accept an empty-{}/{} tautological capture. This
// factory bakes in the exact expected input-consumption count so the
// predicate cannot silently accept "some unspecified input decreased."

export interface FuseCommitState {
  inputQtyTotal: number;
  fusedItemCount: number;
  tc: number;
}

export function makeFuseCommitPredicate(expectedInputsConsumed: number) {
  return function fuseCommitPredicate(ctx: PredicateContext<FuseCommitState, void>): PredicateResult {
    const inputsConsumed = ctx.before.inputQtyTotal - ctx.after.inputQtyTotal;
    const outputAppeared = ctx.after.fusedItemCount === ctx.before.fusedItemCount + 1;
    const feeChargedOrZero = ctx.after.tc <= ctx.before.tc;
    if (inputsConsumed === expectedInputsConsumed && outputAppeared && feeChargedOrZero) {
      return { passed: true, reason: `exactly ${expectedInputsConsumed} reserved input unit(s) consumed and one fused item minted`, observed: { inputsConsumed, tcDelta: ctx.after.tc - ctx.before.tc } };
    }
    if (inputsConsumed === 0 && !outputAppeared && ctx.after.tc === ctx.before.tc) {
      return { passed: false, reason: 'no inputs consumed, no output minted, tc unchanged — a gate refusal (Crucible absence, input/tag diversity, or fee), never a fabricated empty-capture success', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected exactly ${expectedInputsConsumed} input unit(s) consumed and fusedItemCount+1; got inputsConsumed=${inputsConsumed}, fusedItemCountDelta=${ctx.after.fusedItemCount - ctx.before.fusedItemCount}` };
  };
}

// ── CRAFT ('craft' case, app/state/gameStore.ts:21668-21917) ──────────────
// Fully deterministic given valid inputs (no RNG on the craft path itself,
// unlike scrap/salvage). A batch call mints craftN units; ingredients are
// consumed per recipe.ingredients[].quantity × craftN.

export interface CraftState {
  ingredientQty: number;
  craftedItemCount: number;
}

export function makeCraftPredicate(expectedIngredientsConsumed: number, expectedCraftN: number) {
  return function craftPredicate(ctx: PredicateContext<CraftState, void>): PredicateResult {
    const ingredientsConsumed = ctx.before.ingredientQty - ctx.after.ingredientQty;
    const craftedDelta = ctx.after.craftedItemCount - ctx.before.craftedItemCount;
    if (ingredientsConsumed === expectedIngredientsConsumed && craftedDelta === expectedCraftN) {
      return { passed: true, reason: `${expectedIngredientsConsumed} ingredient unit(s) consumed and ${expectedCraftN} crafted item(s) minted` };
    }
    if (ingredientsConsumed === 0 && craftedDelta === 0) {
      return { passed: false, reason: 'no ingredients consumed and no item minted — a gate refusal (lock/INT/cores/one-per-pack/missing-ingredients), not a fabricated success', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected ${expectedIngredientsConsumed} ingredient(s) consumed and ${expectedCraftN} item(s) minted; got ingredientsConsumed=${ingredientsConsumed}, craftedDelta=${craftedDelta}` };
  };
}

// ── AMBIENT SALVAGE (salvageAllAmbient, app/state/slices/inventorySlice.ts:1403-1730) ─
// I-052 FIX: a batch where every noun is a legitimate skip (already-searched /
// takeable-gear / quest-lead / unmatched-by-any-pool) correctly yields
// materialTotalQty unchanged even though nothing is wrong. materialTotalQty
// and searchedNounsCount alone can't tell that apart from a harness-level
// grant failure — but salvageAllAmbient already writes a DISTINCT, real,
// player-visible narration line per skip bucket (its own "already worked
// over" / "left whole" / "left untouched" / "look ... over and find
// nothing" lines — see inventorySlice.ts ~1677-1738), so the skip-reason
// breakdown IS observable, just not through the two original fields. The
// four counts below are recovered by parsing those exact real log lines
// (parseAmbientSalvageSkipSignals), the same before/after log-range idea
// actionExecutor.ts's logRange and logMirror.ts already use elsewhere in
// this harness — captureState() sums the signal over the log captured so
// far, and the predicate diffs before/after like every other field here.
// No app/** change, no new telemetry hook: this is a harness-side read of
// output the production code was already writing.

export interface AmbientSalvageState {
  materialTotalQty: number;
  searchedNounsCount: number;
  /** Cumulative count of nouns salvageAllAmbient has narrated as "already
   *  worked over" (searchedAmbientNouns hit) across the log captured so far. */
  skippedAlreadyCount: number;
  /** Cumulative count of nouns narrated as "left whole" (OTA-1231 takeable-gear guard). */
  skippedTakeableCount: number;
  /** Cumulative count of nouns narrated as "left untouched" (OTA-1236 quest-lead guard). */
  skippedLeadCount: number;
  /** Cumulative count of nouns narrated as matching no salvage pool at all
   *  (OTA-037's unmatched fallback). A floor, not necessarily exact above 3 —
   *  the production line itself caps the named nouns at 3 with no overflow
   *  suffix (unlike the other three buckets' "and N more") — but >0 is all
   *  this predicate needs. */
  unmatchedCount: number;
}

/** Pure text parsing of salvageAllAmbient's own real narration lines — no
 *  store access, no RNG, matching this file's PURE constraint. `prefix`/
 *  `suffix` bracket the name-list exactly as the four emit sites in
 *  inventorySlice.ts render it; an optional " and N more" overflow tail
 *  (present on the already/takeable/lead lines, never on the unmatched one)
 *  is counted in addition to the comma-joined names actually printed. */
function countAmbientSalvageSkipLines(
  lines: readonly { channel: string; text: string }[],
  prefix: string,
  suffix: string,
): number {
  let total = 0;
  for (const { text } of lines) {
    if (!text.startsWith(prefix) || !text.endsWith(suffix)) continue;
    const blob = text.slice(prefix.length, text.length - suffix.length);
    const overflowMatch = / and (\d+) more$/.exec(blob);
    const overflow = overflowMatch ? parseInt(overflowMatch[1]!, 10) : 0;
    const namesBlob = overflowMatch ? blob.slice(0, overflowMatch.index) : blob;
    const names = namesBlob.split(',').map((s) => s.trim()).filter(Boolean);
    total += names.length + overflow;
  }
  return total;
}

/** Builds the four I-052 skip-reason counts from a window of real gameLog
 *  entries (any slice/mirror exposing {channel, text} — e.g. a before/after
 *  slice of the real store's `gameLog`, or test-utils/canonical/logMirror.ts's
 *  getLogMirror()). Call it once against the log captured up to "before" and
 *  once against the log captured up to "after"; the predicate diffs the two
 *  results exactly like materialTotalQty/searchedNounsCount. */
export function parseAmbientSalvageSkipSignals(
  lines: readonly { channel: string; text: string }[],
): Pick<AmbientSalvageState, 'skippedAlreadyCount' | 'skippedTakeableCount' | 'skippedLeadCount' | 'unmatchedCount'> {
  return {
    skippedAlreadyCount: countAmbientSalvageSkipLines(lines, 'Already worked over: ', '.'),
    skippedTakeableCount: countAmbientSalvageSkipLines(
      lines,
      'Left whole — worth more in your pack than in pieces: ',
      '. (TAKE them.)',
    ),
    skippedLeadCount: countAmbientSalvageSkipLines(
      lines,
      '✦ Left untouched — there is something here worth understanding first: ',
      '. (INVESTIGATE.)',
    ),
    unmatchedCount: countAmbientSalvageSkipLines(
      lines,
      'You look the ',
      ' over and find nothing your tools can break down here.',
    ),
  };
}

export function ambientSalvagePredicate(ctx: PredicateContext<AmbientSalvageState, void>): PredicateResult {
  const nounsProcessed = ctx.after.searchedNounsCount > ctx.before.searchedNounsCount;
  const materialGranted = ctx.after.materialTotalQty > ctx.before.materialTotalQty;
  const skippedAlreadyDelta = ctx.after.skippedAlreadyCount - ctx.before.skippedAlreadyCount;
  const skippedTakeableDelta = ctx.after.skippedTakeableCount - ctx.before.skippedTakeableCount;
  const skippedLeadDelta = ctx.after.skippedLeadCount - ctx.before.skippedLeadCount;
  const unmatchedDelta = ctx.after.unmatchedCount - ctx.before.unmatchedCount;
  const legitimateSkipSignal =
    skippedAlreadyDelta > 0 || skippedTakeableDelta > 0 || skippedLeadDelta > 0 || unmatchedDelta > 0;

  if (nounsProcessed && materialGranted) {
    return { passed: true, reason: 'at least one offered noun was processed and material was granted' };
  }
  // I-052: every offered noun accounted for by a legitimate skip reason, and
  // nothing else happened — that is correct zero-yield behavior, not a
  // predicate failure, distinct from a silent harness-level grant failure.
  if (!nounsProcessed && !materialGranted && legitimateSkipSignal) {
    return {
      passed: true,
      reason: 'every offered noun resolved to a legitimate skip (already-searched / takeable-gear / quest-lead / unmatched-by-any-pool) — zero yield is the correct outcome',
      observed: { skippedAlreadyDelta, skippedTakeableDelta, skippedLeadDelta, unmatchedDelta },
    };
  }
  if (!nounsProcessed) {
    return { passed: false, reason: 'searchedAmbientNouns did not grow and no skip-reason line fired — call was refused at the call level (no player/scene, or a live enemy present) or offered zero nouns', classification: 'NO_STATE_CHANGE' };
  }
  return { passed: false, reason: 'nouns were processed but no material was granted and no legitimate skip-reason line accounts for it — harness-level grant failure', classification: 'SUCCESS_PREDICATE_FAILED' };
}

// ── STORY/FORK (answerFork, app/state/gameStore.ts:29647-29670) ───────────
// EC-005 correction: the historical bug called answerFork when pendingFork
// was null the whole run; the silent no-op was hidden by a tautological
// post-call before/after capture. This predicate REQUIRES proof a specific
// fork was pending before the call AND specifically resolved after.

export interface StoryForkState {
  pendingForkId: string | null;
  storyChoiceForFork: string | null;
}

export function makeStoryForkPredicate(expectedForkId: string, expectedOptionId: string) {
  return function storyForkPredicate(ctx: PredicateContext<StoryForkState, void>): PredicateResult {
    const forkWasPending = ctx.before.pendingForkId === expectedForkId;
    const notPreanswered = ctx.before.storyChoiceForFork !== expectedOptionId;
    const forkCleared = ctx.after.pendingForkId === null;
    const choiceRecorded = ctx.after.storyChoiceForFork === expectedOptionId;
    if (forkWasPending && notPreanswered && forkCleared && choiceRecorded) {
      return { passed: true, reason: `fork ${expectedForkId} was pending before the call and resolved to ${expectedOptionId} after` };
    }
    if (!forkWasPending && ctx.before.pendingForkId === ctx.after.pendingForkId && ctx.before.storyChoiceForFork === ctx.after.storyChoiceForFork) {
      return { passed: false, reason: `fork ${expectedForkId} was not pending (pendingForkId=${ctx.before.pendingForkId}) — answerFork silently no-op'd, matching the EC-005 false-positive scenario`, classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected pendingForkId ${expectedForkId}->null and storyChoiceForFork null->${expectedOptionId}; got pendingForkId ${ctx.before.pendingForkId}->${ctx.after.pendingForkId}, storyChoiceForFork ${ctx.before.storyChoiceForFork}->${ctx.after.storyChoiceForFork}` };
  };
}

// ── GUARDIAN SUMMON (summonCoreGuardian, app/state/gameStore.ts:30578-30742) ─
// The one mechanism confirmed NOT a historical false positive — preserve its
// exact rigor: verdict.ok AND Guardian appears AND no Core granted, all three.

export interface GuardianSummonState {
  guardianPresent: boolean;
  coresRecoveredCount: number;
}

export interface GuardianSummonVerdict {
  ok: boolean;
  reason?: string;
}

export function guardianSummonPredicate(ctx: PredicateContext<GuardianSummonState, GuardianSummonVerdict>): PredicateResult {
  const verdictOk = ctx.verdict?.ok === true;
  const guardianAppeared = !ctx.before.guardianPresent && ctx.after.guardianPresent;
  const noCoreGranted = ctx.after.coresRecoveredCount === ctx.before.coresRecoveredCount;
  if (verdictOk && guardianAppeared && noCoreGranted) {
    return { passed: true, reason: 'verdict.ok, Guardian appeared in scene.enemies, and mainQuest.coresRecovered unchanged (summon never grants a Core)' };
  }
  if (ctx.verdict?.ok === false) {
    return { passed: false, reason: `summonCoreGuardian refused: reason=${ctx.verdict.reason}`, classification: 'REFUSED' };
  }
  if (ctx.verdict?.ok === true && ctx.verdict.reason === 'already_present') {
    return { passed: false, reason: 'verdict.ok with reason=already_present — resumes an existing fight, not a fresh spawn; this predicate only proves the fresh-spawn case', classification: 'SUCCESS_PREDICATE_FAILED' };
  }
  return { passed: false, reason: `expected verdict.ok, a new Guardian entry, and unchanged coresRecovered; got verdictOk=${verdictOk}, guardianAppeared=${guardianAppeared}, coresRecoveredDelta=${ctx.after.coresRecoveredCount - ctx.before.coresRecoveredCount}` };
}

// ── WEAPON COATING (applyCoating, app/state/slices/inventorySlice.ts:784-907) ─
// Historical harness mistake (already fixed): checking item.coatingSlots
// (capacity) instead of .coating/.coating2 (applied state). This predicate's
// state shape has NO coatingSlots field at all — the bug class is
// structurally excluded, not just avoided by discipline.

export interface WeaponCoatingState {
  coatingKind: string | null;
  coatingDice: string | null;
  coatingLabel: string | null;
  coatingSourceQty: number;
}

export function makeWeaponCoatingPredicate(expectedKind: string, expectedDice: string, expectedLabel: string) {
  return function weaponCoatingPredicate(ctx: PredicateContext<WeaponCoatingState, void>): PredicateResult {
    const coatingApplied = ctx.after.coatingKind === expectedKind && ctx.after.coatingDice === expectedDice && ctx.after.coatingLabel === expectedLabel;
    const sourceConsumed = ctx.after.coatingSourceQty === ctx.before.coatingSourceQty - 1;
    if (coatingApplied && sourceConsumed) {
      return { passed: true, reason: `.coating written to {kind:${expectedKind},dice:${expectedDice},label:${expectedLabel}} and coating source item consumed` };
    }
    if (ctx.after.coatingKind === ctx.before.coatingKind && ctx.after.coatingSourceQty === ctx.before.coatingSourceQty) {
      return { passed: false, reason: 'coating field and source quantity both unchanged — a refusal (not coatable, no second slot, spec unresolved)', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected .coating={kind:${expectedKind},dice:${expectedDice},label:${expectedLabel}} and source qty -1; got coating={kind:${ctx.after.coatingKind},dice:${ctx.after.coatingDice},label:${ctx.after.coatingLabel}}, sourceQtyDelta=${ctx.after.coatingSourceQty - ctx.before.coatingSourceQty}` };
  };
}

// ── ARMOR COATING (applyCoatingToArmor, app/state/slices/inventorySlice.ts:909-987) ─
// Independent field from weapon coating: writes a resist-type STRING into
// armor.addedResists[], not a coating object.

export interface ArmorCoatingState {
  addedResists: readonly string[];
  coatingSourceQty: number;
}

export function makeArmorCoatingPredicate(expectedType: string, replacedType?: string) {
  return function armorCoatingPredicate(ctx: PredicateContext<ArmorCoatingState, void>): PredicateResult {
    const typeAdded = ctx.after.addedResists.includes(expectedType);
    const sourceConsumed = ctx.after.coatingSourceQty === ctx.before.coatingSourceQty - 1;
    if (replacedType) {
      const replacedRemoved = ctx.before.addedResists.includes(replacedType) && !ctx.after.addedResists.includes(replacedType);
      const lengthStable = ctx.after.addedResists.length === ctx.before.addedResists.length;
      if (typeAdded && replacedRemoved && lengthStable && sourceConsumed) {
        return { passed: true, reason: `resist cap reached: ${replacedType} replaced by ${expectedType}, source consumed` };
      }
      return { passed: false, reason: `expected ${replacedType} replaced by ${expectedType} with addedResists.length stable and source -1; got addedResists ${JSON.stringify(ctx.before.addedResists)}->${JSON.stringify(ctx.after.addedResists)}, sourceQtyDelta=${ctx.after.coatingSourceQty - ctx.before.coatingSourceQty}` };
    }
    const wasAbsent = !ctx.before.addedResists.includes(expectedType);
    if (wasAbsent && typeAdded && sourceConsumed) {
      return { passed: true, reason: `${expectedType} appended to addedResists, source consumed` };
    }
    const resistsUnchanged = ctx.before.addedResists.length === ctx.after.addedResists.length && ctx.before.addedResists.every((t) => ctx.after.addedResists.includes(t));
    if (resistsUnchanged && ctx.after.coatingSourceQty === ctx.before.coatingSourceQty) {
      return { passed: false, reason: 'addedResists and source quantity both unchanged — a refusal (not armor, non-resistable type, already present, or cap reached without a replace target)', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected ${expectedType} appended to addedResists and source -1; got addedResists ${JSON.stringify(ctx.before.addedResists)}->${JSON.stringify(ctx.after.addedResists)}, sourceQtyDelta=${ctx.after.coatingSourceQty - ctx.before.coatingSourceQty}` };
  };
}

// ── NPC RECRUIT ('recruit' case, app/state/gameStore.ts:21060-21113) ──────

export interface NpcRecruitState {
  companionName: string | null;
  vendorPresent: boolean;
}

export function makeNpcRecruitPredicate(expectedName: string) {
  return function npcRecruitPredicate(ctx: PredicateContext<NpcRecruitState, void>): PredicateResult {
    const companionSet = ctx.before.companionName === null && ctx.after.companionName === expectedName;
    const vendorCleared = ctx.before.vendorPresent === true && ctx.after.vendorPresent === false;
    if (companionSet && vendorCleared) {
      return { passed: true, reason: `player.companion set to ${expectedName} and scene.vendor cleared` };
    }
    if (ctx.before.companionName === ctx.after.companionName && ctx.before.vendorPresent === ctx.after.vendorPresent) {
      return { passed: false, reason: 'companion and vendor presence both unchanged — refused (already has a companion, or no vendor present)', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected companionName null->${expectedName} and vendorPresent true->false; got companionName ${ctx.before.companionName}->${ctx.after.companionName}, vendorPresent ${ctx.before.vendorPresent}->${ctx.after.vendorPresent}` };
  };
}

// ── GENERAL CONSUMABLE (use_relic case + rest/eat path, gameStore.ts) ─────
// "Already full" / "no status to cure" are LEGITIMATE zero-visible-effect
// successes with the item still consumed (confirmed by source trace) — the
// predicate therefore checks item consumption only, never HP/status delta.

export interface GeneralConsumableState {
  itemQty: number;
}

export function generalConsumablePredicate(ctx: PredicateContext<GeneralConsumableState, void>): PredicateResult {
  if (ctx.after.itemQty === ctx.before.itemQty - 1) {
    return { passed: true, reason: 'consumable item quantity decreased by exactly 1 (effect magnitude may legitimately be zero, e.g. already-full HP or no matching status to cure)' };
  }
  if (ctx.after.itemQty === ctx.before.itemQty) {
    return { passed: false, reason: 'item quantity unchanged — refused before consumption (gate item, unresolved effect, non-drinkable coating)', classification: 'NO_STATE_CHANGE' };
  }
  return { passed: false, reason: `expected itemQty to decrease by exactly 1; got delta=${ctx.after.itemQty - ctx.before.itemQty}` };
}

// ── COMBAT HEAL BATCH (useHealBatch, app/state/slices/inventorySlice.ts:526-616) ─
// Critical distinguishing fact from the source trace: `use` copies are ALWAYS
// spent once count>0 and the item resolves to a usable effect, even if HP is
// already capped or the roll heals 0 — so quantity decrement, not HP delta,
// is the reliable success signal.

export interface HealBatchState {
  itemQty: number;
}

export function makeHealBatchPredicate(expectedUse: number) {
  return function healBatchPredicate(ctx: PredicateContext<HealBatchState, void>): PredicateResult {
    if (ctx.after.itemQty === ctx.before.itemQty - expectedUse) {
      return { passed: true, reason: `itemQty decreased by exactly ${expectedUse} (the requested/affordable use count)` };
    }
    if (ctx.after.itemQty === ctx.before.itemQty) {
      return { passed: false, reason: 'itemQty unchanged — refused (count<=0, item not found/qty 0, no usable effect, or invalid target)', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected itemQty to decrease by exactly ${expectedUse}; got delta=${ctx.after.itemQty - ctx.before.itemQty}` };
  };
}

// ── EQUIP (equipItem, app/state/slices/inventorySlice.ts:152-358) [optional] ─

export interface EquipState {
  equippedId: string | null;
}

export function makeEquipPredicate(expectedItemId: string) {
  return function equipPredicate(ctx: PredicateContext<EquipState, void>): PredicateResult {
    if (ctx.before.equippedId !== expectedItemId && ctx.after.equippedId === expectedItemId) {
      return { passed: true, reason: `slot's <slot>Id set to ${expectedItemId}` };
    }
    if (ctx.before.equippedId === ctx.after.equippedId) {
      return { passed: false, reason: 'equippedId unchanged — refused (item not found, or slot invalid for this item)', classification: 'NO_STATE_CHANGE' };
    }
    return { passed: false, reason: `expected equippedId ->${expectedItemId}; got ${ctx.before.equippedId}->${ctx.after.equippedId}` };
  };
}

// ── UNEQUIP (unequipSlot, app/state/slices/inventorySlice.ts:408-442) [optional] ─
// unequipSlot is UNCONDITIONAL at the slice level (no refusal path exists) —
// calling it on an already-empty slot is a harmless, legitimate no-op write
// that still "succeeds" mechanically. The predicate therefore checks only
// the POST-STATE (slot empty), never requiring a change from before — this
// is the one contract where NO_STATE_CHANGE (identical before/after) is
// still a legitimate RUNTIME_PROVEN outcome, matching real production
// semantics exactly.

export interface UnequipState {
  equippedId: string | null;
}

export function unequipPredicate(ctx: PredicateContext<UnequipState, void>): PredicateResult {
  if (ctx.after.equippedId === null) {
    return { passed: true, reason: 'slot is empty after the call (unequipSlot is unconditional — this holds whether or not the slot was already empty)' };
  }
  return { passed: false, reason: `expected equippedId null after the call; got ${ctx.after.equippedId}` };
}

// ── LOOT ACCEPTANCE (pickup case / scene-gear "take <item>", gameStore.ts:21133-21254) [optional] ─
// Pack-full is a distinct failure mode: the dedup slot (searchedAmbientNouns)
// is marked WITHOUT granting the item — the predicate must check both fields
// to distinguish that from "did nothing at all" (oversized/no-match).

export interface LootAcceptanceState {
  itemQty: number;
  searchedNounsCount: number;
}

export function lootAcceptancePredicate(ctx: PredicateContext<LootAcceptanceState, void>): PredicateResult {
  const itemGained = ctx.after.itemQty > ctx.before.itemQty;
  const dedupMarked = ctx.after.searchedNounsCount > ctx.before.searchedNounsCount;
  if (itemGained && dedupMarked) {
    return { passed: true, reason: 'item quantity increased and the noun was marked taken' };
  }
  if (!itemGained && !dedupMarked) {
    return { passed: false, reason: 'neither item granted nor noun marked — no match, or oversized refusal before the dedup write', classification: 'NO_STATE_CHANGE' };
  }
  if (!itemGained && dedupMarked) {
    return { passed: false, reason: 'noun marked taken but item NOT granted — pack-full rejection; the item is lost, not retried', classification: 'SUCCESS_PREDICATE_FAILED' };
  }
  return { passed: false, reason: `unexpected state combination: itemGained=${itemGained}, dedupMarked=${dedupMarked}` };
}
