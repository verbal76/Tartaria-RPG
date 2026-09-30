// Strategic repair — Phase 13: DRIVER INTEGRATION.
//
// The Phase 12 report's own known limitation #6 named the exact gap this
// file closes: "This repair has not been exercised inside an actual life
// driver... proven only in isolated fixtures." Life 2/3/4 (__tests__/
// canonicalLife{2,3,4}.test.ts) each reimplement their own travel/equip/
// approach logic as PRIVATE CLOSURES inside one giant it() block — nothing
// reusable, nothing a future Life 5 file could import without copy-pasting
// (the owner's explicit "do not create a giant copy of Life 4" instruction,
// §4). This module is the extraction: the one reusable, exported,
// independently-testable ORCHESTRATION SEAM a future canonicalLife5.test.ts
// would call, wired to the newly-qualified strategic modules instead of the
// old ad hoc weapon-rarity-only logic those closures used.
//
// Responsibility boundary (per the owner's own repeated instruction this
// session): OPTION CONSTRUCTION (equipmentOptions.ts/destinationOptions.ts)
// decides what's legitimately available; POLICY (policy.ts's decide() /
// strategicPolicy.ts's decideBetweenEncounters()) decides what a capable
// human would pick; THIS FILE is the ORCHESTRATOR — it gathers real
// observed facts, hands them to option construction, hands the result to
// policy, and executes the chosen option through a real CanonicalActionExecutor
// door. It never invents an option, never second-guesses a decision, and
// never calls the store directly — every fact arrives through the
// caller-supplied OrchestratorContext, the same dependency-injection shape
// Life3/4's own closures already used internally (view()/executor), just
// now exported and reusable instead of trapped in a test closure.
//
// STRUCTURAL NOTE: unlike policy.ts/playerView.ts, this file is NOT part of
// the player-visible firewall boundary — it is the DRIVER, the same role
// Life2/3/4's closures already played, and it necessarily depends on
// CanonicalActionExecutor (real production doors) to do its job. What it
// must never do is fabricate an option decide() wasn't offered, or read
// anything decide()/decideBetweenEncounters() themselves aren't allowed to
// read — both invariants are enforced by simply calling the qualified
// option constructors + policy functions and nothing else.

import type { PlayerView } from './playerView';
import { decide, type Decision, type DecisionOption, type LifeMemory, type OptionCategory } from './policy';
import { decideBetweenEncounters, type StrategicMemory } from './strategicPolicy';
import { buildEquipmentOptions, buildVendorEquipOptions, equippedName, type VendorEquipOffer } from './equipmentOptions';
import { buildDestinationOptions, type DestinationCandidate, type VisitedCapitalDanger } from './destinationOptions';
import { recordStrategicEvidence, type StrategicEvidenceRecord } from './strategicEvidence';
import type { CanonicalActionExecutor } from './actionExecutor';
import type { ActionRecord } from './actionExecutor';
import { resolveCombatRounds, type CombatLoopResult, type CombatRoundTrace } from './combatLoop';
import {
  decideInCombat,
  isReconsiderableCategory,
  classifyRepositionProgress,
  recordTacticalOutcome,
  rangeSnapshotOf,
  EMPTY_ENCOUNTER_TACTICAL_MEMORY,
  type EncounterTacticalMemory,
  type RangeSnapshot,
} from './tacticalReconsideration';

export interface OrchestratorContext {
  view: () => PlayerView | null;
  executor: CanonicalActionExecutor;
  memory: LifeMemory;
  strategic: StrategicMemory;
  /** This Tartarian's own disclosed race/build vulnerabilities (e.g.
   *  ['aetheric'] for mud_golem) — known at character creation, never a
   *  future enemy's damage type. */
  disclosedVulnerabilities: readonly string[];
  /** Whether production is currently holding a travel-departure confirm
   *  prompt (get().pendingTravelConfirm) — the SAME real-time check Life3/4's
   *  travelTo() already performs; injected here so this module never touches
   *  the store directly. */
  pendingTravelConfirm: () => boolean;
  /** The current in-game clock (player.hoursElapsed), or null if unknown —
   *  purely for evidence labeling; never read by any decision. */
  hoursElapsed: () => number | null;
  /** Optional: when supplied, every strategic decision this module makes is
   *  also recorded via recordStrategicEvidence(). Omitting it (or passing
   *  undefined) disables evidence capture entirely — see
   *  canonicalStrategicEvidenceNonPerturbation.test.ts for the proof that
   *  this toggle changes nothing about gameplay RNG or the chosen actions. */
  record?: (entry: Omit<StrategicEvidenceRecord, 'seq'>) => void;
}

function baseEvidenceFields(view: PlayerView, ctx: OrchestratorContext) {
  return {
    hoursElapsed: ctx.hoursElapsed(),
    locationId: view.position.currentLocationId,
    hp: view.hp,
    hpMax: view.hpMax,
    stamina: view.stamina,
    staminaMax: view.staminaMax,
  };
}

/**
 * DECISION: pre-departure / post-loot equipment reevaluation (owner §5/§8).
 * Repeatedly builds the full-slot equipment option set and equips whatever
 * the UNMODIFIED decide() picks (its own pre-existing 'equip' branch, §5 of
 * its priority hierarchy), through the real production 'wear' door, until
 * no further improvement is offered or `maxIterations` is reached (bounded
 * — never an unbounded reevaluation loop). The SAME function serves both
 * "before committing to dangerous travel" and "after meaningful loot" call
 * sites (owner's own instruction, §8: a bounded reevaluation point, not a
 * second parallel mechanism).
 */
export async function runEquipmentReevaluationPass(
  ctx: OrchestratorContext,
  maxIterations = 10,
): Promise<{ equipped: readonly string[] }> {
  const equipped: string[] = [];
  for (let i = 0; i < maxIterations; i++) {
    const v = ctx.view();
    if (!v) break;
    const options = buildEquipmentOptions(v, ctx.disclosedVulnerabilities);
    if (options.length === 0) break;
    const d = decide(v, options, ctx.memory);
    if (!d.optionId || d.category !== 'equip') break;
    const opt = options.find((o) => o.id === d.optionId)!;
    const slot = typeof opt.meta?.slot === 'string' ? opt.meta.slot : '';
    const before = slot ? equippedName(v, slot) : null;
    const itemName = opt.label.replace(/^wear /, '');
    await ctx.executor.equip(itemName, d);
    equipped.push(itemName);
    ctx.record?.({
      ...baseEvidenceFields(v, ctx),
      destinationId: null,
      travelAction: 'equip',
      strategicCategory: d.category,
      optionId: d.optionId,
      reason: d.reason,
      equipBefore: before,
      equipAfter: itemName,
      learnedDangerState: null,
    });
  }
  return { equipped };
}

/**
 * DECISION: destination selection (owner §6). Replaces
 * `LOST_CAPITAL_LOCATIONS.find(...)` (fixed array order) as the sole
 * destination intelligence: builds risk-aware options for every legitimate
 * unrecovered candidate, lets the UNMODIFIED decide() pick via its own
 * pre-existing 'route' branch (§3, lowest displayed danger), and executes
 * the chosen destination through the real travelSetCourse (+ confirmDeparture
 * when production prompts for it, the same pattern travelTo() already uses)
 * production door. Does not alter Guardian ordering — this only orders
 * WHICH capital the Walker heads toward next; which Guardian that
 * represents is production's own doing.
 */
export async function selectAndDepartForDestination(
  ctx: OrchestratorContext,
  candidates: readonly DestinationCandidate[],
  visitedDanger: VisitedCapitalDanger,
): Promise<string | null> {
  const v = ctx.view();
  if (!v || candidates.length === 0) return null;
  const options = buildDestinationOptions(v.position.currentLocationId, candidates, visitedDanger);
  if (options.length === 0) return null;
  const d = decide(v, options, ctx.memory);
  if (!d.optionId) return null;
  const opt = options.find((o) => o.id === d.optionId)!;
  const destinationId = String(opt.meta?.locationId ?? '');
  if (!destinationId) return null;

  await ctx.executor.travelSetCourse(destinationId, d);
  if (ctx.pendingTravelConfirm()) {
    const v2 = ctx.view();
    if (v2) {
      const confirmD = decide(v2, [{ id: 'confirm', category: 'route', label: 'LEAVE AND TRAVEL' }], ctx.memory);
      if (confirmD.optionId) await ctx.executor.confirmDeparture(confirmD);
    }
  }

  ctx.record?.({
    ...baseEvidenceFields(v, ctx),
    destinationId,
    travelAction: 'set-course',
    strategicCategory: d.category,
    optionId: d.optionId,
    reason: d.reason,
    equipBefore: null,
    equipAfter: null,
    learnedDangerState: Object.fromEntries(visitedDanger),
  });

  return destinationId;
}

export type BetweenEncounterOutcome = 'continue' | 'rest' | 'retreat' | 'stalled';

/**
 * DECISION: ordinary between-encounter travel strategy (owner §4/§7). Called
 * after combat ends and before blindly continuing travel — never during
 * active combat, and never touching the qualified in-combat policy branch.
 * Offers 'continue' always, 'rest' when either the pre-existing
 * stamina<25% trigger OR the new HP-aware trigger would plausibly apply
 * (decideBetweenEncounters makes the actual call), and a between-encounter
 * 'survive-retreat' option toward the known hub — decideBetweenEncounters()
 * (strategicPolicy.ts, UNMODIFIED by this task) decides among them and this
 * function executes the result through the real travelContinue/restNormally/
 * travelSetCourse doors.
 */
export async function runBetweenEncounterStep(
  ctx: OrchestratorContext,
  hubLocationId: string,
): Promise<BetweenEncounterOutcome> {
  const v = ctx.view();
  if (!v) return 'stalled';

  const options: DecisionOption[] = [{ id: 'continue', category: 'journey', label: '→ DESTINATION' }];
  options.push({ id: 'rest', category: 'guardian-prep', label: 'rest' });
  if (v.position.currentLocationId !== hubLocationId) {
    options.push({ id: 'retreat-to-hub', category: 'survive-retreat', label: `retreat to ${hubLocationId}` });
  }

  const d = decideBetweenEncounters(v, options, ctx.memory, ctx.strategic);
  const record = (travelAction: string) =>
    ctx.record?.({
      ...baseEvidenceFields(v, ctx),
      destinationId: travelAction === 'retreat' ? hubLocationId : null,
      travelAction,
      strategicCategory: d.category,
      optionId: d.optionId,
      reason: d.reason,
      equipBefore: null,
      equipAfter: null,
      learnedDangerState: null,
    });

  if (d.optionId === 'continue') {
    await ctx.executor.travelContinue(d);
    record('continue');
    return 'continue';
  }
  if (d.optionId === 'rest') {
    await ctx.executor.restNormally(d);
    record('rest');
    return 'rest';
  }
  if (d.optionId === 'retreat-to-hub') {
    await ctx.executor.travelSetCourse(hubLocationId, d);
    if (ctx.pendingTravelConfirm()) {
      const v2 = ctx.view();
      if (v2) {
        const confirmD = decide(v2, [{ id: 'confirm', category: 'route', label: 'LEAVE AND TRAVEL' }], ctx.memory);
        if (confirmD.optionId) await ctx.executor.confirmDeparture(confirmD);
      }
    }
    record('retreat');
    return 'retreat';
  }
  return 'stalled';
}

/**
 * DECISION: vendor opportunity (owner §9). Requires the CALLER to supply
 * real, currently-on-screen vendor offers — the same legitimate surface
 * Life3/4's own findVendorHealOffer() already reads (get().currentScene?.
 * vendor.offers), reached via ordinary bounded hub/capital navigation.
 * Passing `offers: null` means no legitimate vendor surface was found this
 * call — the function returns a `limitation` string rather than fabricating
 * one. Buys through the real production door, then immediately re-runs the
 * equipment reevaluation pass so a purchased upgrade actually gets worn.
 */
export async function runVendorPass(
  ctx: OrchestratorContext,
  offers: readonly VendorEquipOffer[] | null,
  currency: number,
): Promise<{ bought: string | null; limitation: string | null }> {
  if (offers === null) return { bought: null, limitation: 'no legitimate vendor surface reachable this call' };
  const v = ctx.view();
  if (!v) return { bought: null, limitation: 'no PlayerView available' };
  const options = buildVendorEquipOptions(v, offers, currency, ctx.disclosedVulnerabilities);
  if (options.length === 0) return { bought: null, limitation: null };
  const d = decide(v, options, ctx.memory);
  if (!d.optionId) return { bought: null, limitation: null };
  const opt = options.find((o) => o.id === d.optionId)!;
  const itemName = opt.label.replace(/^buy /, '');
  await ctx.executor.buy(itemName, d, 1);
  ctx.record?.({
    ...baseEvidenceFields(v, ctx),
    destinationId: null,
    travelAction: 'buy',
    strategicCategory: d.category,
    optionId: d.optionId,
    reason: d.reason,
    equipBefore: null,
    equipAfter: null,
    learnedDangerState: null,
  });
  await runEquipmentReevaluationPass(ctx, 1);
  return { bought: itemName, limitation: null };
}

/**
 * Phase 14 — THE REUSABLE IN-COMBAT ENTRY POINT a future canonical life
 * driver calls instead of wiring resolveCombatRounds()'s `decide` callback
 * to raw decide() the way __tests__/canonicalLife{2,3,4,5}.test.ts each did
 * privately and independently (those files are frozen historical records
 * and are not touched by this repair). combatLoop.ts's own
 * resolveCombatRounds() is imported and called completely UNMODIFIED — this
 * function only supplies its `decide`/`onRound` callbacks, exactly the same
 * shape every prior Life driver already supplied inline. What's new is that
 * the `decide` callback routes through decideInCombat() (tacticalReconsideration.ts)
 * instead of calling policy.ts's decide() directly, and this function
 * maintains the small, encounter-local EncounterTacticalMemory the
 * reconsideration wrapper needs — created fresh on entry, discarded when
 * this call returns, never touching ctx.memory (the life-long LifeMemory)
 * or ctx.strategic (the between-encounter StrategicMemory), and never
 * persisted anywhere.
 *
 * Tactical-outcome observation is done entirely from information already
 * passed to the `decide` callback each round — the current PlayerView (via
 * rangeSnapshotOf) and the category actually chosen last round — comparing
 * two already-player-visible range snapshots. It never reads
 * combatLoop.ts's CombatRoundTrace/CombatEnemySnapshot (deliberately left
 * unmodified and without a range field) and never reads production combat
 * log text.
 */
export interface CombatSeamDeps {
  buildOptions(view: PlayerView): readonly DecisionOption[];
  execute(decision: Decision): Promise<ActionRecord>;
  resolveLogDelta?(range: ActionRecord['logRange']): readonly string[];
}

export async function resolveCombatEncounter(
  ctx: OrchestratorContext,
  deps: CombatSeamDeps,
  maxRounds: number,
  onRound?: (row: CombatRoundTrace, reconsidered: boolean) => void,
): Promise<CombatLoopResult> {
  let tactical: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
  let lastCategory: OptionCategory | null = null;
  let lastSnapshot: RangeSnapshot | null = null;
  let lastReconsidered = false;

  return resolveCombatRounds(
    {
      isDead: () => Boolean(ctx.view()?.dead),
      view: ctx.view,
      buildOptions: deps.buildOptions,
      decide: (v, options) => {
        const currentSnapshot = rangeSnapshotOf(v);
        // Fold the outcome of the LAST round's chosen tactic (if any, and if
        // it was one of the three reconsiderable categories) into the
        // encounter-local memory BEFORE deciding this round — the same
        // observe -> act -> observe order a human re-checking their own
        // situation each round would use. A 'survive-flee' pick that we are
        // being asked to decide again after means the flee did NOT end the
        // encounter (a successful flee empties scene.enemies and
        // resolveCombatRounds returns FLED before ever calling this
        // callback again) — so reaching this branch with lastCategory ===
        // 'survive-flee' is itself the observed failure.
        if (lastCategory && isReconsiderableCategory(lastCategory)) {
          const outcome = lastCategory === 'survive-flee' ? 'no-progress' : classifyRepositionProgress(lastSnapshot, currentSnapshot);
          tactical = recordTacticalOutcome(tactical, lastCategory, outcome);
        }
        const { decision, reconsidered } = decideInCombat(v, options, ctx.memory, tactical);
        lastCategory = decision.category === 'stop' ? null : decision.category;
        lastSnapshot = currentSnapshot;
        lastReconsidered = reconsidered;
        return decision;
      },
      execute: deps.execute,
      resolveLogDelta: deps.resolveLogDelta,
    },
    maxRounds,
    onRound ? (row) => onRound(row, lastReconsidered) : undefined,
  );
}
