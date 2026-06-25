// Hunt engine — long-form, multi-stage monster hunts (5-9 prep stages + a
// final boss combat). Hunts are accepted from vendors or from beast-sign
// hooks, scale the target enemy to the player's current power level, and
// pay out big once turned in.

import huntsData from '../data/quests/hunts.json';
import type { PlayerCharacter, Enemy } from './types';
import enemiesData from '../data/enemies/enemies.json';
import { resolveMissions } from './contentPack';

export type HuntCheckKind =
  | null
  | 'investigate'
  | 'stealth'
  | 'diplomacy'
  | 'escape'
  | 'cast'
  | 'attack_provoke'
  | 'boss';

/** 2026-05-26 OTA-055 — narrative slot the stage occupies in the
 *  standardized templates. Two template families:
 *
 *  standard_7 (informant-driven, methodical):
 *    inciting_hook → first_friction → toll → favor → revelation →
 *    catalyst → apex
 *
 *  bait_switch_5 (urgent, subversive, action-heavy):
 *    urgent_dispatch → false_summit → investigation → gauntlet → apex
 *
 *  Optional — null/unset means "legacy stage with no template slot."
 *  The ContractsScreen renders the label only when stageType is set,
 *  so older hunts (or non-bounty quests) still display cleanly. */
export type HuntStageType =
  | 'inciting_hook'
  | 'first_friction'
  | 'toll'
  | 'favor'
  | 'revelation'
  | 'catalyst'
  | 'apex'
  | 'urgent_dispatch'
  | 'false_summit'
  | 'investigation'
  | 'gauntlet';

export interface HuntStageDef {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
  /** 2026-05-26 OTA-055 — narrative slot in the standardized template.
   *  Surfaced as "Stage 3/7 — The Toll" in the ContractsScreen so the
   *  player knows what kind of beat they're on. */
  stageType?: HuntStageType;
}

/** 2026-05-26 OTA-055 — combined "how dangerous is this" tier surfaced
 *  to the player so they don't accept a hunt that'll kill them. The
 *  Arbiter warns on accept if the player is below recommendedHp AND
 *  wielding a weapon under recommendedWeaponRarity. */
export type HuntDifficultyTier = 1 | 2 | 3 | 4;
export type HuntDifficultyLabel = 'Greenhorn' | 'Seasoned' | 'Veteran' | 'Apex';
export type HuntWeaponRarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export interface HuntDef {
  id: string;
  title: string;
  posterText: string;
  /** Catalog name of the target — looked up in enemies.json when the boss spawns. */
  targetEnemyName: string;
  biomeTag: string;
  /** 2026-05-26 OTA-053 — explicit player-facing location name where
   *  the target hides out. Surfaced on accept ("Travel to X to
   *  begin.") and in the Contracts expanded view ("Location: X"),
   *  so the player isn't reduced to scanning posterText for a
   *  proper noun. Optional for backward compat with older hunt
   *  authoring; when missing, the engine falls back to the biomeTag
   *  → friendly-label table in gameStore. */
  targetLocationName?: string;
  /** 2026-05-26 OTA-055 — which template the hunt follows. Drives
   *  the "Stage N/M" total and the stageType label rendering.
   *  Optional for legacy hunts; missing = no template badge. */
  templateKind?: 'standard_7' | 'bait_switch_5';
  /** 2026-05-26 OTA-055 — combined difficulty. Optional but every
   *  authored hunt today carries it. The ContractsScreen renders
   *  "Tier 3 — Veteran" with color-coded urgency vs the player's
   *  current HP / weapon rarity. */
  difficultyTier?: HuntDifficultyTier;
  difficultyLabel?: HuntDifficultyLabel;
  recommendedHp?: number;
  recommendedWeaponRarity?: HuntWeaponRarity;
  minRep: number;
  factionId: string | null;
  rewardTc: number;
  rewardItem: string | null;
  rewardRep: number | null;
  /** Cosmetic name of the trophy that gets added to inventory on turn-in. */
  trophyName: string;
  stages: HuntStageDef[];
}

interface HuntDataShape {
  hunts: HuntDef[];
}

/** 2026-05-26 OTA-053 — player-facing label for the per-stage skill
 *  hint shown in the ContractsScreen. Internal checkKind values are
 *  systemic (`attack_provoke`, `cast`); these are the imperative
 *  the player should act on at this stage. Null = pure narration
 *  stage (auto-advance on any action). */
export function checkKindLabel(kind: HuntCheckKind): string | null {
  switch (kind) {
    case 'investigate': return 'investigate the area';
    case 'stealth': return 'use stealth';
    case 'diplomacy': return 'talk it out';
    case 'escape': return 'escape / disengage';
    case 'cast': return 'use Aethercraft';
    case 'attack_provoke': return 'attack to provoke';
    case 'boss': return 'defeat in combat';
    default: return null;
  }
}

/** 2026-05-26 OTA-053 — friendly label for a biomeTag when a hunt
 *  doesn't carry an explicit targetLocationName. Falls back to the
 *  tag itself title-cased if no mapping exists. */
const BIOME_LABELS: Record<string, string> = {
  mud_seas: 'the Mud Seas',
  buried_capital: 'a buried capital',
  sentinel_ward: 'a Sentinel Ward',
  outskirts: 'the Tartarian Outskirts',
  ruin: 'the buried ruins',
};
export function biomeLabel(biomeTag: string): string {
  const mapped = BIOME_LABELS[biomeTag];
  if (mapped) return mapped;
  return biomeTag
    .split(/[_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/** 2026-05-26 OTA-055 — player-facing label for each stage slot in
 *  the standardized hunt templates. Rendered as "Stage N/M — <label>"
 *  in the ContractsScreen. */
const STAGE_TYPE_LABELS: Record<HuntStageType, string> = {
  // standard_7
  inciting_hook: 'The Inciting Hook',
  first_friction: 'The First Friction',
  toll: 'The Toll',
  favor: 'The Favor',
  revelation: 'The Revelation & Approach',
  catalyst: 'The Catalyst',
  apex: 'The Apex',
  // bait_switch_5
  urgent_dispatch: 'The Urgent Dispatch',
  false_summit: 'The False Summit',
  investigation: 'The Investigation',
  gauntlet: 'The Gauntlet',
  // (apex reused — same label both templates)
};
export function stageTypeLabel(t: HuntStageType | undefined): string | null {
  if (!t) return null;
  return STAGE_TYPE_LABELS[t] ?? null;
}

/** 2026-05-26 OTA-055 — ordinal rank for the weapon rarities so
 *  recommendedWeaponRarity can be compared against the player's
 *  currently-equipped weapon. Same Common→Legendary ladder the
 *  catalog uses. */
const RARITY_RANK: Record<HuntWeaponRarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Legendary: 4,
};
export function weaponRarityMeets(have: string | undefined, need: HuntWeaponRarity): boolean {
  const haveRank = have && have in RARITY_RANK ? RARITY_RANK[have as HuntWeaponRarity] : 0;
  return haveRank >= RARITY_RANK[need];
}

// engine_Dev — built-in (Tartaria) hunts; an uploaded 'missions.hunts' set wins.
const HUNTS_BUILTIN = (huntsData as HuntDataShape).hunts;
/** The live hunt list — uploaded override if present, else built-in. Call at
 *  runtime (not module load) so an upload mirrored after boot is honored. */
export function getHunts(): HuntDef[] {
  return resolveMissions('hunts', HUNTS_BUILTIN) as HuntDef[];
}
/** Built-in hunts only — for the dev-console template / sample. */
export const HUNTS = HUNTS_BUILTIN;

export function findHuntById(id: string): HuntDef | null {
  return getHunts().find((h) => h.id === id) ?? null;
}

// Available to a player from a given vendor or in general. Filters by
// faction (vendors aligned with a faction only post their own hunts —
// hunts with factionId=null are open contracts anyone can offer),
// minimum rep, and already-active/completed lists.
export function availableHunts(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): HuntDef[] {
  return getHunts().filter(
    (h) =>
      (h.factionId === factionId || (factionId !== null && h.factionId === null)) &&
      playerRep >= h.minRep &&
      !active.includes(h.id) &&
      !completed.includes(h.id),
  );
}

export function fuzzyFindHunt(text: string, pool: readonly HuntDef[]): HuntDef | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = pool.find((h) => h.title.toLowerCase() === t);
  if (exact) return exact;
  return pool.find((h) => h.title.toLowerCase().includes(t) || t.includes(h.title.toLowerCase())) ?? null;
}

// Build a scaled clone of the target enemy. Scaling is gentle but
// noticeable: HP scales with player HP (1.0× base if player is at
// starting hpMax of ~30, up to ~1.6× by hpMax 80), damage scales by a
// flat +1 to each die count when the player has hpMax > 50.
export function scaleHuntBoss(player: PlayerCharacter, def: HuntDef): Enemy | null {
  const base = (enemiesData as Enemy[]).find((e) => e.name === def.targetEnemyName);
  if (!base) return null;
  const hpFactor = Math.min(1.6, Math.max(1.0, player.hpMax / 30));
  const hp = Math.round(base.hp * hpFactor);
  // Bump damage by adding one die to the lowest die-count if the player
  // is well-established. Format like "4D10" → "5D10".
  let damage = String(base.damage);
  if (player.hpMax > 50) {
    damage = damage.replace(/(\d+)([dD]\d+)/, (_m, c, rest) => `${parseInt(c, 10) + 1}${rest}`);
  }
  return {
    ...base,
    name: `${base.name} (hunted)`,
    hp,
    damage,
  };
}

// Player-side hunt progress record stored on the player.
export interface ActiveHunt {
  id: string;
  stage: number;
  /** ID of the vendor / faction that posted the hunt (used to validate turn-in). */
  postedByFaction: string | null;
  acceptedAt: number;
}
