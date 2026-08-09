// OTA-1214 — AETHER TECHNIQUES. The mage gap, filled with science.
//
// Owner (2026-08-09): *"I would like to have players get aether powers based off of the
// spells… this fills the mage gap, but these are science not magic."*
//
// ⚠⚠ THE FRAMING IS LOAD-BEARING AND IT IS ALREADY IN THE SOURCE. `tartaria-hack-v2.5.txt`:
// *"Aetheric energy acts like radiation, emanating from materials left behind after the
// empire's fall."* So a technique is not a spell and a practitioner is not a caster — they
// are running a trained procedure on a hazardous energy source, and **they take dose for
// it.** Corruption is the exposure tax, and it is not decoration: `corruptionStatPenalty`
// already subtracts from every skill check at 11+, prices rise, encounters thicken.
//
// Nothing here says cast, spell, mana or magic. Channel, shape, discharge, vent.
//
// ⚠ WHY ONLY FOUR. The orphaned `data/spells/runecasters.json` holds ten, and seven of them
// already exist in the shipped game under other names:
//   • shape_aetherstone / summon_mud_arm / mold_ether → the Aethercraft disciplines
//     (shape / summon / mend), live since OTA-039.
//   • aether_bolt / aether_lance / etheric_pulse → these are RUNECASTERS. A runecaster is
//     an instrument you build and fire; making them techniques too would be the same
//     content twice with two sets of rules.
// Building all ten would have duplicated seven. These are the four with no shipped
// equivalent: a barrier, an evasion, a concealment, and a deliberate overload.

import type { PlayerCharacter } from './types';

export type TechniqueTier = 'Uncommon' | 'Rare' | 'Legendary';

export interface AetherTechnique {
  id: string;
  /** Player-facing name. ⚠ No "spell of", no "cast" — these are procedures. */
  name: string;
  tier: TechniqueTier;
  /** Effective INT required to attempt it at all. From the original spell data. */
  intRequired: number;
  /** Base difficulty before the race ladder. Mirrors the Aethercraft DCs. */
  baseDc: number;
  /** ⚠ THE DOSE. Corruption taken on a SUCCESSFUL channel, scaled by tier (owner: "scale
   *  it"). Failure costs less but is not free — see `dosageFor`. */
  baseDose: number;
  /** One line for the Aetheric tab. */
  effect: string;
  /** What the Arbiter says when it lands. */
  successLine: string;
  /** In-game minutes the procedure takes outside combat. */
  minutes: number;
}

/** ⚠ The four. Ordered by tier so the Aetheric tab reads as a ladder. */
export const AETHER_TECHNIQUES: readonly AetherTechnique[] = [
  {
    id: 'aether_shield',
    name: 'Aether Shield',
    tier: 'Uncommon',
    intRequired: 9,
    baseDc: 12,
    baseDose: 1,
    effect: '+3 AC for 3 rounds. A standing field, held by hand.',
    successLine:
      'The air in front of you thickens and goes faintly bright, the way a heat-haze does. '
      + 'It will hold as long as you keep your attention on it.',
    minutes: 6,
  },
  {
    id: 'temporal_slip',
    name: 'Temporal Slip',
    tier: 'Rare',
    intRequired: 14,
    baseDc: 15,
    baseDose: 3,
    effect: 'Once per encounter, step out of one incoming blow entirely.',
    successLine:
      'You step a half-second sideways. To anything watching you were simply not where the '
      + 'blow went, and the world closes over the gap without comment.',
    minutes: 6,
  },
  {
    id: 'veil_of_ether',
    name: 'Veil of Ether',
    tier: 'Legendary',
    intRequired: 16,
    baseDc: 17,
    baseDose: 4,
    effect: 'The light around you stops arriving. Stealth, until you act.',
    successLine:
      'The light reaching you slows, bends, and declines to leave again. You are still '
      + 'standing there. Nothing can currently prove it.',
    minutes: 10,
  },
  {
    id: 'resonance_cascade',
    name: 'Resonance Cascade',
    tier: 'Legendary',
    intRequired: 18,
    baseDc: 19,
    // ⚠ The heaviest dose in the game by a wide margin, and deliberately so: the original
    // data tags it `forbidden` and prices it at 5d10 out plus 1d10 back into the operator.
    // A technique that hurts you on success is the clearest statement this file can make
    // that aether is a hazard being driven, not a gift being spent.
    baseDose: 8,
    effect: 'A shockwave of driven aether — 5d10 to everything near, and 1d10 back into you.',
    successLine:
      'You let it run. For one second the ruin is lit like a photograph and everything in it '
      + 'is moving away from you. The second one costs you.',
    minutes: 15,
  },
];

export function findTechnique(id: string | null | undefined): AetherTechnique | null {
  if (!id) return null;
  return AETHER_TECHNIQUES.find((t) => t.id === id) ?? null;
}

/** Loose name match, for the parser. Deliberately strict about which techniques it will
 *  answer to — an ambiguous match returns null rather than guessing, the P12 rule. */
export function findTechniqueByName(text: string): AetherTechnique | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = AETHER_TECHNIQUES.find((x) => x.name.toLowerCase() === t);
  if (exact) return exact;
  const hits = AETHER_TECHNIQUES.filter(
    (x) => x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase()),
  );
  return hits.length === 1 ? hits[0]! : null;
}

// ─── Proficiency ────────────────────────────────────────────────────────────────────────
//
// Owner: *"make them grow"*, and on the shape: per-technique rather than one global skill,
// so a character specialises into what they actually practise. A Veil-user and a Cascade-
// user should not be the same person.

/** Practice needed to reach each rank. Rank 0 is "known, never used". */
export const PROFICIENCY_STEPS: readonly number[] = [0, 3, 8, 16, 28];
export const MAX_PROFICIENCY_RANK = PROFICIENCY_STEPS.length - 1;

export function proficiencyRank(uses: number): number {
  let rank = 0;
  for (let i = 1; i < PROFICIENCY_STEPS.length; i++) {
    if (uses >= PROFICIENCY_STEPS[i]!) rank = i;
  }
  return rank;
}

export function proficiencyLabel(rank: number): string {
  return ['Untried', 'Practised', 'Fluent', 'Adept', 'Second Nature'][rank] ?? 'Untried';
}

/** ⚠ Growth makes the procedure EASIER, not stronger. Rank shaves the DC.
 *
 *  Deliberately not a damage or duration bonus: scaling the OUTPUT of a technique that
 *  already costs corruption would push a practised operator toward using the heavy ones
 *  constantly, which is the opposite of what the dose is for. Shaving the DC means practice
 *  buys RELIABILITY — you fail less, so you waste less fuel and take less failure dose. */
export function dcForRank(baseDc: number, rank: number): number {
  return Math.max(5, baseDc - rank);
}

/** ⚠⚠ THE ANTI-FARM GUARD, AND IT IS THE WHOLE REASON THIS IS A FUNCTION.
 *
 *  Growth-through-use is farmable by construction: stand somewhere safe, run the cheapest
 *  technique a hundred times, max the rank. This session has already closed two loops that
 *  paid out on repetition (P2's broker, P13's maze), and building a third would be careless.
 *
 *  Practice only counts when the attempt was a REAL one:
 *    • it SUCCEEDED — failures teach nothing here, and they already cost fuel and dose; and
 *    • it happened UNDER PRESSURE — in combat, or with a live hostile in the scene.
 *
 *  So the way to get good at Temporal Slip is to keep slipping actual blows. Channelling it
 *  at a wall in an empty room is a legal thing to do, costs fuel and corruption, and
 *  teaches nothing — which is also, conveniently, true. */
export function practiceCounts(opts: { success: boolean; underPressure: boolean }): boolean {
  return opts.success && opts.underPressure;
}

// ─── Dose ───────────────────────────────────────────────────────────────────────────────

/** Corruption taken for one channel.
 *
 *  ⚠ Scaled by tier (owner: *"scale it"*) via each technique's own `baseDose`, so Cascade
 *  costs eight times what a Shield does. A FAILED channel still doses — you were still
 *  standing in it — but at half, rounded up, floored at 1. Nobody escapes exposure by being
 *  bad at it; they just get less for the same dose.
 *
 *  ⚠ Aetherborn metabolise it differently (see the mend discipline, which charges them HP
 *  instead), so they take HALF dose here. That is a race trait already established, not a
 *  new exception invented for this file. */
export function dosageFor(
  tech: AetherTechnique,
  opts: { success: boolean; raceId?: string | null },
): number {
  const base = opts.success ? tech.baseDose : Math.max(1, Math.ceil(tech.baseDose / 2));
  if (opts.raceId === 'aetherborn') return Math.max(1, Math.round(base / 2));
  return base;
}

// ─── Knowing a technique ────────────────────────────────────────────────────────────────

export function knowsTechnique(player: PlayerCharacter | null | undefined, id: string): boolean {
  return !!player && (player.knownTechniques ?? []).includes(id);
}

export function usesOf(player: PlayerCharacter | null | undefined, id: string): number {
  return player?.techniqueProficiency?.[id] ?? 0;
}

/** Can this character attempt it at all? Knowing it is not enough — the INT gate is the
 *  same one the original spell data carried (6 → 18), read from EFFECTIVE INT so the Mud
 *  Dweller Aethercraft bonus and any corruption penalty both count. */
export function canAttempt(
  player: PlayerCharacter | null | undefined,
  tech: AetherTechnique,
  effectiveInt: number,
): { ok: true } | { ok: false; reason: 'unknown' | 'int'; needed?: number } {
  if (!knowsTechnique(player, tech.id)) return { ok: false, reason: 'unknown' };
  if (effectiveInt < tech.intRequired) {
    return { ok: false, reason: 'int', needed: tech.intRequired };
  }
  return { ok: true };
}
