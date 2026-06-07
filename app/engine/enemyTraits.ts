// Per-enemy combat traits. Layer on top of the existing macro
// type-resistance map (Constructs resist slashing, Mutations weak to burn,
// etc.) so individual enemies can have their own perks without having to
// invent a new `type` for every variant.
//
// Each trait is a short string id. Some take a damage-type argument after
// a colon — "resist:slashing", "vulnerable:burn". Unknown ids are ignored,
// so the catalog can drift ahead of code without breaking saves.

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

/** Damage-side resistance / vulnerability traits. Returns the multiplier
 *  applied to incoming damage of the given type. Stacks multiplicatively
 *  with other modifiers. */
export function traitDamageMultiplier(
  traits: readonly string[] | undefined,
  weaponDamageType: string | null | undefined,
): { multiplier: number; match: 'resist' | 'vulnerable' | 'normal' } {
  if (!traits || !weaponDamageType) return { multiplier: 1, match: 'normal' };
  const wt = weaponDamageType.toLowerCase();
  for (const t of traits) {
    const [key, arg] = t.split(':');
    if (!arg) continue;
    if (key === 'resist' && arg.toLowerCase() === wt) return { multiplier: 0.5, match: 'resist' };
    if (key === 'vulnerable' && arg.toLowerCase() === wt) return { multiplier: 1.5, match: 'vulnerable' };
  }
  return { multiplier: 1, match: 'normal' };
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
    if (t === 'agile') chance = Math.max(chance, 0.25);
    else if (t === 'quick') chance = Math.max(chance, 0.15);
  }
  return chance;
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
