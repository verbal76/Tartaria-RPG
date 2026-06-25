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
// eslint-disable-next-line @typescript-eslint/no-var-requires
import defaultPowersData from '../data/powers/default-powers.json';

export type PowerDiscipline = 'shape' | 'summon' | 'mend';

/** Enemy coating-DOT kinds the combat round already ticks (reused by powers). */
export type EnemyCoating =
  | 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat';

/** Stage 2 — a power's effect. Absent → the engine runs the `discipline`
 *  primitive (shape ward/transform, summon construct, mend heal). Present → the
 *  engine runs this instead, so authors can define new powers (e.g. a fog that
 *  damages every enemy over time) without code. */
export type PowerEffect =
  | {
      /** Damage-over-time on enemies via the combat coating system (the "fog"). */
      kind: 'coat_enemies';
      coating: EnemyCoating;
      dmgPerTurn: number;
      turns: number;
      /** 'all' = every living enemy (default), 'active' = the targeted one. */
      target?: 'all' | 'active';
    }
  | {
      /** Heal the caster. */
      kind: 'heal_self';
      /** Dice expression like "2d6". */
      dice: string;
    };

export interface Power {
  id: string;
  /** Routes the cast to the coded effect primitive (used when `effect` absent). */
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
  /** Item names this power can burn as fuel (shape / mend / custom effects).
   *  Summon uses its construct recipe instead. */
  fuels: string[];
  /** Cast phrases shown on the card + queued into the input box; also how the
   *  parser routes a typed cast to this power. */
  examples: string[];
  /** Optional Stage-2 custom effect; when present it overrides the discipline. */
  effect?: PowerEffect;
  /** Summon-only: render the per-construct variant rows in the UI. */
  showGolemVariants?: boolean;
}

/** The built-in (Tartaria) disciplines — the LAST-RESORT default power set. Moved
 *  to app/data/powers/default-powers.json so the engine carries no hardcoded
 *  setting strings; an uploaded 'powers' table or the generic-default pack
 *  (GENERIC_POWERS) takes precedence. */
export const DEFAULT_POWERS: Power[] = (defaultPowersData as { powers: Power[] }).powers;

/** engine_Dev — GENERIC, setting-neutral versions of the three disciplines. Used
 *  both for the dev-console TEMPLATE and as the generic-default pack's power set
 *  (GENERIC_GAME.tables.powers), so a reskin that skips the Powers box gets these
 *  bland disciplines — Stone Shaping / Construct Summoning / Mending — rather than
 *  Tartaria's Aetherstone/Aether-golem set. Same disciplines / stats / DCs. */
export const GENERIC_POWERS: Power[] = [
  {
    id: 'shape_power', discipline: 'shape', name: 'Stone Shaping', title: 'Stone Shaping (shape)',
    body: 'INT check, DC 12. In combat: +4 AC for one turn (a shaped ward). Out of combat: binds a crystal shard to a small rock, producing a throwable shaped shard. Power affinity (set per race) adjusts the DC.',
    stat: 'intelligence', dcBase: 12, fuels: ['Raw Crystal', 'Worked Crystal', 'Common Residue'], examples: ['shape stone', 'mold the stone', 'manipulate stone'],
  },
  {
    id: 'summon_power', discipline: 'summon', name: 'Construct Summoning', title: 'Construct Summoning (summon)',
    body: 'INT check, DC 15 (harder than the others — constructs take stronger anchors). Summons a construct ally that fights for you for the rest of the scene. Power affinity (set per race) adjusts the DC.',
    stat: 'intelligence', dcBase: 15, fuels: ['Raw Crystal', 'Worked Crystal'], examples: ['summon construct', 'summon a construct', 'call a construct'], showGolemVariants: true,
  },
  {
    id: 'mend_power', discipline: 'mend', name: 'Mending', title: 'Mending (mend)',
    body: 'WIS check, DC 12. Restores HP to you or an ally. Power affinity (set per race) adjusts the DC.',
    stat: 'wisdom', dcBase: 12, fuels: ['Raw Crystal', 'Worked Crystal'], examples: ['mend wounds', 'heal me', 'mend self'],
  },
];

/** The dev-console TEMPLATE: a GENERIC discipline set PLUS two example custom-effect
 *  powers (a damaging "fog" over all enemies, and a self-heal) so the author sees
 *  how to define new powers. Not part of the live default — only the template. */
export const POWERS_TEMPLATE: Power[] = [
  ...GENERIC_POWERS,
  {
    id: 'example_fog',
    discipline: 'shape',
    name: 'Choking Fog (EXAMPLE — edit me)',
    title: 'Choking Fog (custom)',
    body: 'EXAMPLE custom power. INT check, DC 12. Rolls a damaging fog over every enemy (damage-over-time). Change the fuel to your own resource item; tune dmgPerTurn/turns.',
    stat: 'intelligence',
    dcBase: 12,
    fuels: ['REPLACE-with-your-resource-item'],
    examples: ['call the fog', 'choking fog'],
    effect: { kind: 'coat_enemies', coating: 'corruption_coat', dmgPerTurn: 3, turns: 3, target: 'all' },
  },
  {
    id: 'example_patch',
    discipline: 'mend',
    name: 'Field Dressing (EXAMPLE — edit me)',
    title: 'Field Dressing (custom)',
    body: 'EXAMPLE custom power. WIS check, DC 12. Heals you for 2d6.',
    stat: 'wisdom',
    dcBase: 12,
    fuels: ['REPLACE-with-your-resource-item'],
    examples: ['patch up', 'field dressing'],
    effect: { kind: 'heal_self', dice: '2d6' },
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

/** Data-driven cast routing: match a typed cast ("call the fog", "summon golem")
 *  against the active powers' `examples`. Returns the best-matching power, or
 *  null. Longer example phrases win (more specific), so "summon iron golem"
 *  beats a generic "summon". Used by the parser before the built-in keyword
 *  fallback. */
export function matchPower(castText: string): Power | null {
  const t = castText.toLowerCase().trim();
  if (!t) return null;
  let best: { power: Power; len: number } | null = null;
  for (const p of getPowers()) {
    if (!p || !Array.isArray(p.examples)) continue;
    for (const ex of p.examples) {
      if (typeof ex !== 'string') continue;
      const e = ex.toLowerCase().trim();
      if (!e) continue;
      if (t.includes(e) || e.includes(t)) {
        if (!best || e.length > best.len) best = { power: p, len: e.length };
      }
    }
  }
  return best?.power ?? null;
}
