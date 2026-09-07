// broker — the Guild Broker challenge (Parley Ground). Two non-allied faction
// leaders meet on neutral ground; each demands their faction's coveted relic.
// Fetch both and return → broker an alliance → the Guild Broker title.
//
// Pure / store-free: the store holds a BrokerMission on the player (the two
// chosen faction ids) and uses these helpers to display the demands, grant the
// relics at their source tiles, and check completion. No dice — it's a
// fetch-and-return, so it can't be "failed," only completed.

import factionsData from '../data/factions/factions.json';
import { FACTION_COVETED_ITEM, eligibleBrokerFactions } from './locationChallenges';
import { theLower } from './grammar';

const FACTION_NAME: Record<string, string> =
  Object.fromEntries((factionsData as { id: string; name: string }[]).map((f) => [f.id, f.name]));

export interface BrokerLeg {
  factionId: string;
  factionName: string;
  itemName: string;
  itemId: string;
  tileId: string;
}

export interface BrokerMission {
  /** The two factions being brokered (stored on the player). */
  factionA: string;
  factionB: string;
  /** Set once the alliance is sealed. */
  done?: boolean;
  /** `true` = the player has DEACTIVATED (paused) the parley: it stays on the
   *  slate but is dropped from the standing mission reminders until re-activated. */
  paused?: boolean;
}

export function factionName(id: string): string {
  return FACTION_NAME[id] ?? id;
}

export function brokerLeg(factionId: string): BrokerLeg | null {
  const c = FACTION_COVETED_ITEM[factionId];
  if (!c) return null;
  return {
    factionId,
    factionName: factionName(factionId),
    itemName: c.name,
    itemId: c.itemId,
    tileId: c.sourceLocationId,
  };
}

/** Choose the two factions to broker: the first two eligible (not the player's,
 *  not affiliated), in chart order. Deterministic so a started mission is
 *  stable. Returns null when fewer than two factions are eligible. */
export function pickBrokerFactions(
  playerFactionId: string,
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
): [string, string] | null {
  const elig = eligibleBrokerFactions(playerFactionId, standings);
  if (elig.length < 2) return null;
  return [elig[0]!, elig[1]!];
}

export function missionLegs(m: BrokerMission): [BrokerLeg, BrokerLeg] | null {
  const a = brokerLeg(m.factionA);
  const b = brokerLeg(m.factionB);
  if (!a || !b) return null;
  return [a, b];
}

/** True when the tile is a source for one of the mission's demanded relics. */
export function isBrokerSourceTile(m: BrokerMission, tileId: string): BrokerLeg | null {
  const legs = missionLegs(m);
  if (!legs) return null;
  return legs.find((l) => l.tileId === tileId) ?? null;
}

/** One-line objective summary for an active (unsealed) broker mission — the
 *  same demands string the PARLEY action prints, extracted so it can be
 *  surfaced persistently as a "current mission" reminder under the scene
 *  paragraph (playtester got pulled into a fight mid-parley and lost track of
 *  what they were doing). Returns null when there is no live mission or it's
 *  already sealed. `has` reports whether the player already carries a relic by
 *  name; `tileName` resolves a source tile id to its display name. */
export function brokerMissionLine(
  m: BrokerMission | null | undefined,
  has: (itemName: string) => boolean,
  tileName: (tileId: string) => string,
): string | null {
  if (!m || m.done) return null;
  const legs = missionLegs(m);
  if (!legs) return null;
  const line = legs
    .map((l) => `${l.factionName} demands ${theLower(l.itemName)} (${has(l.itemName) ? 'in hand ✓' : `recover it at ${tileName(l.tileId)}`})`)
    .join('; ');
  // Lead with the mission's NAME ("Broker an Alliance" — matches the CONTRACTS
  // card title + the accept/decline offer title) so the standing reminder names
  // the mission the same way everywhere. "SEAL THE ALLIANCE" is the closing
  // COMMAND, not the name — capitalized like the game's other typed affordances.
  return `Broker an Alliance: two leaders wait at the parley stone. ${line}. Bring both, then SEAL THE ALLIANCE.`;
}

/** OTA-701 — SHORT standing reminder for the look-around / scene-entry feed. The
 *  full brokerMissionLine (both demands + locations + the SEAL command) is right
 *  the first time and on the Contracts card, but reprinting the whole paragraph on
 *  every `look` is noise (playtester: "every look triggers the full mission
 *  dialogue"). This condenses to name + progress + the single next step. */
export function brokerMissionShortLine(
  m: BrokerMission | null | undefined,
  has: (itemName: string) => boolean,
  tileName: (tileId: string) => string,
): string | null {
  if (!m || m.done) return null;
  const legs = missionLegs(m);
  if (!legs) return null;
  const need = legs.filter((l) => !has(l.itemName));
  const inHand = legs.length - need.length;
  if (need.length === 0) {
    return `Broker an Alliance — all ${legs.length} relics in hand. SEAL THE ALLIANCE at the parley stone.`;
  }
  const next = need[0]!;
  const more = need.length > 1 ? ` (+${need.length - 1} more)` : '';
  return `Broker an Alliance — ${inHand}/${legs.length} relics. Next: ${next.itemName} at ${tileName(next.tileId)}${more}.`;
}

/** OTA-681 — gate for the store's parley-verb intercept (approach / examine /
 *  meet / … routed to handleBroker). The parley stone is an OUTDOOR feature of
 *  the parley_ground tile, and its verb list overlaps combat verbs — most
 *  dangerously "approach", which is how a player closes on an enemy. Without
 *  these guards, walking into a shed that happens to sit on the parley tile, or
 *  getting jumped by a wandering monster there, turns every "approach <foe>"
 *  into a re-print of the mission reminder (playtest: "approach Aetheric Raven"
 *  spammed the Broker line five times, un-fightable). Intercept ONLY when:
 *    • on the parley_ground tile with the challenge live,
 *    • NOT in a labyrinth run,
 *    • NOT inside a building (you're not at the stone — parley is on the flats),
 *    • NO live enemies (combat verbs win; the fight must be resolvable). */
/** ⚠⚠ OTA-1728 — THE TWO VERB LISTS LIVE HERE NOW. Both were written out inline
 *  at the store's intercept site, which is why nothing could ask "would the
 *  parley stone swallow this?" without copying the regex a third time. They are
 *  exported so the guard below and the store read the SAME rule. */
export const SEAL_VERB_RE =
  /\b(seal|forge|complete|finish)\b.*\b(alliance|pact|peace|deal|truce|accord)\b|^(seal|forge)\b|\bbroker\s+(the\s+)?(alliance|pact|peace|deal)\b/i;
export const PARLEY_VERB_RE =
  /\b(parley|approach|examine|inspect|survey|meet|talk|speak|leaders?|factions?|broker)\b/i;

export function parleyInterceptEligible(args: {
  labyrinthRun: boolean;
  insideBuilding: boolean;
  enemyCount: number;
  currentLocationId: string;
  challengeOn: boolean;
  /** ⚠⚠⚠ OTA-1728 — WHAT THE GAME ITSELF JUST TOLD THE PLAYER TO TYPE HERE.
   *  `stageVerbAsk` for the tracked mission stage standing on this cell, or null
   *  when no mission claims this ground. See the guard below. */
  missionAskHere?: string | null;
}): boolean {
  // ⚠⚠⚠ OTA-1728 — THE PARLEY STONE DOES NOT EAT A VERB THE GAME JUST ASKED FOR.
  //
  //  Measured, by driving all 32 storylines and mysteries stage by stage: two
  //  missions stalled dead, and both stalled on the SAME tile with the SAME check
  //  kind — a `diplomacy` stage whose ground is the Parley Ground. The card says
  //  "talk it through with the claimant"; the player stands on the right cell
  //  holding the right item and types it; `PARLEY_VERB_RE` matches on `talk`, the
  //  store hands the action to `handleBroker` and RETURNS, and the mission matcher
  //  is never reached. The stage cannot advance.
  //
  //  Causation was isolated rather than argued: with this one predicate forced to
  //  false and nothing else changed, `story_dynasty_blood_aetherborn` went 3/6 →
  //  6/6 and `mystery_pale_signal` went 0/4 → 4/4. That mystery was blocked at its
  //  FIRST stage, so it could not be completed by anyone.
  //
  //  ⚠ THE MISSION IS THE MORE SPECIFIC CLAIM. The stone sits on this tile always;
  //  the player was sent here by a card that named the verb. So the stage wins —
  //  but ONLY when the collision is real, which keeps the Guild Broker reachable
  //  for every other verb and for every player not standing mid-stage.
  //
  //  ⚠ TESTED AGAINST THE ASK, not against a hardcoded 'diplomacy'. If a label is
  //  ever retuned the guard follows it, and it can never drift out of agreement
  //  with the thing it is protecting. Of the seven asks, exactly ONE collides
  //  today ('talk it through'); 'sneak', 'search this ground', 'strike',
  //  'provoke it', 'flee' and 'cast aether' are untouched, which is why the
  //  Silence's `attack_provoke` stage on this same tile always worked.
  if (args.missionAskHere && PARLEY_VERB_RE.test(args.missionAskHere)) return false;
  return args.challengeOn
    && args.currentLocationId === 'parley_ground'
    && !args.labyrinthRun
    && !args.insideBuilding
    && args.enemyCount === 0;
}
