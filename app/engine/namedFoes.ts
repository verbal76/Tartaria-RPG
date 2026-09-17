// namedFoes — creatures that exist ONLY when something in the world calls them
// by name, and never as a random draw.
//
// ⚠⚠⚠ WHY THIS FILE EXISTS, AND WHAT IT COST TO LEARN. OTA-1833 first put
// Rocky's roused form straight into `app/data/enemies/enemies.json`, which is
// the obvious place and the wrong one. That file is not a bestiary the game
// reads from when asked — it IS the random spawn pool. encounter.ts draws from
// the whole of it filtered only by rarity (two of the three sites do not even
// exclude bosses), so a Rocky row made a hostile Rocky spawnable on any tile
// with nobody having touched him. A memorial dog turning up as a wandering
// monster is the exact opposite of the feature.
//
// ⚠⚠ AND IT MOVED A RULED NUMBER. threatWord.ts derives the D1-D5 reference
// from the rarity-weighted mean Power of that same pool, so one extra Legendary
// shifted the owner-ruled D4 reference from 43.0 to 43.2. The suite caught it.
// That is the second, quieter reason the bestiary is not a dumping ground: its
// contents are an INPUT TO THE DIFFICULTY MATHS, not just a list of monsters.
//
// ⚠ THE PRECEDENT THIS FOLLOWS. Core Guardians already live outside
// enemies.json (coreGuardians.ts), and the Lore Codex merges a separate
// SUMMIT_BOSS_BASES registry in for display. The established pattern for "a
// named creature that must not be randomly drawn" is: define it somewhere else
// and let the one caller resolve it by name. This is that somewhere else.
//
// Membership rule, so this does not quietly become a second bestiary: a foe
// belongs here ONLY if some authored content names it explicitly (a provoke
// block, a stage spawn, a scripted beat). Anything a tile may roll on its own
// belongs in enemies.json with everything else.
import type { Enemy } from './types';

/** Rocky, roused. The owner's ruling: "if he is attacked his stats instantly
 *  change to that of the dragon from the hunt and he bites for 4d10."
 *
 *  ⚠⚠ THESE ARE THE BOG DRAGON'S NUMBERS, DELIBERATELY AND EXACTLY — hp,
 *  ability point, rarity, type and all six traits are copied from the hunt's
 *  apex, and ota1833 asserts that field by field against the live dragon rather
 *  than against a remembered copy. Two things differ on purpose:
 *
 *    ATTACK  "Bite", not "Breath Attack". The dragon's damage was ALREADY 4D10,
 *            so the bite is the only part of the attack that changed. The
 *            combat line then reads "Rocky closes — Bite ready", his name.
 *
 *    LOOT    EMPTY. A Legendary statline carrying the dragon's drop table would
 *            make "attack the memorial dog" the best loot rate in the game, and
 *            he is not a resource. Kill him and you get nothing, which is the
 *            correct price.
 *
 *  ⚠ NOT MARKED `boss`. It reads as the right flag and is a trap: a boss kill
 *  carries a guaranteed Resurrection Gem, so flagging him would mean killing
 *  Rocky PAYS you the very thing he gives you for being kind to him. */
export const ROCKY_ROUSED: Enemy = {
  name: 'Rocky',
  flavor: 'He gives you one warning you do not deserve. Then the butterscotch dog is not what is standing there, and whatever wakes up in him is very old and does not blink.',
  type: 'Aetheric Creature',
  abilityPoint: 'Strength 10',
  attack: 'Bite',
  damage: '4D10',
  hp: 255,
  rarity: 'Legendary',
  loot: [],
  traits: ['armored', 'savage', 'fast_regen', 'concussive', 'resist:slashing', 'resist:burn'],
} as unknown as Enemy;

/** Every named-only foe, by lowercased name. `findEnemyByName` falls back here
 *  after the bestiary, so authored content can summon one without any pool,
 *  ratchet or difficulty reference ever seeing it. */
export const NAMED_FOES: Record<string, Enemy> = {
  rocky: ROCKY_ROUSED,
};

/** Resolve a named-only foe, or null. Returns a fresh copy so trait state does
 *  not bleed between scenes — same contract as the bestiary lookup. */
export function findNamedFoe(name: string): Enemy | null {
  const hit = NAMED_FOES[name.toLowerCase().trim()];
  return hit ? (JSON.parse(JSON.stringify(hit)) as Enemy) : null;
}
