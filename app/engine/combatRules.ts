import type { RollStep, PlayerCharacter, Enemy, Stats, StatusEffect } from './types';
import { rollDie } from './rng';
import { findWeaponByName, type CatalogWeapon } from './crafting';
import { effectiveStats } from './equipment';
import { traitACBonus } from './enemyTraits';
import { barehandDamageFor } from './raceMechanics';

/**
 * Roll-modifier aggregator. Walks the player's status effects and sums
 * bonus / penalty dice for a given action class. Returns the net flat
 * modifier (each die ≈ ±2 on a d20 in our scale) plus the labels that
 * fed into it so the combat log can show what stacked.
 *
 * Phase 2: scene context (target in cover, point-blank range, etc.) and
 * enemy traits should also fold in here — for now the helper covers the
 * player-side status pool from the action-card actions.
 */
export interface RollMods {
  bonus: number;       // +N to the final roll
  penalty: number;     // -N to the final roll (positive integer)
  net: number;         // bonus - penalty
  sources: string[];   // human-readable labels for the log
  consume: StatusEffect['kind'][];  // effects to drop after this roll
}

export function rollMods(
  effects: readonly StatusEffect[] | undefined,
  action: 'attack_ranged' | 'attack_melee' | 'defense' | 'skill',
): RollMods {
  const fx = effects ?? [];
  let bonus = 0;
  let penalty = 0;
  const sources: string[] = [];
  const consume: StatusEffect['kind'][] = [];
  for (const e of fx) {
    switch (e.kind) {
      case 'aiming':
        if (action === 'attack_ranged') {
          bonus += 2;
          sources.push('aim +2');
          consume.push('aiming');
        }
        break;
      case 'sprinting':
        if (action === 'attack_ranged' || action === 'attack_melee') {
          penalty += 2;
          sources.push('sprinting -2');
        }
        break;
      case 'in_cover':
        if (action === 'defense') {
          bonus += 4;
          sources.push('cover +4');
        }
        break;
      case 'in_cover_full':
        if (action === 'defense') {
          bonus += 8;
          sources.push('full cover +8');
        }
        break;
      case 'quick_fire':
        if (action === 'attack_ranged') {
          bonus += 2;
          sources.push('quick fire +2');
          consume.push('quick_fire');
        }
        break;
      case 'fighting_back':
        // No direct attack-roll modifier; flag is read by the enemy
        // counter-attack handler in gameStore to switch defense to an
        // opposed Fighting roll.
        break;
      case 'distracted':
        // OTA-144 — dog distract bonus. OTA-121 set this status on the
        // player but no consumer ever read it (rollMods missed the
        // case, so "+2 to next attack" was vapor). Now applies +2 to
        // the next attack roll AND is consumed; the initiative +1
        // rides on a separate consumer in buildCombatSteps that
        // peeks at the status without consuming it (so the same
        // distract pulse covers BOTH bonuses on the same swing).
        if (action === 'attack_ranged' || action === 'attack_melee') {
          bonus += 2;
          sources.push('distract +2');
          consume.push('distracted');
        }
        break;
      case 'dodging':
        if (action === 'defense') {
          bonus += 4;
          sources.push((e.label === 'in cover' ? 'cover' : e.label === 'aiming' ? 'aim' : e.label === 'disengaging' ? 'disengage' : 'dodge') + ' +4');
        }
        if (action === 'attack_ranged' && e.label === 'aiming') {
          bonus += 2;
          sources.push('aim +2');
          consume.push('dodging');
        }
        break;
      case 'blocking':
        if (action === 'defense') {
          bonus += 4;
          sources.push('block +4');
        }
        break;
      case 'overwhelmed':
        if (action === 'defense') {
          penalty += 2;
          sources.push('overwhelmed -2');
        }
        break;
      case 'surprised':
        penalty += 2;
        sources.push('surprised -2');
        consume.push('surprised');
        break;
      // v2.4.1 (OTA 034) — Successful stealth approach grants +5 on
      // the next melee or ranged strike. Consumed on use.
      case 'stealthed':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          bonus += 5;
          sources.push('stealthed +5');
          consume.push('stealthed');
        }
        break;
      // 2026-05-24 — stamina-driven statuses. tired and exhausted are
      // auto-applied/cleared from stamina each tick; never consumed
      // here. power_attack_pending and defensive_stance are tactical.
      case 'tired':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          penalty += 1;
          sources.push('tired -1');
        }
        if (action === 'defense') {
          penalty += 1;
          sources.push('tired -1');
        }
        break;
      case 'exhausted':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          penalty += 2;
          sources.push('exhausted -2');
        }
        if (action === 'defense') {
          penalty += 2;
          sources.push('exhausted -2');
        }
        break;
      case 'power_attack_pending':
        if (action === 'attack_melee' || action === 'attack_ranged') {
          bonus += 2;
          sources.push('power attack +2');
          consume.push('power_attack_pending');
        }
        break;
      case 'defensive_stance':
        if (action === 'defense') {
          bonus += 2;
          sources.push('defensive +2');
        }
        break;
    }
  }
  return { bonus, penalty, net: bonus - penalty, sources, consume };
}

type WeaponClass = 'ranged' | 'melee' | 'runecaster' | 'barehanded';

// Did the player explicitly call for a bare-hand attack? "punch", "kick",
// "fist", etc. — these always route through bare hands regardless of what
// the player has equipped, and never wear down the equipped weapon.
export function isBareHandAttack(actionText: string): boolean {
  return /\b(punch|kick|fist|knee|headbutt|elbow|bare[- ]?hand)\b/.test(actionText.toLowerCase());
}

// Resolve the player's currently-equipped weapon to a catalog entry, if any.
// `prefer` lets the caller bias toward an off-hand strike when the player
// explicitly chooses it; defaults to the main-hand weapon.
export function getEquippedWeapon(
  player: PlayerCharacter,
  prefer: 'main' | 'off' = 'main',
): CatalogWeapon | null {
  const eq = player.equipped;
  if (!eq) return null;
  const name =
    prefer === 'off'
      ? eq.off ?? eq.main ?? eq.weaponName
      : eq.main ?? eq.weaponName ?? eq.off;
  return name ? findWeaponByName(name) : null;
}

function detectWeaponClass(text: string): WeaponClass {
  const t = text.toLowerCase();
  if (/bolt|boltcaster|bow|crossbow|pistol|shot|shoot|fire|sling|arrow|ranged/.test(t)) return 'ranged';
  if (/rune|spell|cast|aether|channel|arcane/.test(t)) return 'runecaster';
  if (/sword|blade|axe|knife|dagger|spear|hammer|mace|club|strike|slash|cut|stab|melee/.test(t)) return 'melee';
  return 'barehanded';
}

function attackStatFor(
  wc: WeaponClass,
  stats: PlayerCharacter['stats'],
): { value: number; label: string } {
  switch (wc) {
    case 'ranged': return { value: stats.dexterity, label: 'DEX' };
    case 'runecaster': return { value: stats.intelligence, label: 'INT' };
    default: return { value: stats.strength, label: 'STR' };
  }
}

function enemyAC(enemy: Enemy): number {
  const ap = parseInt(String(enemy.abilityPoint), 10);
  const base = isNaN(ap) ? 8 : Math.max(5, Math.min(18, 5 + ap));
  // Boss tier: +6 over the standard scaling so even a power character
  // (STR 14 + 1d8 weapon) can't auto-hit. Combined with double counters
  // and bonus damage downstream, bosses become "find another way" walls.
  const bossBonus = enemy.boss ? 6 : 0;
  return Math.max(1, base + traitACBonus(enemy.traits) + bossBonus);
}

// Rulebook: Common 1d6 / Uncommon 2d6 / Rare 1d10+1d6 / Legendary 2d10
// We derive weapon tier from inventory kind+rarity — default to common 1d6.
function damageDice(wc: WeaponClass): { sides: number; count: number } {
  if (wc === 'runecaster') return { sides: 6, count: 1 }; // common runecaster
  return { sides: 6, count: 1 }; // common weapon
}

// ─── Combat sequence: Initiative → Attack → Damage ───────────────────────────

export function buildCombatSteps(
  actionText: string,
  player: PlayerCharacter,
  enemy: Enemy,
  opts?: {
    /** When set, the attack is being made out of normal weapon range.
     *  Applies a -5 to the attack roll and notes it in the bonus label
     *  so the player sees why it missed. */
    blindSwing?: boolean;
    /** Visibility / atmospheric penalty from the active weather
     *  (Iron Fog, Whisper Fog, Ash Storm, etc.). Subtracted from the
     *  attack roll on top of any blindSwing penalty. */
    visibilityPenalty?: number;
    /** Optional descriptor for the visibility penalty (e.g. "Iron Fog")
     *  so the bonus label can name the source. */
    visibilityLabel?: string;
    /** Active weather's per-stat modifiers (Iron Fog −1 DEX etc.). When
     *  passed, effectiveStats folds these into the stat used for the
     *  attack/damage roll. */
    weatherMod?: Partial<Stats>;
    /** Pre-computed roll modifier from the player's status pool — aim
     *  bonus, sprinting penalty, surprise penalty, etc. Caller computes
     *  this so the dice-prompt label can also surface the consume list
     *  (effects expire on use). */
    statusMods?: RollMods;
    /** Point-blank bonus from being at arm's reach with a ranged weapon
     *  designed for it. +2 to the attack roll. */
    pointBlankBonus?: boolean;
  },
): RollStep[] {
  // Equipped weapon takes precedence over text-based weapon-class detection.
  // No equip = fall back to the original behavior (rusted blade / fists).
  // Off-hand attack: when the player says "off-hand" or "off hand", route
  // through the off-slot weapon instead of the main.
  // Bare-hand attack: explicit "punch" / "kick" / "fist" forces barehanded
  // regardless of what's equipped — lets the player choose to sacrifice
  // damage in exchange for the bludgeoning damage type or to spare the
  // weapon's durability.
  const forcesBarehand = isBareHandAttack(actionText);
  const prefersOff = /\boff[- ]?hand\b/.test(actionText.toLowerCase());
  const equipped = forcesBarehand ? null : getEquippedWeapon(player, prefersOff ? 'off' : 'main');
  const wc: WeaponClass = equipped?.weaponKind ?? detectWeaponClass(actionText);
  // Stat used for the attack roll factors in any equipped accessory bonuses
  // (rings/amulets boosting STR/DEX/INT/WIS/CHA) PLUS the active weather's
  // stat modifiers (Iron Fog −1 DEX etc.) so the world's mood is in every
  // swing.
  const stats = effectiveStats(player, opts?.weatherMod);
  const stat = equipped
    ? { value: stats[equipped.stat], label: STAT_LABEL[equipped.stat] }
    : attackStatFor(wc, stats);
  const ac = enemyAC(enemy);
  const enemyInit = rollDie(10);
  // Use equipped damage dice if available; parse "2d6" or "1d10+1d6".
  // OTA 038 — barehanded path now reads race.barehandDamage instead of
  // the old hardcoded 1d6. Giants land 1d6+2, Mud Dwellers 1d6-3,
  // Sentinels 1d10. The Sentinel even/odd hit-gate is enforced at the
  // attack-resolution site in gameStore.ts (OTA 041) after the damage
  // die is rolled — see the `if (barehand)` guard around the
  // BarehandSpec.hitGate check there.
  const barehandSpec = !equipped ? barehandDamageFor(player.raceId) : null;
  const dmg = equipped
    ? parseDamageDice(equipped.damageDice)
    : barehandSpec
      ? { count: barehandSpec.count, sides: barehandSpec.sides }
      : damageDice(wc);
  const damageBonus = barehandSpec?.bonus ?? 0;
  const damageTypeNote = equipped
    ? ` (${equipped.damageType})`
    : forcesBarehand ? ' (bludgeoning)' : '';

  // OTA-144 — distract gives +1 to initiative on the next combat
  // swing per the playtester spec ("+1 for initiative and an
  // additional +2 to attack power"). Read-only peek; the +2 attack
  // bonus consumer (rollMods in this same file) is what actually
  // strips the status. So a single distract pulse covers both
  // bonuses on the SAME swing — the player's first attack after
  // the dog distracts gets initiative +1 AND attack +2.
  const distractBonus = (player.statusEffects ?? []).some((e) => e.kind === 'distracted') ? 1 : 0;
  return [
    {
      id: 'initiative',
      label: 'Roll for INITIATIVE',
      sides: 10,
      count: 1,
      bonus: distractBonus,
      bonusLabel: distractBonus > 0 ? 'distract +1' : '',
      target: enemyInit,
      targetLabel: `Enemy rolled ${enemyInit}`,
      context: `d10 — meet or beat the enemy to act first`,
    },
    (() => {
      const blindPen = opts?.blindSwing ? -5 : 0;
      const visPen = -(opts?.visibilityPenalty ?? 0);
      const statusNet = opts?.statusMods?.net ?? 0;
      const pointBlank = opts?.pointBlankBonus ? 2 : 0;
      const totalMod = blindPen + visPen + statusNet + pointBlank;
      const pieces: string[] = [`${stat.label} ${stat.value}`];
      if (blindPen) pieces.push(`− 5 (blind swing)`);
      if (visPen) pieces.push(`− ${Math.abs(visPen)} (${opts?.visibilityLabel ?? 'visibility'})`);
      if (pointBlank) pieces.push('+ 2 (point blank)');
      if (opts?.statusMods?.sources?.length) pieces.push(...opts.statusMods.sources);
      const ctxPieces: string[] = [`d20 + ${stat.label}`];
      if (blindPen) ctxPieces.push(`− 5 (out of reach)`);
      if (visPen) ctxPieces.push(`− ${Math.abs(visPen)} (${opts?.visibilityLabel ?? 'low visibility'})`);
      if (pointBlank) ctxPieces.push('+ 2 (point blank)');
      if (opts?.statusMods?.sources?.length) ctxPieces.push(...opts.statusMods.sources);
      // HANDOFF #14b — attack-side advantage / disadvantage. Mirrors the
      // defense-side logic in gameStore.applyEnemyCounter. Aiming gives
      // the player advantage on their next attack (roll 2d20, keep higher);
      // surprised gives disadvantage (keep lower). When both fire, they
      // cancel out and the roll stays normal. The flat bonuses on these
      // statuses still apply — advantage stacks on top, deliberately
      // making aim-then-fire feel decisive.
      const fx = player.statusEffects ?? [];
      const hasAiming = fx.some((e) => e.kind === 'aiming' && e.remainingRounds > 0);
      const hasSurprised = fx.some((e) => e.kind === 'surprised' && e.remainingRounds > 0);
      let rollMode: 'advantage' | 'disadvantage' | undefined;
      let rollModeLabel: string | undefined;
      if (hasAiming && !hasSurprised) {
        rollMode = 'advantage';
        rollModeLabel = 'aiming';
      } else if (hasSurprised && !hasAiming) {
        rollMode = 'disadvantage';
        rollModeLabel = 'surprised';
      }
      return {
        id: 'attack',
        label: 'Roll to ATTACK',
        sides: 20,
        count: 1,
        bonus: stat.value + totalMod,
        bonusLabel: pieces.join(' '),
        target: ac,
        targetLabel: `AC ${ac}`,
        context: `${ctxPieces.join(' ')} to hit ${enemy.name}`,
        ...(rollMode ? { rollMode, rollModeLabel } : {}),
      };
    })(),
    {
      id: 'damage',
      label: 'Roll for DAMAGE',
      sides: dmg.sides,
      count: dmg.count,
      bonus: damageBonus,
      bonusLabel: damageBonus !== 0 ? `${damageBonus > 0 ? '+' : ''}${damageBonus} (race)` : '',
      context: `damage dealt to ${enemy.name}${damageTypeNote}`,
      // no target — always applies if the attack hit
    },
  ];
}

// Parse a damage notation string like "2d6" or "1d10+1d6" into a single
// {sides, count} we can roll. For multi-die notations we pick the larger
// die and double the count to roughly preserve the range (close enough
// for a single roll step — we don't currently animate multiple groups).
export function parseDamageDice(notation: string): { sides: number; count: number } {
  const m = /(\d+)d(\d+)/i.exec(notation);
  if (!m) return { sides: 6, count: 1 };
  // For compound like "1d10+1d6" the first match captures the larger.
  return { count: parseInt(m[1]!, 10), sides: parseInt(m[2]!, 10) };
}

// ─── Skill checks ────────────────────────────────────────────────────────────
// Rulebook DC table: Easy 6 / Moderate 9 / Hard 12 / Very Hard 15

const SKILL_DC: Record<string, number> = {
  stealth: 12,
  diplomacy: 15,
  escape: 9,
  investigate: 9,
  cast: 12,
  use_relic: 12,
};

const SKILL_STAT: Record<string, keyof PlayerCharacter['stats']> = {
  stealth: 'dexterity',
  diplomacy: 'charisma',
  escape: 'dexterity',
  investigate: 'intelligence',
  cast: 'intelligence',
  use_relic: 'wisdom',
  // Maneuver sub-types — route to the right stat for the kind of move.
  maneuver_disarm: 'dexterity',
  maneuver_trip: 'dexterity',
  maneuver_grapple: 'strength',
  maneuver_shove: 'strength',
  maneuver_pin: 'strength',
  maneuver_sweep: 'dexterity',
  maneuver_hook: 'dexterity',
};

/** Classify a player's maneuver verb to one of the sub-types so the
 *  skill check routes through the correct stat. Default = grapple
 *  (STR) when nothing matches. */
export function classifyManeuver(actionText: string): string {
  const t = actionText.toLowerCase();
  if (/disarm|knock.*weapon|strip.*weapon/.test(t)) return 'maneuver_disarm';
  if (/trip|sweep.*leg|leg.*sweep|knock down/.test(t)) return 'maneuver_trip';
  if (/grapple|wrestle|tackle|bear hug/.test(t)) return 'maneuver_grapple';
  if (/shove|push|knock back|ram/.test(t)) return 'maneuver_shove';
  if (/pin|hold down|restrain/.test(t)) return 'maneuver_pin';
  if (/sweep|sweep.*aside/.test(t)) return 'maneuver_sweep';
  if (/hook|catch|snag/.test(t)) return 'maneuver_hook';
  return 'maneuver_grapple';
}

const STAT_LABEL: Record<keyof PlayerCharacter['stats'], string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const DC_NAME: Record<number, string> = {
  6: 'Easy', 9: 'Moderate', 12: 'Hard', 15: 'Very Hard', 18: 'Difficult',
};

// Human-readable label for what the skill check is FOR — the player should
// always know "I'm rolling to STEALTH" not "Skill Check".
const INTENT_ACTION_VERB: Record<string, string> = {
  stealth: 'STEALTH',
  diplomacy: 'PERSUADE',
  escape: 'ESCAPE',
  investigate: 'INVESTIGATE',
  cast: 'CAST',
  use_relic: 'USE RELIC',
};

// Single roll for rest duration. 1d4+3 = 4-7 hours. The store derives
// HP + stamina recovery deterministically from the rolled hours, so the
// player can see "longer rest = more recovery" instead of three opaque
// random numbers.
export function buildRestSteps(): RollStep[] {
  return [{
    id: 'rest_hours',
    label: 'Roll for REST HOURS',
    sides: 4,
    count: 1,
    bonus: 3,
    bonusLabel: '+3',
    context: 'd4 + 3 — how long you sit. Each hour gives 2 HP and 1 stamina (capped at your max).',
  }];
}

export function buildSkillSteps(
  intent: string,
  player: PlayerCharacter,
  opts?: { weatherMod?: Partial<Stats>; companionAssist?: boolean; statusMods?: RollMods },
): RollStep[] {
  const statKey = SKILL_STAT[intent] ?? 'wisdom';
  const stats = effectiveStats(player, opts?.weatherMod);
  const statVal = stats[statKey];
  const statLabel = STAT_LABEL[statKey];
  const dc = SKILL_DC[intent] ?? 12;
  const dcName = DC_NAME[dc] ?? '';
  const verb = INTENT_ACTION_VERB[intent] ?? intent.toUpperCase();
  const label = `Roll to ${verb}`;
  // Companion assist — +2 bonus when a companion is present. Stacks
  // with weather + equipped stat bonuses. Narrative: the follower is
  // helping you.
  const assistBonus = opts?.companionAssist ? 2 : 0;
  const assistLabel = assistBonus ? ` + ${assistBonus} (companion assist)` : '';
  // Status-effect mods — e.g. maneuver's build-mismatch applies one
  // or more `surprised` stacks for -2 each. Caller passes rollMods
  // computed for 'skill' action. QA flagged that this layer existed
  // for attack rolls but never reached skill checks.
  const sMods = opts?.statusMods;
  const statusNet = sMods?.net ?? 0;
  const statusLabel = sMods && sMods.sources.length > 0 ? ` ${statusNet >= 0 ? '+' : ''}${statusNet} (${sMods.sources.join(', ')})` : '';

  return [{
    id: 'skill_check',
    label,
    sides: 20,
    count: 1,
    bonus: statVal + assistBonus + statusNet,
    bonusLabel: `${statLabel} ${statVal}${assistLabel}${statusLabel}`,
    target: dc,
    targetLabel: `DC ${dc}${dcName ? ` — ${dcName}` : ''}`,
    context: `d20 + ${statLabel}${assistLabel}${statusLabel} vs ${dcName || 'DC'} ${dc}`,
  }];
}
