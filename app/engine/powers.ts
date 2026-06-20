// engine_Dev — data-driven powers (the magic / ability system). The built-in
// Aethercraft disciplines are just the DEFAULT_POWERS; an uploaded 'powers' table
// REPLACES them, so a re-skinned game defines its OWN powers — name, cast phrases,
// fuel (referencing your items/materials), DC, and stat. The actual effect a power
// runs is one of the engine's coded primitives, selected by `discipline`:
//   shape  → in-combat AC ward / out-of-combat item transform
//   summon → summon a construct ally (golem roster)
//   mend   → heal HP (race-dependent cost)
// (Stage 2 will add more effect primitives — damage / status / debuff — so powers
// can do things like a fog blind. Stage 1 makes the DEFINITIONS data.)

import { resolveTable } from './contentPack';

export type PowerDiscipline = 'shape' | 'summon' | 'mend';

export interface Power {
  id: string;
  /** Routes the cast to the coded effect primitive. */
  discipline: PowerDiscipline;
  /** Short display name used in narration / logs. */
  name: string;
  /** Crafting-screen card title. */
  title: string;
  /** Crafting-screen card body (rules text). */
  body: string;
  /** Skill-check stat. */
  stat: 'intelligence' | 'wisdom';
  /** Base DC before the race modifier (summon may override per-construct). */
  dcBase: number;
  /** Item names this power can burn as fuel (shape / mend). Summon uses its
   *  construct recipe instead. */
  fuels: string[];
  /** Cast phrases shown on the card + queued into the input box. */
  examples: string[];
  /** Summon-only: render the per-construct variant rows in the UI. */
  showGolemVariants?: boolean;
}

/** The built-in Tartaria Aethercraft disciplines — the default power set. */
export const DEFAULT_POWERS: Power[] = [
  {
    id: 'aether_shape',
    discipline: 'shape',
    name: 'Aetherstone Manipulation',
    title: 'Aetherstone Manipulation (shape)',
    body:
      'INT check, DC 12. In combat: +4 AC for one turn (shaped-stone ward). Out of combat: ' +
      'binds an Aetheric Shard to a Small Rock, producing a throwable Shaped Aetheric Shard. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    stat: 'intelligence',
    dcBase: 12,
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Aether Mud', 'Aether Residue', 'Golem Core', 'Aetheric Locket'],
    examples: ['shape stone', 'mold the aetherstone', 'manipulate stone'],
  },
  {
    id: 'aether_summon',
    discipline: 'summon',
    name: 'Aether Golem Constructor',
    title: 'Aether Golem Constructor (summon)',
    body:
      'INT check, DC 15 (harder than the other two — golems take stronger anchors). Summons ' +
      'a golem ally that fights for you for the rest of the scene. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    stat: 'intelligence',
    dcBase: 15,
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Golem Core'],
    examples: ['summon golem', 'summon an aether golem', 'call a golem'],
    showGolemVariants: true,
  },
  {
    id: 'aether_mend',
    discipline: 'mend',
    name: 'Aetheric Healing',
    title: 'Aetheric Healing (mend)',
    body:
      'WIS check, DC 12. Restores HP to you or an ally. Aetherborn pay HP instead of corruption ' +
      'when they cast this — racial trait. Mud Dwellers and Aetherborn cast at the base DC; ' +
      'every other race rolls +4 harder.',
    stat: 'wisdom',
    dcBase: 12,
    fuels: ['Aetheric Shard', 'Aether Crystal'],
    examples: ['mend wounds', 'heal me', 'mend self', 'aetheric healing'],
  },
];

/** The active power set — uploaded 'powers' override or the built-in default. */
export function getPowers(): readonly Power[] {
  return resolveTable<Power>('powers', DEFAULT_POWERS);
}

/** The active power for a coded effect primitive (the dispatch routes by this).
 *  Returns the FIRST power with that discipline, or undefined if the author's
 *  set has none (then the dispatch falls back to its built-in defaults). */
export function powerForDiscipline(d: PowerDiscipline): Power | undefined {
  return getPowers().find((p) => p && p.discipline === d);
}
