// OTA-120 — Dog Companion central module.
//
// Mirrors the shape of golems.ts: definitions, factories, and parsing
// helpers for the dog system. The store imports from here when:
//   - a rescue investigation hook resolves and a captor must spawn
//   - the Arbiter 3-step onboarding finalizes and a DogCompanion is built
//   - the parser hits a pronoun-templated narration string
//   - the dog combat actions (bite / distract) need their stat baselines
//
// Design rules (frozen in HANDOFF.md §0.A):
//   - ONE dog per save. Rescue hooks die globally on first acquisition.
//   - Captor fights are faction-neutral (factionNeutralFight: true).
//   - Dog stamina mirrors player stamina (no separate pool).
//   - Dog stats grow same per-tier as player (statTraining curve).
//   - Dogs and golems coexist (mutex was removed; both fight together).
//   - Puppy-vendor safety net is single-shot per save, post-combat-death
//     only (NOT abandonment). Rubble-puppy is the post-all-Guardians
//     fallback.

import type {
  DogCompanion,
  DogStartingProfile,
  Enemy,
  Rarity,
} from './types';
import { resolveDogScenarios } from './contentPack';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import rescueScenarioData from '../data/dog/rescue-scenarios.json';

// ----- Rescue scenarios -----------------------------------------------

// engine_Dev — scenario ids are author-defined now (a reskin supplies its own
// 'dog hook' wording via the dog-rescue content table), so the id is a free
// string rather than the old fixed 'smelter'|'wagon'|'cellar'|'snare' union.
export type RescueScenarioId = string;

export interface RescueScenario {
  id: RescueScenarioId;
  /** Trigger phrases. The rescue fires when the player investigates / attacks /
   *  approaches a target that matches one of these, in any enemy-free scene.
   *  Matching is WHOLE-PHRASE + whole-word (see rescueHookMatches): "ash tree"
   *  fires on "the black ash tree" but NOT "trash"; "airlock" fires on "the
   *  airlock" but NOT a bare "lock". A multi-word phrase only fires on the FULL
   *  phrase — "black ash tree" does NOT fire on "tree" — so list any single word
   *  you also want to trigger as its own entry. */
  hookNouns: string[];
  /** Captor faction template id when the player IS NOT this faction.
   *  Resolves to the unaligned poacher captor when the player IS
   *  this faction (the snare scenario uses the fallback always). */
  captorFactionId: string | null;
  /** Display label / breed seed for the dog this scenario hands the
   *  player. Pure flavor — the player gets to override the breed in
   *  the onboarding. */
  defaultBreed: string;
  /** Starting profile drives stat baselines. */
  startingProfile: DogStartingProfile;
  /** Thematic scene tags. OPTIONAL / reserved — placement is driven entirely by
   *  hookNouns; this does not currently gate where a scenario can fire. */
  archetypes: string[];
  /** Arbiter beat shown to the player when the captor falls. */
  victoryLine: string;
  /** Captor name shown in the combat log. */
  captorName: string;
  /** Arbiter beat shown when the captor first spawns. `{captorName}`
   *  resolves to this row's captorName. */
  introLine: string;
  /** Short venue phrase used in the ~day-5 rumor tip ("a dog held at
   *  {rumorVenue} to the north"). Optional. */
  rumorVenue?: string;
  // ----- Optional captor combat overrides (defaults shown) -----
  /** Captor max HP. Default 14. */
  captorHp?: number;
  /** Captor to-hit value (string or number). Default '4'. */
  captorAttack?: string | number;
  /** Captor damage dice, e.g. '1d8+2'. Default '1d6+1'. */
  captorDamage?: string;
  /** Item names the captor drops on death — define these in YOUR item tables so
   *  they grant as real items. Default ['Scrap Metal','Hardtack','Mud Cloth']. */
  captorLoot?: string[];
}

const RESCUE_SCENARIOS_BUILTIN: RescueScenario[] =
  (rescueScenarioData as { scenarios: RescueScenario[] }).scenarios;

/** Live dog-rescue scenarios — the author's uploaded 'dog hook' wording if
 *  loaded, else the generic-default pack, else the built-in Tartaria scenarios.
 *  The firing MECHANIC stays in the store; only this wording is data-driven. */
export function getRescueScenarios(): RescueScenario[] {
  return resolveDogScenarios(RESCUE_SCENARIOS_BUILTIN) as RescueScenario[];
}

/** Look a scenario up by id from the live (resolved) set. */
export function getRescueScenario(id: RescueScenarioId): RescueScenario | undefined {
  return getRescueScenarios().find((s) => s.id === id);
}

/** The fallback "unaligned" scenario — the first row whose captorFactionId is
 *  null. Used when the player belongs to a scenario's captor faction, so we
 *  never make them fight their own. */
function unalignedScenario(): RescueScenario | undefined {
  return getRescueScenarios().find((s) => s.captorFactionId == null);
}

/** Does a rescue hookNoun match the player's target text? WHOLE-PHRASE,
 *  whole-word matching — the hookNoun fires only when that EXACT phrase appears
 *  (bounded by word edges) in what the player engaged:
 *    - exact: target === noun
 *    - the noun phrase appears word-bounded inside a longer target
 *      ("ash tree" ⊂ "the black ash tree" ✓; "ash" ⊄ "trash"; "airlock" ⊄ "lock")
 *  A multi-word noun does NOT fire on its individual words ("black ash tree"
 *  does NOT fire on "tree"/"black") — list any single word you want to trigger
 *  as its own hookNoun. This replaces the old loose bidirectional substring test
 *  (which fired "forest" on "trash", "bunker" on "lock", "snare" on "pit", etc.). */
export function rescueHookMatches(noun: string, target: string): boolean {
  const nl = (noun ?? '').toLowerCase().trim();
  const t = (target ?? '').toLowerCase().trim();
  if (!nl || !t) return false;
  if (t === nl) return true;
  const escaped = nl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(t);
}

/** Id of the first live scenario whose hookNouns match the target text, else
 *  null. The store's dog-rescue dispatch calls this. */
export function matchRescueScenarioId(target: string): RescueScenarioId | null {
  for (const s of getRescueScenarios()) {
    for (const n of s.hookNouns) {
      if (rescueHookMatches(n, target)) return s.id;
    }
  }
  return null;
}

// ----- Captor factory --------------------------------------------------

/** Build an Enemy record for the rescue captor. Always sets
 *  factionNeutralFight=true so the kill-handling site skips the
 *  faction-standing delta and the witness-cascade pass. */
export function spawnRescueCaptor(
  scenarioId: RescueScenarioId,
  playerFactionId: string | null | undefined,
): Enemy {
  const scenario = getRescueScenario(scenarioId) ?? getRescueScenarios()[0]!;
  // If the captor's faction matches the player's faction, fall back
  // to the unaligned captor template so we never make the player
  // fight one of their own under the neutral-kill flag.
  const useFallback =
    scenario.captorFactionId !== null &&
    scenario.captorFactionId === playerFactionId;
  // The captor's identity AND combat profile come from the fallback row when the
  // swap fires, so the player fights the unaligned poacher as that row defines it.
  const src = useFallback ? (unalignedScenario() ?? scenario) : scenario;
  return {
    name: src.captorName,
    type: 'humanoid',
    abilityPoint: 'Strength 4',
    attack: String(src.captorAttack ?? '4'),
    damage: src.captorDamage ?? '1d6+1',
    hp: src.captorHp ?? 14,
    rarity: 'Uncommon' as Rarity,
    loot: src.captorLoot ?? ['Scrap Metal', 'Hardtack', 'Mud Cloth'],
    aliases: ['captor', 'deserter', 'enforcer', 'scavenger', 'poacher', 'stranger'],
    factionNeutralFight: true,
  };
}

// ----- Pronoun parser + template helper -------------------------------

export type Pronoun = 'he' | 'she' | 'they';

/** Parse the player's raw sex answer into a pronoun. Common tokens
 *  for male / female / nonbinary; anything else falls back to 'they'.
 *  Case-insensitive. */
export function parsePronoun(rawText: string): Pronoun {
  const t = rawText.toLowerCase().trim();
  if (/\b(boy|male|he|him|his|man|sir)\b/.test(t)) return 'he';
  if (/\b(girl|female|she|her|woman|hers|ma'am|madam)\b/.test(t)) return 'she';
  // Anything else (mixed, nonbinary, "unknown", typos) → singular they.
  return 'they';
}

/** Pronoun substitution table. Each tuple is [subject, possessive,
 *  object, reflexive, subjectCap, possessiveCap]. */
const PRONOUN_FORMS: Record<Pronoun, {
  subject: string;
  subjectCap: string;
  possessive: string;
  possessiveCap: string;
  object: string;
  reflexive: string;
  /** "has" / "have" — singular they uses plural verb. */
  hasOrHave: string;
  /** "is" / "are" — singular they uses plural verb. */
  isOrAre: string;
  /** "'s" or "'re" contraction — for "He's gone" / "They're gone". */
  contraction: string;
  /** OTA-146 — verb suffix: 's' for singular he/she ("eats"), '' for
   *  plural they ("eat"). Used as `{verbS}` in templates. Pre-fix,
   *  callsites wrote `eat{contraction === "'s" ? "s" : ""}` and the
   *  literal ternary leaked into the world feed because applyDog
   *  Pronouns only does whole-token substitution. */
  verbS: string;
  /** OTA-146 — verb suffix variant: 'es' for singular ("crunches",
   *  "watches"), '' for plural ("crunch", "watch"). Used for verbs
   *  whose third-person singular needs the 'es' suffix instead of
   *  just 's'. */
  verbES: string;
}> = {
  he: {
    subject: 'he', subjectCap: 'He',
    possessive: 'his', possessiveCap: 'His',
    object: 'him', reflexive: 'himself',
    hasOrHave: 'has', isOrAre: 'is', contraction: "'s",
    verbS: 's', verbES: 'es',
  },
  she: {
    subject: 'she', subjectCap: 'She',
    possessive: 'her', possessiveCap: 'Her',
    object: 'her', reflexive: 'herself',
    hasOrHave: 'has', isOrAre: 'is', contraction: "'s",
    verbS: 's', verbES: 'es',
  },
  they: {
    subject: 'they', subjectCap: 'They',
    possessive: 'their', possessiveCap: 'Their',
    object: 'them', reflexive: 'themselves',
    hasOrHave: 'have', isOrAre: 'are', contraction: "'re",
    verbS: '', verbES: '',
  },
};

/** Substitute pronoun placeholders in a template string. Supported
 *  tokens (case-sensitive):
 *    {pronoun}            he / she / they
 *    {Pronoun}            He / She / They
 *    {possessive}         his / her / their
 *    {Possessive}         His / Her / Their
 *    {object}             him / her / them
 *    {reflexive}          himself / herself / themselves
 *    {hasOrHave}          has / have
 *    {isOrAre}            is / are
 *    {contraction}        's / 're
 */
export function applyDogPronouns(
  template: string,
  pronoun: Pronoun,
): string {
  const f = PRONOUN_FORMS[pronoun];
  return template
    .replace(/\{pronoun\}/g, f.subject)
    .replace(/\{Pronoun\}/g, f.subjectCap)
    .replace(/\{possessive\}/g, f.possessive)
    .replace(/\{Possessive\}/g, f.possessiveCap)
    .replace(/\{object\}/g, f.object)
    .replace(/\{reflexive\}/g, f.reflexive)
    .replace(/\{hasOrHave\}/g, f.hasOrHave)
    .replace(/\{isOrAre\}/g, f.isOrAre)
    .replace(/\{contraction\}/g, f.contraction)
    // OTA-146 — verb suffix tokens. Replace whole-token first; callers
    // that wrote the broken `{contraction === "'s" ? "s" : ""}` ternary
    // (which leaked the literal JS into the world feed) have been
    // migrated to `{verbS}` / `{verbES}`. The defensive fallback below
    // strips any remaining ternary leak so a future regression doesn't
    // surface raw JS to the player.
    .replace(/\{verbS\}/g, f.verbS)
    .replace(/\{verbES\}/g, f.verbES)
    .replace(/\{contraction === "'s" \? "s" : ""\}/g, f.verbS)
    .replace(/\{contraction === "'s" \? "es" : ""\}/g, f.verbES);
}

// ----- DogCompanion factory -------------------------------------------

const STARTING_STATS: Record<DogStartingProfile, { strength: number; dexterity: number; intelligence: number; hpMax: number }> = {
  mongrel:  { strength: 10, dexterity: 10, intelligence: 10, hpMax: 16 },
  shepherd: { strength: 12, dexterity: 9,  intelligence: 9,  hpMax: 18 },
  hound:    { strength: 9,  dexterity: 12, intelligence: 10, hpMax: 14 },
  mutt:     { strength: 9,  dexterity: 10, intelligence: 12, hpMax: 14 },
  puppy:    { strength: 8,  dexterity: 9,  intelligence: 9,  hpMax: 12 },
};

/** Build a DogCompanion from the finished onboarding payload. */
export function createDogCompanion(args: {
  name: string;
  breed: string;
  rawSex: string;
  startingProfile: DogStartingProfile;
  currentHour: number;
}): DogCompanion {
  const base = STARTING_STATS[args.startingProfile];
  return {
    id: `dog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: args.name.slice(0, 16).trim() || 'Marrow',
    breed: args.breed.slice(0, 24).trim() || 'mutt',
    sex: {
      raw: args.rawSex.slice(0, 8).trim(),
      pronoun: parsePronoun(args.rawSex),
    },
    startingProfile: args.startingProfile,
    hp: base.hpMax,
    hpMax: base.hpMax,
    stats: {
      strength: base.strength,
      dexterity: base.dexterity,
      intelligence: base.intelligence,
    },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80,
    lastFedAtHour: args.currentHour,
    equipped: { vest: null },
    status: 'with_player',
  };
}

/** Pick a default fall-back name from the breed for players who skip
 *  the name stage. Three flavor names rotate per session. */
export function defaultDogName(): string {
  const names = ['Rust', 'Cinder', 'Marrow'];
  return names[Math.floor(Math.random() * names.length)]!;
}

// ----- Train dog stat -------------------------------------------------
//
// Mirrors engine/statTraining.ts trainStat() for the player, but
// operates on the DogCompanion.statProgress field. Same per-tier
// progression curve. Failures do NOT train; only the caller knows
// whether the underlying check succeeded.

type DogStatKey = 'strength' | 'dexterity' | 'intelligence';

function dogProgressAwardFor(currentStat: number): number {
  if (currentStat <= 5)  return 3;
  if (currentStat <= 10) return 2;
  if (currentStat <= 14) return 1;
  if (currentStat <= 18) return 0.5;
  if (currentStat <= 22) return 0.25;
  return 0.1;
}

const DOG_LEVEL_UP_THRESHOLD = 100;

export interface DogTrainResult {
  dog: DogCompanion;
  leveled: { stat: DogStatKey; from: number; to: number } | null;
}

/** Train one of the dog's stats. Caller passes the relevant key and
 *  whether the use succeeded. */
export function trainDogStat(
  dog: DogCompanion,
  stat: DogStatKey,
  success: boolean,
): DogTrainResult {
  if (!success) return { dog, leveled: null };
  const baseStat = dog.stats[stat];
  const award = dogProgressAwardFor(baseStat);
  if (award <= 0) return { dog, leveled: null };
  const prev = dog.statProgress[stat];
  let progress = prev + award;
  let next = baseStat;
  let leveled: DogTrainResult['leveled'] = null;
  while (progress >= DOG_LEVEL_UP_THRESHOLD) {
    progress -= DOG_LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  return {
    dog: {
      ...dog,
      stats: { ...dog.stats, [stat]: next },
      statProgress: { ...dog.statProgress, [stat]: progress },
    },
    leveled,
  };
}
