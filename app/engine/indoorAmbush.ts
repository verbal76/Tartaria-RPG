// OTA-1032 — WHO CAN AMBUSH YOU INDOORS. A rest-ambush used to draw from the
// wilderness table wherever you slept, so the owner's log has a Rare 202-HP Mud
// Cyclops materialising in the Builders' crew bunks inside fortified Asgardar,
// narrated as if it crossed open country. The ODDS were already right (a hub
// rest is 8% against the wilds' 22%) — the CAST was wrong.
//
// This is the cast that can plausibly be in the room with you: someone who got
// past the door, something small that lives in the walls, a machine still
// walking its rounds, or one of the dead the flood sealed in. Deliberately
// rarity-keyed rather than a flat list, so the swap preserves the danger the
// wilderness roll picked — a Rare ambush stays a Rare ambush, it just stops
// being a swamp behemoth in a bunkhouse.

import * as fb from './factionBodies';
import { findEnemyByName } from './encounter';
import type { Enemy } from './types';

/** Indoor-plausible ambushers, keyed by the rarity they stand in for.
 *  Intruders (human), vermin (small + at home in ruins), machines (still on
 *  patrol), and Aetherkin (the dead sealed into these very walls). */
export const INDOOR_AMBUSHERS: Readonly<Record<string, readonly string[]>> = {
  // Vermin and the loose small stuff — things that live in a drowned building.
  Common: [
    'Gutter Rat', 'Aetheric Spider', 'Mud Spider', 'Aetherbat',
    'Aetheric Leech', 'Aetheric Ooze', 'Scrap Drone', 'Drowned Aetherkin',
  ],
  // Someone got in, or something woke up: thieves, raiders, patrol machines.
  Uncommon: [
    'Silt Thief', 'Reclaimer Ambusher', 'Disc Hijacker', 'Aetheric Drone',
    'Iron Spider', 'Rust Lurker', 'Plague Moth', 'Mud-Wracked Aetherkin',
  ],
  // A serious intrusion: a hired blade, a guard-machine, a haunting.
  // OTA-1033 — Mud Monarch Purifier added: a zealot-knight is exactly the kind
  // of armed caller a capital gets, and he was the one martial human the cast
  // had left out.
  Rare: [
    'Black Cloak Agent', 'Mud Monarch Purifier', 'Steel Hound',
    'Clockwork Knight', 'Stone Warden', 'Clockwork Serpent', 'Steam Spider',
    'Shifting Shade', 'Aetheric Ghost', 'Mud Wraith', 'Aetherkin',
  ],
  // The things a sealed hall keeps. All of these belong under a roof — the
  // open-country colossi (Iron Titan, Metal Hydra, Storm Walker) do not.
  Legendary: [
    'Architectural Sentinel', 'Mech Sentinel', 'Obsidian Sentinel',
    'Aetheric Guardian', 'Aetheric Lich', 'Hollow King', 'Tartarian Reaver',
  ],
};

// OTA-1033 — RAIDERS AND SOLDIERS WEARING A FACTION'S COLOURS. Owner asked the
// indoor list to cover raiders and soldiers explicitly. The roster only has six
// humans total and exactly one martial one below Legendary, so a named-enemy
// list alone can't carry "a rival faction broke in" at every tier. The game
// already builds faction fighters by RESKINNING a template (injectFactionParty
// for outdoor raids) — but that one dresses whatever the WILD table rolled,
// which is how a soldier's name can end up on a cyclops's statline. Indoors we
// only ever dress a HUMAN body, so a "Mud Monarchs Raider" fights like a person.
//
// Common is deliberately absent: the cheapest human body is Uncommon, and a
// Common-tier intruder in a fortified capital is a rat or a loose drone, not a
// soldier. A soldier is a serious visit by definition.
// OTA-1035 — the list now lives in factionBodies.ts, because the OUTDOOR raid
// builder needed the same one. Re-exported under the old name so nothing that
// reads the indoor cast has to know where it moved.
export { FACTION_BODIES as INDOOR_FACTION_BODIES } from './factionBodies';

/** Dress a same-rarity HUMAN body in a faction's colours: "Mud Monarchs Raider",
 *  "Stone Builders Soldier". Keeps the body's statline and traits (so the fight
 *  plays like a person), stamps the factionId so the kill lands on the right
 *  ledger, and carries the aliases the parser already answers to. Returns null
 *  at a rarity with no human body — the caller falls back to the creature cast. */
export function pickIndoorFactionIntruder(
  rarity: string | null | undefined,
  factionId: string,
  factionName: string,
): Enemy | null {
  // OTA-1035 — no `nearest`: indoors, a Common-tier intruder really is a rat, and
  // the caller wants the null so it can fall back to the creature cast.
  const body = fb.pickFactionBody(rarity);
  if (!body) return null;
  return fb.dressFactionFighter(body, factionId, factionName, fb.nounForBody(body.name));
}

/** Every name in the indoor cast, flattened. */
export function indoorAmbusherNames(): string[] {
  return Object.values(INDOOR_AMBUSHERS).flatMap((names) => [...names]);
}

// OTA-1033 — the three groups the owner named, so a future edit can't drop one.
// (Faction raiders/soldiers are BUILT, not listed, so they're covered by the
// INDOOR_FACTION_BODIES check rather than by name.)
export const INDOOR_RAIDERS: readonly string[] = [
  'Silt Thief', 'Reclaimer Ambusher', 'Disc Hijacker',
];
export const INDOOR_SOLDIERS: readonly string[] = [
  'Black Cloak Agent', 'Mud Monarch Purifier', 'Tartarian Reaver',
];
export const INDOOR_AETHERKIN: readonly string[] = [
  'Drowned Aetherkin', 'Mud-Wracked Aetherkin', 'Aetherkin',
  'Aetheric Lich', 'Hollow King',
];

/** True when this enemy is one the indoor cast allows. Used by the guard test
 *  so a future edit can't quietly re-admit a swamp behemoth to a bunkhouse. */
export function isIndoorPlausibleEnemy(name: string): boolean {
  return indoorAmbusherNames().includes(name);
}

/** Swap a wilderness pick for an indoor one of the SAME rarity. Returns null
 *  when nothing matches (unknown rarity, or the roster lacks the name), and the
 *  caller keeps whatever it had — a wrong-feeling foe beats no ambush at all. */
export function pickIndoorAmbusher(rarity: string | null | undefined): Enemy | null {
  const pool = rarity ? INDOOR_AMBUSHERS[rarity] : undefined;
  if (!pool || pool.length === 0) return null;
  // Try the pool in a random rotation so a missing catalog entry can't wedge
  // the swap on one unlucky draw.
  const order = [...pool].sort(() => Math.random() - 0.5);
  for (const name of order) {
    const found = findEnemyByName(name);
    if (found) return found;
  }
  return null;
}

/** The Arbiter's read on waking to company, INDOORS. The wilderness line
 *  ("something circled while you were out") is open-ground; in a sealed room
 *  the unsettling part is that it was already in here with you. */
export function indoorRestWakeLine(): string {
  const lines = [
    `The Arbiter goes still. "You weren't alone in here. Whatever it is, it waited until you were under."`,
    `The Arbiter goes still. "Something shared this room with you and let you sleep. That was a choice."`,
    `The Arbiter goes still. "A door moved while you were out. Not the one you came through."`,
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

/** Arrival line for an ambusher that is INSIDE with you — no crossing of open
 *  ground, because there is none. */
export function indoorRestArrivalLine(nameWithArticle: string): string {
  const lines = [
    `${nameWithArticle} is already inside, between you and the way out. The rest is over.`,
    `${nameWithArticle} comes out of the dark at the far wall. The rest is over.`,
    `${nameWithArticle} was in here before you woke. The rest is over.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
}
