// OTA-928 — a single "Power" rating for the player and for each enemy, on the SAME
// scale, so the combat HUD can show them facing each other (player top-right of the
// stats panel, enemy top-left of its card) as a quick "where do I stand?" gauge.
//
// Power is a GAUGE, not a replacement for stats: it is BUILT FROM the stats + gear
// (best effective combat stat + average weapon damage per hit + effective AC + HP/10),
// so training a stat or upgrading a weapon/armour visibly moves the number. Player and
// enemy use the same four terms so "yours 46 vs its 38" reads as "you're favoured".
import type { Enemy, PlayerCharacter } from './types';
import { effectiveStats, standingAc } from './equipment';
import { getEquippedWeapon } from './combatRules';
import { traitACBonus } from './enemyTraits';

/** Average of a dice-notation string like "2d6+3" → count*(sides+1)/2 + flat. Falls
 *  back to a plain integer, else 2, for odd/empty notations. */
export function avgDamageNotation(notation: string | undefined | null): number {
  if (!notation) return 2;
  const m = String(notation).match(/(\d+)\s*d\s*(\d+)\s*(?:\+\s*(\d+))?/i);
  if (!m) {
    const n = parseInt(String(notation), 10);
    return Number.isFinite(n) ? n : 2;
  }
  const count = parseInt(m[1]!, 10);
  const sides = parseInt(m[2]!, 10);
  const flat = m[3] ? parseInt(m[3], 10) : 0;
  return (count * (sides + 1)) / 2 + flat;
}

/** The player's Power rating: best effective combat stat + avg weapon damage/hit +
 *  effective AC (base + worn armour) + HP/10. Self-contained (no scene needed). */
export function playerPowerScore(player: PlayerCharacter): number {
  const eff = effectiveStats(player);
  const bestStat = Math.max(eff.strength, eff.dexterity, eff.intelligence);
  // ⚠ OTA-1162 (audit) — this was the FOURTH inline copy of the gear-AC walk,
  // found by the very sweep OTA-1158 said should never be needed again. It had
  // both of 1158's defects in miniature: no amulet/ring AC, and the catalog
  // acBonus where combat prefers the rolled instance. The gauge therefore
  // disagreed with the panel by exactly the jewellery. One function, one
  // answer — the OTA-955 promise below ("equals the AC the player SEES and
  // FIGHTS with") is finally literally true, because it is the same call.
  // OTA-955 — the gauge's AC term runs through the OTA-947 standing-AC trim so it equals
  // the AC the player SEES (StatsPanel) and FIGHTS with (applyEnemyCounter) exactly.
  // Pre-OTA it summed the raw stack, so a tank's Power kept quoting the untrimmed
  // number the rebalance retired ("my AC dropped but my Power didn't") and the
  // favored/danger badge overstated the tank's real standing. Enemy Power stays raw
  // on purpose: enemy combat AC is never trimmed, and each side's gauge mirrors the
  // AC that side actually fights with. (Combat additionally counts scene-conditional
  // racial/title AC that a scene-free gauge can't; that pre-existing 1-2pt display
  // drift near the knee is out of scope here.) The correction lands SILENTLY across
  // an update: the OTA-929 delta flash seeds its prev-ref on mount, so a value that
  // changed between sessions never fires it — only in-session gear/stat moves do.
  const ac = standingAc(player);
  const weapon = getEquippedWeapon(player, 'main');
  const dmg = weapon ? avgDamageNotation(weapon.damageDice) : 2;
  const hp = player.hpMax ?? 10;
  return Math.max(1, Math.round(bestStat + dmg + ac + hp / 10));
}

/** An enemy's Power rating on the SAME scale as playerPowerScore. Mirrors the combat
 *  AC derivation exactly (abilityPoint number → clamp(5..18, 5+ap) + trait AC + boss +6). */
export function enemyPowerScore(enemy: Enemy): number {
  const apMatch = String(enemy.abilityPoint ?? '').match(/\d+/);
  const apNum = apMatch ? parseInt(apMatch[0], 10) : 4;
  const baseAc = Math.max(5, Math.min(18, 5 + apNum));
  const ac = Math.max(1, baseAc + traitACBonus(enemy.traits) + (enemy.boss ? 6 : 0));
  // ⚠ OTA-1163 (pressure test) — the damage term now prices what the resolver
  // actually rolls. This function already knew about bosses (the +6 AC above)
  // but scored their damage from the bare notation, while applyEnemyCounter
  // adds +1d6 to every connecting boss swing AND takes a second swing per
  // round. A 1d8+3 boss therefore scored 7.5 where its round averages
  // 2 × (7.5 + 3.5) = 22 — so the matchup badge painted "even" on fights
  // outputting three times what the gauge priced. The identical lie OTA-1159
  // and OTA-1162 already fixed on the damage chip, one meter to its left.
  const perSwing = avgDamageNotation(enemy.damage) + (enemy.boss ? 3.5 : 0);
  const dmg = enemy.boss ? perSwing * 2 : perSwing;
  const hp = enemy.hp ?? 1;
  return Math.max(1, Math.round(apNum + dmg + ac + hp / 10));
}

/** How the fight reads at a glance, driving the colour of the enemy's Power badge:
 *  'favored' = you outclass it, 'danger' = it outclasses you, 'even' = a real fight. */
export type PowerMatchup = 'favored' | 'even' | 'danger';
export function powerMatchup(playerPower: number, enemyPower: number): PowerMatchup {
  if (enemyPower >= playerPower * 1.15) return 'danger';
  if (enemyPower <= playerPower * 0.85) return 'favored';
  return 'even';
}
