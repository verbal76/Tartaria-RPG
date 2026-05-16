import type { RollStep, PlayerCharacter, Enemy } from './types';
import { rollDie } from './rng';

type WeaponClass = 'ranged' | 'melee' | 'runecaster' | 'barehanded';

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
): RollStep[] {
  const wc = detectWeaponClass(actionText);
  const stat = attackStatFor(wc, player.stats);
  const ac = enemyAC(enemy);
  const enemyInit = rollDie(10);
  const dmg = damageDice(wc);

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
      bonus: stat.value,
      bonusLabel: `${stat.label} ${stat.value}`,
      target: ac,
      targetLabel: `AC ${ac}`,
      context: `d20 + ${stat.label} to hit ${enemy.name}`,
    },
    {
      id: 'damage',
      label: 'Roll for DAMAGE',
      sides: dmg.sides,
      count: dmg.count,
      bonus: 0,
      bonusLabel: '',
      context: `damage dealt to ${enemy.name}`,
      // no target — always applies if the attack hit
    },
  ];
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

export function buildSkillSteps(
  intent: string,
  player: PlayerCharacter,
): RollStep[] {
  const statKey = SKILL_STAT[intent] ?? 'wisdom';
  const statVal = player.stats[statKey];
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
