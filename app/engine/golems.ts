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

import type { Companion, GolemKind } from './types';
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
}

export const GOLEM_DEFINITIONS: Record<GolemKind, GolemDefinition> = {
  mud_golem: {
    kind: 'mud_golem',
    name: 'Mud Golem',
    fuel: [
      { name: 'Aether Mud', quantity: 2 },
      { name: 'Mudstone', quantity: 1 },
      { name: 'Aether Crystal', quantity: 1 },
    ],
    hpMax: 16,
    attackDie: '1d8',
    attackMod: 1,
    hitBonus: 0,
    damageType: 'bludgeoning',
    blurb: 'Starter anchor. Cheap to bind, modest in every measure.',
    summonDC: 13, // easiest — abundant Aether Mud, low-power binding
  },
  iron_golem: {
    kind: 'iron_golem',
    name: 'Iron Golem',
    fuel: [
      { name: 'Scrap Metal', quantity: 3 },
      { name: 'Golem Core', quantity: 1 },
    ],
    hpMax: 24,
    attackDie: '1d8',
    attackMod: 2,
    hitBonus: 1,
    damageType: 'slashing',
    blurb: 'Tank build. Tough frame, steady slashing strikes.',
    summonDC: 15,
  },
  aether_golem: {
    kind: 'aether_golem',
    name: 'Aether Golem',
    fuel: [
      { name: 'Aether Crystal', quantity: 2 },
      { name: 'Aetheric Shard', quantity: 1 },
    ],
    hpMax: 24,
    attackDie: '1d10',
    attackMod: 2,
    hitBonus: 2,
    damageType: 'aetheric',
    blurb: 'Energy striker. Heavy aetheric blows pierce armor.',
    summonDC: 17, // volatile mix, the binding fights you
  },
  crystal_golem: {
    kind: 'crystal_golem',
    name: 'Crystal Golem',
    fuel: [
      { name: 'Aether Crystal', quantity: 2 },
      { name: 'Aetheric Cloth', quantity: 1 },
      { name: 'Aetheric Shard', quantity: 1 },
    ],
    hpMax: 30,
    attackDie: '1d12',
    attackMod: 3,
    hitBonus: 3,
    damageType: 'piercing',
    blurb: 'Apex anchor — the hardest to seat and the strongest in every measure.',
    summonDC: 19, // lattice-structured, the hardest to seat
  },
};

/** Lookup a golem definition by kind. */
export function getGolemDefinition(kind: GolemKind): GolemDefinition {
  return GOLEM_DEFINITIONS[kind];
}

// ----- OTA-478: golem armaments -----------------------------------------------
//
// Craftable melee weapons, one per golem kind. The kind is encoded on the
// weapon's catalog tags as `golem:<kind>` plus a `golem_weapon` marker. These
// pure helpers read tags so the caller (which resolves the catalog) avoids an
// import cycle with crafting.ts.

/** True if a weapon (by its tags) is a golem armament. */
export function isGolemWeapon(weaponTags: readonly string[] | undefined): boolean {
  return (weaponTags ?? []).includes('golem_weapon');
}

/** The golem kind a golem-weapon is built for (from its `golem:<kind>` tag), or
 *  null if it's not a golem weapon / the kind is unknown. */
export function golemWeaponKind(weaponTags: readonly string[] | undefined): GolemKind | null {
  const tag = (weaponTags ?? []).find((t) => t.startsWith('golem:'));
  if (!tag) return null;
  const kind = tag.slice('golem:'.length);
  return (kind in GOLEM_DEFINITIONS) ? (kind as GolemKind) : null;
}

/** Friendly per-kind weapon name, for messages/UI. */
export const GOLEM_WEAPON_NAME: Record<GolemKind, string> = {
  mud_golem: 'Mire Maul',
  iron_golem: 'Sentinel Greatcleaver',
  aether_golem: 'Aetheric Lance',
  crystal_golem: 'Shard Glaive',
};

/** Parse player input like "summon iron golem" / "summon mud" /
 *  "summon golem" → GolemKind. Defaults to mud_golem when only
 *  "golem" is named (backward-compat with the pre-existing
 *  one-type summon path). Returns null when the input doesn't
 *  reference any known golem. */
export function parseGolemKind(text: string): GolemKind | null {
  const t = text.toLowerCase();
  if (t.includes('iron')) return 'iron_golem';
  if (t.includes('aether') && t.includes('golem')) return 'aether_golem';
  if (t.includes('crystal')) return 'crystal_golem';
  if (t.includes('mud') || t.includes('golem')) return 'mud_golem';
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
  return {
    golem: {
      ...golem,
      stats: { ...stats, [stat]: next },
      statProgress: { ...statProgress, [stat]: progress },
    },
    leveled,
  };
}

/** OTA-466 — the material names a golem is BUILT from (its summon fuel set).
 *  A golem is repaired by feeding it these same parts. Returns the distinct
 *  part names for the kind. */
export function golemRepairParts(kind: GolemKind): string[] {
  return Array.from(new Set(GOLEM_DEFINITIONS[kind].fuel.map((f) => f.name)));
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
  return Math.max(3, Math.round(GOLEM_DEFINITIONS[kind].hpMax / 4));
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
