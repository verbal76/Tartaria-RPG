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
  Uncommon: [
    'Silt Thief', 'Reclaimer Ambusher', 'Disc Hijacker',
    // OTA-1548 — the whisper-chain marks and road ambushers. Every one is a
    // Human on the roster, so they belong here by this file's own law; ambient
    // faction fights get nineteen more faces out of the deal.
    'Lens Prier', 'Marsh Poacher', 'Copper Stripper', 'Chart Runner',
    'Dice Palmer', 'Brine Runner', 'Verse Peddler', 'Tin Grubber',
    'Latch Picker', 'Quiver Rat', 'Spore Skimmer', 'Ash Robber',
    'Page Tearer', 'Loadstone Lifter', 'Ink Dipper', 'Coal Creeper',
    'Road Skimmer', 'Silt Footpad',
    // ⚠ OTA-1576 — the jaw-marked sworn authored for the Doubter's false summit.
    // A Human on the roster belongs here by this file's own law, and the
    // ota1035 pin enforces exactly that: the body list IS the humans, no one
    // left out. Adding a Human and not listing it here is how the victory card
    // learns to skip somebody.
    'Tartarian Raider',
  ],
  Rare: [
    'Black Cloak Agent', 'Mud Monarch Purifier',
    // OTA-1548 — the higher-stakes marks.
    'Charm Cutter', 'Glass Creeper', 'Horn Filcher', 'Ring Slipper', 'Dusk Prowler',
  ],
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
  // OTA-1576 — sworn to the Reaver, but rank and file. A Raider, not a Soldier:
  // the word is what the man is, not who he follows.
  'Tartarian Raider': 'Raider',
  // OTA-1548 — every chain mark is a cutpurse of one flavor or another.
  'Lens Prier': 'Raider',
  'Marsh Poacher': 'Raider',
  'Copper Stripper': 'Raider',
  'Chart Runner': 'Raider',
  'Dice Palmer': 'Raider',
  'Brine Runner': 'Raider',
  'Verse Peddler': 'Raider',
  'Tin Grubber': 'Raider',
  'Latch Picker': 'Raider',
  'Quiver Rat': 'Raider',
  'Spore Skimmer': 'Raider',
  'Ash Robber': 'Raider',
  'Page Tearer': 'Raider',
  'Loadstone Lifter': 'Raider',
  'Ink Dipper': 'Raider',
  'Coal Creeper': 'Raider',
  'Road Skimmer': 'Raider',
  'Silt Footpad': 'Raider',
  'Charm Cutter': 'Raider',
  'Glass Creeper': 'Raider',
  'Horn Filcher': 'Raider',
  'Ring Slipper': 'Raider',
  'Dusk Prowler': 'Raider',
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
    // ⚠⚠ OTA-1155 — A DRESSED FIGHTER IS RANK AND FILE. NEVER A BOSS.
    //
    // The roster's only Legendary human is the Tartarian Reaver — 310 HP, 3D8,
    // Strength 12, `boss: true` — so a Legendary tile roll picks it with
    // certainty, and `...body` above forwarded that flag into a mook called
    // "Forgotten Order Raider 1". Device log 2026-08-07T03:24, against a 29 HP
    // player: TWO of them at 248 HP each, AC 25, ATK 16/14, both taking the
    // second swing. The owner fled, which was the only correct play — 9 damage a
    // hit into 496 HP is roughly fifty rounds while taking ~24 a round.
    //
    // One flag, six systems, because everything asks it independently:
    //   1. scaleEncounterForContext builds `nonBossIdx` and routes a party of
    //      all-bosses down the SOLO branch — so packHpCeiling (70-120 for the
    //      whole party) never applied, and each body kept its full boss scale.
    //   2. scaleStaticBoss's 0.8 boss floor: 310 × 0.8 = 248. The log's number.
    //   3. combatRules AC: min(18, 5+12) + 2 armored + 6 BOSS = 25. The log's.
    //   4. bossSwingsTwice → the second strike every round.
    //   5. +1d6 on every boss swing.
    //   6. Exemption from MELEE_PACK_SWINGS_PER_ROUND.
    // Plus, had the player won: boss spoils, post-boss grace and a gem key
    // written to permanent world memory under a mook's name.
    //
    // ⚠ THE GATE UPSTREAM WAS ALREADY RIGHT and that is what hid this. The wild
    // roll filters `!e.boss` before ever reaching here — but OTA-1035 then
    // REPLACES the filtered template with a body picked fresh from the roster,
    // downstream of the filter, so the filter guards a value that gets thrown
    // away. The raid builder's own comment promises "difficulty is unmoved …
    // anchors the pack on its mean HP"; this flag is precisely what broke that
    // promise. Fixed here rather than in FACTION_BODIES because both the outdoor
    // raid and the indoor ambush come through this one function — and because
    // dropping the Reaver from the list would make pickFactionBody return null
    // at Legendary, whose `?? tmpl` fallback reinstates the beast-loot bug
    // OTA-1035 existed to kill.
    boss: false,
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
