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
    // ⚠ OTA-1218 — REWORDED TO MATCH WHAT SHIPPED. This said "once per encounter", which
    // the implementation cannot honestly claim: the slip is a 3-round status like every
    // other held field, so it can lapse unused and it can be re-channelled in the same
    // fight (for another dose, and another turn). A tab that promises one thing while the
    // engine does another is its own defect, so the text moved to the engine.
    effect: 'Held for 3 rounds. The first blow that would land in that window does not.',
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
 *  answer to — an ambiguous match returns null rather than guessing, the P12 rule.
 *
 *  ⚠⚠ OTA-1223 — A THIRD TIER, tokens, because the parser strips small words. `channel
 *  veil of ether` reaches this as "veil ether", and two tiers of matching could not find
 *  the technique under ITS OWN NAME — the exact dropped-word defect OTA-1211 found in the
 *  contract finders, rebuilt here five days later. Found by the P18 fix's own test.
 *  Same rules as titleMatch.ts: the tier runs only where substring found NOTHING (two
 *  substring hits still REFUSE — "ether" fits both Veil and Shield and must take
 *  neither), and a token tie refuses too. */
export function findTechniqueByName(text: string): AetherTechnique | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = AETHER_TECHNIQUES.find((x) => x.name.toLowerCase() === t);
  if (exact) return exact;
  const hits = AETHER_TECHNIQUES.filter(
    (x) => x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase()),
  );
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) return null;
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  const byTokens = AETHER_TECHNIQUES.filter((x) => {
    const nameTokens = x.name.toLowerCase().split(/[^a-z0-9]+/);
    return words.every((w) => nameTokens.includes(w));
  });
  return byTokens.length === 1 ? byTokens[0]! : null;
}

// ─── OTA-1225 — ENEMIES CHANNEL TOO (PUNCHLIST P16, the mirror) ─────────────────────────
//
// Owner (2026-08-09): *"once this is working we will mirror it to enemies and have them
// applied like the resists are"* — and the resists are TRAITS, stamped per spawn by
// `randomizeEnemyDefense` from type pools and listed in the portrait. So techniques ride
// the identical rail: a `technique:<id>` trait, rolled at spawn, visible before the first
// swing lands.
//
// WHO (owner's ruling, 2026-08-10: *"aether and mud animals, and the faction seeking the
// old ways"*): the aether-natured kinds, the MUD kinds, and any HUMAN fighting for the
// **Tartarian Revivalists** — the faction whose written goal is *"reactivate Tartaria's
// Aetheric Power systems."* A plain raider does not slip time; a Revivalist zealot has
// been practising.
export const ENEMY_TECHNIQUE_POOLS: Record<string, readonly string[]> = {
  'aetheric creature': ['aether_shield', 'veil_of_ether'],
  'aetheric mutation': ['temporal_slip', 'resonance_cascade'],
  'aetheric undead':   ['veil_of_ether', 'aether_shield'],
  'automation':        ['aether_shield', 'temporal_slip'],
  'mechanism':         ['aether_shield', 'temporal_slip'],
  'mech-construct':    ['aether_shield', 'temporal_slip'],
  // waterlogged things that live half-in the silt: the mud hides them, or hardens on them.
  'mud creature':      ['veil_of_ether', 'aether_shield'],
};
export const TECHNIQUE_FACTION = 'tartarian_revivalists';
const REVIVALIST_POOL: readonly string[] = ['aether_shield', 'temporal_slip', 'veil_of_ether'];

/** ⚠ ~1 in 4 eligible spawns (owner: "agree") — the same occasional-not-every-fight feel
 *  as the ~35% hard-wall roll on resists. */
export const ENEMY_TECHNIQUE_RATE = 0.25;

/** The pool an enemy draws from, or null if its kind never channels. ⚠ Bosses excluded —
 *  they keep their authored kits, exactly as `randomizeEnemyDefense` leaves them alone. */
export function enemyTechniquePool(
  enemy: { type?: string | null; factionId?: string | null; boss?: boolean },
): readonly string[] | null {
  if (enemy.boss) return null;
  if (enemy.factionId === TECHNIQUE_FACTION) return REVIVALIST_POOL;
  return ENEMY_TECHNIQUE_POOLS[(enemy.type ?? '').toLowerCase()] ?? null;
}

/** Roll the spawn's technique trait, or null. Pure; rng injectable like the resists. */
export function rollEnemyTechnique(
  enemy: { type?: string | null; factionId?: string | null; boss?: boolean },
  rng: () => number = Math.random,
): string | null {
  const pool = enemyTechniquePool(enemy);
  if (!pool || pool.length === 0) return null;
  if (rng() >= ENEMY_TECHNIQUE_RATE) return null;
  const id = pool[Math.floor(rng() * pool.length)]!;
  return `technique:${id}`;
}

/** Portrait text for the technique-family traits — the promise that the player can READ
 *  the threat before the first swing, exactly as they read the resists. */
export function describeTechniqueTrait(t: string): string | null {
  const [key, arg] = t.split(':');
  const name = (id: string) => findTechnique(id)?.name ?? id;
  if (key === 'technique' && arg) return `Channels: ${name(arg)}`;
  if (key === 'technique_spent' && arg) return `Spent: ${name(arg)}`;
  if (t === 'field:aether_shield') return 'Aether Shield raised (+3 AC)';
  if (t === 'slip_held') return 'Temporal Slip held';
  if (t === 'veiled_strike') return 'Veiled — the next strike comes unseen';
  return null;
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

// ─── Fuel ───────────────────────────────────────────────────────────────────────────────

/** ⚠ OTA-1218 — THE SAME LIST THE `shape` DISCIPLINE USES, IN THE SAME ORDER, AND THAT IS
 *  DELIBERATE. `runAethercraft` picks fuel CHEAPEST-FIRST after OTA-970, where reaching
 *  into inventory order silently ate a playtester's equipped Aetheric Locket. A technique
 *  that reached differently would re-open that bug on a second path, so it reaches the
 *  same way — and the Locket is a detection relic, so it is absent here too.
 *
 *  Exported rather than inlined at the call site so a test can pin the ORDER, which is the
 *  part that carries the fix. */
export const TECHNIQUE_FUEL_PREFERENCE: readonly string[] = [
  'Aether Residue', 'Aether Mud', 'Aether Crystal', 'Aetheric Shard', 'Golem Core',
];

// ─── Acquisition ────────────────────────────────────────────────────────────────────────
//
// Owner, on how a player should come by these: *"make them grow rewards and texts you. an
// buy from friendly vendors you developed repor with"* — three routes. This file ships the
// PURCHASE one, because the rapport gate is the only one of the three that is
// deterministic: `hasFactionRapport` already exists, already has a completed-quest receipt
// behind it, and needs no new drop table or hook to be reachable.
//
// ⚠ It is modelled on the OTA-726 recipe offer, not on an item: buying teaches into
// `knownTechniques` the way buying a working teaches into `knownRecipes`. A physical text
// would need a catalog row, a `use` handler and a read path before it taught anything —
// three more places to end in nothing, for the same outcome.

export const TECHNIQUE_TEXT_PREFIX = 'Procedure Text: ';

/** The row a vendor shows. Named as an object, not a technique, because it is the thing a
 *  player buys — and because `buy aether shield` should not be ambiguous with channelling
 *  one. */
export function techniqueTextName(tech: AetherTechnique): string {
  return `${TECHNIQUE_TEXT_PREFIX}${tech.name}`;
}

/** Priced by tier. A Legendary procedure is a real gold sink; an Uncommon one is roughly a
 *  good weapon, which is the correct comparison — it is a permanent capability. */
export function techniqueTextPrice(tech: AetherTechnique): number {
  return tech.tier === 'Uncommon' ? 250 : tech.tier === 'Rare' ? 600 : 1400;
}

export function findTechniqueByTextName(name: string): AetherTechnique | null {
  const n = name.toLowerCase().trim();
  if (!n.startsWith(TECHNIQUE_TEXT_PREFIX.toLowerCase())) return null;
  const rest = n.slice(TECHNIQUE_TEXT_PREFIX.length).trim();
  return AETHER_TECHNIQUES.find((t) => t.name.toLowerCase() === rest) ?? null;
}

/** ⚠ Stable per faction, not rolled. Deliberately: a text that appears on a die roll turns
 *  the only acquisition route into a slot machine, and the player has no way to tell
 *  "this vendor never sells them" from "not today". A given faction always keeps the same
 *  procedure, so a player who wants Temporal Slip can find out where it lives and go. */
export function techniqueForFaction(factionId: string): AetherTechnique {
  let h = 0;
  for (let i = 0; i < factionId.length; i++) h = (h * 31 + factionId.charCodeAt(i)) >>> 0;
  return AETHER_TECHNIQUES[h % AETHER_TECHNIQUES.length]!;
}

/** ⚠⚠ OTA-1226 (PUNCHLIST P16, route C) — FOUR STORYLINES PAY A PROCEDURE TEXT.
 *
 *  Owner: *"push it through all routes, three doors makes it accessible even with bad
 *  faction standing."* This is the story door: finish the arc, the faction hands you the
 *  written procedure alongside its authored reward — the authored reward is NOT replaced
 *  (removing shipped content to make room would be the P4 defect in reverse).
 *
 *  The pairings are thematic, one per technique, spread across four factions:
 *    Scripture in Stone (Stone Builders, minRep 4) → Aether Shield — wards written in rock,
 *      and deliberately the LOWEST bar for the cheapest technique.
 *    Sasha's Gambit (Revivalists) → Temporal Slip — the old-ways faction whose own
 *      fighters channel it (OTA-1225).
 *    The Silence Protocol (Conspiracy Architects) → Veil of Ether — concealment is their
 *      entire creed.
 *    The Drowned Library (Forgotten Order) → Resonance Cascade — a forbidden procedure
 *      recovered by the scholars who dig such things up.
 *
 *  ⚠ The text TEACHES NOTHING at grant. It is an object; the read path is the teacher and
 *  the INT gate lives there — so a story finished early is a text banked, never wasted. */
export const STORYLINE_TEXT_REWARDS: Record<string, string> = {
  story_builders_scripture_in_stone: 'aether_shield',
  story_revivalist_sashas_gambit: 'temporal_slip',
  story_architect_silence_protocol: 'veil_of_ether',
  story_order_drowned_library: 'resonance_cascade',
};

/** The offer a rapport vendor adds, or null.
 *
 *  Three gates, and the INT one is the interesting one: a text you cannot run is a purchase
 *  that ends in nothing until some later level-up, which is the exact defect this whole
 *  punch list exists for. So the row only appears once the character can actually channel
 *  what it teaches. */
export function techniqueTextOfferFor(opts: {
  vendorFaction: string | null | undefined;
  hasRapport: boolean;
  knownTechniques: readonly string[] | undefined;
  effectiveInt: number;
}): { itemName: string; price: number; quantity: number } | null {
  if (!opts.vendorFaction || !opts.hasRapport) return null;
  const tech = techniqueForFaction(opts.vendorFaction);
  if ((opts.knownTechniques ?? []).includes(tech.id)) return null;
  if (opts.effectiveInt < tech.intRequired) return null;
  return { itemName: techniqueTextName(tech), price: techniqueTextPrice(tech), quantity: 1 };
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
