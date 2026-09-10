// ⚠⚠⚠ OTA-1797 — THE WORD BESIDE THE NUMBER.
//
// D1–D5 is the ground's own danger and never moves for the player. The word
// beside it used to be a second spelling of the same number (CALM · UNEASY ·
// DANGEROUS · DEADLY · LETHAL, driven by danger alone) — the header said
// "D3 DANGEROUS" to a fresh character and to one in Legendary plate. The owner's
// question was "how dangerous is this place to my character right now?", and
// the answer is character-relative: durable combat readiness over what the
// ground actually spawns.
//
// Ruled 2026-09-10 (threat matrix, revision 2):
//   • THE REFERENCE is read from the encounter rules, never a hand-typed ladder:
//     the rarity-weighted mean Power of the enemies this danger can spawn
//     (rarityCapForDanger, rarityWeights, bosses excluded), times the expected
//     body count from the pack rule, each extra body worth 0.6 of a foe. The
//     player-HP cap and the scaled-enemy path are deliberately NOT used: they
//     move with the player, and D1–D5 must not.
//   • THE PARTY is playerPowerScore plus a gated companion term: half the
//     substitute gain (the companion's expected damage per swing minus the
//     player's, floored at zero, halved — commanding a companion SPENDS the
//     player's turn, OTA-611) plus the soak (companion hit points over ten
//     times 0.25 for a dog, OTA-685's quarter of ordinary swings; zero for a
//     golem, zero against a boss). Expected damage uses each side's hit chance
//     against the danger's reference AC.
//   • THE GATE: a companion counts only when it can act in that encounter —
//     dog with the player, up, not benched at a climb, target not aerial; golem
//     present, up, not at a climb. Otherwise the word describes the player alone.
//   • THE BANDS, set D′, fitted to measured win rates: LETHAL below 0.65,
//     SEVERE below 0.95, DANGEROUS below 1.20, RISKY below 1.80, MANAGEABLE
//     from 1.80. Read as: MANAGEABLE you win more than nine in ten; RISKY two
//     in three to nine in ten; DANGEROUS a coin flip to a modest edge; SEVERE
//     you lose most; LETHAL you lose four in five or worse.
//
// ⚠ DURABLE means what it says: the score reads hpMax, never hp. A wounded
// player on safe ground is still on safe ground; the header is not a health bar.

import enemiesData from '../data/enemies/enemies.json';
import type { Companion, DogCompanion, Enemy, PlayerCharacter, Rarity } from './types';
import { PACK_RULE, rarityCapForDanger, rarityWeights } from './encounter';
import { avgDamageNotation, enemyPowerScore, playerPowerScore } from './powerRating';
import { enemyAC, getEquippedWeapon } from './combatRules';
import { effectiveStats } from './equipment';
import { enemyIsAerial } from './enemyTraits';
import { golemStatBonus } from './golems';

export type ThreatWord = 'LETHAL' | 'SEVERE' | 'DANGEROUS' | 'RISKY' | 'MANAGEABLE';

/** Set D′ — each band is "ratio below this"; the last word is the rest. */
export const THREAT_BANDS: ReadonlyArray<{ word: ThreatWord; below: number }> = [
  { word: 'LETHAL', below: 0.65 },
  { word: 'SEVERE', below: 0.95 },
  { word: 'DANGEROUS', below: 1.20 },
  { word: 'RISKY', below: 1.80 },
];
export const THREAT_TOP_WORD: ThreatWord = 'MANAGEABLE';

/** The matrix's weighting of a pack's extra body: 0.6 of a foe (action economy
 *  makes N foes harder per hit point; the HP premium stays modest — the same
 *  reasoning as scaleEncounterForContext's pack budget). */
export const EXTRA_BODY_WEIGHT = 0.6;

const RANK: Record<Rarity, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const ENEMIES = enemiesData as Enemy[];

export function threatWordFor(ratio: number): ThreatWord {
  for (const b of THREAT_BANDS) if (ratio < b.below) return b.word;
  return THREAT_TOP_WORD;
}

/** The non-boss enemies a tile of this danger can put in front of the player. */
export function spawnPoolFor(danger: number): Enemy[] {
  const cap = RANK[rarityCapForDanger(danger)];
  return ENEMIES.filter((e) => !e.boss && RANK[e.rarity] <= cap);
}

function weightedMean(pool: readonly Enemy[], read: (e: Enemy) => number): number {
  let w = 0;
  let acc = 0;
  for (const e of pool) { const k = rarityWeights[e.rarity]; w += k; acc += k * read(e); }
  return w > 0 ? acc / w : 0;
}

/** Bodies a scene arrival is expected to stand up: the primary pick plus the
 *  pack rule's extras, read from PACK_RULE so this cannot drift from the roll. */
export function expectedBodiesFor(danger: number): number {
  const d = Math.max(0, danger);
  const packChance = PACK_RULE.base + d * PACK_RULE.perDanger;
  const second = d >= PACK_RULE.secondExtraFromDanger ? PACK_RULE.secondExtraChance : 0;
  return 1 + packChance * (1 + second);
}

const refCache = new Map<number, { power: number; ac: number }>();
function reference(danger: number): { power: number; ac: number } {
  const d = Math.max(0, Math.min(5, Math.round(danger || 0)));
  const hit = refCache.get(d);
  if (hit) return hit;
  const pool = spawnPoolFor(d);
  const meanPower = weightedMean(pool, enemyPowerScore);
  const power = meanPower * (1 + EXTRA_BODY_WEIGHT * (expectedBodiesFor(d) - 1));
  const ac = weightedMean(pool, enemyAC);
  const out = { power, ac };
  refCache.set(d, out);
  return out;
}

/** The ground's reference Power for a danger — DERIVED, never typed. */
export function referencePowerFor(danger: number): number { return reference(danger).power; }
/** The ground's reference AC — what a swing has to beat here, on average. */
export function referenceAcFor(danger: number): number { return reference(danger).ac; }

/** P(d20 + bonus ≥ ac), with the natural 1 and 20 (5%..95%). */
export function hitChance(bonus: number, ac: number): number {
  return Math.max(0.05, Math.min(0.95, (21 - (ac - bonus)) / 20));
}

/** What the encounter in front of the player allows a companion to do. */
export interface ParticipationContext {
  /** Fighting atop a climb: the dog is benched at the base, the golem cannot climb (OTA-911/912). */
  elevated: boolean;
  /** The active target, when a fight is on; null on quiet ground. */
  target: Pick<Enemy, 'boss' | 'traits' | 'name' | 'type'> | null;
}

/** A substitute gain under a quarter of a Power point is noise — an untrained
 *  Iron Golem over a Cudgel measures 0.009 — and the page's finding is that such
 *  a golem "is worth nothing measurable". Below this the term is zero and names
 *  no companion. */
export const NEGLIGIBLE_GAIN = 0.25;

export interface CompanionTerm {
  /** Half the substitute gain — what commanding the companion buys over swinging yourself. */
  substitute: number;
  /** The dog's quarter-share of ordinary swings, priced in hit points over ten. */
  soak: number;
  /** Which companion the substitute term came from, for the log line. */
  from: 'dog' | 'golem' | null;
}

function playerSwing(player: PlayerCharacter, refAc: number): number {
  const eff = effectiveStats(player);
  const bestStat = Math.max(eff.strength, eff.dexterity, eff.intelligence);
  const weapon = getEquippedWeapon(player, 'main');
  return hitChance(bestStat, refAc) * (weapon ? avgDamageNotation(weapon.damageDice) : 2);
}

function dogSwing(dog: DogCompanion, refAc: number): number {
  // handleDogCombat: d20 + STR vs AC; bite 1d6 + floor(STR/2). (The vest's STR
  // bonus is a combat-time read in the store; a point or two of bite is under
  // the term's own rounding.)
  const str = dog.stats?.strength ?? 0;
  return hitChance(str, refAc) * (3.5 + Math.floor(str / 2));
}

function golemSwing(golem: Companion, refAc: number): number {
  // handleGolemCommand: d20 + hitBonus + power vs AC; dice + attackMod + floor(power/2).
  const power = golemStatBonus(golem, 'power');
  // A wielded armament's dice are a catalog read at swing time; the innate die
  // is the durable term, the same way the player's term reads the equipped weapon.
  return hitChance(golem.hitBonus + power, refAc) * (avgDamageNotation(golem.attackDie) + golem.attackMod + Math.floor(power / 2));
}

export function dogCanAct(dog: DogCompanion | null | undefined, ctx: ParticipationContext): dog is DogCompanion {
  if (!dog || dog.status !== 'with_player' || dog.hp <= 0) return false;
  if (ctx.elevated) return false;
  if (ctx.target && enemyIsAerial(ctx.target)) return false;
  return true;
}

export function golemCanAct(golem: Companion | null | undefined, ctx: ParticipationContext): golem is Companion {
  if (!golem || golem.hp <= 0) return false;
  if (ctx.elevated) return false;
  return true;
}

/** The gated companion term for this ground: half substitute gain + soak. */
export function companionTerm(player: PlayerCharacter, danger: number, ctx: ParticipationContext): CompanionTerm {
  const refAc = referenceAcFor(danger);
  const mine = playerSwing(player, refAc);
  let substitute = 0;
  let from: CompanionTerm['from'] = null;
  const dog = player.dog;
  if (dogCanAct(dog, ctx)) {
    const gain = Math.max(0, dogSwing(dog, refAc) - mine) / 2;
    if (gain >= NEGLIGIBLE_GAIN && gain > substitute) { substitute = gain; from = 'dog'; }
  }
  const golem = player.golem;
  if (golemCanAct(golem, ctx)) {
    const gain = Math.max(0, golemSwing(golem, refAc) - mine) / 2;
    if (gain >= NEGLIGIBLE_GAIN && gain > substitute) { substitute = gain; from = 'golem'; }
  }
  // One companion is commanded per turn, so the substitute credit is the better
  // of the two, not their sum. The soak is the dog's alone, and a boss fights
  // the person in front of it (OTA-1142).
  const soak = dogCanAct(dog, ctx) && !ctx.target?.boss ? (dog.hpMax / 10) * 0.25 : 0;
  return { substitute, soak, from };
}

export interface ThreatReadout {
  word: ThreatWord;
  ratio: number;
  party: number;
  reference: number;
  term: CompanionTerm;
}

/** How dangerous is this ground to this party, right now — the header's word. */
export function threatReadout(player: PlayerCharacter, danger: number, ctx: ParticipationContext): ThreatReadout {
  const term = companionTerm(player, danger, ctx);
  const party = playerPowerScore(player) + term.substitute + term.soak;
  const reference = referencePowerFor(danger);
  const ratio = reference > 0 ? party / reference : Infinity;
  return { word: threatWordFor(ratio), ratio, party, reference, term };
}

/** The participation context read off a live scene (or quiet ground). */
export function participationFromScene(scene: {
  elevatedOn?: unknown;
  enemies: ReadonlyArray<Pick<Enemy, 'boss' | 'traits' | 'name' | 'type'>>;
  activeEnemyIdx: number;
} | null | undefined): ParticipationContext {
  if (!scene) return { elevated: false, target: null };
  return { elevated: !!scene.elevatedOn, target: scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0] ?? null };
}
