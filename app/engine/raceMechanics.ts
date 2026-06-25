// Race-driven mechanics that fire at runtime (not just at character
// creation). The data lives in app/data/races/races.json; until OTA 038
// only the character-creation literal fields (baseAC, startingHPBonus,
// starting TC) were plumbed. This module is the new pipe that pulls
// barehand damage, conditional AC bonuses, and racial stat bumps from
// the race entry every time combat or a skill check fires.
//
// Why this file exists (not in character.ts): keeps character.ts focused
// on creation-time logic; this module is queried per-action.

import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import type { PlayerCharacter, Race, Faction, Stats } from './types';
import { resolveTable } from './contentPack';

// Structural-typed scene snapshot. CurrentScene lives inline in
// gameStore.ts and isn't exported; we accept any object with the
// fields we actually need so we don't have to depend on the store.
interface SceneContext {
  location?: { tags?: string[]; type?: string } | null;
  microMicroId?: string | null;
}

const RACES = racesData as Race[];
const FACTIONS = factionsData as Faction[];

// engine_Dev — resolve through the content pack so a re-skin's UPLOADED races /
// factions drive every mechanic (stat bonuses, AC, abilities), not just the
// built-in Tartaria rows. No override → the built-in data.
function getRace(raceId: string | undefined): Race | undefined {
  if (!raceId) return undefined;
  return (resolveTable('races', RACES) as Race[]).find((r) => r.id === raceId);
}

function getFaction(factionId: string | undefined): Faction | undefined {
  if (!factionId) return undefined;
  return (resolveTable('factions', FACTIONS) as Faction[]).find((f) => f.id === factionId);
}

/** engine_Dev — always-on stat bumps from the player's FACTION (mirrors
 *  racialStatBonusesFor). Empty when the faction has no factionStatBonuses. */
export function factionStatBonusesFor(factionId: string | undefined): RacialStatBonuses {
  const faction = getFaction(factionId);
  return (faction?.factionStatBonuses as RacialStatBonuses | undefined) ?? {};
}

const lc = (a: readonly string[] | undefined): string[] => (a ?? []).map((s) => String(s).toLowerCase());

/** engine_Dev — damage types the PLAYER resists / is weak to from their race +
 *  faction rows (armor + potion resists are layered on at the combat site). The
 *  player carries no innate weakness unless a race/faction declares one. */
export function playerRaceFactionResists(player: PlayerCharacter): { resist: string[]; weak: string[] } {
  const race = getRace(player.raceId);
  const faction = getFaction(player.factionId);
  return {
    resist: [...lc(race?.resist), ...lc(faction?.resist)],
    weak: [...lc(race?.weak), ...lc(faction?.weak)],
  };
}

// ─── Barehand damage ────────────────────────────────────────────────
// Parses race.barehandDamage strings:
//   "1d6"           → { count: 1, sides: 6, bonus: 0 }
//   "1d6 +2"        → { count: 1, sides: 6, bonus: 2 }
//   "1d6-3"         → { count: 1, sides: 6, bonus: -3 }
//   "1d10 even/odd roll to land" → { count: 1, sides: 10, bonus: 0, hitGate: 'even' }
// hitGate captures the Architectural Sentinel "only lands on even"
// rule. The combat path can choose whether to honor it (OTA 038 reads
// it but does not yet branch on it — full Sentinel gating arrives in
// a follow-up alongside per-day powers).
export interface BarehandSpec {
  count: number;
  sides: number;
  bonus: number;
  hitGate?: 'even' | 'odd';
}

const DEFAULT_BAREHAND: BarehandSpec = { count: 1, sides: 6, bonus: 0 };

export function barehandDamageFor(raceId: string | undefined): BarehandSpec {
  const race = getRace(raceId);
  if (!race?.barehandDamage) return DEFAULT_BAREHAND;
  const raw = race.barehandDamage.trim().toLowerCase();
  // "1d10 even/odd roll to land" — Architectural Sentinel
  if (/even\/odd|odd\/even/.test(raw)) {
    const m = /(\d+)\s*d\s*(\d+)/.exec(raw);
    if (!m) return DEFAULT_BAREHAND;
    return {
      count: parseInt(m[1]!, 10),
      sides: parseInt(m[2]!, 10),
      bonus: 0,
      hitGate: 'even',
    };
  }
  // Plain "XdY" or "XdY +N" / "XdY-N"
  const m = /(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/.exec(raw);
  if (!m) return DEFAULT_BAREHAND;
  const count = parseInt(m[1]!, 10);
  const sides = parseInt(m[2]!, 10);
  const bonusRaw = m[3] ? m[3].replace(/\s+/g, '') : '0';
  const bonus = parseInt(bonusRaw, 10);
  return { count, sides, bonus: Number.isNaN(bonus) ? 0 : bonus };
}

// OTA 041 — Sentinel barehand hit-gate enforcement. Returns true when
// the natural damage roll doesn't satisfy the spec's even/odd gate,
// meaning the strike should be converted to a clean miss before any
// damage applies. Returns false when there's no gate or the gate is
// satisfied (i.e. the hit lands normally).
export function barehandGateBlocks(spec: BarehandSpec, naturalRoll: number): boolean {
  if (!spec.hitGate) return false;
  if (!Number.isFinite(naturalRoll)) return false;
  const rolledEven = naturalRoll % 2 === 0;
  const wantsEven = spec.hitGate === 'even';
  return rolledEven !== wantsEven;
}

// ─── Conditional AC bonuses ─────────────────────────────────────────
// Each race entry has a `racialACBonus` description string AND (after
// OTA 038) an optional `racialACBonusRules` structured field. The
// rules are tag-matched against the current scene context.

export type ACBonusCondition =
  | 'underground'
  | 'dark'
  | 'confined'
  | 'runic_gear'
  | 'energy_powers'
  | 'constructed_environment'
  | 'relic_armor';

interface ACBonusRule {
  condition: ACBonusCondition;
  delta: number;
}

function getACBonusRules(race: Race | undefined): ACBonusRule[] {
  if (!race) return [];
  // The field is optional; TS doesn't know about it yet so we widen.
  const rules = (race as Race & { racialACBonusRules?: ACBonusRule[] }).racialACBonusRules;
  return Array.isArray(rules) ? rules : [];
}

// Detects which AC-bonus conditions the current scene/equipment combo
// satisfies. Cheap predicate set; called from effectiveAC per attack.
export function detectACContexts(
  player: PlayerCharacter,
  scene: SceneContext | null,
): Set<ACBonusCondition> {
  const set = new Set<ACBonusCondition>();
  if (!scene) return set;
  const locTags = scene.location?.tags ?? [];
  const microMicroId = scene.microMicroId ?? '';
  const microMicroLower = microMicroId.toLowerCase();

  // Underground / dark — buried cities, mud-dweller tunnels, etc.
  if (
    locTags.includes('underground') ||
    locTags.includes('subterranean') ||
    /buried|tunnel|cavern|under|tomb|catacomb/.test(microMicroLower)
  ) {
    set.add('underground');
    set.add('dark');
  }
  // Confined — low-ceiling micro-micros. Authoring pass needed for
  // full coverage; for now we sniff a few obvious patterns.
  if (/confined|crawl|crevice|narrow|tunnel/.test(microMicroLower)) {
    set.add('confined');
  }
  // Constructed environment — ruins, buried cities, strongholds.
  const locType = (scene.location as { type?: string })?.type ?? '';
  if (['ruin', 'buried_city', 'stronghold', 'buried_capital', 'lost_capital', 'tower'].includes(locType)) {
    set.add('constructed_environment');
  }
  // Equipped gear-based conditions.
  const equipped = player.equipped ?? {};
  for (const slotItem of Object.values(equipped)) {
    if (!slotItem) continue;
    const item = player.inventory.find((i) => i.name === slotItem);
    const tags = item?.tags ?? [];
    if (tags.some((t) => /runic/i.test(t))) set.add('runic_gear');
    // built-in game's energy gear carries 'aether*' tags; the engine-level condition
    // is the generic 'energy_powers' (renames cleanly with the {energy} concept).
    if (tags.some((t) => /aether|energy/i.test(t))) set.add('energy_powers');
    if (item?.kind === 'relic' && tags.some((t) => /armor|plate|chest|head|legs/i.test(t))) {
      set.add('relic_armor');
    }
  }
  return set;
}

// Player AC plus any race-conditional bonus that matches the current
// scene/equipment context. Called from enemy attack resolution; one
// call site in combatRules so the blast radius is narrow.
export function effectiveAC(
  player: PlayerCharacter,
  scene: SceneContext | null,
): number {
  const base = player.ac ?? 10;
  const race = getRace(player.raceId);
  const faction = getFaction(player.factionId);
  const factionRules = (faction?.factionACBonusRules as ACBonusRule[] | undefined) ?? [];
  const rules = [...getACBonusRules(race), ...factionRules];
  if (rules.length === 0) return base;
  const contexts = detectACContexts(player, scene);
  let delta = 0;
  for (const rule of rules) {
    if (contexts.has(rule.condition)) delta += rule.delta;
  }
  return base + delta;
}

// arb-fix — race LOOT-LUCK. Surfaced via rollAreaSearch: a non-zero bias both
// widens the "find" window and biases the find toward the rare Aetheric gear
// pool. Replaces three ex-flavor traits:
//  - Reclaimer "Relic Hunter" + "Rogue's Ingenuity" (merged) — the strongest
//    relic-finder; always on.
//  - Aetherborn "Aetheric Awakening" (sense-half) — a steady relic pull.
//  - Mud Dweller (ex-"Dark Vision") — same edge, but ONLY indoors/underground.
function indoorOrUnderground(player: PlayerCharacter, scene: SceneContext | null): boolean {
  const ctx = detectACContexts(player, scene);
  return ctx.has('underground') || ctx.has('constructed_environment') || ctx.has('confined');
}

export function raceLootBias(player: PlayerCharacter, scene: SceneContext | null): number {
  const r = player.raceId;
  if (r === 'reclaimer') return 0.18;
  if (r === 'aetherborn') return 0.12;
  if (r === 'mud_dweller' && indoorOrUnderground(player, scene)) return 0.18;
  return 0;
}

// arb-fix — Mud Dweller (ex-"Dark Vision") reads buried halls better: a keener
// chance to pull a story HOOK while investigating indoors / underground.
export function raceSearchHookBonus(player: PlayerCharacter, scene: SceneContext | null): number {
  if (player.raceId === 'mud_dweller' && indoorOrUnderground(player, scene)) return 0.15;
  return 0;
}

// arb-fix — Sentinel "Immunity to Time": the one race that cheats death finds
// more of the one thing that cheats death. Per-kill Resurrection Gem drop
// chance is raised over the base for Sentinels (still rare, and install-wide).
// Other races keep the base rate.
// OTA-436 — [audit #20] gem economy tightened. The base per-kill drop was 0.5%
// and the Sentinel rate 1.25%; combined with the boss-guaranteed drop and a
// 50-kill pity gem, a grinding character accumulated enough gems that death
// stopped mattering. Halved to 0.25% / 0.625% so passive income roughly halves
// while the boss-kill reward (the signature "earned" gem) is untouched.
export const BASE_GEM_DROP_CHANCE = 0.0025;
export function resurrectionGemDropChance(raceId: string | undefined): number {
  if (raceId === 'architectural_sentinel') return 0.00625;
  return BASE_GEM_DROP_CHANCE;
}

// ─── Racial stat bonuses ────────────────────────────────────────────
// Always-on stat bumps that apply at every effectiveStats read. Context-
// conditional bumps (e.g. Mud Dweller "+2 INT when using Aethercraft")
// stay strings in race.traits for now; OTA 039 may wire them via a
// `contextMods` arg to effectiveStats. This OTA only fires the static
// add-ons (Towering Strength +2 STR, Indomitable Strength +2 STR +1 INT,
// Noble Heritage +1 CHA, Relic Savvy +2 DEX, etc.).

export interface RacialStatBonuses {
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  // OTA-348 — present so effectiveStats can read racial.stealth. No race
  // currently grants a flat stealth bonus (race proportionality is the
  // creation roll, not a runtime modifier), but the key must exist for the
  // keyof-Stats indexing in effectiveStatsBreakdown.
  stealth?: number;
}

export function racialStatBonusesFor(raceId: string | undefined): RacialStatBonuses {
  const race = getRace(raceId);
  if (!race) return {};
  const bonuses = (race as Race & { racialStatBonuses?: RacialStatBonuses }).racialStatBonuses;
  return bonuses ?? {};
}

// ─── Passive race damage resistances (arb-fix) ──────────────────────
// Wires the "half damage from X" race traits that were flavor-only.
// Returns a multiplier applied to incoming COMBAT damage (1 = no resist).
//   • Mud Dweller — Aetherstone Resilience: ½ Aetheric.
//   • Architectural Sentinel — Aetheric Constitution: ½ energy (aetheric /
//     electrical / burn).
//   • Mud Golem — Aetherstone Resilience: TUNED. Lore said "½ from
//     non-Aetheric" (near-immune to everything); softened to a 25% reduction
//     on non-Aetheric so it's a tank, not invulnerable. Aetheric (its weakness)
//     lands full.
export function raceDamageMultiplier(
  raceId: string | undefined,
  damageType: string | null | undefined,
): number {
  if (!raceId || !damageType) return 1;
  const dt = damageType.toLowerCase();
  switch (raceId) {
    case 'mud_dweller':
      return dt === 'aetheric' ? 0.5 : 1;
    case 'architectural_sentinel':
      return /aetheric|electrical|burn/.test(dt) ? 0.5 : 1;
    case 'mud_golem':
      return dt === 'aetheric' ? 1 : 0.75;
    default:
      return 1;
  }
}

/** Human label for the resistance that fired (for the combat log), or ''. */
export function raceResistLabel(raceId: string | undefined, mult: number): string {
  if (mult >= 1) return '';
  const pct = Math.round((1 - mult) * 100);
  const name =
    raceId === 'mud_dweller' ? 'Aetherstone Resilience'
    : raceId === 'architectural_sentinel' ? 'Aetheric Constitution'
    : raceId === 'mud_golem' ? 'Aetherstone Resilience'
    : 'racial resilience';
  return ` (${name} absorbs ${pct}%)`;
}

// ─── Power-discipline DC modifier ───────────────────────────────────
// engine_Dev — data-driven race AFFINITY for the POWERS (the "magic" disciplines:
// summon/shape/mend). Each race row carries an optional powerDcMod (added to every
// power-check DC; + = harder) and powerIntBonus (added to effective INT). A race
// that sets neither casts at the base DC with no INT bonus — the neutral default
// for a reskin. The Tartaria reference races carry their historical values in
// races.json (mud_dweller 0 / +2 INT, aetherborn +2, the rest +3), so their
// balance is unchanged; the rule is just no longer hardcoded to those ids.
export function powerDcModifier(raceId: string | undefined): number {
  const m = getRace(raceId)?.powerDcMod;
  return typeof m === 'number' ? m : 0;
}

// ─── Power-discipline INT bonus ─────────────────────────────────────
// The race's powerIntBonus is added to effective INT before the power skill check
// (Tartaria's Mud Dwellers carry +2). Verb handlers apply it.
export function powerStatBonus(raceId: string | undefined): Partial<Stats> {
  const b = getRace(raceId)?.powerIntBonus;
  return typeof b === 'number' && b !== 0 ? { intelligence: b } : {};
}
