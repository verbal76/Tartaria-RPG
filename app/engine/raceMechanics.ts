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
import type { PlayerCharacter, Race, Stats } from './types';

// Structural-typed scene snapshot. CurrentScene lives inline in
// gameStore.ts and isn't exported; we accept any object with the
// fields we actually need so we don't have to depend on the store.
interface SceneContext {
  location?: { tags?: string[]; type?: string } | null;
  microMicroId?: string | null;
}

const RACES = racesData as Race[];

function getRace(raceId: string | undefined): Race | undefined {
  if (!raceId) return undefined;
  return RACES.find((r) => r.id === raceId);
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
  | 'aether_powers'
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
    if (tags.some((t) => /aether/i.test(t))) set.add('aether_powers');
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
  const rules = getACBonusRules(race);
  if (rules.length === 0) return base;
  const contexts = detectACContexts(player, scene);
  let delta = 0;
  for (const rule of rules) {
    if (contexts.has(rule.condition)) delta += rule.delta;
  }
  return base + delta;
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
}

export function racialStatBonusesFor(raceId: string | undefined): RacialStatBonuses {
  const race = getRace(raceId);
  if (!race) return {};
  const bonuses = (race as Race & { racialStatBonuses?: RacialStatBonuses }).racialStatBonuses;
  return bonuses ?? {};
}

// ─── Aethercraft DC modifier ────────────────────────────────────────
// OTA 039 — True Tartarians (Mud Dwellers) trained the discipline;
// they cast at base DC. Aetherborn share Aetheric blood but lack the
// True Tartarian training, so they cast at +2 DC. All other races
// are guessing — +4 DC.
export function aethercraftDcModifier(raceId: string | undefined): number {
  if (raceId === 'mud_dweller') return 0;
  if (raceId === 'aetherborn') return 2;
  return 4;
}

// ─── Aethercraft context bonus ──────────────────────────────────────
// Mud Dwellers' "Aethercraft Mastery: +2 Intelligence when using
// Aethercraft" trait fires here. Verb handlers add this to the
// effective INT before the skill check. Other races: no bonus.
export function aethercraftStatBonus(raceId: string | undefined): Partial<Stats> {
  if (raceId === 'mud_dweller') return { intelligence: 2 };
  return {};
}
