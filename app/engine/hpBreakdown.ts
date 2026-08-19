// OTA-1184 — WHERE YOUR MAX HP CAME FROM.
//
// Owner: "for AC it shows your base and your buffs. HP just says HP not what my
// base number was so I can see the progression, I didn't roll a 29 at start."
//
// He is right that the number is opaque, and right that it moved. `hpMax` is a
// BAKED total — three sources are added into the same field and nothing anywhere
// records which contributed what:
//   • the CREATION ROLL — `rollDice(5, 10)` + the race's startingHPBonus, so 5-50
//     before race. Never stored separately.
//   • MILESTONES — +1 per MILESTONE_KILL_STEP *distinct* enemy types beaten
//     (arb119 made it distinctness, not volume, so a respawnable enemy cannot be
//     farmed for unbounded hpMax).
//   • GEAR — `gearHpBonus` is added to hpMax on equip and stripped on unequip
//     (OTA-796 closed the re-equip loop that used to leave it behind).
//
// ⚠ NOTHING NEW IS PERSISTED. The creation roll is recovered by SUBTRACTION —
// total minus what we can attribute — so this works on every existing save
// without a migration. That also means the base is a RESIDUAL: if some future
// path adds to hpMax without being accounted for here, it silently lands in
// "base" rather than showing up as a discrepancy. Anything that grows hpMax must
// be added to this file at the same time.

import type { PlayerCharacter, WorldMemory } from './types';
import { gearHpBonus } from './equipment';

/** +1 max HP per this many DISTINCT enemy types beaten.
 *  ⚠ Lives here, not in gameStore, so the sheet can explain the number using the
 *  same constant the store awards it with. OTA-1165 tuned it 5 → 3; a stale
 *  comment claiming "every 3 enemies defeated" (volume, not distinctness) is how
 *  a session came to tell the owner that grinding one patrol builds HP. */
export const MILESTONE_KILL_STEP = 3;

/** Every equipped slot that can bake HP into hpMax. Weapons included — a two-
 *  hander's HP bonus goes through the same path as a chestplate's. */
const HP_BEARING_SLOTS = [
  'main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak',
  'lens', 'amulet', 'ring', 'ring2', 'ring3',
] as const;

export interface HpBreakdown {
  /** The creation roll, recovered as total − earned − gear. Floored at 1. */
  base: number;
  /** Max HP earned from distinct-kill milestones. */
  earned: number;
  /** Max HP currently baked in by worn gear — vanishes if you take it off. */
  gear: number;
  /** The live hpMax, i.e. base + earned + gear. */
  total: number;
  /** Distinct enemy types beaten, and how many more until the next +1. */
  distinctKills: number;
  toNextMilestone: number;
}

export function hpBreakdown(
  player: Pick<PlayerCharacter, 'hpMax' | 'equipped'> | null | undefined,
  wm: Pick<WorldMemory, 'defeatedEnemies'> | null | undefined,
): HpBreakdown | null {
  if (!player) return null;
  const total = player.hpMax ?? 0;

  // ⚠ DISTINCT, not the lifetime tally. `milestones.enemiesDefeated` counts every
  // kill; the milestone keys off the set of names in worldMemory.defeatedEnemies.
  // Quoting the tally here would overstate the progression on any save where the
  // player has ground the same enemy — which is most of them.
  const distinctKills = new Set(wm?.defeatedEnemies ?? []).size;
  const earned = Math.floor(distinctKills / MILESTONE_KILL_STEP);

  const eq = player.equipped ?? {};
  let gear = 0;
  for (const slot of HP_BEARING_SLOTS) {
    const name = (eq as Record<string, string | undefined>)[slot];
    if (name) gear += gearHpBonus(name);
  }

  return {
    base: Math.max(1, total - earned - gear),
    earned,
    gear,
    total,
    distinctKills,
    toNextMilestone: MILESTONE_KILL_STEP - (distinctKills % MILESTONE_KILL_STEP),
  };
}

/** The sheet's one-line version: "base 24 · +5 earned · +2 gear".
 *  Zero-valued terms are dropped so a fresh character reads a clean "base 24"
 *  rather than a row of noise. */
export function hpBreakdownLine(b: HpBreakdown | null | undefined): string | null {
  if (!b) return null;
  const parts = [`base ${b.base}`];
  if (b.earned > 0) parts.push(`+${b.earned} earned`);
  if (b.gear > 0) parts.push(`+${b.gear} gear`);
  return parts.join(' · ');
}
