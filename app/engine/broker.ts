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
    .map((l) => `${l.factionName} demands the ${l.itemName} (${has(l.itemName) ? 'in hand ✓' : `recover it at ${tileName(l.tileId)}`})`)
    .join('; ');
  return `Two leaders face off across the parley stone. ${line}. Bring both, then SEAL THE ALLIANCE.`;
}
