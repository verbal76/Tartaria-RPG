// 2026-05-25 [MECHANIC-1b] — Golem sidekick definitions.
//
// Each entry maps a GolemKind to:
//   - display label
//   - summoning fuel cost (consumed from inventory on cast)
//   - base HP / hpMax (the companion's health pool, tracked
//     separately from the player's HP)
//   - attack profile (damage die, flat mod, hit bonus, damage type)
//
// The runAethercraft 'summon' branch reads from this table when
// the player casts e.g. `summon iron golem`. Mud Golem is the
// default when the player types just `summon golem`.
//
// To add a new golem type: add to GolemKind in types.ts, append
// here, optionally surface in the recipe-list UI so the player
// can see what fuel each variant needs.

import type { Companion, GolemKind, Rarity } from './types';
import type { GolemStatKey } from './types';

export interface GolemRecipeFuel {
  /** Item name as written in the catalog (materials.json). */
  name: string;
  quantity: number;
}

export interface GolemDefinition {
  kind: GolemKind;
  name: string;
  /** Fuel set consumed from inventory on successful summon. */
  fuel: GolemRecipeFuel[];
  /** Base stats. The summon path copies these into Companion. */
  hpMax: number;
  attackDie: string;
  attackMod: number;
  hitBonus: number;
  damageType: 'bludgeoning' | 'slashing' | 'piercing' | 'aetheric';
  /** Short one-line flavor description for the UI / summon log. */
  blurb: string;
  /** OTA-137 — per-golem summon DC. The Aethercraft cast rolls
   *  d20 + INT vs this DC. When unset, runAethercraft falls back to
   *  the historical flat 15 (summon) / 12 (shape/mend). Defaults
   *  ship: Mud 13 (easiest — abundant Aether Mud, low-power
   *  binding), Iron 15 (baseline — matches old default), Aether 17
   *  (volatile mix, the binding fights you), Crystal 19 (lattice-
   *  structured, the hardest to seat). Per-race modifiers
   *  (raceMechanics.aethercraftDcModifier) still apply on top. */
  summonDC?: number;
  /** arb170 — innate % damage resistance (0..1) baked in at summon, scaled to how
   *  hard the kind is to build. `resistBase` is the floor a fresh golem ships with;
   *  training resilience raises the effective resist up to `resistCap` (never
   *  immunity — see golemDamageResist + the retaliation min-1-damage rule). */
  resistBase: number;
  resistCap: number;
  /** engine_Dev — words the player can type after "summon" to call THIS sidekick
   *  (e.g. ['phase', 'phase automaton']). parseGolemKind matches the longest alias
   *  first. When omitted, the kind's own name words are used. */
  aliases?: string[];
  /** engine_Dev — raw-material tags this sidekick can mend from as a weaker
   *  substitute when its exact fuel parts are out (replaces the built-in
   *  GOLEM_ELEMENT_TAGS for uploaded summons). */
  elementTags?: string[];
}

// engine_Dev — the built-in sidekick ("golem") definitions moved to
// app/data/summons/builtin-sidekicks.json so the engine carries no hardcoded
// setting strings. They are the LAST-RESORT fallback only: an uploaded "summons"
// pack replaces them, and the generic-default pack supplies generic sidekicks for
// a reskin. The summon / weapon / skill MECHANICS below are unchanged.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import builtinSidekickData from '../data/summons/builtin-sidekicks.json';

export const GOLEM_DEFINITIONS: Record<GolemKind, GolemDefinition> =
  (builtinSidekickData as { definitions: Record<GolemKind, GolemDefinition> }).definitions;

// engine_Dev — DATA-DRIVEN summon set. An uploaded "summons" pack (via the dev
// console's SUMMONED SIDEKICKS box) replaces the built-in golems wholesale; the
// built-in four are the default (Tartaria's golems — never used by a reskin that
// uploads its own). Resolved at call time so an upload after boot is honored.
//
// The override is read through contentPack.getSummonsOverride(). Importing it
// lazily (require) avoids a static import cycle (contentPack → … → golems).
function readSummonsOverride(): { noun?: string; defs: GolemDefinition[] } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cp = require('./contentPack') as typeof import('./contentPack');
    // resolveSummons = uploaded pack → generic-default sidekicks → null, so a
    // reskin that skips the box falls to generic sidekicks, not Tartaria golems.
    return cp.resolveSummons?.() ?? null;
  } catch {
    return null;
  }
}

/** The active sidekick definitions — uploaded set if present, else the built-in four. */
export function resolveGolemDefs(): GolemDefinition[] {
  const ov = readSummonsOverride();
  if (ov && Array.isArray(ov.defs) && ov.defs.length > 0) return ov.defs;
  return Object.values(GOLEM_DEFINITIONS);
}

/** The category noun the player types after "summon" and reads in summon lines
 *  ("sidekick" by default; an uploaded pack can set "automaton", "construct",
 *  "golem", …). */
export function getSummonNoun(): string {
  const ov = readSummonsOverride();
  const n = ov?.noun?.trim();
  return n && n.length > 0 ? n : 'sidekick';
}

/** Lookup a sidekick definition by kind, resolving against the active set. Falls
 *  back to the first active def (never undefined) so a stale saved kind still
 *  renders rather than crashing. */
export function getGolemDefinition(kind: GolemKind): GolemDefinition {
  const defs = resolveGolemDefs();
  return defs.find((d) => d.kind === kind) ?? defs[0]!;
}

// ----- OTA-481: golem armaments ----------------------------------------------
//
// Craftable two-handed melee weapons (a Sledge / a Greatsword) that ANY golem can
// wield — the player picks the form (bludgeoning vs slashing) and coats it. Marked
// with a `golem_weapon` tag. This pure helper reads tags so the caller (which
// resolves the catalog) avoids an import cycle with crafting.ts.

/** True if a weapon (by its tags) is a golem armament — wieldable by any golem. */
export function isGolemWeapon(weaponTags: readonly string[] | undefined): boolean {
  return (weaponTags ?? []).includes('golem_weapon');
}

/** Parse player input like "summon iron golem" / "summon mud" / "summon phase
 *  automaton" → the matching sidekick kind, resolved against the ACTIVE summon set
 *  (uploaded or built-in). Each def's aliases (longest first) + its kind token + its
 *  name words are matched. When only the bare category noun is named (e.g. "summon
 *  golem" / "summon automaton"), defaults to the FIRST active def — backward-compat
 *  with the pre-existing one-type path. Returns null when nothing matches. */
export function parseGolemKind(text: string): GolemKind | null {
  const t = text.toLowerCase();
  const defs = resolveGolemDefs();
  // Build (alias → kind) candidates, longest alias first so "iron golem" beats "iron".
  const cands: { needle: string; kind: GolemKind }[] = [];
  for (const d of defs) {
    for (const a of d.aliases ?? []) cands.push({ needle: a.toLowerCase(), kind: d.kind });
    cands.push({ needle: d.kind.toLowerCase().replace(/_/g, ' '), kind: d.kind });
    for (const w of d.name.toLowerCase().split(/\s+/)) {
      if (w && w !== getSummonNoun().toLowerCase()) cands.push({ needle: w, kind: d.kind });
    }
  }
  cands.sort((a, b) => b.needle.length - a.needle.length);
  for (const c of cands) {
    if (c.needle && t.includes(c.needle)) return c.kind;
  }
  // Bare category noun ("summon sidekick" / "summon automaton") → first active
  // def. (A built-in golem def still matches via its name words above, so
  // "summon golem" keeps working without a hardcoded noun here.)
  if (t.includes(getSummonNoun().toLowerCase())) return defs[0]?.kind ?? null;
  return null;
}

/** Build a fresh Companion record from a definition. summonedAt
 *  is stamped at call time. */
export function makeCompanion(def: GolemDefinition): Companion {
  return {
    kind: def.kind,
    name: def.name,
    hp: def.hpMax,
    hpMax: def.hpMax,
    attackDie: def.attackDie,
    attackMod: def.attackMod,
    hitBonus: def.hitBonus,
    damageType: def.damageType,
    summonedAt: Date.now(),
    // OTA-467 — trainable stats start at 0; a kept-alive golem grows them.
    stats: { power: 0, resilience: 0 },
    statProgress: { power: 0, resilience: 0 },
  };
}

// ----- OTA-467: golem stat progression (mirrors dogCompanion.trainDogStat) ----
//
// A golem that survives combat builds POWER (to-hit + damage) and RESILIENCE
// (damage reduction). Same per-tier diminishing-returns curve and 100-progress
// level-up threshold as the dog, so the two companions level on identical math.
// This is the incentive to repair + keep a golem rather than re-summon a base one.

function golemProgressAwardFor(currentStat: number): number {
  if (currentStat <= 5)  return 3;
  if (currentStat <= 10) return 2;
  if (currentStat <= 14) return 1;
  if (currentStat <= 18) return 0.5;
  if (currentStat <= 22) return 0.25;
  return 0.1;
}

const GOLEM_LEVEL_UP_THRESHOLD = 100;

/** Read a trained golem stat, tolerating golems summoned before OTA-467. */
export function golemStatBonus(golem: Companion, key: GolemStatKey): number {
  return golem.stats?.[key] ?? 0;
}

/** arb170 — effective % damage resistance (0..1): the kind's innate floor plus a
 *  trained bonus from resilience (+2% per level), hard-capped per kind. Never
 *  reaches 1, and the retaliation path always lands ≥1 damage, so a golem is
 *  durable but never immune (preserves OTA-433's "doesn't trivialize bosses"). */
export function golemDamageResist(golem: Companion): number {
  const def = getGolemDefinition(golem.kind);
  if (!def) return 0;
  const trained = (golem.stats?.resilience ?? 0) * 0.02;
  return Math.min(def.resistCap ?? 0, (def.resistBase ?? 0) + trained);
}

export interface GolemTrainResult {
  golem: Companion;
  leveled: { stat: GolemStatKey; from: number; to: number } | null;
}

/** Train one golem stat on a successful action. Failures don't train. Preserves
 *  hp and every other field — only stats/statProgress change. */
export function trainGolemStat(
  golem: Companion,
  stat: GolemStatKey,
  success: boolean,
): GolemTrainResult {
  if (!success) return { golem, leveled: null };
  const stats = golem.stats ?? { power: 0, resilience: 0 };
  const statProgress = golem.statProgress ?? { power: 0, resilience: 0 };
  const baseStat = stats[stat];
  const award = golemProgressAwardFor(baseStat);
  if (award <= 0) return { golem, leveled: null };
  let progress = statProgress[stat] + award;
  let next = baseStat;
  let leveled: GolemTrainResult['leveled'] = null;
  while (progress >= GOLEM_LEVEL_UP_THRESHOLD) {
    progress -= GOLEM_LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  // arb170 — TRAINABLE HP: a stat level-up also toughens the frame (+3 max HP,
  // healed to keep the ratio). Power trains on attacking, resilience on surviving
  // a hit, so this is the "trash/mid fights grow it for the boss" loop the player
  // asked for — HP and resist both climb through use. (No cap here; the resist
  // cap + min-1-damage + big boss hits keep a maxed golem mortal — see
  // golemDamageResist and the retaliation rule.)
  const HP_PER_LEVEL = 3;
  const hpBump = leveled ? HP_PER_LEVEL : 0;
  return {
    golem: {
      ...golem,
      stats: { ...stats, [stat]: next },
      statProgress: { ...statProgress, [stat]: progress },
      hpMax: golem.hpMax + hpBump,
      hp: golem.hp + hpBump,
    },
    leveled,
  };
}

/** OTA-466 — the material names a golem is BUILT from (its summon fuel set).
 *  A golem is repaired by feeding it these same parts. Returns the distinct
 *  part names for the kind. */
export function golemRepairParts(kind: GolemKind): string[] {
  return Array.from(new Set(getGolemDefinition(kind).fuel.map((f) => f.name)));
}

/** OTA-466 — true if `itemName` is one of the parts this golem is made of
 *  (case-insensitive). Only constituent parts can repair it. */
export function isGolemRepairPart(kind: GolemKind, itemName: string): boolean {
  const lower = itemName.toLowerCase().trim();
  return golemRepairParts(kind).some((p) => p.toLowerCase() === lower);
}

/** OTA-466 — HP restored per constituent part fed to a golem. Scales with the
 *  golem's size so a few of its own parts mend it: Mud 4, Iron/Aether 6,
 *  Crystal 8 (~3–4 parts for a full repair from near-dead). */
export function golemRepairHeal(kind: GolemKind): number {
  // arb170 — bumped /4 → /3 so a top-up takes fewer parts (eases the
  // material drain), on top of the new out-of-combat self-mend in gameStore.
  return Math.max(4, Math.round(getGolemDefinition(kind).hpMax / 3));
}

/** arb121 — the elemental material tags a golem can mend from as a WEAKER
 *  SUBSTITUTE when you're out of its exact fuel parts. A pack of aether loot can
 *  top up an Aether Golem; mud sludge an mud golem; scrap an iron golem.
 *  engine_Dev — built-in fallback only; uploaded summons carry their own
 *  `elementTags`. Read via golemElementTags(kind), not this map directly. */
export const GOLEM_ELEMENT_TAGS: Record<string, readonly string[]> = {
  mud_golem: ['mud'],
  iron_golem: ['metal', 'iron'],
  aether_golem: ['aether', 'aetheric'],
  crystal_golem: ['aether', 'crystal'],
};

/** engine_Dev — the substitute-mend material tags for a kind, resolving the
 *  active def's `elementTags` first (uploaded summons), then the built-in map. */
export function golemElementTags(kind: GolemKind): readonly string[] {
  const def = getGolemDefinition(kind);
  if (def?.elementTags && def.elementTags.length > 0) return def.elementTags;
  return GOLEM_ELEMENT_TAGS[kind] ?? [];
}

/** arb121 — true if `item` is a raw MATERIAL sharing the golem's element (but
 *  not one of its exact fuel parts). Such items mend the golem at a reduced
 *  rate (see golemSubstituteHeal). Restricted to misc/material items so you
 *  can't feed it an aether-tagged WEAPON or armor piece. */
export function isGolemSubstitutePart(
  kind: GolemKind,
  item: { name: string; kind?: string; tags?: readonly string[] },
): boolean {
  if (item.kind && item.kind !== 'misc') return false; // materials/loot only
  if (isGolemRepairPart(kind, item.name)) return false; // exact fuel → full-heal path
  const el = golemElementTags(kind);
  return (item.tags ?? []).some((t) => el.includes(t.toLowerCase()));
}

/** arb122 — HP a SUBSTITUTE material restores, SCALED BY RARITY so a pinch of
 *  garbage scrap isn't worth half a true part. Fraction of a full fuel part:
 *  Common/untiered ¼, Uncommon ½, Rare ¾, Legendary full. Aether Golem (full 6):
 *  Common 1, Uncommon 3, Rare 4, Legendary 6. Min 1 so a feed always does
 *  *something*. */
export function golemSubstituteHeal(kind: GolemKind, rarity?: Rarity | null): number {
  const full = golemRepairHeal(kind);
  const frac = rarity === 'Legendary' ? 1
    : rarity === 'Rare' ? 0.75
    : rarity === 'Uncommon' ? 0.5
    : 0.25; // Common / untiered = garbage tier
  return Math.max(1, Math.floor(full * frac));
}

/** Validate that the player's inventory holds the full fuel set.
 *  Returns the names of missing items (empty array when fully
 *  funded). Used by the summon handler before the skill check. */
export function missingFuelFor(
  def: GolemDefinition,
  inventory: ReadonlyArray<{ name: string; quantity: number }>,
): string[] {
  const missing: string[] = [];
  for (const need of def.fuel) {
    const held = inventory
      .filter((i) => i.name.toLowerCase() === need.name.toLowerCase())
      .reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    if (held < need.quantity) {
      const short = need.quantity - held;
      missing.push(`${need.name} (need ${short} more)`);
    }
  }
  return missing;
}

/** Consume the fuel set from inventory. Returns the new inventory
 *  array. Caller should only invoke after missingFuelFor returns
 *  []. */
export function consumeFuel<T extends { name: string; quantity: number }>(
  def: GolemDefinition,
  inventory: readonly T[],
): T[] {
  const remaining: Record<string, number> = {};
  for (const f of def.fuel) {
    remaining[f.name.toLowerCase()] = f.quantity;
  }
  return inventory
    .map((item) => {
      const key = item.name.toLowerCase();
      const owe = remaining[key] ?? 0;
      if (owe <= 0) return { ...item };
      const take = Math.min(owe, item.quantity);
      remaining[key] = owe - take;
      return { ...item, quantity: item.quantity - take };
    })
    .filter((i) => i.quantity > 0);
}
