// Hunt engine — long-form, multi-stage monster hunts (5-9 prep stages + a
// final boss combat). Hunts are accepted from vendors or from beast-sign
// hooks, scale the target enemy to the player's current power level, and
// pay out big once turned in.

import huntsData from '../data/quests/hunts.json';
import type { PlayerCharacter, Enemy } from './types';
import enemiesData from '../data/enemies/enemies.json';

export type HuntCheckKind =
  | null
  | 'investigate'
  | 'stealth'
  | 'diplomacy'
  | 'escape'
  | 'cast'
  | 'attack_provoke'
  | 'boss';

export interface HuntStageDef {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
}

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

export const HUNTS = (huntsData as HuntDataShape).hunts;

export function findHuntById(id: string): HuntDef | null {
  return HUNTS.find((h) => h.id === id) ?? null;
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
  return HUNTS.filter(
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
