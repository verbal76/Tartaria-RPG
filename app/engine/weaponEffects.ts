// Lightweight parser for the rulebook's "Effect or Special Property"
// column on CatalogWeapon. Recognizes a handful of common patterns and
// produces structured hooks the combat code can consume. Anything we
// don't parse stays as flavor on the item preview.
//
// Patterns recognized:
//   "+1d6 against Large creatures"     → large
//   "+1d6 against constructs"           → construct
//   "+1d6 against structures"           → structure (no enemy match yet)
//   "+1d6 against mechanical"           → mechanical
//   "+1d6 against animals"              → animal
//   "+1d6 against energy-shielded"      → shielded
//   "+1d6 against magical creatures"    → magical
//   "+1d6 against airborne enemies"     → aerial
//   "Causes bleed"                      → onHitBleed
//   "Causes burns" / "burn damage"      → onHitBurn (placeholder)
//
// arb-fix — a weapon can now carry MORE THAN ONE "+NdN against X" clause
// (e.g. a longbow that hits Large creatures AND gets an anti-air bonus).
// Every matching clause rolls and stacks additively. Returns null when
// nothing matches — caller falls through.

import { rollFromNotation } from './rng';
import { enemyIsAerial, armorACPortions, PLATE_TRAIT_AC } from './enemyTraits';
import { reachBandsFor } from './types';
import type { CombatRange, Enemy } from './types';

export type BonusCondition =
  | 'large'
  | 'construct'
  | 'structure'
  | 'mechanical'
  | 'animal'
  | 'shielded'
  | 'magical'
  | 'darkness'
  | 'aetheric'
  | 'aerial';

/**
 * ⚠⚠⚠ OTA-1562 — THE EFFECT COLUMN WAS MOSTLY DECORATION. An audit of all 284
 * weapons found that only 56 of them carry an effect line anything reads: 23 go
 * through the "+NdN against X" clause above, 33 through `statBonuses`. The other
 * 184 print a sentence under a rules heading that no code has ever asked about.
 * The Compact Laser Pistol says *"Ignores light armor."* and does not. The
 * Aetheric Railgun says *"Ignores armor; long range."* and does neither. A
 * player who reads the card and buys the weapon for the promise on it has been
 * lied to by the game, which is a worse defect than the missing mechanic.
 *
 * ⚠⚠ THIS OTA TAKES THE TWO FAMILIES THAT LAND ON SYSTEMS THAT ALREADY EXIST —
 * range notes ride the reach bands, armour-ignore rides the AC step — so nothing
 * new has to be invented to make the sentences true. What deliberately does NOT
 * land here is any ignore gated on an outcome (*"on max damage roll"*, *"on
 * advantage rolls"*): those are decided AFTER the roll this reads, so they are a
 * different mechanic wearing the same words, and they wait for their own slice.
 * Parsing them here and quietly not applying them would just recreate the bug in
 * a new place.
 */

/** How a weapon's effect line changes the bands it can strike from. */
export type WeaponRangeNote = 'short' | 'long' | 'any';

export type ArmorIgnoreScope =
  /** "ignores armor" / "cuts through any armor" — worn plate AND raised fields. */
  | 'all'
  /** "ignores non-magical armor" / "non-Aetheric armor" — plate only, and
   *  nothing at all when the creature's own nature is the armour. */
  | 'nonmagical'
  /** "ignores light armor" — capped at one tier of plate. */
  | 'light'
  /** "ignores shields" — the raised Aether Shield only. */
  | 'shields'
  /** "ignores N armor points" — a flat number off whatever armour is there. */
  | 'points';

export interface ArmorIgnore {
  scope: ArmorIgnoreScope;
  /** Only meaningful for scope 'points'. */
  points?: number;
}

export interface ParsedWeaponEffect {
  /** Every "+NdN against X" clause on the weapon, each stacking additively. */
  bonuses?: Array<{ dice: string; condition: BonusCondition }>;
  onHitBleed?: boolean;
  onHitBurn?: boolean;
  /** OTA-1562 — "short range" / "long range" / "at any range". */
  rangeNote?: WeaponRangeNote;
  /** OTA-1562 — an unconditional armour piercer. See the note above on why
   *  outcome-gated ignores are NOT parsed into this field. */
  armorIgnore?: ArmorIgnore;
}

/**
 * ⚠⚠ THE GUARD THAT KEEPS THE PROMISE HONEST. An ignore clause qualified by an
 * outcome — a max damage roll, an advantage roll, once per encounter — is not
 * what this OTA implements, and a parser that matched it anyway would hand every
 * Plasma Scythe swing an unconditional armour pierce it was never meant to have.
 * Refusing the clause outright leaves the weapon exactly as it was, which is the
 * honest state until its own slice lands.
 */
// ⚠ OTA-1563 — WIDENED, because the first draft leaked. The Bone Spear
// Launcher's *"Bypasses shields permanently on THIRD max roll"* slipped the
// "on max" shape (an ordinal sat between the two words) and was handed a
// permanent, unconditional shield-break on every swing — a Rare weapon quietly
// out-performing the Legendary that has to earn it. Matching "max roll" and
// "rolls of N+" ANYWHERE in the clause closes the shape rather than one spelling
// of it.
const IGNORE_DEFERRED_RE =
  /\bmax\b|\badvantage\b|\bonce per\b|\bcritical\b|\brolls?\s+of\s+\d+/;

/** Rank the scopes so a two-clause line ("Cuts through any armor; ignores
 *  non-magical defenses") resolves to the STRONGER claim rather than the last
 *  one the regex happened to reach. */
const IGNORE_RANK: Record<ArmorIgnoreScope, number> = {
  all: 5, nonmagical: 4, light: 3, shields: 2, points: 1,
};

/**
 * ⚠⚠⚠ OTA-1563 — THE VERB LIST WAS THE REAL LIMIT. OTA-1562 read "ignores" and
 * "cuts through" and found eight weapons. The catalog was making the same
 * promise in six other verbs the whole time, and each of those weapons was
 * failing for a reason that had nothing to do with its design:
 *
 *   Bone Siege Crossbow  "Pierces armor; only energy armor resists."
 *   Plasma Cutter Knife  "Melts through armor; 1d6 burning damage."
 *   Aetheric Blade       "bypasses non-magical defenses."
 *   Energy Blade         "Cuts non-magical armor; +1d6 on max roll."
 *   Laser Blade          "Cuts through metal; +1d6 against armor."
 *   Aether Lance         "Disrupts energy shields; …"
 *   Winter's Verdict     "the freeze carries through armour and holds"
 *
 * ⚠⚠ WHAT IS DELIBERATELY STILL NOT A VERB, because the distinction is real:
 * `reduces` / `splits`. The four Mud blades that *"reduce enemy armor by N"* are
 * a SHRED — a lasting change to the enemy that the acid-coating path already
 * models — not a one-swing bypass, and folding them in here would make the shred
 * permanent, free, and invisible. They wait for the shred slice.
 */
const IGNORE_VERB_RE =
  /\bignor\w*\b|\bcuts?\b|\bmelts?\s+through\b|\bpunches?\s+through\b|\bpierces?\b|\bbypass\w*\b|\bdisrupts?\b|\bcarries\s+through\b/;

function armorIgnoreFromClause(clause: string): ArmorIgnore | null {
  if (!IGNORE_VERB_RE.test(clause)) return null;
  // "Ignores cover" and "Ignores wind conditions" are real effects — they are
  // just not THIS effect. Requiring an armour noun keeps them out of the AC math
  // and leaves them for the weather/cover slice. `metal` joins the nouns for the
  // Laser Blade's "cuts through metal", which is what plate is made of.
  if (!/\barmou?r\b|\barmou?r\s+points?\b|\bdefen[cs]es?\b|\bshields?\b|\bmetal\b/.test(clause)) return null;
  if (IGNORE_DEFERRED_RE.test(clause)) return null;
  const pts = clause.match(/(\d+)\s+armou?r\s+points?/);
  if (pts) return { scope: 'points', points: parseInt(pts[1]!, 10) };
  if (/\blight\s+armou?r\b/.test(clause)) return { scope: 'light' };
  if (/\bnon-?\s*(?:magical|aetheric|aether)\b/.test(clause)) return { scope: 'nonmagical' };
  // ⚠ "only energy armor resists" and "cuts through metal" are the same claim
  // said from the other side: mundane plate opens, an energised field does not.
  if (/\bonly\s+energy\s+armou?r\s+resists\b|\bmetal\b/.test(clause)) return { scope: 'nonmagical' };
  // A clause naming ONLY shields is a shield-breaker; one naming armour (with or
  // without shields alongside) is the broader claim.
  if (/\barmou?r\b|\bdefen[cs]es?\b/.test(clause)) return { scope: 'all' };
  return { scope: 'shields' };
}

function rangeNoteFrom(text: string): WeaponRangeNote | null {
  if (/\bat any range\b/.test(text)) return 'any';
  if (/\bshort[- ]?ranged?\b/.test(text)) return 'short';
  // ⚠ OTA-1563 — a thrown weapon says it reaches in the vocabulary of THROWING,
  // not of range bands: the Bone Javelin's *"Longer throw than a knife"* and the
  // Tartarian Spear's *"Long throw"* are the same claim the Bone War Javelin
  // spells out as "Long range", and were the only three the note could ever
  // matter for (a thrown weapon's class already stops short of `distant`; a
  // rifle's does not).
  if (/\blong[- ]?ranged?\b|\blong(?:er)?\s+throw\b/.test(text)) return 'long';
  return null;
}

/**
 * ⚠⚠ OTA-1562 — WHAT A RANGE NOTE DOES TO THE BANDS. `bands` arrives ordered
 * OUTERMOST-FIRST (`['distant','far','mid','close']`), which is what makes
 * "short" a single shift off the front rather than a rewritten table.
 *
 * A note can only ever move a weapon WITHIN the ranged family — it never
 * promotes a melee weapon into a shooter (a pike that reaches `mid` is still a
 * pike), and `short` never strips a weapon below close+mid, because a thrown
 * knife you cannot throw is not a short-ranged weapon, it is a broken one.
 */
export function applyRangeNote(
  bands: readonly CombatRange[],
  note: WeaponRangeNote | null | undefined,
): CombatRange[] {
  const out = [...bands];
  if (!note || out.length <= 1) return out;
  if (note === 'any' || note === 'long') {
    const full = reachBandsFor('ranged');
    return out.length >= full.length ? out : full;
  }
  // ⚠⚠⚠ OTA-1563 — 'short' TAKES NOTHING AWAY. It used to give up the outermost
  // band, which made the word mean something at the cost of shortening five
  // weapons players already own. The owner's call: *"remove the nerfs from 1a."*
  //
  // ⚠⚠ AND THE NOTE STILL MEANS SOMETHING, because the difference was never
  // supposed to come from the short end. A throwable's class bands ALREADY stop
  // short of `distant` — that IS short range, correctly modelled, and always was.
  // What was missing was the other half of the ladder: a "long range" throwable
  // reaching a band its class does not. So the ladder is now built entirely out
  // of PROMOTIONS — a long-range weapon climbs, a short-range one is simply
  // telling you what its class already does. Nobody's weapon gets worse.
  return out;
}

/**
 * ⚠⚠ OTA-1562 — HOW MUCH AC AN ARMOUR PIERCER ACTUALLY REMOVES. The rule is
 * that "ignores armour" removes exactly the AC that ARMOUR added, no more: the
 * portions come from `armorACPortions`, so a piercer can never eat the `agile`
 * +1 (footwork is not armour) and can never drive AC below what an unarmoured
 * version of the same creature would have. It returns a positive number the
 * caller subtracts, so a creature wearing nothing gives back 0 and the weapon
 * simply behaves as it always did.
 */
export function armorIgnoreReduction(
  ignore: ArmorIgnore | null | undefined,
  enemy: { traits?: readonly string[]; name?: string; type?: string } | null | undefined,
): number {
  if (!ignore || !enemy) return 0;
  const { plate, field } = armorACPortions(enemy.traits);
  switch (ignore.scope) {
    case 'all':
      return plate + field;
    case 'shields':
      return field;
    case 'light':
      return Math.min(plate, PLATE_TRAIT_AC);
    case 'nonmagical': {
      // ⚠ "Ignores non-Aetheric armour" has to mean something against an
      // Aetheric creature, or the qualifier is decoration. On a thing whose own
      // substance is aether, the armour IS magical and the edge finds nothing to
      // skip; a raised field is likewise never mundane, so it is excluded either
      // way.
      const sig = `${enemy.name ?? ''} ${enemy.type ?? ''}`.toLowerCase();
      if (/aether|magical|spirit|wraith|apparition|phantom/.test(sig)) return 0;
      return plate;
    }
    case 'points':
      return Math.max(0, Math.min(ignore.points ?? 0, plate + field));
    default:
      return 0;
  }
}

/** Map the free-text target phrase to a structured condition, or null. */
function conditionFromTarget(tgt: string): BonusCondition | null {
  if (/large/.test(tgt)) return 'large';
  if (/construct/.test(tgt)) return 'construct';
  if (/structure|building|vehicle/.test(tgt)) return 'structure';
  // aerial BEFORE mechanical so "airborne / aerial / flying" targets route to
  // the flyer match (drones are both — the aerial bonus is the point).
  if (/aerial|airborne|flying|flyer/.test(tgt)) return 'aerial';
  if (/mechanical|machine|automaton|drone|sentinel/.test(tgt)) return 'mechanical';
  if (/animal|beast|creature.*natural/.test(tgt)) return 'animal';
  if (/shield|shielded|energy-shield/.test(tgt)) return 'shielded';
  if (/magic|magical|supernatural/.test(tgt)) return 'magical';
  if (/dark|darkness/.test(tgt)) return 'darkness';
  if (/aetheric|aether/.test(tgt)) return 'aetheric';
  return null;
}

export function parseWeaponEffect(effect: string | undefined | null): ParsedWeaponEffect | null {
  if (!effect) return null;
  const text = effect.toLowerCase();
  const out: ParsedWeaponEffect = {};
  let touched = false;

  // "+NdN [type] [damage] against X" — extract dice + condition for EVERY
  // clause. The optional middle group allows a damage-type adjective between
  // the dice and "damage"/"against": "+1d4 aetheric damage against …",
  // "+2d6 burn against …", "+1d6 to large creatures".
  const re = /\+\s*(\d+d\d+)(?:\s+\w+)?\s+(?:damage\s+)?(?:against|to|vs\.?|versus)\s+([^.;,]+)/g;
  const bonuses: Array<{ dice: string; condition: BonusCondition }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const dice = m[1]!;
    const condition = conditionFromTarget(m[2]!.trim());
    if (condition) bonuses.push({ dice, condition });
  }
  if (bonuses.length > 0) {
    out.bonuses = bonuses;
    touched = true;
  }

  if (/\bcauses?\s+bleed\b|\bbleed\s+(?:damage|effect)?\b/.test(text)) {
    out.onHitBleed = true;
    touched = true;
  }
  if (/\bcauses?\s+burn\b/.test(text) || /\bburn(?:ing)?\s+damage\b/.test(text)) {
    out.onHitBurn = true;
    touched = true;
  }

  // OTA-1562 — the range note is read off the whole line; there is never more
  // than one, and no weapon in the catalog claims two.
  const note = rangeNoteFrom(text);
  if (note) {
    out.rangeNote = note;
    touched = true;
  }

  // OTA-1562 — armour-ignore is read CLAUSE BY CLAUSE, because the qualifier
  // that matters ("on max damage roll") attaches to its own clause and must not
  // be able to disqualify — or license — a different one on the same line.
  let best: ArmorIgnore | null = null;
  for (const clause of text.split(/[.;]/)) {
    const found = armorIgnoreFromClause(clause);
    if (!found) continue;
    if (!best || IGNORE_RANK[found.scope] > IGNORE_RANK[best.scope]) best = found;
    else if (best.scope === 'points' && found.scope === 'points') {
      best = { scope: 'points', points: Math.max(best.points ?? 0, found.points ?? 0) };
    }
  }
  if (best) {
    // ⚠⚠ OTA-1563 — A QUALIFIER CAN SIT IN A DIFFERENT CLAUSE FROM THE CLAIM.
    // The Bone Siege Crossbow says *"Pierces armor; only energy armor resists."*
    // — clause one is an unqualified `all`, and clause two is the exception that
    // makes it `nonmagical`. Clause-by-clause ranking cannot see that on its own
    // (the exception carries no ignore verb, so it scores nothing), and the
    // weapon came out stronger than its own sentence. The cap is applied to the
    // finished answer, where the whole line is in view.
    if (best.scope === 'all' && /\bonly\s+energy\s+armou?r\s+resists\b/.test(text)) {
      best = { scope: 'nonmagical' };
    }
    out.armorIgnore = best;
    touched = true;
  }

  return touched ? out : null;
}

/** True if the parsed condition matches the given enemy. Used at
 *  damage-application time to know whether to roll the bonus dice. */
export function effectConditionMatches(
  cond: BonusCondition | undefined,
  enemy: Enemy,
): boolean {
  if (!cond) return false;
  const name = enemy.name.toLowerCase();
  const type = (enemy.type ?? '').toLowerCase();
  const sig = `${name} ${type}`;
  switch (cond) {
    case 'large':
      return /titan|giant|leviathan|behemoth|kraken|wyvern|dragon|golem|sentinel|chimera|cyclops/.test(sig);
    case 'construct':
      return /construct|automation|sentinel|drone|spider|knight|warden|mechanism/.test(type) ||
             /construct|automation|sentinel|drone|knight|mechanism/.test(name);
    case 'structure':
      return false; // structures aren't enemies in our schema yet
    case 'mechanical':
      return /automation|mechanism|drone|cog|gear/.test(sig);
    case 'animal':
      return /animal/.test(type);
    case 'shielded':
      return (enemy.traits ?? []).some((t) => /shield|warded/.test(t.toLowerCase()));
    case 'magical':
      return /aetheric|spirit|wraith|apparition|banshee|ghost|phantom/.test(sig);
    case 'darkness':
      return /shade|shadow|phantom|wraith|dark/.test(sig);
    case 'aetheric':
      return /aetheric|aether|aetherkin/.test(sig);
    case 'aerial':
      return enemyIsAerial(enemy);
    default:
      return false;
  }
}

/** Roll the bonus damage for EVERY matching clause and sum them. Returns 0
 *  when no bonus applies. */
export function rollEffectBonusDamage(
  effect: ParsedWeaponEffect | null,
  enemy: Enemy,
): number {
  if (!effect?.bonuses) return 0;
  let total = 0;
  for (const b of effect.bonuses) {
    if (effectConditionMatches(b.condition, enemy)) total += rollFromNotation(b.dice);
  }
  return total;
}
