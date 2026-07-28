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
}

export const GOLEM_DEFINITIONS: Record<GolemKind, GolemDefinition> = {
  mud_golem: {
    kind: 'mud_golem',
    name: 'Mud Golem',
    // arb119 — the STARTER anchor ("cheap to bind, easiest") was gated by RARE
    // Mudstone, which made the first golem effectively unbuildable. Now fueled by
    // the COMMON mud you actually forage (Aether Mud + Mud Fragment), matching the
    // flavor. Mudstone is reserved for higher-tier mud gear and is refinable from
    // Mud Fragment for anything that still wants it.
    fuel: [
      { name: 'Aether Mud', quantity: 2 },
      { name: 'Mud Fragment', quantity: 2 },
      { name: 'Aether Crystal', quantity: 1 },
    ],
    hpMax: 24, // arb170 — raised from 16 (durability pass)
    attackDie: '1d8',
    attackMod: 1,
    hitBonus: 0,
    damageType: 'bludgeoning',
    blurb: 'Starter anchor. Cheap to bind, modest in every measure.',
    summonDC: 13, // easiest — abundant Aether Mud, low-power binding
    resistBase: 0.15,
    resistCap: 0.35,
  },
  iron_golem: {
    kind: 'iron_golem',
    name: 'Iron Golem',
    fuel: [
      { name: 'Scrap Metal', quantity: 3 },
      { name: 'Golem Core', quantity: 1 },
    ],
    hpMax: 40, // arb170 — raised from 24 (durability pass; the tank build)
    attackDie: '1d8',
    attackMod: 2,
    hitBonus: 1,
    damageType: 'slashing',
    blurb: 'Tank build. Tough frame, steady slashing strikes.',
    summonDC: 15,
    resistBase: 0.30,
    resistCap: 0.50,
  },
  aether_golem: {
    kind: 'aether_golem',
    name: 'Aether Golem',
    fuel: [
      { name: 'Aether Crystal', quantity: 2 },
      { name: 'Aetheric Shard', quantity: 1 },
    ],
    hpMax: 34, // arb170 — raised from 24 (durability pass)
    attackDie: '1d10',
    attackMod: 2,
    hitBonus: 2,
    damageType: 'aetheric',
    blurb: 'Energy striker. Heavy aetheric blows pierce armor.',
    summonDC: 17, // volatile mix, the binding fights you
    resistBase: 0.20,
    resistCap: 0.40,
  },
  crystal_golem: {
    kind: 'crystal_golem',
    name: 'Crystal Golem',
    fuel: [
      { name: 'Aether Crystal', quantity: 2 },
      { name: 'Aetheric Cloth', quantity: 1 },
      { name: 'Aetheric Shard', quantity: 1 },
    ],
    hpMax: 52, // arb170 — raised from 30 (durability pass; apex tank)
    attackDie: '1d12',
    attackMod: 3,
    hitBonus: 3,
    damageType: 'piercing',
    blurb: 'Apex anchor — the hardest to seat and the strongest in every measure.',
    summonDC: 19, // lattice-structured, the hardest to seat
    resistBase: 0.35,
    resistCap: 0.55,
  },
};

/** Lookup a golem definition by kind. */
export function getGolemDefinition(kind: GolemKind): GolemDefinition {
  return GOLEM_DEFINITIONS[kind];
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
// OTA-800 — hard training ceiling, mirroring the player's MAX_TRAINED_STAT
// (statTraining.ts) and the dog twin. Power fed to-hit + damage with no cap and
// each level also bumped max HP by 3, so a patiently-ground golem climbed both
// without bound. The resist cap kept its DEFENSE mortal, but nothing bounded its
// OFFENSE or HP; this does. Reaching 30 is still an extreme grind (~1000 uses/
// point at the top tier).
const GOLEM_MAX_TRAINED_STAT = 30;

/** Read a trained golem stat, tolerating golems summoned before OTA-467. */
export function golemStatBonus(golem: Companion, key: GolemStatKey): number {
  return golem.stats?.[key] ?? 0;
}

/** arb170 — effective % damage resistance (0..1): the kind's innate floor plus a
 *  trained bonus from resilience (+2% per level), hard-capped per kind. Never
 *  reaches 1, and the retaliation path always lands ≥1 damage, so a golem is
 *  durable but never immune (preserves OTA-433's "doesn't trivialize bosses"). */
export function golemDamageResist(golem: Companion): number {
  const def = GOLEM_DEFINITIONS[golem.kind as GolemKind];
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
  // OTA-800 — ceiling reached: stop training (see GOLEM_MAX_TRAINED_STAT).
  if (baseStat >= GOLEM_MAX_TRAINED_STAT) return { golem, leveled: null };
  const award = golemProgressAwardFor(baseStat);
  if (award <= 0) return { golem, leveled: null };
  let progress = statProgress[stat] + award;
  let next = baseStat;
  let leveled: GolemTrainResult['leveled'] = null;
  while (progress >= GOLEM_LEVEL_UP_THRESHOLD && next < GOLEM_MAX_TRAINED_STAT) {
    progress -= GOLEM_LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  if (next >= GOLEM_MAX_TRAINED_STAT) progress = 0;
  // arb170 — TRAINABLE HP: a stat level-up also toughens the frame (+3 max HP,
  // healed to keep the ratio). Power trains on attacking, resilience on surviving
  // a hit, so this is the "trash/mid fights grow it for the boss" loop the player
  // asked for — HP and resist both climb through use. OTA-800 — now bounded by
  // GOLEM_MAX_TRAINED_STAT: HP stops climbing once the stat hits the ceiling
  // (the resist cap + min-1-damage + big boss hits already kept it mortal).
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
  // arb170 — bumped /4 → /3 so a top-up takes fewer parts (eases the
  // material drain), on top of the new out-of-combat self-mend in gameStore.
  return Math.max(4, Math.round(GOLEM_DEFINITIONS[kind].hpMax / 3));
}

/** arb121 — the elemental material tags a golem can mend from as a WEAKER
 *  SUBSTITUTE when you're out of its exact fuel parts. A pack of aether loot can
 *  top up an Aether Golem; mud sludge an mud golem; scrap an iron golem. */
export const GOLEM_ELEMENT_TAGS: Record<GolemKind, readonly string[]> = {
  mud_golem: ['mud'],
  iron_golem: ['metal', 'iron'],
  aether_golem: ['aether', 'aetheric'],
  crystal_golem: ['aether', 'crystal'],
};

/** arb121 — true if `item` is a raw MATERIAL sharing the golem's element (but
 *  not one of its exact fuel parts). Such items mend the golem at a reduced
 *  rate (see golemSubstituteHeal). Restricted to misc/material items so you
 *  can't feed it an aether-tagged WEAPON or armor piece. */
export function isGolemSubstitutePart(
  kind: GolemKind,
  item: { name: string; kind?: string; tags?: readonly string[] },
): boolean {
  // OTA-1023 — canonical kind + tags: a stale aether material fed the golem and
  // NOTHING happened (element tag missing from the snapshot), while the
  // name-based exact-fuel sibling check worked — two rules, one item.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { canonicalItemKind: cik, canonicalItemTags: cit } = require('./crafting') as typeof import('./crafting');
  if (cik(item as Parameters<typeof cik>[0]) !== 'misc') return false; // materials/loot only
  if (isGolemRepairPart(kind, item.name)) return false; // exact fuel → full-heal path
  const el = GOLEM_ELEMENT_TAGS[kind] ?? [];
  return cit(item).some((t) => el.includes(t));
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
