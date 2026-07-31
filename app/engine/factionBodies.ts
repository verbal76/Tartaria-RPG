// OTA-1035 — WHAT A FACTION FIGHTER IS MADE OF. Owner: "let's fix the loot drop
// issue you noticed where humans drop beast loot."
//
// The game builds a faction's soldiers by RESKINNING an existing roster entry —
// rename it, stamp a factionId. Outdoors (injectFactionParty) that template was
// whatever the WILD table happened to roll for the tile, so a "Conspiracy
// Architects Raider" could be a Mud Cyclops underneath: 202 HP, tinder-dry to
// fire, and dropping Raven Feather and Aether Wing off a man's corpse. The
// indoor ambush (OTA-1056) already solved this by only ever dressing a HUMAN
// body. This module is that list, lifted out so BOTH paths share one source —
// the outdoor path was the half that was still wrong.
//
// The roster holds six humans total, and none at Common. `nearest` walks UP to
// the cheapest human body rather than falling back to a beast, because a
// faction patrol is people at every tier by definition — and the party is
// re-scaled to the tile's danger afterwards anyway (scaleEncounterForContext
// anchors on the pack's mean HP, so the body's authored rarity barely moves the
// difficulty; what it moves is the loot, the resist profile and the attack name).

import { findEnemyByName } from './encounter';
import type { Enemy } from './types';

/** Every HUMAN in the enemy roster, keyed by rarity. Locked by test against
 *  enemies.json — if a human is added there, it belongs here too. */
export const FACTION_BODIES: Readonly<Record<string, readonly string[]>> = {
  Uncommon: ['Silt Thief', 'Reclaimer Ambusher', 'Disc Hijacker'],
  Rare: ['Black Cloak Agent', 'Mud Monarch Purifier'],
  Legendary: ['Tartarian Reaver'],
};

/** Which word fits the body. A cutpurse or brigand is a RAIDER; a zealot-knight,
 *  a blade in someone's pay, or a warlord is a SOLDIER. */
export const FACTION_NOUN_BY_BODY: Readonly<Record<string, 'Raider' | 'Soldier'>> = {
  'Silt Thief': 'Raider',
  'Reclaimer Ambusher': 'Raider',
  'Disc Hijacker': 'Raider',
  'Black Cloak Agent': 'Soldier',
  'Mud Monarch Purifier': 'Soldier',
  'Tartarian Reaver': 'Soldier',
};

const RARITY_LADDER = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const;

/** A human body at this rarity. With `nearest`, searches up the ladder and then
 *  down, so Common (which has no human) borrows the cheapest one instead of
 *  handing the fight back to a beast. Without it, returns null at a rarity with
 *  no body — the indoor path uses that to fall back to its creature cast. */
export function pickFactionBody(
  rarity: string | null | undefined,
  opts?: { nearest?: boolean },
): Enemy | null {
  const tiers: string[] = [];
  if (rarity && FACTION_BODIES[rarity]) tiers.push(rarity);
  if (opts?.nearest) {
    const at = rarity ? RARITY_LADDER.indexOf(rarity as typeof RARITY_LADDER[number]) : -1;
    const start = at >= 0 ? at : 0;
    for (let step = 1; step < RARITY_LADDER.length; step++) {
      for (const i of [start + step, start - step]) {
        const t = RARITY_LADDER[i];
        if (t && FACTION_BODIES[t] && !tiers.includes(t)) tiers.push(t);
      }
    }
  }
  for (const tier of tiers) {
    const pool = FACTION_BODIES[tier] ?? [];
    for (const bodyName of [...pool].sort(() => Math.random() - 0.5)) {
      const body = findEnemyByName(bodyName);
      if (body) return body;
    }
  }
  return null;
}

/** Dress a human body in a faction's colours, keeping its statline, traits,
 *  attack and DROPS — which is the whole point: a soldier's corpse yields a
 *  soldier's kit. `noun` lets each caller keep its own word ("Patrol", "War
 *  Party" outdoors; "Raider"/"Soldier" indoors). */
export function dressFactionFighter(
  body: Enemy,
  factionId: string,
  factionName: string,
  noun: string,
  index?: number,
): Enemy {
  const label = index == null ? `${factionName} ${noun}` : `${factionName} ${noun} ${index}`;
  return {
    ...body,
    name: label,
    factionId,
    aliases: [
      noun.toLowerCase(), 'soldier', 'raider', 'intruder',
      factionName.toLowerCase(),
    ],
  };
}

/** The noun that suits a given body, for callers that don't bring their own. */
export function nounForBody(bodyName: string): 'Raider' | 'Soldier' {
  return FACTION_NOUN_BY_BODY[bodyName] ?? 'Raider';
}

/** Every faction body name, flattened. */
export function factionBodyNames(): string[] {
  return Object.values(FACTION_BODIES).flatMap((names) => [...names]);
}
