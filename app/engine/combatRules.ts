import type { RollStep, PlayerCharacter, Enemy, Stats, StatusEffect } from './types';
import { rollDie } from './rng';
import { findWeaponByName, type CatalogWeapon } from './crafting';
import { effectiveStats } from './equipment';
import { traitACBonus } from './enemyTraits';

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
  return Math.max(1, base + traitACBonus(enemy.traits));
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
  const dmg = equipped ? parseDamageDice(equipped.damageDice) : damageDice(wc);
  const damageTypeNote = equipped
    ? ` (${equipped.damageType})`
    : forcesBarehand ? ' (bludgeoning)' : '';

  return [
    {
      id: 'initiative',
      label: 'Roll for INITIATIVE',
      sides: 10,
      count: 1,
      bonus: 0,
      bonusLabel: '',
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
      };
    })(),
    {
      id: 'damage',
      label: 'Roll for DAMAGE',
      sides: dmg.sides,
      count: dmg.count,
      bonus: 0,
      bonusLabel: '',
      context: `damage dealt to ${enemy.name}${damageTypeNote}`,
      // no target — always applies if the attack hit
    },
  ];
}

// Parse a damage notation string like "2d6" or "1d10+1d6" into a single
// {sides, count} we can roll. For multi-die notations we pick the larger
// die and double the count to roughly preserve the range (close enough
// for a single roll step — we don't currently animate multiple groups).
function parseDamageDice(notation: string): { sides: number; count: number } {
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
};

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
  opts?: { weatherMod?: Partial<Stats> },
): RollStep[] {
  const statKey = SKILL_STAT[intent] ?? 'wisdom';
  const stats = effectiveStats(player, opts?.weatherMod);
  const statVal = stats[statKey];
  const statLabel = STAT_LABEL[statKey];
  const dc = SKILL_DC[intent] ?? 12;
  const dcName = DC_NAME[dc] ?? '';
  const verb = INTENT_ACTION_VERB[intent] ?? intent.toUpperCase();
  const label = `Roll to ${verb}`;

  return [{
    id: 'skill_check',
    label,
    sides: 20,
    count: 1,
    bonus: statVal,
    bonusLabel: `${statLabel} ${statVal}`,
    target: dc,
    targetLabel: `DC ${dc}${dcName ? ` — ${dcName}` : ''}`,
    context: `d20 + ${statLabel} vs ${dcName || 'DC'} ${dc}`,
  }];
}
