// OTA-1055 — WHO CAN AMBUSH YOU INDOORS. A rest-ambush used to draw from the
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
  Rare: [
    'Black Cloak Agent', 'Steel Hound', 'Clockwork Knight', 'Stone Warden',
    'Clockwork Serpent', 'Steam Spider', 'Shifting Shade', 'Aetheric Ghost',
    'Mud Wraith', 'Aetherkin',
  ],
  // The things a sealed hall keeps. All of these belong under a roof — the
  // open-country colossi (Iron Titan, Metal Hydra, Storm Walker) do not.
  Legendary: [
    'Architectural Sentinel', 'Mech Sentinel', 'Obsidian Sentinel',
    'Aetheric Guardian', 'Aetheric Lich', 'Hollow King', 'Tartarian Reaver',
  ],
};

/** Every name in the indoor cast, flattened. */
export function indoorAmbusherNames(): string[] {
  return Object.values(INDOOR_AMBUSHERS).flatMap((names) => [...names]);
}

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
