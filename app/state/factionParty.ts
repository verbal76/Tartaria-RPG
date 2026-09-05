// factionParty — the faction-party spawner, out of gameStore.
//
// ⚠ OTA-1678 moved `injectFactionParty` here unchanged (the OTA-1400 line
// ratchet: gameStore stays under 37,000 lines, and the flee-escalation wiring
// was the 27 lines that crossed it). Three callers in gameStore — the raid, the
// hostile-ground patrol and the open-country crossing — pass `scalePowerOf` in
// rather than this file importing it back out of the store, which would be a
// value cycle. Everything below the signature is the code as it stood.

import type { GameStore } from './gameStore';
import type { Enemy, PlayerCharacter } from '../engine/types';
import { rollEncounter, scaleEncounterForContext } from '../engine/encounter';
import { profileOf } from '../engine/pressure';
import { openingRange, placeEnemies } from './combatResolution';
import { markUnscripted } from '../engine/fleeEscalation';

/** OTA-1116 — what actually landed. `null` = nothing spawned (callers already
 *  treat that as falsy and bail). `elite` is set only when the OTA-1116 swap
 *  fired, so the announce line can stop claiming a headcount that is no longer
 *  true — a "war party, 4 of them" line over a single body is the kind of small
 *  lie that reads as a bug. */
export type InjectedParty = { elite: Enemy | null } | null;

export interface FactionPartyOpts {
  factionId: string;
  factionName: string;
  partySize: number;
  noun: string;
  /** ⚠ OTA-1678 — a patrol that CROSSES you in the open is a world roll and its
   *  bodies are marked for the flee contest; a party a contract or a raid sends
   *  is not. Only the caller knows which. */
  unscripted?: boolean;
}

export function injectFactionParty(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  opts: FactionPartyOpts,
  deps: { scalePowerOf: (player: PlayerCharacter) => number },
): InjectedParty {
  const s = get();
  const player = s.player;
  const scene = s.currentScene;
  if (!player || !scene || !scene.location) return null;
  // OTA-1015 — a faction party is made of that faction's PEOPLE. This builder reskins
  // whatever the local wild table rolls (rename + stamp a factionId) and KEEPS
  // every trait, so an Aetherkin roll used to walk in as "<Faction> Patrol 1" —
  // a mud-mummified corpse wearing a soldier's name, resisting piercing and
  // burning like tinder. That reskin is also what double-docked the victim's own
  // faction on the kill (the reverence penalty below assumes Aetherkin carry no
  // faction). Special-marked creatures are excluded from the pool outright; if
  // nothing ordinary is available here, no party lands (callers handle false).
  const specialTemplate = (e: Enemy): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isAetherkin: isAk } = require('../engine/aetherkin') as typeof import('../engine/aetherkin');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isRevenant } = require('../engine/fallenRevenants') as typeof import('../engine/fallenRevenants');
    return isAk(e) || isRevenant(e);
  };
  const base = rollEncounter(scene.location).filter((e) => !e.boss && !specialTemplate(e));
  if (base.length === 0) return null;
  // OTA-1035 — AND THE BODY IS A PERSON. Owner: "let's fix the loot drop issue
  // where humans drop beast loot." The reskin above kept every trait of the WILD
  // roll, so a "Conspiracy Architects Patrol" could be a Mud Cyclops underneath —
  // dropping Raven Feather and Aether Wing off a man's corpse, burning like
  // tinder, swinging a beak. The indoor ambush was fixed this way in OTA-1056;
  // this is the outdoor half, sharing the same body list. The wild roll still
  // decides HOW MANY and at what RARITY (so the tile's danger still governs) —
  // it just no longer decides what a soldier is made of. Difficulty is unmoved:
  // scaleEncounterForContext below anchors the pack on its mean HP against the
  // tile's danger, not on the template's authored numbers.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fbMod = require('../engine/factionBodies') as typeof import('../engine/factionBodies');
  const party: Enemy[] = [];
  for (let i = 0; i < opts.partySize; i++) {
    const tmpl = base[i % base.length]!;
    // `nearest` because a Common tile still sends PEOPLE — the roster has no
    // Common human, and borrowing the cheapest one beats sending a rat in
    // faction colours. Falls back to the old reskin only if the roster somehow
    // yields no human at all, so this can never leave a raid unspawned.
    const body = fbMod.pickFactionBody(tmpl.rarity, { nearest: true }) ?? tmpl;
    party.push(fbMod.dressFactionFighter(
      body, opts.factionId, opts.factionName, opts.noun,
      opts.partySize > 1 ? i + 1 : undefined,
    ));
  }
  const tide = Math.max(0, s.worldMemory.factionTides?.[opts.factionId] ?? 0);
  const power = deps.scalePowerOf(player) + tide; // escalation: an ascendant faction hits harder
  const packDanger = scene.location.danger + Math.floor(tide / 2);
  let scaled = scaleEncounterForContext(party, packDanger, power);
  // OTA-1116 — THE ELITE SWAP. The `elite` dial (OTA-1113) finally has a
  // consumer. On a hit, the party that would have crested the rise arrives as
  // ONE named body instead — the survey's CONTENT lever rather than another
  // multiplier, and the only one that makes a fight different instead of
  // longer.
  //
  // ⚠ The fold happens AFTER scaling, on purpose. The scaled pack's summed HP
  // IS the elite's budget, straight from scaleEncounterForContext's pack
  // branch, so the elite is exactly as durable as the party would have been —
  // with no new balance constant to drift. Re-scaling the single body then
  // routes it through the SOLO branch, which grants the FULL attack/AC bump
  // rather than the pack's 0.6x; that softening exists precisely BECAUSE there
  // are several of them, so one body earning the full rate is the shipped rule
  // and not a new opinion. The pack's HP total is then restored over whatever
  // the solo path computed: durability from the pack, aggression from the solo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const eliteSwapMod = require('../engine/eliteSwap') as typeof import('../engine/eliteSwap');
  const eliteMult = profileOf(player).elite;
  if (eliteSwapMod.shouldSwapToElite(scaled.length, { eliteMult })) {
    const folded = eliteSwapMod.foldPartyIntoElite(scaled, {
      factionName: opts.factionName, noun: opts.noun,
    });
    if (folded) {
      const solo = scaleEncounterForContext([folded.elite], packDanger, power);
      const body = solo[0] ?? folded.elite;
      scaled = [{ ...body, hp: folded.hpBudget, eliteReplaced: folded.elite.eliteReplaced }];
    }
  }
  // ⚠ OTA-1506 — the party lands ON THE BULLSEYE: a raid travels together, so
  // it clusters (patrol shape) and staggers across the rings, leader nearest.
  // ⚠ OTA-1678 — a patrol that CROSSES you in the open is a world roll (the
  // caller says so); a party a contract or a raid sends is not.
  const placedParty = opts.unscripted ? markUnscripted(placeEnemies(scaled, 'patrol')) : placeEnemies(scaled, 'patrol');
  const enemyHps = placedParty.map((e) => e.hp);
  set((st) => (st.currentScene ? {
    currentScene: {
      ...st.currentScene,
      enemies: placedParty,
      enemyHps,
      fleeAttempts: undefined,
      activeEnemyIdx: 0,
      range: openingRange(placedParty),
      enemyAmbushUsed: placedParty.map(() => false),
      stealthOpenerUsed: false,
      // OTA-960 — a party that crests the rise while you're UP a climb masses at
      // the BASE (drives the elevation combat gates); on level ground the
      // flag clears so a stale siege can't linger into the next fight.
      enemiesAtBase: !!st.currentScene.elevatedOn,
    },
  } : st));
  return { elite: scaled.length === 1 && scaled[0]?.eliteReplaced ? scaled[0] : null };
}
