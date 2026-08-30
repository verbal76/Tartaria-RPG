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

/** The armour half of the AC traits, named once so `traitACBonus` and the
 *  OTA-1562 armour-piercing reader can never drift apart on what a trait costs. */
export const PLATE_TRAIT_AC = 2;
export const FIELD_TRAIT_AC = 3;

/** Stat-style modifiers — applied to enemy AC / attack rolls. */
export function traitACBonus(traits: readonly string[] | undefined): number {
  if (!traits) return 0;
  let bonus = 0;
  for (const t of traits) {
    if (t === 'armored') bonus += PLATE_TRAIT_AC;
    // OTA-1202 — a raised Aether Shield IS armour while it stands: same +3 the player's
    // field grants, read here so enemyAC and the panel agree for free.
    else if (t === 'field:aether_shield') bonus += FIELD_TRAIT_AC;
    else if (t === 'weak_armor') bonus -= 2;
    else if (t === 'agile') bonus += 1;
  }
  return bonus;
}

/**
 * ⚠⚠ OTA-1562 — HOW MUCH OF THAT AC IS ACTUALLY ARMOUR? `traitACBonus` answers
 * "what do the traits add up to", which is the wrong question to ask on behalf
 * of a weapon that claims to ignore armour: `agile` is +1 because the thing
 * MOVES, and no railgun ever built pierces footwork. Splitting the sum here
 * means the armour-ignore reader subtracts exactly the AC that armour put on.
 *
 * `plate` is mundane worn armour; `field` is a raised Aether Shield, which is
 * armour AND magical — so a "non-magical armour" piercer must leave it standing.
 * `weak_armor` is deliberately excluded: it is NEGATIVE, and folding it in would
 * have an armour-piercing hit HAND AC BACK to a badly-armoured foe.
 */
export function armorACPortions(
  traits: readonly string[] | undefined,
): { plate: number; field: number } {
  let plate = 0;
  let field = 0;
  for (const t of traits ?? []) {
    if (t === 'armored') plate += PLATE_TRAIT_AC;
    else if (t === 'field:aether_shield') field += FIELD_TRAIT_AC;
  }
  return { plate, field };
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
): { multiplier: number; match: 'resist' | 'vulnerable' | 'normal' | 'inured' } {
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
    // ⚠ OTA-1093 — `inured:<type>` CANCELS this individual's kind-wide WEAKNESS
    // to that type. It does NOT make the hit worse; it makes it ordinary. See
    // combineDamageTypeMatch, and randomizeEnemyDefense which is the only thing
    // that stamps it. The distinction is the whole point of this OTA: the
    // per-spawn profiler used to write `resist:` here, which INVERTED a kind's
    // softness into armour — a man in a leather vest shrugging off a crossbow
    // bolt at ×0.5 (owner's device log, 2026-08-04).
    if (key === 'inured' && canonicalDamageType(arg) === wt) return { multiplier: 1, match: 'inured' };
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
  traitMatch: 'resist' | 'vulnerable' | 'normal' | 'inured',
): { multiplier: number; match: 'weak' | 'resist' | 'normal' } {
  // OTA-1093 — `inured` is a CANCELLATION, not a direction, so it resolves
  // before the stack/discord math: whatever the type table says, this
  // individual takes that type as an ordinary hit. It can only ever cancel a
  // WEAKNESS — an inured trait on a type the kind already resists leaves the
  // kind's armour alone (you cannot be "used to" something that was never
  // soft), which keeps Constructs from being talked out of their plating.
  if (traitMatch === 'inured') {
    return typeMatch === 'weak'
      ? { multiplier: 1, match: 'normal' }
      : { multiplier: typeMatch === 'resist' ? 0.5 : 1, match: typeMatch };
  }
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
  {
    // OTA-1202 — technique-family traits get real names in the portrait.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AT = require('./aetherTechniques') as typeof import('./aetherTechniques');
    const tech = AT.describeTechniqueTrait(t);
    if (tech) return tech;
  }
  // resist:slashing / vulnerable:burn → "Resist Slashing" / "Vuln Burn"
  const [key, arg] = t.split(':');
  if (arg) {
    if (key === 'resist') return `Resist ${cap(arg)}`;
    if (key === 'vulnerable') return `Vuln ${cap(arg)}`;
    // ⚠⚠ OTA-1527 — `inured:` HAD NO LABEL, so it fell through to `TRAIT_LABEL[t] ?? t`
    // and printed its own raw id: the owner's portrait showed `inured:slashing`,
    // `inured:poison`, `inured:corruption` beside properly-worded chips.
    //
    // ⚠ AND THE OBVIOUS LABEL WOULD HAVE BEEN A LIE. `inured` is a CANCELLATION,
    // not armour — traitDamageMultiplier returns ×1.0 and combineDamageTypeMatch
    // only ever cancels a WEAKNESS ("you cannot be 'used to' something that was
    // never soft"). Calling it `Resist Slashing` would tell the player to put the
    // axe away when the axe is merely ORDINARY here, which is the same inversion
    // OTA-1093 was written to undo. `Not Weak:` says exactly what it does: its
    // kind is soft to this, and this one is not.
    if (key === 'inured') return `Not Weak: ${cap(arg)}`;
  }
  return TRAIT_LABEL[t] ?? t;
}

function cap(s: string): string {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** ⚠⚠⚠ OTA-1527 — WHICH TRAIT CHIPS THE PORTRAIT MAY PRINT, AND WHY THE LIST IS
 *  SHORTER THAN THE TRAITS.
 *
 *  The owner's screenshot of an Eternal Dynasty Raider printed twelve chips. The
 *  card above them read `RESIST Aetheric · WEAK Burn`. Reconstructing the spawn
 *  from its own chips — randomizeEnemyDefense stamps `inured:` on every
 *  kind-weakness EXCEPT the rolled one, so inured{slashing, poison, corruption}
 *  plus vulnerable:piercing identifies a Human exactly — its real defences are
 *  `RESIST Aetheric · WEAK Piercing, Slashing, Poison, Corruption`. No enemy type
 *  in TYPE_RESISTANCE_MAP yields `WEAK Burn` alone for that trait set. The card
 *  was therefore in the OTA-838 OBSERVED branch, printing only what the player had
 *  learned by hitting — while the chip row underneath spelled out `Vuln Piercing`
 *  and `Resist Aetheric` in full.
 *
 *  ⚠⚠ THE CHIP ROW DEFEATED THE INTEL GATE. OTA-798 gates the RESIST/WEAK block on
 *  Wisdom, OTA-838 replaces it with strike-to-learn, and OTA-1117 added a dial that
 *  switches the free read off entirely. All three guard one reader. The chip row
 *  guarded nothing: it mapped every trait unconditionally, so a card reading
 *  `DEF ? — strike to learn` could still be answered by reading two lines down.
 *  The detail popup had the identical hole — it narrates the gate's refusal and
 *  then lists the raw traits beneath it.
 *
 *  So the rule is by KIND, not by blanket gating:
 *   • `resist:` / `vulnerable:` — dropped always. Not censored: REDUNDANT. Both
 *     already feed defensesFor, so whatever they say is in the RESIST/WEAK line
 *     with the type table folded in. The chip was the raw input to a sum the card
 *     had already printed.
 *   • `inured:` — real information the RESIST/WEAK line cannot carry (traitDefenses
 *     ignores it), so it is kept — behind the same gate, because "its kind is soft
 *     here and this one isn't" is exactly the intel Wisdom is supposed to buy.
 *   • `profiled` — never a trait. It is randomizeEnemyDefense's idempotence marker
 *     and reached the player only because it fell through `TRAIT_LABEL[t] ?? t`.
 *   • everything else — ungated. Armored, Savage, Quick, Ambusher, Bleeder,
 *     Concussive describe how the thing FIGHTS, which you learn by looking at it;
 *     hiding those would be blindness rather than difficulty, the trade OTA-1117
 *     explicitly refused. */
export function portraitTraitChips(
  traits: readonly string[] | undefined,
  canReadDefenses: boolean,
): string[] {
  const out: string[] = [];
  for (const t of traits ?? []) {
    if (t === 'profiled') continue;
    const [key, arg] = t.split(':');
    if (arg && (key === 'resist' || key === 'vulnerable')) continue;
    if (arg && key === 'inured') {
      if (canReadDefenses) out.push(t);
      continue;
    }
    out.push(t);
  }
  return out;
}

/** ⚠⚠⚠ OTA-1528 — WHAT "STRIKE TO LEARN" IS ALLOWED TO REMEMBER, AND ABOUT WHOM.
 *
 *  The owner's portrait said `WEAK Burn` about a raider whose own chips said
 *  `Vuln Piercing`. It was not an arithmetic error. `recordEnemyIntel` keyed the
 *  bestiary on `enemy.name.toLowerCase()` — "eternal dynasty raider 1" — while
 *  `randomizeEnemyDefense` rolls a FRESH weakness for every spawn. His own log,
 *  one corpus, three raiders:
 *
 *    Weakness exposed — Raider 1 flinches. (burn ×1.5 for 5)
 *    Weakness exposed — Raider 2 flinches. (piercing ×2.25 for 13)
 *    Weakness exposed — Raider 3 flinches. (piercing ×2.25 for 21)
 *
 *  Two different answers under three names that repeat every encounter. So the
 *  card faithfully reported intel filed under a label that is not an identity:
 *  a Raider 1 from an earlier fight was weak to burn, and every Raider 1 since
 *  has been described with that fact. Strike-to-learn was teaching the wrong
 *  answer to the next fight — worse than teaching nothing, because the player
 *  acts on it. (He did: burn weapon, piercing-weak foe.)
 *
 *  ⚠⚠ THE NAME WAS NEVER THE THING YOU LEARNED ABOUT. The spawn ordinal is
 *  presentation — which of the four is on the left — and it is reused every
 *  encounter. What you actually learn by hitting something is a fact about its
 *  DEFENCE PROFILE: the kind it is, plus the roll it got. So that is the key.
 *  The ordinal is stripped (a lesson about "Raider 1" is a lesson about raiders),
 *  and the defence-bearing traits are appended, so:
 *   • a later raider that rolled the SAME profile shows what you learned — it is
 *     genuinely the same thing, and re-learning it would be busywork;
 *   • a raider that rolled DIFFERENTLY shows nothing until struck — it genuinely
 *     is a different thing, and the old answer would be a lie.
 *
 *  ⚠ Only `resist:` / `vulnerable:` / `inured:` go into the signature. Armored,
 *  Savage, Quick and the rest describe how a thing FIGHTS, not what bites it;
 *  including them would split the bestiary on facts that have nothing to do with
 *  the question being asked and quietly re-create the same forgetting.
 *
 *  ⚠ Rows written under the old bare-name keys stop matching and simply go
 *  unread. That is deliberate: they hold exactly the mixed-up data this OTA
 *  exists to stop trusting, so silently keeping them in play would preserve the
 *  bug in the saves that already have it. They are left on disk rather than
 *  deleted — a migration that drops player data to fix a display is a worse
 *  trade than a few stale keys nobody reads. */
export function enemyIntelKey(
  name: string | null | undefined,
  traits: readonly string[] | undefined,
): string {
  const base = (name ?? '').toLowerCase().trim().replace(/\s+\d+$/, '');
  const sig = (traits ?? [])
    .filter((t) => {
      const [key, arg] = t.split(':');
      return !!arg && (key === 'resist' || key === 'vulnerable' || key === 'inured');
    })
    .map((t) => t.toLowerCase())
    .sort()
    .join(',');
  return sig ? `${base}|${sig}` : base;
}

export function describeTraits(traits: readonly string[] | undefined): string {
  if (!traits || traits.length === 0) return '';
  return traits.map(describeTrait).join(' · ');
}
