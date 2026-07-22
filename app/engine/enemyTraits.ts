// Per-enemy combat traits. Layer on top of the existing macro
// type-resistance map (Constructs resist slashing, Mutations weak to burn,
// etc.) so individual enemies can have their own perks without having to
// invent a new `type` for every variant.
//
// Each trait is a short string id. Some take a damage-type argument after
// a colon — "resist:slashing", "vulnerable:burn". Unknown ids are ignored,
// so the catalog can drift ahead of code without breaking saves.

import { canonicalDamageType } from './damageTypes';

// arb-fix — flying / hovering enemies the dog can't reach (it can't jump
// that high), and that ranged "+Nd6 against airborne enemies" weapons get a
// bonus against. Primary signal is the explicit `aerial` trait; a name/type
// fallback catches drones / bats authored before the trait existed.
export function enemyIsAerial(enemy: {
  traits?: readonly string[];
  name?: string;
  type?: string;
} | null | undefined): boolean {
  if (!enemy) return false;
  if ((enemy.traits ?? []).some((t) => /^aerial$|flying|airborne/i.test(t))) return true;
  const sig = `${enemy.name ?? ''} ${enemy.type ?? ''}`.toLowerCase();
  return /\bdrone\b|\bbat\b|flying|airborne|wyvern|harpy|aetherwing/.test(sig);
}

/** Stat-style modifiers — applied to enemy AC / attack rolls. */
export function traitACBonus(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  let bonus = 0;
  for (const t of traits) {
    if (t === 'armored') bonus += 2;
    else if (t === 'weak_armor') bonus -= 2;
    else if (t === 'agile') bonus += 1;
  }
  return bonus;
}

export function traitAttackBonus(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  let bonus = 0;
  for (const t of traits) {
    if (t === 'quick') bonus += 1;
    else if (t === 'slow') bonus -= 1;
    else if (t === 'savage') bonus += 1;
  }
  return bonus;
}

/** Per-enemy `resist:<type>` / `vulnerable:<type>` traits collapsed into the
 *  damage types this enemy resists / is weak to. Layered on top of the macro
 *  type-resistance map by the EnemyPanel so the player sees the full picture. */
export function traitDefenses(
  traits: readonly string[] | undefined,
): { resists: string[]; weaknesses: string[] } {
  const resists: string[] = [];
  const weaknesses: string[] = [];
  for (const t of traits ?? []) {
    const [key, arg] = t.split(':');
    if (!arg) continue;
    if (key === 'resist') resists.push(arg.toLowerCase());
    else if (key === 'vulnerable') weaknesses.push(arg.toLowerCase());
  }
  return { resists, weaknesses };
}

/** Damage-side resistance / vulnerability traits. Returns the multiplier
 *  applied to incoming damage of the given type. Stacks multiplicatively
 *  with other modifiers. */
export function traitDamageMultiplier(
  traits: readonly string[] | undefined,
  weaponDamageType: string | null | undefined,
): { multiplier: number; match: 'resist' | 'vulnerable' | 'normal' } {
  if (!traits || !weaponDamageType) return { multiplier: 1, match: 'normal' };
  // OTA-827 [Group-K] — canonicalize both sides through the shared alias table so
  // a `force` weapon matches a `resist:aetheric` trait and a `frost` weapon matches
  // a `vulnerable:cold` trait (the two Core Guardians' authored cold traits now fire
  // against the new frost weapons). Identity for a non-aliased type.
  const wt = canonicalDamageType(weaponDamageType);
  for (const t of traits) {
    const [key, arg] = t.split(':');
    if (!arg) continue;
    if (key === 'resist' && canonicalDamageType(arg) === wt) return { multiplier: 0.5, match: 'resist' };
    if (key === 'vulnerable' && canonicalDamageType(arg) === wt) return { multiplier: 1.5, match: 'vulnerable' };
  }
  return { multiplier: 1, match: 'normal' };
}

/** OTA-698 — reconcile the creature-TYPE damage table with an enemy's
 *  authored resist/vulnerable TRAIT for the same damage type.
 *
 *  The two systems are meant to STACK when they agree — a Construct
 *  (resist:slashing by type) that ALSO carries a resist:slashing trait
 *  halves twice (x0.25). But when they DISAGREE — e.g. an Aetheric
 *  Creature (type resists aetheric) authored vulnerable:aetheric — the
 *  old code multiplied 0.5 x 1.5 = 0.75 and printed BOTH "shrugs off" and
 *  "vulnerable" on the same hit, and the swap-nag steered the player away
 *  from the enemy's real weakness. A per-enemy authored trait is a
 *  deliberate override, so on a DISCORD the trait wins; otherwise stack. */
export function combineDamageTypeMatch(
  typeMatch: 'weak' | 'resist' | 'normal',
  traitMatch: 'resist' | 'vulnerable' | 'normal',
): { multiplier: number; match: 'weak' | 'resist' | 'normal' } {
  const typeMult = typeMatch === 'weak' ? 1.5 : typeMatch === 'resist' ? 0.5 : 1;
  const traitMult = traitMatch === 'vulnerable' ? 1.5 : traitMatch === 'resist' ? 0.5 : 1;
  const typeDir = typeMatch === 'weak' ? 1 : typeMatch === 'resist' ? -1 : 0;
  const traitDir = traitMatch === 'vulnerable' ? 1 : traitMatch === 'resist' ? -1 : 0;
  if (typeDir !== 0 && traitDir !== 0 && typeDir !== traitDir) {
    return { multiplier: traitMult, match: traitMatch === 'vulnerable' ? 'weak' : 'resist' };
  }
  const multiplier = typeMult * traitMult;
  return { multiplier, match: multiplier > 1 ? 'weak' : multiplier < 1 ? 'resist' : 'normal' };
}

/** True if the enemy has a trait that should fire status-effect on its
 *  successful melee hits. Returns the effect kind to apply, or null. */
export function traitOnHitStatus(
  traits: readonly string[] | undefined,
  rng: () => number = Math.random,
): { kind: 'bleed' | 'poisoned' | 'stun'; rounds: number; label: string } | null {
  if (!traits) return null;
  for (const t of traits) {
    if (t === 'bleeder' && rng() < 0.5) {
      return { kind: 'bleed', rounds: 3, label: 'bleeding' };
    }
    if (t === 'venomous' && rng() < 0.35) {
      return { kind: 'poisoned', rounds: 3, label: 'poisoned' };
    }
    if (t === 'concussive' && rng() < 0.2) {
      return { kind: 'stun', rounds: 1, label: 'stunned' };
    }
  }
  return null;
}

/** Per-round HP regeneration. Negative numbers mean DOT-style decay (rare
 *  — currently no enemy has it but the field reads cleanly). Capped at
 *  the enemy's starting HP by the caller. */
export function traitRegen(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  for (const t of traits) {
    if (t === 'regenerate') return 1;
    if (t === 'fast_regen') return 2;
  }
  return 0;
}

/** First-strike bonus on the enemy's opening attack (consumed after one
 *  successful hit). Caller tracks consumption per encounter. */
export function traitAmbushBonus(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  for (const t of traits) {
    if (t === 'ambush_strike') return 2;
  }
  return 0;
}

/** Chance (0..1) that this enemy can dodge an otherwise-successful player
 *  attack. `agile` enemies have the strongest dodge; `quick` enemies
 *  catch a slimmer save. Slow enemies dodge nothing (returns 0). */
export function traitDodgeChance(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  let chance = 0;
  for (const t of traits) {
    // OTA-912 — trimmed (agile 0.25->0.18, quick 0.15->0.12) so a slippery foe slips the
    // odd blow without stonewalling a long fight.
    if (t === 'agile') chance = Math.max(chance, 0.18);
    else if (t === 'quick') chance = Math.max(chance, 0.12);
  }
  return chance;
}

/** OTA-912 — a CRUSHING blow can't be twisted clear. A crit never dodges, and beating the
 *  enemy's AC by DODGE_BEATEN_MARGIN or more always lands (no more "rolled 29, whiffed").
 *  Only marginal hits face the (reduced) trait dodge chance. */
export const DODGE_BEATEN_MARGIN = 8;
export function enemyDodgesHit(
  traits: readonly string[] | undefined,
  attackTotal: number,
  enemyAc: number,
  isCrit: boolean,
  rng: () => number = Math.random,
): boolean {
  if (isCrit) return false;
  const chance = traitDodgeChance(traits);
  if (chance <= 0) return false;
  if (attackTotal - enemyAc >= DODGE_BEATEN_MARGIN) return false;
  return rng() < chance;
}

/** Human-readable trait summary for the EnemyPanel. Shortens to badges
 *  the UI can chip-list. Unknown ids passed through verbatim so the data
 *  team can experiment without code changes. */
const TRAIT_LABEL: Record<string, string> = {
  armored: 'Armored',
  weak_armor: 'Weak Armor',
  agile: 'Agile',
  quick: 'Quick',
  slow: 'Slow',
  savage: 'Savage',
  bleeder: 'Bleeder',
  venomous: 'Venomous',
  concussive: 'Concussive',
  regenerate: 'Regen',
  fast_regen: 'Fast Regen',
  ambush_strike: 'Ambusher',
};

export function describeTrait(t: string): string {
  // resist:slashing / vulnerable:burn → "Resist Slashing" / "Vuln Burn"
  const [key, arg] = t.split(':');
  if (arg) {
    if (key === 'resist') return `Resist ${arg.charAt(0).toUpperCase()}${arg.slice(1)}`;
    if (key === 'vulnerable') return `Vuln ${arg.charAt(0).toUpperCase()}${arg.slice(1)}`;
  }
  return TRAIT_LABEL[t] ?? t;
}

export function describeTraits(traits: readonly string[] | undefined): string {
  if (!traits || traits.length === 0) return '';
  return traits.map(describeTrait).join(' · ');
}
