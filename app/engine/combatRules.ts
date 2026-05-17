import type { RollStep, PlayerCharacter, Enemy } from './types';
import { rollDie } from './rng';
import { findWeaponByName, type CatalogWeapon } from './crafting';
import { effectiveStats } from './equipment';

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
  return isNaN(ap) ? 8 : Math.max(5, Math.min(18, 5 + ap));
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
    /** When set, the attack is being made out of normal weapon range
     *  (e.g. melee swing at close range during Iron Fog, when
     *  repositioning is locked). Applies a -5 to the attack roll and
     *  notes it in the bonus label so the player sees why it missed. */
    blindSwing?: boolean;
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
  // (rings/amulets boosting STR/DEX/INT/WIS/CHA).
  const stats = effectiveStats(player);
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
    {
      id: 'attack',
      label: 'Roll to ATTACK',
      sides: 20,
      count: 1,
      bonus: stat.value + (opts?.blindSwing ? -5 : 0),
      bonusLabel: opts?.blindSwing
        ? `${stat.label} ${stat.value} − 5 (blind swing)`
        : `${stat.label} ${stat.value}`,
      target: ac,
      targetLabel: `AC ${ac}`,
      context: opts?.blindSwing
        ? `d20 + ${stat.label} − 5 (out of reach, swinging blind) to hit ${enemy.name}`
        : `d20 + ${stat.label} to hit ${enemy.name}`,
    },
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
): RollStep[] {
  const statKey = SKILL_STAT[intent] ?? 'wisdom';
  const stats = effectiveStats(player);
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
