/**
 * app/state/humanActivity.ts — THE PLAYER IS HERE, WHICH IS NOT THE SAME AS
 * THE PLAYER TOOK A TURN.
 *
 * ⚠⚠⚠ OTA-1807 (Baker item 13) — THE FALSE-IDLE ADMISSION. Two authorities
 * decide whether optional background work may start:
 *
 *   `lastPlayerActionAt`  — when the player last did anything. Read by
 *     `introFillTick` (bootSlice) against a 6–20 s floor, and by
 *     `playerActionIsSettling` (ai/narration) against a 1.5 s settle window.
 *   `uiIdleSince`         — stamped only by STATIONARY SCREENS (the pack).
 *     Read by the item-synthesis requester and the homework tick.
 *
 * Both are written in exactly ONE place today: `submitPlayerAction`, "the one
 * door every action passes through" (OTA-1126 / OTA-1129). That sentence is
 * true of TYPED and chip-driven input and false of the Gather sheet: a direct
 * Take is a store mutation (`takeAmbientNoun`), never a submit. MEASURED on
 * e7eea2e3, with the item actually granted:
 *
 *   submitPlayerAction('look')  → uiIdleSince cleared, lastPlayerActionAt set
 *   takeAmbientNoun('rope')     → item granted, and NEITHER moved
 *
 * So a player standing in a room clearing it by hand — tap, tap, tap — was
 * invisible to every one of those gates. Past the 6 s floor the scene-intro
 * bank starts a full narration-sized generation on top of somebody who is
 * plainly still playing. That is the defect, and it is all this file fixes.
 *
 * ⚠⚠ WHY THIS IS NOT `submitPlayerAction`, AND MUST NOT BECOME IT. Routing a
 * Take through the action pipeline to borrow its bookkeeping would buy the
 * bookkeeping with a gameplay turn: the parser, the stamina table, the roll
 * queue, the epoch bump, the breadcrumb, the deferred Qwen warm. A Take is a
 * direct mutation and stays one. This function therefore carries the SMALLEST
 * honest subset — the two activity stamps — and nothing else.
 *
 * ⚠⚠ AND IT DELIBERATELY DOES NOT FEED `notePlayerActionForSprint`. That door
 * stopped being pure activity accounting at OTA-1472: it calls
 * `preemptHomeworkForPlayer` before anything else, and it feeds the sprint
 * detector that governs whether a scene intro may START AT ALL. Both are
 * scheduling decisions about gameplay turns, and a Take is not one — three
 * Takes in four seconds are not a speed-run, they are a player picking up three
 * things. Homework preemption (J2) is a separate question with its own
 * evidence, and is left open on purpose rather than smuggled in through here.
 *
 * ⚠ NO IMPORT FROM THE STORE'S OWN GRAPH. gameStore does not import this file,
 * so the screen-layer call sites cannot cycle. The store is at its ceiling
 * (check:storeceiling, 36,945 with no headroom and the standing ruling
 * "EXTRACT, DO NOT JUST RAISE IT"), which is the other reason the authority
 * lives out here rather than as a store action.
 */
import { useCallback } from 'react';
import { useGameStore, type GameStore } from './gameStore';

/**
 * A genuine direct human interaction happened — one that mutates the game but
 * never passes through `submitPlayerAction`.
 *
 * ⚠ THE uiIdleSince CLEAR IS GUARDED AND, IN THIS FAMILY, A NO-OP. Nothing on
 * the Exploration screen stamps that field — only the pack does — so today this
 * branch never fires for a Take. It is here because the field's MEANING is
 * "the player is not touching anything", and a function named for human
 * activity that left a stale idle stamp standing would be lying on the day some
 * future direct control appears on a stationary screen. Idempotent, exactly as
 * `submitPlayerAction`'s own copy is.
 *
 * ⚠ `now` is injectable so a test can prove the genuine-idle threshold still
 * arrives without sleeping through it.
 */
export function noteHumanInteraction(now: number = Date.now()): void {
  const st = useGameStore.getState();
  if (st.uiIdleSince !== null) useGameStore.setState({ uiIdleSince: null });
  useGameStore.setState({ lastPlayerActionAt: now });
}

/* ───────────────────────────────────────────────────────────────────────────
 * ⚠⚠⚠ OTA-1816 (Baker item 13, job A) — THE OTHER SIXTY DOORS.
 *
 * OTA-1807 fixed the Take family and said so honestly: it wrapped the store
 * call "once here … what keeps that number from quietly becoming four." The
 * number was never four. A census of CURRENT source found direct human
 * gameplay mutations on SEVEN screens, none of them passing `submitPlayerAction`
 * and none of them noted:
 *
 *   VendorScreen ...... buy / sell / steal / reinforce / equip / accept×4
 *   InventoryScreen ... equip / unequip / use / drop / scrap / coat / stow /
 *                       unpouch / gift / heal-batch / arm the golem
 *   ContractsScreen ... accept / abandon / complete / turn in / send by runner
 *   MapScreen ......... set a travel course, complete a contract
 *   WorldScreen ....... accept a bounty
 *   CraftingScreen .... repair one, repair all
 *   ExplorationScreen . resolve or cancel a PENDING ROLL — a whole combat
 *                       fought by tapping dice and the clock never moved
 *
 * So a player could fight, trade, equip, travel and turn in contracts for
 * minutes on end while `lastPlayerActionAt` sat where the last typed command
 * left it. Past `introFillTick`'s 6 s floor the scene-intro bank starts a
 * narration-sized generation on top of somebody who is plainly still playing —
 * the OTA-1807 defect exactly, at sixty more doors than it closed.
 *
 * ⚠⚠ WHY A HOOK AND NOT A CALL AT EACH SITE. There is no chokepoint: 16 mutation
 * calls in Vendor, 35 in Inventory, more elsewhere. Sixty hand-placed
 * `noteHumanInteraction()` lines is sixty chances to forget one, and the
 * sixty-first gets added unnoted with nothing to say so. Wrapping the SELECTOR
 * instead costs one edit per action rather than one per press, and
 * `HUMAN_GAMEPLAY_MUTATIONS` below is then a list a test can hold.
 *
 * ⚠⚠ AND WHY NOT WRAP THE STORE ACTION ITSELF, which would be smaller still:
 * these same actions are invoked PROGRAMMATICALLY — by the engine, by other
 * store actions, by tests. Timestamping there would make automatic simulation
 * look like a person, which is the one thing this clock must never say. The
 * wrap therefore lives at the UI boundary, where a human press is the only
 * caller.
 *
 * ⚠ IT STAYS THE SMALLEST HONEST SUBSET. Same two stamps as `noteHumanInteraction`
 * and nothing else — no sprint feed, no homework preemption, no `uiIdleSince`
 * policy change. Those are job B and are deliberately untouched.
 * ─────────────────────────────────────────────────────────────────────────── */

/** ⚠ THE MEMBERSHIP LIST, AND WHAT EARNS A PLACE ON IT: a store action that a
 *  HUMAN PRESS invokes directly and that MUTATES GAMEPLAY. Navigation, opening a
 *  picker, clearing a notice, a refusal nudge and save/meta actions are all
 *  absent on purpose — see the exclusions pinned in the suite. */
export const HUMAN_GAMEPLAY_MUTATIONS = [
  // rolls — the player resolving or standing down from a pending roll
  'resolveRollStep', 'cancelPendingRolls',
  // vendor
  'buyFromVendor', 'sellToVendor', 'stealFromVendor', 'reinforceWithVendor',
  'acceptHunt', 'acceptMystery', 'acceptStoryline', 'acceptFactionQuest',
  // inventory
  'equipItem', 'unequipSlot', 'useInventoryItem', 'dropInventoryItem',
  'scrapInventoryItem', 'applyCoating', 'applyCoatingToArmor',
  'stowInBandolier', 'stowInMedkit', 'stowInPouch', 'unpouchItem',
  'removeFromBandolier', 'removeFromMedkit', 'giveGift', 'useHealBatch',
  'armGolem',
  // contracts / missions
  'abandonContract', 'completeContractFromUI', 'turnInSigil',
  'sendContractByRunner', 'discardLead',
  // travel
  'setTravelCourse', 'setWhisperCourse',
  // crafting / repair
  'repairInventoryItem', 'repairInventoryItems',
  // world board
  'acceptBounty',
] as const;

export type HumanGameplayMutation = typeof HUMAN_GAMEPLAY_MUTATIONS[number];

/**
 * Subscribe to a store action AND account the player's activity when a press
 * calls it. A drop-in replacement for `useGameStore((s) => s.someAction)` at a
 * human-driven call site.
 *
 * ⚠ IT NOTES, THEN CALLS — never the other way round. The stamp must land even
 * if the mutation throws, because the player still acted; and it must land
 * BEFORE the mutation so anything the mutation itself triggers already sees a
 * non-idle store.
 *
 * ⚠ THE RETURN VALUE IS PASSED THROUGH UNTOUCHED. Several of these actions
 * answer the caller (`buyFromVendor` reports refusals), and a wrapper that
 * swallowed that would change gameplay rather than account for it.
 */
/**
 * The same accounting for a seam that reads the store IMPERATIVELY inside a
 * press handler — `useGameStore.getState().doThing()` — where a hook cannot go.
 *
 * ⚠ IT IS A DROP-IN FOR `useGameStore.getState()` AND NOTHING MORE, which is why
 * it is shaped this way rather than as fifteen hand-placed note-then-call pairs:
 * the note cannot drift away from the call it belongs to, and the seam reads the
 * same in an arrow body, a ternary and an object property alike.
 *
 * ⚠ ONLY AT A HUMAN PRESS. The plain `useGameStore.getState()` is still correct —
 * and still the overwhelming majority — for reading state, for engine code and
 * for anything a timer or a callback does on its own.
 */
export function humanGetState(): GameStore {
  noteHumanInteraction();
  return useGameStore.getState();
}

export function useHumanAction<K extends HumanGameplayMutation>(name: K): GameStore[K] {
  const action = useGameStore((s) => s[name]);
  return useCallback(
    ((...args: unknown[]) => {
      noteHumanInteraction();
      return (action as unknown as (...a: unknown[]) => unknown)(...args);
    }) as unknown as GameStore[K],
    [action],
  );
}
