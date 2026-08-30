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
import type { CombatRange, Enemy, Stats } from './types';

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

/**
 * ⚠⚠⚠ OTA-1564 (slice 1b) — WHAT HAPPENS WHEN THE DICE COME UP PERFECT. The
 * catalog says "on a max roll" on TWENTY-SIX weapons and nothing anywhere reads
 * it. (My own estimate when I split the slices was four. That was wrong by more
 * than six times, and worth saying plainly: the max-roll family is the single
 * largest unread promise in the game.) Every payload differs — bonus damage,
 * stun, knockback, an execute — but they all wait on the SAME question, so the
 * trigger is built once here and the payloads read it.
 *
 * ⚠⚠ WHY THIS IS RISKIER THAN 1a, IN ONE SENTENCE: 1a adjusted a number BEFORE
 * the roll; everything here is decided AFTER one, and some of it has to be
 * remembered into the next round. That is the whole difference, and it is why
 * the payloads landed in this slice are only the ones that ride machinery that
 * already exists.
 */
export interface OnMaxRoll {
  /** "+1d6 on max roll" / "+1d6 fire damage on max roll". */
  bonusDice?: string;
  /** "+5 Aetheric damage on max roll". */
  bonusFlat?: number;
  /** "Reduces enemy armor by 1d6 on max roll" — rides the OTA-362 shred lever. */
  shredDice?: string;
  /** "Ignores armor on a max damage roll" / "Splits shields on a max roll". The
   *  attack roll is long resolved by the time a damage die lands, so this cannot
   *  lower the AC that was already beaten — what it does instead is OPEN the
   *  guard from here on, through the same shred the acid coating writes. */
  pierce?: 'armor' | 'shields';
  /** "+2 STR permanently on your first max damage roll". Write-once-forever
   *  needs only a flag saying it already happened — which is why it can land
   *  where "on the 5th max roll" could not. */
  permanentStat?: { stat: keyof Stats; amount: number };
  /** ⚠⚠ OTA-1566 — "Bypasses shields PERMANENTLY on your first max damage
   *  roll." Not a per-swing pierce: the first perfect strike UNLOCKS the weapon,
   *  and from then on its bypass is unconditional — it stops being an event and
   *  becomes part of what the weapon is. Same write-once flag as the stat gain. */
  permanentPierce?: 'armor' | 'shields';
  /** True when the payload is claimed on the FIRST max roll only. */
  onceEver?: boolean;
}

/**
 * ⚠⚠⚠ OTA-1565 (slice 1c) — THE BLAST. Nine weapons say the damage does not
 * stop at the thing you aimed at, and every one of them hit exactly one enemy.
 * This is the riskiest family in slice 1 and it was held to last on purpose: the
 * other slices adjusted the swing, this one reaches PAST the target and touches
 * things the swing never named — other enemies, and on two weapons, your own dog.
 *
 * ⚠⚠ `dice` is what each additional body takes; it is rolled ONCE for the blast
 * rather than per victim, because an explosion is one event. `whenMaxRoll` marks
 * the three that only go off on a perfect roll (OTA-1564's trigger, reused —
 * this slice adds no second answer to "did the dice come up perfect"). And
 * `hitsAllies` is carried explicitly rather than inferred, because a weapon that
 * can kill your companion must say so in its own data and on its own card.
 */
export interface SplashSpec {
  dice: string;
  /** Only on a max damage roll (Giant Warblade, Sword of Storms, War Hammer). */
  whenMaxRoll?: boolean;
  /** "enemies or allies", "(allies included)" — friendly fire is real. */
  hitsAllies?: boolean;
}

/** "Natural 1 → overheat, useless 2 rounds." A weapon that punishes you later. */
export interface OverheatSpec {
  /** Rounds the weapon is unusable. */
  rounds: number;
  /** "1d6 self damage" on the Aetheric Hand Cannon's overload. */
  selfDice?: string;
  /** A jam is confirmed by a second roll rather than automatic (Rust Rifle). */
  confirmed?: boolean;
  /** The word the weapon itself uses, so the Arbiter's line sounds like the
   *  weapon and not like a generic failure. */
  word: 'overheat' | 'overload' | 'jam';
  /**
   * ⚠⚠⚠ OTA-1566 — THE FUSE, restored on the owner's call: *"add the explode
   * option back to it, and add a counter number in the text after you use it."*
   * The counter is what makes this a good mechanic rather than the chore I cut
   * it as: a bomb with a VISIBLE fuse is a decision every round — keep firing or
   * holster it — where a hidden one is only an ambush. It is a tally, which is
   * the state shape 1b avoided, but a tally the player can read is a different
   * object from one they cannot.
   */
  explodeAfter?: number;
  /** What the detonation deals to everyone in the player's own band. */
  explodeDice?: string;
}

export interface ParsedWeaponEffect {
  /** Every "+NdN against X" clause on the weapon, each stacking additively. */
  bonuses?: Array<{ dice: string; condition: BonusCondition }>;
  onHitBleed?: boolean;
  onHitBurn?: boolean;
  /** OTA-1562 — "short range" / "long range" / "at any range". */
  rangeNote?: WeaponRangeNote;
  /** OTA-1562 — an UNCONDITIONAL armour piercer. Outcome-gated ignores are not
   *  parsed into this field; they arrive as `onMaxRoll.pierce` instead. */
  armorIgnore?: ArmorIgnore;
  /** OTA-1564 — the payload owed when the damage dice come up perfect. */
  onMaxRoll?: OnMaxRoll;
  /** OTA-1564 — "Rolls of 19+ count as max roll" (Plasma Cutter). Widens the
   *  trigger without adding a payload: the weapon's whole identity is that it
   *  maxes out more often than anything else. */
  maxRollFloor?: number;
  /** OTA-1564 — "Fires twice per round" / "Fires 3 bolts per round". */
  shotsPerRound?: number;
  /** OTA-1564 — the round cost a repeater pays for that volume. */
  reloadRounds?: number;
  /** OTA-1564 — "Natural 1 → overheat, useless 2 rounds." */
  overheat?: OverheatSpec;
  /** OTA-1565 — damage that does not stop at the thing you aimed at. */
  splash?: SplashSpec;
  /** OTA-1572 — what the hit DOES to them, past the damage. */
  onHitControl?: OnHitControl;
  /** OTA-1574 — how this weapon answers the sky. */
  weather?: WeatherNote;
}

/**
 * ⚠⚠⚠ OTA-1574 (slice 3) — TWENTY-ONE WEAPONS TALK ABOUT THE WEATHER AND NOT ONE
 * OF THEM LISTENED TO IT. The engine side has existed for a long time and works:
 * `weatherAttackPenalty` docks the attack roll (the owner's log, verbatim —
 * `attack: visibility penalty −1 (Ash Storm)`), `weatherRepositionCost` slows
 * movement, and armour resists can zero both. What was never wired is the
 * WEAPON's own clause.
 *
 * ⚠⚠⚠ SO THE IMMUNITIES WERE THE WORST OF IT. Five weapons promise to shrug the
 * weather off — Laser Crossbow *"Accuracy unaffected by weather"*, Aetheric
 * Longbow *"Ignores wind conditions"*, Aetheric Throwing Disk *"unaffected by
 * wind"*, Mud Darts *"weather does not affect effectiveness"*, and the LEGENDARY
 * Aetheric Sniper Bow *"ignores cover; unaffected by weather"* — and every one of
 * them ate the full visibility penalty like a rusted shortbow. A Legendary's
 * headline clause, doing nothing, in the one condition it was written for.
 *
 * ⚠⚠ AND THE PENALTIES ARE THE PRICE THAT MAKES THE IMMUNITY WORTH BUYING. Twelve
 * weapons say they get worse in rain / wind / fog / cold. Shipping only the
 * immunities would make five weapons strictly better with nothing given up; both
 * halves land together or neither means anything.
 */
export type WeatherCondition = 'rain' | 'wind' | 'fog' | 'cold' | 'heat' | 'any';

export interface WeatherNote {
  /** Conditions this weapon is explicitly unaffected by. 'any' = all weather. */
  immuneTo?: readonly WeatherCondition[];
  /** Conditions that cost it, and what they cost. */
  penalty?: { conditions: readonly WeatherCondition[]; kind: 'accuracy' | 'range' | 'damage' | 'reload' };
  /** A condition it is BETTER in, and by how much. */
  bonus?: { conditions: readonly WeatherCondition[]; dice?: string };
}

/**
 * ⚠⚠⚠ OTA-1572 — WHAT A HIT DOES BESIDES DAMAGE, and until now the answer was
 * "nothing, whatever the card says". FORTY-TWO weapons promise a control effect
 * in their effect text — stun, prone, restrained, paralyze, slow, blind,
 * knockback — and `enemyStatuses` has never had a field that could hold one: its
 * kinds are all damage-over-time (`poison_coat`, `typed_dot`, …). The one thing
 * that DID read a weapon's status promise, `rollIncomingStatusEffect`, keys off
 * the DAMAGE TYPE and never looks at the text at all, so Energy Baton's "stuns
 * target on max roll" and Rusted Blade's silence produced identical behaviour.
 *
 * ⚠⚠ THE FAMILIES ARE SPLIT BY WHAT THEY COST THE ENEMY, not by flavour.
 * `skip` kinds take the enemy's swing away outright; `hinder` kinds leave it
 * swinging but worse. That distinction is the whole safety budget — see
 * ENEMY_BRACE_ROUNDS.
 */
export type ControlKind =
  | 'stunned' | 'paralyzed' | 'restrained'   // skip: the swing is gone
  | 'prone' | 'slowed' | 'blinded'           // hinder: the swing lands worse
  | 'knockback';                             // hinder: it lands from further off

/** Kinds that cost the enemy its counter-attack outright. */
export const CONTROL_SKIPS: ReadonlySet<ControlKind> = new Set<ControlKind>([
  'stunned', 'paralyzed', 'restrained',
]);

export interface OnHitControl {
  kind: ControlKind;
  /** Rounds it lasts. Always ≥ 1 — a zero-round control is a no-op that would
   *  read on the card as a promise. */
  rounds: number;
  /** How the hit earns it. 'always' is the dangerous one and is deliberately
   *  rare in the catalog; see the brace guard. */
  trigger: 'always' | 'max-roll' | 'chance' | 'threshold';
  /** 0..1, for trigger 'chance'. */
  chance?: number;
  /** Natural-roll floor, for trigger 'threshold' ("on rolls of 15+"). */
  threshold?: number;
  /**
   * ⚠⚠ OTA-1572 — WHO IT ACTUALLY SEIZES. Four cold weapons say their freeze
   * takes a MACHINE apart and merely inconveniences a person: Killing Frost is
   * *"deep enough to seize a Construct's joints outright"*, Frost Maul *"seizes
   * machinery and staggers the living"*. Read without this the Rare Frost Maul
   * paralyses everything it touches unconditionally, which is both a lie about
   * the card and the strongest melee weapon in the game by a wide margin. When
   * set, the control lands only on a matching enemy — and where the card names
   * a lesser effect for everyone else (`fallback`), that is what they get.
   */
  restrictedTo?: BonusCondition;
  /** The weaker control everyone outside `restrictedTo` receives instead. */
  fallback?: ControlKind;
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

/** True when a clause hangs its effect on the dice coming up perfect. */
const MAX_ROLL_RE = /\bmax(?:imum)?\s+(?:damage\s+)?rolls?\b|\bon\s+all\s+max\s+roll\b/;

/**
 * ⚠⚠ OTA-1564 — READ THE PAYLOAD OFF THE CLAUSE THAT CARRIES THE TRIGGER, not
 * off the line. "+1d6 energy; bypasses shield on max rolls" has TWO effects and
 * only the second one waits on a max roll — reading the line as a whole would
 * make the flat +1d6 conditional and hand the player a weapon that is worse than
 * its card most of the time. Same reason 1562 split armour-ignore by clause.
 */
/**
 * ⚠⚠⚠ AN ORDINAL IS A TALLY, AND A TALLY IS NOT THIS SLICE. "on 5th max roll",
 * "on first max roll", "on third max roll" each need a count that survives a
 * round, a fight and a save/load — the same bookkeeping the owner had removed
 * from the game with the per-encounter charge. Three weapons carried one and all
 * three would have fired on EVERY max roll without this guard: a Legendary's
 * signature payoff turning up several times a fight instead of once.
 */
/**
 * ⚠⚠⚠ OTA-1566 — THE OWNER PUT THE ORDINALS BACK, AS FIRSTS. Verbatim: *"keep
 * the on first roll buff and change the on 3rd and 5th roll to on first roll on
 * the weapons they were on."* That is the right call and it dissolves the
 * problem rather than accepting it: "your FIRST max roll" is write-once-forever,
 * which needs a FLAG saying it already happened — where "your fifth" needs a
 * TALLY that survives a round, a fight and a save/load. Same words, completely
 * different amount of state, and only one of them can go wrong quietly.
 *
 * So `first` is now a supported shape and the deeper ordinals stay refused: if
 * one is ever authored again it must be rewritten as a first, not silently fired
 * on every max roll.
 */
const ORDINAL_GATED_RE = /\b(?:second|third|fourth|fifth|\d+(?:nd|rd|th))\s+max\b/;
const FIRST_ROLL_RE = /\b(?:first|1st)\s+max\b/;

const STAT_WORD: Record<string, keyof Stats> = {
  str: 'strength', dex: 'dexterity', int: 'intelligence',
  wis: 'wisdom', cha: 'charisma', ste: 'stealth',
};

function onMaxRollFrom(text: string): OnMaxRoll | null {
  const out: OnMaxRoll = {};
  let touched = false;
  for (const clause of text.split(/[.;]/)) {
    if (!MAX_ROLL_RE.test(clause)) continue;
    if (ORDINAL_GATED_RE.test(clause)) continue;
    const isFirst = FIRST_ROLL_RE.test(clause);
    if (isFirst) { out.onceEver = true; touched = true; }
    // ⚠ A PERMANENT STAT GAIN IS NOT DAMAGE, and reading it as damage is the
    // exact mistake the first draft made: "+2 STR (permanent)" became +2 to the
    // hit. Claim the clause before the bonus-damage patterns can see the number.
    const stat = clause.match(/\+\s*(\d+)\s*(str|dex|int|wis|cha|ste)\w*/);
    if (stat && /\bpermanent/.test(clause)) {
      out.permanentStat = { stat: STAT_WORD[stat[2]!]!, amount: parseInt(stat[1]!, 10) };
      touched = true;
      continue;
    }
    // ⚠⚠ OTA-1566 — A PERMANENT PIERCE IS NOT A PER-SWING ONE. "Bypasses shields
    // PERMANENTLY on your first max damage roll" unlocks the weapon once and
    // then holds; routing it through `pierce` would re-earn it on every perfect
    // roll and never make it permanent at all.
    if (/\bpermanent/.test(clause) && /\bbypass\w*|\bignor\w*|\bpierces?\b/.test(clause)) {
      out.permanentPierce = /\bshields?\b/.test(clause) ? 'shields' : 'armor';
      touched = true;
      continue;
    }
    // Bonus damage — dice first, because "+1d6" and "+5" both start with '+'.
    const dice = clause.match(/\+\s*(\d+d\d+)/);
    if (dice) { out.bonusDice = dice[1]!; touched = true; }
    else {
      const flat = clause.match(/\+\s*(\d+)\s/);
      if (flat) { out.bonusFlat = parseInt(flat[1]!, 10); touched = true; }
    }
    // "Reduces enemy armor by 1d6 on max roll" — the shred family, which has a
    // lever already (the acid coating writes the same number).
    const shred = clause.match(/reduces?\s+enemy\s+armou?r\s+by\s+(\d+d\d+|\d+)/);
    if (shred) { out.shredDice = shred[1]!; touched = true; }
    // A pierce that waits on the roll. `armorIgnoreFromClause` deliberately
    // refuses these (see IGNORE_DEFERRED_RE); this is where they land instead.
    if (/\bignor\w*|\bsplits?\b|\bbypass\w*|\bpierces?\b|\bcuts?\s+through\b/.test(clause)) {
      if (/\barmou?r\b|\bdefen[cs]es?\b/.test(clause)) { out.pierce = 'armor'; touched = true; }
      else if (/\bshields?\b/.test(clause)) { out.pierce = 'shields'; touched = true; }
    }
  }
  return touched ? out : null;
}

/**
 * ⚠⚠ OTA-1564 — THE WEAPON THAT PUNISHES YOU LATER. Four firearms say a natural
 * 1 costs them rounds, and `ActionReferenceScreen` has documented the rule to
 * players the whole time — *"Roll a natural 1 on a firearm: jam."* — while no
 * code has ever applied it. That is the same defect as an unread effect column,
 * only worse, because it is printed in the rulebook screen.
 */
function overheatFrom(text: string): OverheatSpec | null {
  if (!/\bnatural\s*1\b/.test(text)) return null;
  const word: OverheatSpec['word'] =
    /\boverload\b/.test(text) ? 'overload' : /\bjam\b/.test(text) ? 'jam' : 'overheat';
  if (!/\boverheat|\boverload|\bjam\b/.test(text)) return null;
  const rounds = text.match(/useless\s+(\d+)\s+(?:rounds?|turns?)/);
  const self = text.match(/(\d+d\d+)\s+self\s+damage/);
  // OTA-1566 — "After 4 overheats it explodes: 1d10 to everyone in your range."
  const fuse = text.match(/after\s+(\d+)\s+overheats?\s+it\s+explodes?\s*[:—-]?\s*(\d+d\d+)?/);
  return {
    ...(fuse ? { explodeAfter: parseInt(fuse[1]!, 10), ...(fuse[2] ? { explodeDice: fuse[2] } : {}) } : {}),
    // A jam with no stated duration costs one round — the action the rulebook
    // screen already says you spend clearing it.
    rounds: rounds ? parseInt(rounds[1]!, 10) : 1,
    ...(self ? { selfDice: self[1]! } : {}),
    ...(/\breroll\b/.test(text) ? { confirmed: true } : {}),
    word,
  };
}

const WORD_COUNT: Record<string, number> = { twice: 2, three: 3, thrice: 3, two: 2, four: 4 };

/**
 * ⚠⚠⚠ OTA-1565 — WHICH SENTENCES ARE ACTUALLY A BLAST. The catalog says this
 * eight different ways ("splash", "AoE", "explosive rounds", "shockwave …
 * radius", "to all enemies", "to everything in arm's reach"), so the reader
 * matches the CLAIM rather than any one word.
 *
 * ⚠⚠ WHAT IS DELIBERATELY NOT A BLAST, and the distinction is the whole reason
 * this reads clause by clause: KNOCKBACK moves bodies between range bands
 * (Shockwave Club, Shockwave Buckler) and STUN incapacitates them (Gravity
 * Hammer). Both are frequently written in the same shockwave vocabulary and
 * neither is damage — a "shockwave" reader that took them would hand three
 * weapons a damage blast their cards never promised, on top of doing nothing
 * about the effect they DID promise. They wait for their own systems.
 *
 * ⚠⚠ AND "+1d6 to arm's-reach TARGETS" IS NOT A BLAST EITHER. The Giant Bone
 * Knuckles' line is a bonus against something you are already hitting — the same
 * shape as "+1d6 against constructs", which the clause parser above has read
 * since long before this OTA. Matching it here would double-count it.
 */
/**
 * ⚠⚠⚠ THE DISQUALIFIERS ARE JUDGED ON THE WHOLE LINE, NOT PER CLAUSE — and the
 * first draft got this backwards in BOTH directions, which is why it is spelled
 * out here. Clause-scoped, `"2d8 damage to all enemies; knocks prone."` slipped
 * through: the blast clause read clean because the rider sat in the next one, so
 * the weapon would have gained a damage blast and still owed a prone it never
 * got. A rider this slice cannot build makes the WEAPON not-this-slice, wherever
 * on the line it is written.
 */
const SPLASH_DEFERRED_RE = /\bknock|\bpush\b|\bstun\b|\bprone\b|\bburning ground\b/;

/**
 * ⚠⚠⚠ OTA-1572 — THE CONTROL VOCABULARY, and the verb list is the ceiling again.
 * Slices 1a and 1c both taught the same lesson the hard way: the catalog was
 * never the limit, the parser's verb list was. Seven weapons already promised
 * armour-piercing in words 1a's first draft didn't know, and the blast was said
 * eight different ways in 1c. So this is built from the ACTUAL 42 strings in the
 * catalog rather than from what a control effect "should" be called — "seizes
 * machinery", "strikes late", "DEX save or fall", "restrained", "sickens" are
 * all in there, and none of them is the word a rulebook would have used.
 *
 * ⚠⚠ ORDER MATTERS. `paralyzed` is tested before `stunned` because "knock-stun"
 * and "paralyze" can co-occur in one line, and the stronger reading is the one
 * the card's own emphasis carries. Within a line the FIRST kind matched wins;
 * a weapon that promises two control effects gets the more severe, never both,
 * because two controls off one swing is a lock however it is spelled.
 */
const CONTROL_PATTERNS: ReadonlyArray<readonly [ControlKind, RegExp]> = [
  ['paralyzed', /\bparaly\w*|\bshackle|\bbinds?\s+\w*\s*target|\bseizes?\s+(?:a\s+\w+'s\s+)?joints?\b|\bseizes?\s+machin\w*|\bchill\s+seizes\b/],
  ['restrained', /\brestrain\w*|\bentangl\w*|\bsnare\w*|\bimmobiliz\w*|\bvines?\s+to\b|\broots?\s+entangl/],
  ['stunned', /\bstuns?\b|\bstunned\b|\bstunning\b|\bknock-stun\b|\bdaze\w*/],
  ['knockback', /\bknock(?:s|ed)?\s*back\b|\bknockback\b|\bpush(?:es)?\s+enem|\bpush\s+\w+\s+to\s+far\b/],
  ['prone', /\bprone\b|\bknocks?\s+\w*\s*down\b|\bor\s+fall\b|\btrip\s+enem|\bfall\b/],
  ['blinded', /\bblind\w*/],
  ['slowed', /\bslow\w*|\bstrikes?\s+late\b|\bstaggers?\b|\bchill\s+sets\s+in\b|\bsickens?\b|\bweaken\b/],
];

/**
 * ⚠⚠ THE COLD-VS-MACHINE FAMILY. Four weapons scope their freeze to constructs
 * in the catalog's own words. Matching on the machine noun rather than on a
 * "construct" keyword is deliberate: not one of the four uses the word the
 * condition is called.
 */
const MACHINE_SCOPED_RE = /\bmachin\w*|\bconstruct\w*|\bautomation/;
/** The lesser thing the card promises everyone who is not a machine. */
const MACHINE_FALLBACK_RE = /\bstaggers?\s+the\s+living\b|\band\s+staggers?\b/;

/** Durations the catalog actually writes, in the two shapes it writes them. */
function controlRoundsFrom(clause: string, whole: string): number {
  const m =
    clause.match(/(\d+)\s*-?\s*rounds?\b/) ??
    clause.match(/for\s+(\d+)\s+(?:rounds?|turns?)/) ??
    whole.match(/(\d+)\s*-?\s*rounds?\b/);
  const n = m ? parseInt(m[1]!, 10) : 1;
  // ⚠ "Instantaneous" is how the catalog spells a knockdown that is over the
  // moment it lands. That is still one round of consequence, not zero — a
  // zero-round control would read on the card as a promise and do nothing.
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 5) : 1;
}

function controlFrom(text: string): OnHitControl | null {
  let found: ControlKind | null = null;
  let clause = text;
  outer: for (const c of text.split(/[.;—]/)) {
    for (const [kind, re] of CONTROL_PATTERNS) {
      if (re.test(c)) { found = kind; clause = c; break outer; }
    }
  }
  if (!found) return null;

  // ⚠⚠ HOW THE HIT EARNS IT. An unconditional control is the expensive case, so
  // every gated spelling in the catalog is recognised before we fall back to it.
  let trigger: OnHitControl['trigger'] = 'always';
  let chance: number | undefined;
  let threshold: number | undefined;

  const pct = text.match(/(\d+)\s*%\s*chance/);
  const thr = text.match(/\brolls?\s+of\s+(\d+)\s*\+/);
  if (/\bmax(?:imum)?\s+(?:damage\s+)?roll\b|\bon\s+max\s+roll\b|\bmax-roll\b/.test(text)) {
    trigger = 'max-roll';
  } else if (pct) {
    trigger = 'chance';
    chance = Math.min(1, Math.max(0, parseInt(pct[1]!, 10) / 100));
  } else if (thr) {
    trigger = 'threshold';
    threshold = parseInt(thr[1]!, 10);
  } else if (/\beven\/odd\b|\beven\s*=|\breroll\s+to\b|\bto\s+confirm\b|\bsave\s+or\b|\bchance\s+to\b/.test(text)) {
    // The catalog's own coin-flip spellings. Treated as a real 50% rather than
    // as unconditional — "even/odd to confirm" and "even = stun for 3 turns"
    // are gates, and reading either as "always" is how a weapon becomes a lock.
    trigger = 'chance';
    chance = 0.5;
  }

  const out: OnHitControl = {
    kind: found, rounds: controlRoundsFrom(clause, text), trigger, chance, threshold,
  };

  // ⚠⚠ Scope the freeze to what the card actually says it seizes. Only the
  // incapacitating kinds are ever narrowed — a slow that reads broadly is not
  // the failure mode this guards against.
  if (CONTROL_SKIPS.has(found) && MACHINE_SCOPED_RE.test(text)) {
    out.restrictedTo = 'construct';
    if (MACHINE_FALLBACK_RE.test(text)) out.fallback = 'slowed';
  }
  return out;
}

/**
 * ⚠⚠ THE CONDITION WORDS THE CATALOG ACTUALLY USES. As in every slice before
 * this, the vocabulary is taken from the 21 real strings rather than from what a
 * weather system "should" call things: "bad weather", "high wind", "dense fog",
 * "extreme cold", "extreme heat".
 */
const WEATHER_WORDS: ReadonlyArray<readonly [WeatherCondition, RegExp]> = [
  ['rain', /\brain\w*\b/],
  ['wind', /\bwind\w*\b/],
  ['fog', /\bfog\w*\b|\bmist\w*\b/],
  ['cold', /\bextreme\s+cold\b|\bfreezing\b|\bblizzard\b/],
  ['heat', /\bextreme\s+heat\b|\bscorching\b/],
  ['any', /\b(?:bad\s+)?weather\b|\bweather\s+conditions?\b/],
];

/** ⚠ "Ignores X" / "unaffected by X" / "X does not affect" — the three ways the
 *  catalog spells an immunity, and all three appear. */
const WX_IMMUNE_RE = /\bignores?\b|\bunaffected\s+by\b|\bdoes\s+not\s+affect\b|\bregardless\s+of\b|\bno\s+penalty\s+in\b/;
/** The costs the catalog names, mapped to what they cost. */
const WX_PENALTY_RE = /\breduced?\b|\breduces?\b|\bloses?\b|\blosing\b|\bdrops?\b|\bpoor\s+performance\b|\bless\s+effective\b/;

function conditionsIn(clause: string): WeatherCondition[] {
  const out: WeatherCondition[] = [];
  for (const [cond, re] of WEATHER_WORDS) if (re.test(clause)) out.push(cond);
  return out;
}

function weatherFrom(text: string): WeatherNote | null {
  const note: WeatherNote = {};
  let touched = false;
  for (const clause of text.split(/[.;]/)) {
    const conds = conditionsIn(clause);
    if (conds.length === 0) continue;
    // ⚠ IMMUNITY IS TESTED FIRST. "Accuracy unaffected by weather" contains no
    // penalty verb, but "Ignores wind conditions" and "reduced range in wind"
    // are one word apart in shape — reading the immunity as a penalty would
    // turn five weapons' headline clause into its exact opposite.
    if (WX_IMMUNE_RE.test(clause)) {
      note.immuneTo = [...(note.immuneTo ?? []), ...conds];
      touched = true;
      continue;
    }
    // A bonus reads as "+NdN in <condition>" and must be checked before the
    // penalty verbs, because "+1d6 in extreme heat" has no penalty word in it
    // and would otherwise fall through to nothing.
    const plus = clause.match(/\+\s*(\d+d\d+)/);
    if (plus && !WX_PENALTY_RE.test(clause)) {
      note.bonus = { conditions: conds, dice: plus[1]! };
      touched = true;
      continue;
    }
    if (WX_PENALTY_RE.test(clause)) {
      const kind: NonNullable<WeatherNote['penalty']>['kind'] =
        /\breload\b/.test(clause) ? 'reload'
          : /\bdamage\b/.test(clause) ? 'damage'
            : /\brange\b/.test(clause) ? 'range'
              : 'accuracy';
      note.penalty = { conditions: conds, kind };
      touched = true;
    }
  }
  return touched ? note : null;
}

function splashFrom(text: string): SplashSpec | null {
  if (SPLASH_DEFERRED_RE.test(text)) return null;
  for (const clause of text.split(/[.;]/)) {
    const isBlast =
      /\bsplash\b|\baoe\b|\bexplosive\b/.test(clause)
      || /\bto all enemies\b|\bto everything\b|\ball enemies in\b/.test(clause)
      || (/\bshockwave\b/.test(clause) && /\bradius\b/.test(clause))
      || (/\bdamage\b/.test(clause) && /\bnearby enemies\b/.test(clause));
    if (!isBlast) continue;
    // ⚠⚠ THE DICE MAY LIVE IN A NEIGHBOURING CLAUSE — the mirror of the bug
    // above, and just as real: `"2d8 fire; 15 ft AoE"` names the blast in one
    // clause and its damage in the other. Falling back to the line finds it.
    const dice = clause.match(/(\d+d\d+)/) ?? text.match(/(\d+d\d+)/);
    if (!dice) continue;
    return {
      dice: dice[1]!,
      ...(MAX_ROLL_RE.test(clause) || MAX_ROLL_RE.test(text) ? { whenMaxRoll: true } : {}),
      // Stated in the weapon's own words, never inferred. A weapon that can kill
      // your companion has to say so in its data.
      ...(/\ballies\b|\bally\b/.test(clause) ? { hitsAllies: true } : {}),
    };
  }
  return null;
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

  // ── OTA-1564 (slice 1b) — the outcome-gated families ──────────────────────
  const onMax = onMaxRollFrom(text);
  if (onMax) { out.onMaxRoll = onMax; touched = true; }

  // "Rolls of 19+ count as max roll" — the Plasma Cutter's entire identity.
  const floor = text.match(/rolls?\s+of\s+(\d+)\s*\+?\s+count\s+as\s+(?:a\s+)?max/);
  if (floor) { out.maxRollFloor = parseInt(floor[1]!, 10); touched = true; }

  // "Fires twice per round" / "Fires 2 bolts per round" / "Fires 3 bolts…".
  const shots = text.match(/fires?\s+(\w+)\s+(?:bolts?\s+)?per\s+round/);
  if (shots) {
    const n = /^\d+$/.test(shots[1]!) ? parseInt(shots[1]!, 10) : (WORD_COUNT[shots[1]!] ?? 0);
    if (n >= 2) { out.shotsPerRound = n; touched = true; }
  }
  const reload = text.match(/needs?\s+(\d+)\s+rounds?\s+to\s+reload/);
  if (reload) { out.reloadRounds = parseInt(reload[1]!, 10); touched = true; }

  const oh = overheatFrom(text);
  if (oh) { out.overheat = oh; touched = true; }

  // OTA-1565 (slice 1c) — the blast.
  const blast = splashFrom(text);
  if (blast) { out.splash = blast; touched = true; }

  // OTA-1572 (slice 2) — the thing the hit DOES to them beyond damage.
  const ctrl = controlFrom(text);
  if (ctrl) { out.onHitControl = ctrl; touched = true; }

  // OTA-1574 (slice 3) — how the weapon answers the sky.
  const wx = weatherFrom(text);
  if (wx) { out.weather = wx; touched = true; }

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

/**
 * ⚠⚠⚠ OTA-1564 — DID THIS SWING COME UP PERFECT? One reader, because twenty-six
 * weapons ask the same question and twenty-six local copies of it is how two of
 * them end up disagreeing about what "max" means on a crit.
 *
 * ⚠⚠ IT READS THE FACES, NOT THE TOTAL. `total` carries the STR bonus, the race
 * bonus, the rune passives and the aether surge, so a well-built character would
 * clear any total-based threshold on ordinary dice and proc a Legendary's signature
 * effect every single swing. Every DIE at its top face is the only reading that
 * means what the card says.
 *
 * ⚠⚠ AND IT SURVIVES DOUBLED DICE. A crit, a backstab and a perfect opening all
 * double `count`, and a multi-shot weapon multiplies it further — so the check is
 * "every die that was actually rolled", never a comparison against the weapon's
 * printed dice count, which would silently stop firing on exactly the biggest
 * swings in the game.
 *
 * `floor` is the Plasma Cutter's *"Rolls of 19+ count as max roll"*: the bar drops
 * for that weapon and nothing else changes.
 */
export function damageRollIsMax(
  step: { values?: number[]; sides?: number } | null | undefined,
  floor?: number | null,
): boolean {
  const values = step?.values;
  const sides = step?.sides ?? 0;
  if (!values || values.length === 0 || sides <= 0) return false;
  // A floor above the die's own top face can never be met — treat it as "max",
  // so a mis-authored "rolls of 19+" on a d6 weapon is merely strict, not broken.
  const bar = floor && floor > 0 ? Math.min(floor, sides) : sides;
  return values.every((v) => v >= bar);
}

/** The damage the max-roll payload adds, rolled. 0 when nothing is owed. */
export function rollMaxRollBonus(spec: OnMaxRoll | null | undefined): number {
  if (!spec) return 0;
  let total = spec.bonusFlat ?? 0;
  if (spec.bonusDice) total += rollFromNotation(spec.bonusDice);
  return total;
}

/**
 * ⚠⚠ HOW MUCH GUARD A MAX ROLL OPENS. The attack roll is long resolved by the
 * time a damage die lands, so a pierce owed "on a max damage roll" cannot lower
 * an AC that has already been beaten. What it CAN do is leave the guard open:
 * the same `enemyArmorShred` lever the acid coating writes, which every later
 * swing in the fight already reads. `shredDice` is the authored amount; a
 * `pierce` with no number opens what armour there is.
 */
export function maxRollShredAmount(
  spec: OnMaxRoll | null | undefined,
  enemy: { traits?: readonly string[]; name?: string; type?: string } | null | undefined,
): number {
  if (!spec || !enemy) return 0;
  if (spec.shredDice) {
    return /d/.test(spec.shredDice) ? rollFromNotation(spec.shredDice) : parseInt(spec.shredDice, 10) || 0;
  }
  if (!spec.pierce) return 0;
  const { plate, field } = armorACPortions(enemy.traits);
  return spec.pierce === 'shields' ? field : plate + field;
}
