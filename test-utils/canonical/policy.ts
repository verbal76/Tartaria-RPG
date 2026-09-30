// P4 — the human decision policy.
//
// STRUCTURAL FIREWALL: this file imports NOTHING from the game store,
// telemetry (rngLedger/storeDiffer/logMirror/decisionJournal), or any
// hidden-source table. Its only import is playerView.ts's own exported
// types — themselves already filtered to player-visible information. A P5
// proof (firewall.proof.test.ts, not yet written) enforces this with a
// static check over this file's import list, not just a code-review claim.
//
// decide() is a PURE function: PlayerView + the concrete list of options
// the CanonicalWalker has already proven are legitimately available right
// now (real UI affordances: a visible chip, an enabled button, a typed
// command the parser accepts in this state) -> one chosen option + a human
// -readable reason. It never invents an option that isn't in `options`,
// never inspects anything besides its two parameters, and never consumes
// RNG.
//
// Priority hierarchy (owner spec, 11 points):
//   1. survive                    6. economy/maintenance
//   2. Guardian prep              7. Fuse Crucible
//   3. route choice (displayed danger/distance only) 8. coatings
//   4. normal journey             9. crafting
//   5. loot/equipment compare+dispose 10. companions
//                                  11. reassess after each Core
//
// NO-GRINDING: decide() never returns the same non-critical-path option
// twice in a row for its own sake (see `avoidRepeat`) and never manufactures
// a reason to repeat a combat/farming action once its legitimate objective
// is met. If the critical path becomes impossible without optional content,
// decide() returns a 'stop' decision instead of inventing a workaround —
// the CanonicalWalker must treat that as a hard STOP, not retry silently.

import type { PlayerView } from './playerView';

export type OptionCategory =
  | 'survive-heal'
  | 'survive-flee'
  | 'survive-retreat'
  | 'guardian-prep'
  | 'engage'
  /** Phase 11 — offered instead of 'engage' (never alongside it — see
   *  buildOptions in canonicalLife3.test.ts) exactly when the player's
   *  current main-hand attack cannot reach the active enemy's displayed
   *  range band. Same production door as a real player typing "advance":
   *  gameStore.ts case 'advance' -> runMoveCombatRange. This is what closes
   *  the reach gap the Mud-Wracked Aetherkin stalemate got stuck behind —
   *  decide() treats it as the engage-tier action to take when 'engage'
   *  itself isn't a legitimate option this round. */
  | 'engage-approach'
  | 'dodge'
  | 'block'
  | 'route'
  | 'journey'
  | 'loot'
  | 'equip'
  | 'dispose'
  | 'repair'
  | 'reinforce'
  | 'sell'
  | 'buy'
  | 'salvage'
  | 'scrap'
  | 'fuse'
  | 'coating'
  | 'craft'
  | 'companion'
  | 'reassess'
  | 'critical-path'
  | 'other';

export interface DecisionOption {
  id: string;
  category: OptionCategory;
  label: string;
  /** Displayed-only numbers the walker read off screen for this option —
   *  e.g. { danger: 3 } for a route chip, { price: 40 } for a vendor row,
   *  { powerDelta: 2 } for an equip comparison. Never a hidden number. */
  meta?: Record<string, number | string | boolean>;
}

export interface Decision {
  optionId: string | null;
  category: OptionCategory | 'stop';
  reason: string;
}

/**
 * Phase 7 — LEARNED_DURING_THIS_LIFE, per the owner's firewall categories
 * (PLAYER_VISIBLE / PLAYER_DERIVABLE / LEARNED_DURING_THIS_LIFE are all
 * legitimate policy inputs; TELEMETRY_ONLY / HIDDEN_FUTURE are not). This is
 * NOT a store/telemetry import — it is a plain value the caller (the walker)
 * builds by watching its OWN canonical Tartarian's history this life, the
 * same way a real player remembers "that pack hit hard" or "that dodge just
 * worked." decide() never reads the store, RNG ledger, or historical Sentry
 * logs to populate this — the walker does, from its own production
 * consequences, and hands over only the sanitized, player-plausible summary.
 */
export interface LifeMemory {
  /** Enemy names that dealt unusually heavy damage to THIS Tartarian earlier
   *  in THIS life — a real player remembers which named threats hit hard. */
  dangerousEnemyNames: ReadonlySet<string>;
  /** Did the most recently attempted dodge, in the current encounter,
   *  succeed? null if none attempted yet this encounter. */
  lastDodgeSucceeded: boolean | null;
  /** Phase 8 (Life 2 postmortem repair) — ATTEMPT MEMORY. A real player
   *  remembers the outcome of a materially significant attempt at an
   *  objective (a Guardian fight, or any other significant encounter this
   *  life), not just whether any single round crossed a damage-spike
   *  threshold. Built entirely by the caller from THIS Tartarian's own
   *  observed production consequences this life — never from a hidden
   *  future, another life, or Sentry history. Ordered oldest-first; a
   *  caller looking for "the last attempt at X" takes the last matching
   *  entry. Optional so Life 2's frozen driver (canonicalContextualCombatPolicy
   *  .test.ts, canonicalLife2.test.ts — preserved, immutable evidence, never
   *  edited for this repair) keeps typechecking unchanged; decide() treats a
   *  missing value as "no attempt history", which is exactly what those
   *  callers' pre-Phase-8 memory snapshots mean. */
  attempts?: readonly AttemptRecord[];
  /** Phase 8 — objective ids (e.g. "guardian:asgardar") this Tartarian has
   *  PERSONALLY observed reset (re-encountered at full/fresh state after a
   *  prior withdrawal) during THIS life. Never populated from source-only
   *  knowledge of how retreat mechanics work in general — only from an
   *  actual in-life observation the caller recorded. Per the owner's Life 2
   *  ruling (post-mortem §7): a fresh life begins with this empty; it is
   *  populated only after the Tartarian itself sees the reset happen once.
   *  Optional for the same backward-compatibility reason as `attempts`. */
  observedResets?: ReadonlySet<string>;
}

export type AttemptOutcome = 'success' | 'withdrawal' | 'death';

/** Phase 8 — a record of one materially significant attempt at a
 *  player-identifiable objective (a Guardian fight, or similar), built
 *  entirely from player-visible/player-derivable observation. Nothing here
 *  may be a hidden-source, telemetry-only, or future value. */
export interface AttemptRecord {
  /** A player-visible identity for the objective — e.g. "guardian:asgardar"
   *  (the location the player is standing in and the encounter they chose
   *  to engage), never a hidden internal id. */
  objectiveId: string;
  result: AttemptOutcome;
  /** capabilitySignature(view) at the moment the attempt began. */
  startCapability: string;
  /** capabilitySignature(view) at the moment the attempt ended. */
  endCapability: string;
  roundsSpent: number;
  healsConsumed: number;
  /** Set true by the caller once it has offered — and the player has
   *  considered — a real non-repeat alternative after this attempt ended in
   *  withdrawal/failure, so decide() does not defer the same retry decision
   *  indefinitely once an alternative has genuinely been tried. */
  deferredAfter?: boolean;
}

export const EMPTY_MEMORY: LifeMemory = {
  dangerousEnemyNames: new Set(),
  lastDodgeSucceeded: null,
  attempts: [],
  observedResets: new Set(),
};

/**
 * Phase 8 — a stable, player-visible signature of "how capable is this
 * Tartarian right now", built ONLY from PlayerView fields a human could
 * directly observe (equipment worn, consumables on hand, hp/stamina
 * ceilings, earned titles, companions). Used to compare "what changed since
 * my last attempt at this objective" without reading any hidden number.
 * Two views with the same signature represent the same observable
 * capability, even if the underlying instance ids differ.
 */
export function capabilitySignature(view: PlayerView): string {
  const consumableCount = view.inventory
    .filter((i) => i.kind === 'consumable')
    .reduce((sum, i) => sum + i.quantity, 0);
  return JSON.stringify({
    equipped: view.equipped ?? null,
    consumableCount,
    hpMax: view.hpMax,
    staminaMax: view.staminaMax,
    titles: view.earnedTitles.filter((t) => t.earned).length,
    dog: Boolean(view.dog),
    golem: Boolean(view.golem),
  });
}

const PRIORITY_ORDER: OptionCategory[] = [
  'survive-heal',
  'survive-flee',
  'survive-retreat',
  'guardian-prep',
  'engage',
  'engage-approach',
  'dodge',
  'block',
  'route',
  'journey',
  'loot',
  'equip',
  'dispose',
  'repair',
  'reinforce',
  'sell',
  'buy',
  'salvage',
  'scrap',
  'fuse',
  'coating',
  'craft',
  'companion',
  'reassess',
  'critical-path',
  'other',
];

/** Phase 7 correction — this used to be the WHOLE survival rule (flat 30%,
 *  always heal/flee/retreat below it, always attack above it), which the
 *  Life 1 postmortem + human-Sentry study both showed is not how a capable
 *  human actually plays: real players fought on well below this ratio when
 *  the visible tactical picture favored it, and fled at ANY ratio, including
 *  full HP, against a recognized threat. It now exists only as a genuine
 *  last-resort emergency floor — the real reasoning lives in the contextual
 *  combat branch of decide() below, which reads matchup/threatWord/hpDelta/
 *  enemy count together instead of one static cliff. */
const SURVIVE_HP_RATIO = 0.12;
/** Below this ratio (and above the true emergency floor), a capable human
 *  is willing to spend a heal even absent an acute danger signal — real
 *  play showed healing mid-fight before HP became critical, not only at
 *  the last possible moment. Deliberately not the same number as the old
 *  30% gate: this is a preference weighed alongside other signals in the
 *  contextual branch, not a hard switch between two behaviors. */
const HEAL_CONSIDER_RATIO = 0.4;
/** Fraction of hpMax/staminaMax considered "ready" for Guardian prep gating. */
const READY_HP_RATIO = 0.85;
const READY_STAMINA_RATIO = 0.6;

let lastNonCriticalOptionId: string | null = null;

function isReadyForGuardian(view: PlayerView): boolean {
  return view.hp / view.hpMax >= READY_HP_RATIO && view.stamina / view.staminaMax >= READY_STAMINA_RATIO;
}

function pickCheapestDanger(options: DecisionOption[]): DecisionOption | undefined {
  return [...options].sort((a, b) => {
    const da = typeof a.meta?.danger === 'number' ? (a.meta.danger as number) : Infinity;
    const db = typeof b.meta?.danger === 'number' ? (b.meta.danger as number) : Infinity;
    return da - db;
  })[0];
}

/**
 * Pick one option from the legitimately-available list, per the 11-point
 * priority hierarchy. `options` must already be filtered by the caller to
 * what a real player could actually choose right now — decide() trusts
 * that filtering and never second-guesses it against hidden state (it has
 * none to check against).
 */
export function decide(view: PlayerView, options: readonly DecisionOption[], memory: LifeMemory = EMPTY_MEMORY): Decision {
  if (options.length === 0) {
    return { optionId: null, category: 'stop', reason: 'No legitimate options were offered — nothing to decide.' };
  }

  const byCategory = new Map<OptionCategory, DecisionOption[]>();
  for (const opt of options) {
    const list = byCategory.get(opt.category) ?? [];
    list.push(opt);
    byCategory.set(opt.category, list);
  }

  // 1. Survive: a true emergency floor preempts everything else. Lowered
  // from the old flat 30% (Phase 6) to a genuine last-resort band (Phase 7
  // correction, per the Life 1 postmortem + human-Sentry study): real
  // players do not treat 30-100% HP as one undifferentiated "fine" zone —
  // see the contextual combat branch below, which now does the real
  // reasoning over that whole range. This floor exists only to guarantee a
  // decision still fires if every contextual rule above it somehow doesn't
  // apply.
  if (view.hp / view.hpMax < SURVIVE_HP_RATIO) {
    const heal = byCategory.get('survive-heal')?.[0];
    if (heal) return { optionId: heal.id, category: 'survive-heal', reason: `HP ${view.hp}/${view.hpMax} below the emergency floor; healing is available.` };
    const flee = byCategory.get('survive-flee')?.[0];
    if (flee) return { optionId: flee.id, category: 'survive-flee', reason: `HP ${view.hp}/${view.hpMax} below the emergency floor and no heal is available; fleeing.` };
    const retreat = byCategory.get('survive-retreat')?.[0];
    if (retreat) return { optionId: retreat.id, category: 'survive-retreat', reason: `HP ${view.hp}/${view.hpMax} below the emergency floor and no heal/flee is available; retreating.` };
  }
  if (view.dead) {
    return { optionId: null, category: 'stop', reason: 'Player is dead; no legitimate action can be a policy decision at this state.' };
  }

  // 2. Guardian prep: if a Guardian encounter is being offered and the
  // player isn't ready, prefer preparation over engaging.
  const guardianPrep = byCategory.get('guardian-prep');
  if (guardianPrep?.length && !isReadyForGuardian(view)) {
    const opt = guardianPrep[0]!;
    return {
      optionId: opt.id,
      category: 'guardian-prep',
      reason: `HP ${view.hp}/${view.hpMax}, stamina ${view.stamina}/${view.staminaMax} below readiness thresholds before a Guardian encounter; preparing first.`,
    };
  }

  // 2a. Repeat-attempt reasoning (Phase 8 — Life 2 postmortem repair,
  // GENERAL ADAPTATION POLICY GAP). Life 2 retried the Asgardar Guardian
  // five times: each retry offered the policy nothing but REST and SUMMON,
  // and decide() never asked "what changed since my last attempt at this
  // exact objective?" — it just re-engaged once HP recovered. This branch
  // is the fix: when a 'critical-path' option is flagged as a retryable
  // objective (meta.isRetryableObjective, with a player-visible
  // meta.objectiveId), and this Tartarian has PERSONALLY attempted and
  // withdrawn/failed/died at that exact objective before this life, with no
  // material capability change since (capabilitySignature comparison — real
  // equipment/consumables/stat/companion state, never a hidden number) —
  // a capable human does not reflexively retry. It is NOT an absolute
  // prohibition: retry remains legitimate and IS taken immediately when (a)
  // this is the first attempt, (b) the last attempt succeeded, (c)
  // capability has materially changed since, or (d) no real alternative was
  // actually offered this round (availability is the caller's job, never
  // fabricated here). And it never repeats the deferral for the SAME
  // attempt twice — once the caller records deferredAfter on that attempt
  // (meaning a real alternative was already tried), retry proceeds.
  const retryOpt = options.find((o) => o.category === 'critical-path' && o.meta?.isRetryableObjective === true);
  if (retryOpt) {
    const objectiveId = String(retryOpt.meta?.objectiveId ?? '');
    const priorAttempts = (memory.attempts ?? []).filter((a) => a.objectiveId === objectiveId);
    const lastAttempt = priorAttempts[priorAttempts.length - 1];
    const alternatives = options.filter((o) => o.id !== retryOpt.id);
    const nowSignature = capabilitySignature(view);
    const priorFailure = Boolean(lastAttempt) && lastAttempt!.result !== 'success';
    const materiallyChanged = !lastAttempt || lastAttempt.endCapability !== nowSignature;

    if (priorFailure && !materiallyChanged && !lastAttempt!.deferredAfter && alternatives.length > 0) {
      const alt = alternatives[0]!;
      const resetNote = memory.observedResets?.has(objectiveId) ? '; this objective is known to reset on withdrawal, so repeating unchanged is unlikely to go differently' : '';
      return {
        optionId: alt.id,
        category: alt.category,
        reason: `Previous attempt at ${objectiveId} ended in ${lastAttempt!.result} with no material capability change since (same equipment/consumables/state)${resetNote} — trying a legitimate alternative (${alt.category}) before repeating it unchanged.`,
      };
    }

    const why = !lastAttempt
      ? 'no prior attempt at this objective exists this life'
      : lastAttempt.result === 'success'
        ? 'the last attempt succeeded'
        : materiallyChanged
          ? 'capability has materially changed since the last attempt'
          : 'a legitimate alternative was already tried since the last attempt';
    return { optionId: retryOpt.id, category: 'critical-path', reason: `Proceeding with ${objectiveId} — ${why}.` };
  }

  // 2b. Contextual combat reasoning (Phase 7 — replaces the old
  // unconditional "first engage option always wins" rule, which the Life 1
  // postmortem confirmed mechanically defaulted to ATTACK-until-critical-HP
  // and never read matchup/threatWord/enemy count/damage trajectory. The
  // independent human-Sentry study found real players: (a) flee at ANY HP,
  // including full, against a recognized/displayed threat — not only near
  // death; (b) still fight on well below the old 30% floor when the visible
  // tactical picture favors it (a dying enemy, a just-won defensive
  // opening) — so this is NOT a new static threshold, it weighs multiple
  // visible signals together; (c) use dodge tactically against groups, not
  // only in panic; (d) prefer BLOCK over dodge when a shield makes it a
  // real option (block guarantees the first hit is absorbed; dodge is a
  // contested roll) — production gates block on an equipped shield
  // (view.canBlock), never invented here.
  const engage = byCategory.get('engage');
  // Phase 11 — the range-repair option. buildOptions offers this INSTEAD OF
  // 'engage' (never both) exactly when the equipped attack is currently out
  // of reach, so this branch never has to choose between them — it only
  // needs to recognize "engage-tier action is on the table" now covers two
  // possible shapes.
  const approachOpts = byCategory.get('engage-approach');
  const dodgeOpts = byCategory.get('dodge');
  const blockOpts = byCategory.get('block');
  const fleeOpts = byCategory.get('survive-flee');
  const healOpts = byCategory.get('survive-heal');
  if (engage?.length || approachOpts?.length || dodgeOpts?.length || blockOpts?.length) {
    const enemies = view.scene?.enemies ?? [];
    const enemyCount = enemies.length;
    const dangerMatchupCount = enemies.filter((e) => e.matchup === 'danger').length;
    const knownDangerous = enemies.some((e) => memory.dangerousEnemyNames.has(e.name));
    const bigRecentLoss = view.hpDelta !== null && view.hpDelta < 0 && -view.hpDelta >= 0.25 * view.hpMax;
    const displayedLethal = view.scene?.threatWord === 'LETHAL' || view.scene?.threatWord === 'SEVERE';
    // A Guardian fight is not a roadside ambush: the player already chose to
    // summon it (guardian-prep, above, already required readiness first).
    // core_guardian is a real trait chip production shows on the card
    // (playerView.ts's own header notes it is not filtered — a genuine,
    // if leaky, player-visible signal), so this is PLAYER_VISIBLE, not
    // invented. A capable human does not flee the boss fight they just
    // opted into merely because it is *labeled* LETHAL — Guardians are
    // supposed to be hard. They still flee one that is actually going
    // badly (bigRecentLoss) or that has already hurt them before
    // (knownDangerous) — this narrows which signals count, it does not
    // remove flee as an option against a Guardian.
    const facingCommittedGuardian = enemies.some((e) => e.traits.includes('core_guardian'));
    // A genuine, multi-signal danger read — never "LETHAL alone => flee".
    const dangerSignal = facingCommittedGuardian
      ? (bigRecentLoss || knownDangerous)
      : (displayedLethal || bigRecentLoss || knownDangerous || (enemyCount >= 3 && dangerMatchupCount >= 1));

    if (dangerSignal && fleeOpts?.length) {
      const opt = fleeOpts[0]!;
      const why = [
        displayedLethal && !facingCommittedGuardian ? `displayed threat "${view.scene?.threatWord}"` : null,
        bigRecentLoss ? `lost ${-view.hpDelta!} HP last round` : null,
        knownDangerous ? 'an enemy here has hurt this Tartarian badly before' : null,
        !facingCommittedGuardian && enemyCount >= 3 && dangerMatchupCount >= 1 ? `${enemyCount} enemies incl. ${dangerMatchupCount} at unfavorable matchup` : null,
      ].filter(Boolean).join('; ');
      return { optionId: opt.id, category: 'survive-flee', reason: `Fleeing on visible danger signal (${why}) — HP ${view.hp}/${view.hpMax}, not gated to low HP.` };
    }

    if (healOpts?.length && view.hp / view.hpMax < HEAL_CONSIDER_RATIO) {
      const opt = healOpts[0]!;
      return { optionId: opt.id, category: 'survive-heal', reason: `HP ${view.hp}/${view.hpMax} is low enough to be worth a heal even without an acute danger signal; no reason to save it for later.` };
    }

    if (blockOpts?.length && enemyCount >= 2) {
      const opt = blockOpts[0]!;
      return { optionId: opt.id, category: 'block', reason: `${enemyCount} live enemies and a shield is equipped; block guarantees the first blow is absorbed this volley.` };
    }
    if (dodgeOpts?.length && enemyCount >= 2 && memory.lastDodgeSucceeded !== true) {
      const opt = dodgeOpts[0]!;
      return { optionId: opt.id, category: 'dodge', reason: `${enemyCount} live enemies; setting up a defensive opening before committing to the next strike.` };
    }
    if (engage?.length) {
      const opt = engage[0]!;
      return { optionId: opt.id, category: 'engage', reason: `No danger signal outweighs continuing; HP ${view.hp}/${view.hpMax}, ${enemyCount} enemy(ies) — pressing the attack.` };
    }
    // Phase 11 — buildOptions offers this INSTEAD OF 'engage' exactly when
    // the current attack cannot reach the enemy's displayed range: the fix
    // for the proven Mud-Wracked Aetherkin stalemate, where the old policy
    // had no move besides re-issuing an ATTACK production kept refusing.
    // meta.rangeLabel/meta.reachLabel are the same on-screen text the
    // refusal itself already shows — not new information, just now acted on
    // instead of only logged.
    if (approachOpts?.length) {
      const opt = approachOpts[0]!;
      const rangeLabel = typeof opt.meta?.rangeLabel === 'string' ? opt.meta.rangeLabel : 'its current range';
      const reachLabel = typeof opt.meta?.reachLabel === 'string' ? opt.meta.reachLabel : 'the equipped attack';
      return {
        optionId: opt.id,
        category: 'engage-approach',
        reason: `${reachLabel} cannot reach the enemy at ${rangeLabel}; closing the distance before attempting to strike.`,
      };
    }
    // Only dodge/block were offered (no attack option this round) — take
    // whichever defensive option exists rather than stalling.
    const fallback = dodgeOpts?.[0] ?? blockOpts?.[0];
    if (fallback) {
      return { optionId: fallback.id, category: fallback.category, reason: 'Only a defensive option was offered this round; taking it.' };
    }
  }

  // 3. Route choice: pick the lowest DISPLAYED danger among route options —
  // never a hidden difficulty score (none is read here; only opt.meta.danger,
  // which the walker filled from the on-screen D{n} stamp).
  const routeOptions = byCategory.get('route');
  if (routeOptions?.length) {
    const chosen = pickCheapestDanger(routeOptions) ?? routeOptions[0]!;
    return { optionId: chosen.id, category: 'route', reason: `Chose the route with the lowest displayed danger among ${routeOptions.length} option(s).` };
  }

  // 4. Normal journey: proceed along the critical path with no suppressed
  // ambient-encounter avoidance — take the first journey option as offered.
  const journey = byCategory.get('journey')?.[0];
  if (journey) {
    return { optionId: journey.id, category: 'journey', reason: 'Continuing the journey; no survival or route decision was pending.' };
  }

  // 5. Loot/equipment: compare by displayed power delta, dispose of clearly
  // inferior duplicates.
  const equip = byCategory.get('equip');
  if (equip?.length) {
    const best = [...equip].sort((a, b) => {
      const pa = typeof a.meta?.powerDelta === 'number' ? (a.meta.powerDelta as number) : -Infinity;
      const pb = typeof b.meta?.powerDelta === 'number' ? (b.meta.powerDelta as number) : -Infinity;
      return pb - pa;
    })[0]!;
    if (typeof best.meta?.powerDelta === 'number' && (best.meta.powerDelta as number) > 0) {
      return { optionId: best.id, category: 'equip', reason: `Equipping the option with the highest displayed power delta (+${best.meta.powerDelta}).` };
    }
  }
  const dispose = byCategory.get('dispose')?.[0];
  const loot = byCategory.get('loot')?.[0];
  if (loot) {
    return { optionId: loot.id, category: 'loot', reason: 'Collecting available loot before moving on.' };
  }
  if (dispose) {
    return { optionId: dispose.id, category: 'dispose', reason: 'Disposing of an item already confirmed inferior/unneeded, freeing inventory.' };
  }

  // 6. Economy/maintenance.
  for (const cat of ['repair', 'reinforce', 'sell', 'buy', 'salvage', 'scrap'] as const) {
    const opt = byCategory.get(cat)?.[0];
    if (opt) return { optionId: opt.id, category: cat, reason: `Handling maintenance/economy action: ${cat}.` };
  }

  // 7-9. Fuse / coatings / crafting.
  for (const cat of ['fuse', 'coating', 'craft'] as const) {
    const opt = byCategory.get(cat)?.[0];
    if (opt) return { optionId: opt.id, category: cat, reason: `Handling optional-content action: ${cat}.` };
  }

  // 10. Companions.
  const companion = byCategory.get('companion')?.[0];
  if (companion) {
    return { optionId: companion.id, category: 'companion', reason: 'Attending to companion needs; no higher-priority option was available.' };
  }

  // 11. Reassess after a Core.
  const reassess = byCategory.get('reassess')?.[0];
  if (reassess) {
    return { optionId: reassess.id, category: 'reassess', reason: 'Reassessing the plan after a Core recovery, per the post-Core checkpoint rule.' };
  }

  const criticalPath = byCategory.get('critical-path')?.[0];
  if (criticalPath) {
    return { optionId: criticalPath.id, category: 'critical-path', reason: 'Advancing the critical path; no other priority applied.' };
  }

  // NO-GRINDING: never repeat the same non-critical option back-to-back for
  // its own sake. If the only remaining options are a repeat of the last
  // pick, stop rather than grind.
  const remaining = options.filter((o) => o.id !== lastNonCriticalOptionId);
  const fallback = remaining[0] ?? options[0]!;
  if (fallback.id === lastNonCriticalOptionId) {
    return { optionId: null, category: 'stop', reason: 'Only a repeat of the previous action remains available; refusing to grind. Legitimate critical-path dependency likely missing.' };
  }
  lastNonCriticalOptionId = fallback.id;
  return { optionId: fallback.id, category: fallback.category, reason: 'No higher-priority category applied; taking the first remaining legitimate option.' };
}

/** Test-only: clear the no-grinding repeat-tracking state between runs. */
export function resetPolicyState(): void {
  lastNonCriticalOptionId = null;
}

export { PRIORITY_ORDER };
