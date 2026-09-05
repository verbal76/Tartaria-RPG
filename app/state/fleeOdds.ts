// fleeOdds — OTA-1678, THE CHASE GETS HARDER (store-side half).
//
// ⚠⚠ ONE READER FOR THE BAR. The skill dispatch in gameStore builds the real
// escape roll from `fleePursuitFor`, and the FLEE chip prints its odds from
// `fleeOddsFor`, which calls the same function and the same step builder. Two
// readers for one bar is how a chip comes to promise 70% on a roll that was
// built against a different pursuer — so there is one, and the chip cannot
// disagree with the card the tap produces.
//
// Lives outside gameStore because that file is under the OTA-1400 line ratchet
// and because InputBox needs it too; it sits in `state/` rather than `engine/`
// only because the armour-resist read it needs lives in combatResolution.

import type { CurrentScene } from './gameStore';
import type { PlayerCharacter } from '../engine/types';
import { buildSkillSteps, type EscapePursuit } from '../engine/combatRules';
import { weatherStatModifiers } from '../engine/weatherEffects';
import { playerArmorResistKinds } from './combatResolution';
import { escalatedPursuit, fleeOddsPercent } from '../engine/fleeEscalation';

type FleeScene = Pick<CurrentScene, 'enemies' | 'enemyHps' | 'location' | 'weather' | 'fleeAttempts'>;

/** The pursuit the escape roll is built against: OTA-1009's fastest live body,
 *  escalated by OTA-1678 when every live body was rolled by the world. Null
 *  with no live pursuer (traps, hook stages, cleared scenes keep the flat DC). */
export function fleePursuitFor(scene: FleeScene): EscapePursuit | null {
  return escalatedPursuit(
    scene.enemies ?? [],
    scene.enemyHps,
    scene.location?.danger ?? 0,
    scene.fleeAttempts ?? 0,
  );
}

/** The runner's side of the contest — d20 + this — read off the same step the
 *  dispatch builds (DEX, weather, companion assist, perks), with the pursuer's
 *  d20 pinned so nothing is rolled here. */
export function escapeRollBonus(player: PlayerCharacter, scene: Pick<CurrentScene, 'weather'>): number {
  const step = buildSkillSteps('escape', player, {
    weatherMod: weatherStatModifiers(scene.weather, playerArmorResistKinds(player)),
    companionAssist: !!player.companion,
    pursuit: { bonus: 0, label: '', d20: 0 },
  })[0];
  return step?.bonus ?? 0;
}

/** Whole-percent odds the next FLEE tap succeeds, and the pursuer it is
 *  measured against. Null when nothing in the scene is alive to run from. */
export function fleeOddsFor(player: PlayerCharacter, scene: FleeScene): { pct: number; pursuit: EscapePursuit | null } | null {
  const pursuit = fleePursuitFor(scene);
  if (!pursuit) return null;
  return { pct: fleeOddsPercent(escapeRollBonus(player, scene), pursuit.bonus), pursuit };
}
