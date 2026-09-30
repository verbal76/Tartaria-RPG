// Phase 3B, Part 1 — the bounded canonical action executor.
//
// The smallest missing layer between PlayerView -> policy -> legitimate
// player action -> production door -> telemetry -> updated PlayerView.
//
// STRICT BOUNDARY, per the owner's explicit Phase 3B rule:
//   POLICY chooses (policy.ts's decide() — never imports the store/telemetry).
//   EXECUTOR performs (this file — translates an already-made Decision into
//     the real production door, never invents or second-guesses the choice).
//   TELEMETRY observes (rngLedger/storeDiffer/logMirror/decisionJournal —
//     already attached by the caller; the executor only tells it WHICH
//     actionSeq is current, via setRngActionSeq/setDifferActionSeq/
//     setLogMirrorActionSeq, then records the resulting ranges).
//
// Every perform() call records one DecisionRecord (test-utils/canonical/
// decisionJournal.ts) with: actionSeq, PlayerView hash before/after,
// player-visible options, the policy's choice + reason, the UI/player action
// represented, the production door invoked, the RNG draw range, the store-
// diff range, and the log-mirror range it produced.
//
// NO PARALLEL GAME ENGINE. Every method below calls a real production
// store action (submitPlayerAction, setTravelCourse, continueTravel, ...);
// none of them compute damage, synthesize loot, or write enemy/player HP,
// inventory, stats, Core state, Guardian state, or world position directly.
// Combat resolution is production's, via the same pendingRolls/resolveRollStep
// queue CanonicalWalker's own drainRolls() (production-faithful dice) already
// resolves.
//
// FORBIDDEN, same as CanonicalWalker: topUp, resetForMission, fixed dice,
// coup de grâce, direct HP writes, forced win, hidden enemy data as a policy
// input. This file imports nothing from policy.ts's forbidden list either —
// it consumes an already-made Decision, never the raw store/telemetry itself
// to MAKE one.

import type { GameStore } from '../../app/state/gameStore';
import type { CanonicalWalker } from './CanonicalWalker';
import type { Decision, OptionCategory } from './policy';
import { buildPlayerView, hashPlayerView, type PlayerView, type PlayerViewHash } from './playerView';
import { recordDecision } from './decisionJournal';
import { rngDrawCount, setRngActionSeq } from './rngLedger';
import { getStoreDiffLog, setDifferActionSeq } from './storeDiffer';
import { getLogMirror, setLogMirrorActionSeq, syncLogMirror } from './logMirror';

export type ActionFamily =
  | 'TRAVEL' | 'REST' | 'ENCOUNTER' | 'COMBAT' | 'SEARCH' | 'LOOT'
  | 'EQUIPMENT' | 'CONSUMABLES' | 'COATINGS' | 'MAINTENANCE' | 'ECONOMY'
  | 'FUSE' | 'CRAFTING' | 'COMPANIONS' | 'GUARDIAN' | 'STORY' | 'NEXUS';

export interface ActionRecord {
  actionSeq: number;
  family: ActionFamily;
  playerViewHashBefore: PlayerViewHash;
  optionsShown: readonly string[];
  policyChoice: string;
  reason: string;
  uiActionRepresented: string;
  productionDoor: string;
  rngRange: readonly [number, number] | null;
  stateDiffRange: readonly [number, number] | null;
  logRange: readonly [number, number] | null;
  result: 'ok' | 'refused' | 'error';
  playerViewHashAfter: PlayerViewHash;
}

function storeState(store: { getState: () => GameStore }): Pick<GameStore, 'player' | 'currentScene' | 'worldMemory'> {
  const s = store.getState();
  return { player: s.player, currentScene: s.currentScene, worldMemory: s.worldMemory };
}

export class CanonicalActionExecutor {
  private actionSeq = 0;
  readonly records: ActionRecord[] = [];

  constructor(
    private readonly store: { getState: () => GameStore },
    private readonly walker: CanonicalWalker,
  ) {}

  currentPlayerView(): PlayerView | null {
    return buildPlayerView(storeState(this.store));
  }

  /**
   * The one primitive every family below is built from. `decision` must
   * already have been produced by policy.decide() — this method never
   * chooses, it only performs what was already chosen and records what
   * happened. `run` is the real production door call (and nothing else —
   * no state edits of its own).
   */
  private async perform(
    family: ActionFamily,
    decision: Decision,
    optionsShown: readonly string[],
    uiActionRepresented: string,
    productionDoor: string,
    run: () => Promise<void> | void,
  ): Promise<ActionRecord> {
    this.actionSeq += 1;
    const seq = this.actionSeq;
    setRngActionSeq(seq);
    setDifferActionSeq(seq);
    setLogMirrorActionSeq(seq);

    const before = buildPlayerView(storeState(this.store));
    const hashBefore = hashPlayerView(before);
    const rngBefore = rngDrawCount();
    const diffBefore = getStoreDiffLog().length;
    const logBefore = getLogMirror().length;

    let result: ActionRecord['result'] = 'ok';
    try {
      await run();
    } catch {
      result = 'error';
    }

    // Let the log-coalescing microtask settle before reading the mirror
    // (storeNotify.ts) — same discipline logMirror.ts's own header requires.
    await Promise.resolve();
    syncLogMirror(this.store.getState().gameLog as unknown as ReadonlyArray<{ channel: string; text: string }>);

    const after = buildPlayerView(storeState(this.store));
    const hashAfter = hashPlayerView(after);
    const rngAfter = rngDrawCount();
    const diffAfter = getStoreDiffLog().length;
    const logAfter = getLogMirror().length;

    const record: ActionRecord = {
      actionSeq: seq,
      family,
      playerViewHashBefore: hashBefore,
      optionsShown,
      policyChoice: decision.optionId ?? '(stop)',
      reason: decision.reason,
      uiActionRepresented,
      productionDoor,
      rngRange: rngAfter > rngBefore ? [rngBefore + 1, rngAfter] : null,
      stateDiffRange: diffAfter > diffBefore ? [diffBefore + 1, diffAfter] : null,
      logRange: logAfter > logBefore ? [logBefore + 1, logAfter] : null,
      result,
      playerViewHashAfter: hashAfter,
    };
    this.records.push(record);

    recordDecision({
      actionSeq: seq,
      virtualTimeMs: Date.now(),
      position: {
        locationId: after?.position.currentLocationId ?? null,
        gridX: after?.position.gridX ?? null,
        gridY: after?.position.gridY ?? null,
      },
      playerViewHash: hashAfter,
      optionsShown,
      decision: decision.optionId ?? '(stop)',
      reason: decision.reason,
      productionDoor,
      resultingDiffRange: record.stateDiffRange,
    });

    return record;
  }

  // ── TRAVEL ──────────────────────────────────────────────────────────────
  // Same doors test-utils/playerWalker.ts's Walker.walkTo() already uses.
  async travelSetCourse(locationId: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('TRAVEL', decision, [`set course → ${locationId}`], `SET COURSE → ${locationId}`, 'setTravelCourse(locationId)', () => {
      this.store.getState().setTravelCourse(locationId);
    });
  }

  // Phase 6 methodology correction — apparatus repair, not a production
  // change. Production itself has no enemy-presence gate INSIDE
  // continueTravel() (gameStore.ts:26536-26687), but no player-facing
  // surface ever reaches it while enemies are live: InputBox.tsx wraps the
  // whole travel row in {!inCombat && ...} (InputBox.tsx:818-819), and
  // typed input is redirected into combat instead (gameStore.ts:17892-17898,
  // runMoveCombatRange). A harness that calls continueTravel() directly with
  // live enemies present is therefore not exercising anything a human player
  // could do — this is the exact STORE_ONLY gap recorded as
  // RCH-002-travel-continue-live-enemies / I-012-store-only-travel-through-enemies.
  // This guard makes the executor refuse the call under that same condition,
  // closing the gap at the harness boundary rather than editing production.
  async travelContinue(decision: Decision): Promise<ActionRecord> {
    return this.perform('TRAVEL', decision, ['→ DESTINATION'], '→ DESTINATION', 'continueTravel()', () => {
      const enemyCount = this.store.getState().currentScene?.enemies.length ?? 0;
      if (enemyCount > 0) {
        throw new Error(
          `travelContinue() refused: ${enemyCount} live enemy(ies) present in currentScene — no player-facing surface ` +
            'reaches continueTravel() in this state (see docs/cartography/reachability.json RCH-002, open-issues.json I-012). ' +
            'A human player must resolve combat (attack/flee/dodge/block) before travel becomes available again.',
        );
      }
      this.store.getState().continueTravel();
    });
  }

  // Phase 6 measured run — apparatus repair (materially relevant gap hit on
  // the real first departure: setTravelCourse() can leave pendingTravelConfirm
  // set — e.g. leaving a building/hub interior mid-mission or mid-climb,
  // gameStore.ts:27005 — and continueTravel() then does nothing until it is
  // answered). The base test-utils/playerWalker.ts's own walkTo() already
  // answers this exact prompt via confirmLeaveAndTravel() (gameStore.ts:27007
  // — the real door the "LEAVE AND TRAVEL" confirm button calls); this door
  // was missing here only because Phase 3B's bounded proof never happened to
  // trigger the prompt.
  async confirmDeparture(decision: Decision): Promise<ActionRecord> {
    return this.perform('TRAVEL', decision, ['LEAVE AND TRAVEL'], 'LEAVE AND TRAVEL', 'confirmLeaveAndTravel()', () => {
      this.store.getState().confirmLeaveAndTravel();
    });
  }

  // ── REST ────────────────────────────────────────────────────────────────
  // Normal production rest — never Walker.restByFiat().
  async restNormally(decision: Decision): Promise<ActionRecord> {
    return this.perform('REST', decision, ['rest'], 'rest', "submitPlayerAction('rest')", async () => {
      await this.store.getState().submitPlayerAction('rest');
    });
  }

  // ── ENCOUNTER ───────────────────────────────────────────────────────────
  // Encounters are not a player-initiated action — they're rolled inside
  // beginScene()/stepDirection() as a consequence of TRAVEL. "Observe" is a
  // pure read, not a production door call.
  observeEncounter(): { enemyCount: number; options: OptionCategory[] } {
    const enemyCount = this.store.getState().currentScene?.enemies.length ?? 0;
    return { enemyCount, options: enemyCount > 0 ? ['guardian-prep'] : [] };
  }

  /** Avoid an encounter that's legitimately avoidable BEFORE it starts —
   *  i.e. simply continue traveling past a cleared/quiet tile. There is no
   *  separate "avoid" door; avoidance is the ABSENCE of engaging, so this
   *  records the choice without calling anything besides the travel step
   *  the caller was already going to take. */
  async encounterAvoidByContinuing(decision: Decision): Promise<ActionRecord> {
    return this.travelContinue(decision);
  }

  // ── COMBAT ──────────────────────────────────────────────────────────────
  // submitPlayerAction('attack') opens pendingRolls (initiative/attack/
  // damage/coating steps, buildCombatSteps — app/engine/combatRules.ts:542);
  // CanonicalWalker's own drainRolls() (production-faithful dice, never
  // fixed-18) resolves every step via resolveRollStep(). Damage, status
  // effects, enemy counters, and kill/loot resolution (resolveEnemyDefeat)
  // are ALL production's, not computed here.
  async combatAttack(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['attack'], 'attack', "submitPlayerAction('attack') + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('attack');
      this.walker.drainRolls();
    });
  }

  /** Flee/give-ground — a genuine, failable, contested roll (fleePursuitFor
   *  vs. the fastest live pursuer), never a guaranteed success. */
  async combatFlee(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['flee'], 'flee', "submitPlayerAction('flee') + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('flee');
      this.walker.drainRolls();
    });
  }

  /** Defend/guard — Phase 3C correction: there is no dedicated `case
   *  'defend':` in gameStore.ts. `defend` (and parry/deflect/brace/guard/
   *  fend/absorb/ward) is a parser synonym that resolves to intent `dodge`
   *  (app/engine/parser.ts:212-216), handled by `case 'dodge':`
   *  (gameStore.ts:18242) — the real, player-facing mechanic here is named
   *  DODGE in production (with a separate `block` intent/case at 18339 for
   *  shield-equipped players). submitPlayerAction('defend') still reaches
   *  a real door (the dodge handler) via that synonym mapping — it is not
   *  a fictitious command — but the family this exercises is DODGE, not a
   *  distinct "defend" mechanic. Both live UI buttons exist (InputBox.tsx
   *  dodge/block QuickBtns). */
  async combatDodge(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['dodge'], 'dodge', "submitPlayerAction('dodge') [synonym: defend] + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('dodge');
      this.walker.drainRolls();
    });
  }

  async combatBlock(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['block'], 'block', "submitPlayerAction('block') + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('block');
      this.walker.drainRolls();
    });
  }

  /** Phase 11 — close the distance to the active enemy through the exact same
   *  door a real player types "advance" into (gameStore.ts case 'advance':
   *  -> runMoveCombatRange). Production decides everything: whether the move
   *  lands this round or only makes partial progress under bad weather, the
   *  resulting range band, and whether any enemy that can still reach at the
   *  new band gets a counter-attack (runEnemyGroupCounters). No range field
   *  is ever written here directly. */
  async combatAdvance(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['advance'], 'advance', "submitPlayerAction('advance') + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('advance');
      this.walker.drainRolls();
    });
  }

  /** Phase 11 — the OTA-1795 "give ground" door (gameStore.ts case 'retreat':
   *  -> the same runMoveCombatRange, direction='retreat'), distinct from
   *  combatFlee: retreat opens one band of distance while staying in the
   *  fight; flee is a full, contested escape attempt. Same production-decides
   *  contract as combatAdvance above. */
  async combatRetreat(decision: Decision): Promise<ActionRecord> {
    return this.perform('COMBAT', decision, ['retreat'], 'retreat', "submitPlayerAction('retreat') + pendingRolls resolution", async () => {
      await this.store.getState().submitPlayerAction('retreat');
      this.walker.drainRolls();
    });
  }

  // ── SEARCH / INVESTIGATE ───────────────────────────────────────────────
  async investigate(target: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('SEARCH', decision, [`investigate ${target}`], `investigate ${target}`, `submitPlayerAction('investigate ${target}')`, async () => {
      await this.store.getState().submitPlayerAction(`investigate ${target}`);
    });
  }

  // ── LOOT ────────────────────────────────────────────────────────────────
  // A normal kill's loot is granted automatically inside resolveEnemyDefeat
  // — no follow-up action exists to represent for that case. This method
  // exists for the cases that DO have a real UI decision (a scene-gear
  // acceptance prompt), routed through the universal door.
  async acceptSceneGear(itemText: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('LOOT', decision, [`take ${itemText}`], `take ${itemText}`, `submitPlayerAction('take ${itemText}')`, async () => {
      await this.store.getState().submitPlayerAction(`take ${itemText}`);
    });
  }

  // ── EQUIPMENT ───────────────────────────────────────────────────────────
  async equip(itemName: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('EQUIPMENT', decision, [`wear ${itemName}`], `wear ${itemName}`, `submitPlayerAction('wear ${itemName}')`, async () => {
      await this.store.getState().submitPlayerAction(`wear ${itemName}`);
    });
  }

  async unequip(slotOrItem: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('EQUIPMENT', decision, [`unequip ${slotOrItem}`], `unequip ${slotOrItem}`, `submitPlayerAction('unequip ${slotOrItem}')`, async () => {
      await this.store.getState().submitPlayerAction(`unequip ${slotOrItem}`);
    });
  }

  // ── CONSUMABLES ─────────────────────────────────────────────────────────
  async useConsumable(itemName: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('CONSUMABLES', decision, [`use ${itemName}`], `use ${itemName}`, `submitPlayerAction('use ${itemName}')`, async () => {
      await this.store.getState().submitPlayerAction(`use ${itemName}`);
      this.walker.drainRolls();
    });
  }

  // Phase 6 methodology correction (Section E.4) — I-049. The real
  // player-facing mid-combat healing door is the "✚ heals" quick-bar chip
  // (InputBox.tsx:1428-1493), which calls useHealBatch(itemName, target,
  // count) directly (inventorySlice.ts:526) specifically BECAUSE the
  // generic useConsumable()/submitPlayerAction('use <item>') path hits the
  // pendingRolls guard (gameStore.ts:12036) and silently no-ops mid-combat
  // (OTA-1658). A small, faithful door — not a new framework — closing the
  // gap the same way every other direct-store-action door in this file
  // already does (applyCoating, salvageAllAmbient, toggleReserveForFusion).
  async useHealBatch(itemName: string, target: 'self' | 'dog' | 'golem', count: number, decision: Decision): Promise<ActionRecord> {
    const label = `heal ${target} with ${itemName} x${count}`;
    return this.perform('CONSUMABLES', decision, [label], label, 'useHealBatch(itemName, target, count)', () => {
      this.store.getState().useHealBatch(itemName, target, count);
    });
  }

  // ── COATINGS ────────────────────────────────────────────────────────────
  // Phase 3C correction: NO parser verb exists for "coat"/"apply" (confirmed
  // by exhaustive grep of app/engine/parser.ts's intent table) — the
  // Phase 3B version of this method called a fictitious submitPlayerAction
  // text command that would have silently no-opped. The real production
  // door is the direct store action applyCoating(coatingItemId, weaponId,
  // replaceSlot?) (app/state/slices/inventorySlice.ts:784), the exact
  // function InventoryScreen.tsx's coating UI calls by item-instance id —
  // legitimate (same validation gates run inside it), just not a typed
  // command.
  async applyCoating(coatingItemId: string, weaponId: string, decision: Decision, replaceSlot?: 'coating' | 'coating2'): Promise<ActionRecord> {
    const label = `coat ${weaponId} with ${coatingItemId}`;
    return this.perform('COATINGS', decision, [label], label, 'applyCoating(coatingItemId, weaponId, replaceSlot)', () => {
      this.store.getState().applyCoating(coatingItemId, weaponId, replaceSlot);
    });
  }

  // ── MAINTENANCE ─────────────────────────────────────────────────────────
  // Vendor repair (submitPlayerAction('repair <item>') is real — case
  // 'repair', gameStore.ts:18988 — always calls repairWithVendor).
  async repair(itemName: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('MAINTENANCE', decision, [`repair ${itemName}`], `repair ${itemName}`, `submitPlayerAction('repair ${itemName}') -> repairWithVendor`, async () => {
      await this.store.getState().submitPlayerAction(`repair ${itemName}`);
    });
  }

  // Bench/self (materials) repair — Phase 3C addition. No typed command
  // exists for this; the real door is the direct store action
  // repairInventoryItem(itemId, opts?) (inventorySlice.ts:~1190), the exact
  // function CraftingScreen.tsx's Repair/Repair-All controls call. Distinct
  // cost model from vendor repair (materials, not TC) — never merged into
  // one generic "maintenance works" claim per owner instruction.
  async repairAtBench(itemId: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('MAINTENANCE', decision, [`repair (bench) ${itemId}`], `repair (bench) ${itemId}`, 'repairInventoryItem(itemId)', () => {
      this.store.getState().repairInventoryItem(itemId);
    });
  }

  // Reinforcement — Phase 3C correction: no `case 'reinforce':` exists in
  // gameStore.ts (confirmed by grep; "reinforce" only appears as an
  // unrelated help/assist synonym). The real door is the direct store
  // action reinforceWithVendor(itemName, itemId?) (vendorSlice.ts:1057),
  // the exact function VendorScreen.tsx's reinforce row calls.
  async reinforce(itemName: string, decision: Decision, itemId?: string): Promise<ActionRecord> {
    return this.perform('MAINTENANCE', decision, [`reinforce ${itemName}`], `reinforce ${itemName}`, 'reinforceWithVendor(itemName, itemId)', () => {
      this.store.getState().reinforceWithVendor(itemName, itemId);
    });
  }

  // ── ECONOMY ─────────────────────────────────────────────────────────────
  // Phase 3C correction: buy/sell/scrap have NO typed-command case in
  // gameStore.ts's switch (confirmed by grep) — all three are direct store
  // actions, wired to VendorScreen.tsx/InventoryScreen.tsx buttons only.
  // The Phase 3B versions called fictitious submitPlayerAction text.
  async buy(itemName: string, decision: Decision, qty?: number): Promise<ActionRecord> {
    return this.perform('ECONOMY', decision, [`buy ${itemName}`], `buy ${itemName}`, 'buyFromVendor(itemName, qty)', () => {
      this.store.getState().buyFromVendor(itemName, qty);
    });
  }

  async sell(itemName: string, decision: Decision, itemId?: string): Promise<ActionRecord> {
    return this.perform('ECONOMY', decision, [`sell ${itemName}`], `sell ${itemName}`, 'sellToVendor(itemName, itemId)', () => {
      this.store.getState().sellToVendor(itemName, itemId);
    });
  }

  /** Inventory-item breakdown (distinct from the ambient-noun ground
   *  salvage the 'investigate'/'salvage' typed intent performs — see
   *  salvageAllAmbient, a different mechanic entirely). */
  async scrapItem(itemName: string, decision: Decision, itemId?: string): Promise<ActionRecord> {
    return this.perform('ECONOMY', decision, [`scrap ${itemName}`], `scrap ${itemName}`, 'scrapInventoryItem(itemName, itemId)', () => {
      this.store.getState().scrapInventoryItem(itemName, itemId);
    });
  }

  /** Phase 3D addition — scene-ambient-noun bulk salvage, the exact door
   *  GatherModal.tsx's "SALVAGE ALL" control calls (salvageAllAmbient,
   *  inventorySlice.ts:1403-1600+). Distinct RNG table (rollSalvagePool)
   *  and distinct engine module (engine/salvagePools.ts) from
   *  scrapInventoryItem's scrapEngine.ts — confirmed genuinely separate
   *  mechanisms, not aliases, by Phase 3D research trace. Refuses while a
   *  live enemy is present; skips take-able gear nouns and quest-lead
   *  nouns automatically (production's own guard, not this executor's). */
  async salvageAmbient(nouns: readonly string[], decision: Decision): Promise<ActionRecord> {
    const label = `salvage ${nouns.join(', ')}`;
    return this.perform('LOOT', decision, [label], label, 'salvageAllAmbient(nouns)', () => {
      this.store.getState().salvageAllAmbient(nouns);
    });
  }

  // ── FUSE CRUCIBLE ───────────────────────────────────────────────────────
  // Phase 3C correction: neither "reserve" nor "fuse" is a typed command
  // (no case in gameStore.ts's switch). Reserve + fuse only — never
  // inspects hidden future output (that input is forbidden to policy per
  // playerKnowledge.json; production itself doesn't roll the output until
  // fuseAtCrucible() runs, confirmed by research trace).
  async fuseReserve(itemId: string, decision: Decision, count?: number): Promise<ActionRecord> {
    return this.perform('FUSE', decision, [`reserve ${itemId}`], `reserve ${itemId}`, 'toggleReserveForFusion(itemId, count)', () => {
      this.store.getState().toggleReserveForFusion(itemId, count);
    });
  }

  async fuse(itemIds: readonly string[], kind: 'weapon' | 'armor' | 'dog_armor', decision: Decision, catalystId?: string): Promise<ActionRecord> {
    return this.perform('FUSE', decision, ['fuse'], 'fuse', 'confirmFusionSelection(itemIds, kind, catalystId) -> fuseAtCrucible()', () => {
      this.store.getState().confirmFusionSelection(itemIds as string[], kind, catalystId);
    });
  }

  // ── CRAFTING ────────────────────────────────────────────────────────────
  async craft(recipeName: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('CRAFTING', decision, [`craft ${recipeName}`], `craft ${recipeName}`, `submitPlayerAction('craft ${recipeName}')`, async () => {
      await this.store.getState().submitPlayerAction(`craft ${recipeName}`);
    });
  }

  // ── COMPANIONS ──────────────────────────────────────────────────────────
  async companionCommand(text: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('COMPANIONS', decision, [text], text, `submitPlayerAction('${text}')`, async () => {
      await this.store.getState().submitPlayerAction(text);
    });
  }

  // ── GUARDIAN ────────────────────────────────────────────────────────────
  // Summon/admit through the production path; fight through the SAME
  // combatAttack/combatFlee machinery above — a Guardian fight is not a
  // separate engine, it's the same pendingRolls queue against a
  // spawnGuardianForCapital()-scaled Enemy. Core resolution is automatic
  // (resolveEnemyDefeat -> triggerMainQuest('core_recovered')), observed
  // via telemetry, never computed here.
  // Phase 3D correction: summonCoreGuardian() returns { ok, reason? } rather
  // than throwing on refusal (gameStore.ts:7741) — a wrapper that discards
  // the return value would record a refused summon as 'ok', the exact
  // false-positive class Phase 3C's buy/sell/reinforce fixes existed to
  // close. Surface the refusal as a thrown error so perform()'s existing
  // try/catch marks the record 'error' and callers file it honestly.
  async guardianSummon(decision: Decision): Promise<ActionRecord> {
    return this.perform('GUARDIAN', decision, ['★ SUMMON'], '★ SUMMON', 'summonCoreGuardian()', () => {
      const outcome = this.store.getState().summonCoreGuardian();
      if (!outcome.ok) throw new Error(`summonCoreGuardian refused: ${outcome.reason ?? '(no reason)'}`);
    });
  }

  // ── STORY/PRESENTATION ──────────────────────────────────────────────────
  async dismissChapterCard(decision: Decision): Promise<ActionRecord> {
    return this.perform('STORY', decision, ['dismiss chapter card'], 'dismiss chapter card', 'dismissChapterCard() + notePresentationDismissed', async () => {
      this.store.getState().dismissChapterCard();
      await this.walker.dismissPresentationIfPending();
    });
  }

  // Phase 3C correction: the real door is the direct store action
  // answerFork(optionId) (gameStore.ts:29647), reached in production via
  // StoryForkOverlay.tsx's Pressable onPress={() => answer(o.id)} — NOT
  // free text through submitPlayerAction, which the Phase 3B version
  // called (a fictitious command for this case). optionLabel must be the
  // real displayed label (forks.json's own option.label/.hint text) so the
  // decision journal records what the player actually saw, even though the
  // production door itself is invoked by option id.
  async answerFork(optionId: string, optionLabel: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('STORY', decision, [optionLabel], optionLabel, `answerFork('${optionId}')`, async () => {
      this.store.getState().answerFork(optionId);
      await this.walker.dismissPresentationIfPending();
    });
  }

  // ── DEATH/RESURRECTION ──────────────────────────────────────────────────
  // Phase 7 (Life 2 death handling, owner Section 19) — the real player-facing
  // continuation from death: resurrectSlot(slotId) (gameStore.ts,
  // slotSlice.ts:712), gated on a character-bound resurrectionGems balance
  // (OTA-1850) and reached from the death/slot screen's own resurrect
  // control. Never called speculatively — only after confirming
  // player.resurrectionGems > 0 and the death has actually settled/persisted.
  async resurrectViaGem(slotId: string, decision: Decision): Promise<ActionRecord> {
    return this.perform('STORY', decision, ['Resurrect with Gem'], 'Resurrect with Gem', 'resurrectSlot(slotId)', async () => {
      const ok = await this.store.getState().resurrectSlot(slotId);
      if (!ok) throw new Error('resurrectSlot() returned false — no gem spent, character remains dead.');
    });
  }

  // ── NEXUS/ENDING ────────────────────────────────────────────────────────
  // Door implemented for P7-readiness completeness — NEVER called by any
  // Phase 3B test. Executing this is the canonical run's own job (P7),
  // explicitly forbidden here.
  async nexusArrive(decision: Decision): Promise<ActionRecord> {
    throw new Error(
      'CanonicalActionExecutor.nexusArrive() exists only to document the door (submitPlayerAction referencing the Nexus arrival text) — ' +
        'it must never be CALLED outside the canonical run itself (P7), which this package does not execute.',
    );
  }
}
