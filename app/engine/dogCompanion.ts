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

// ----- Rescue scenarios -----------------------------------------------

export type RescueScenarioId = 'smelter' | 'wagon' | 'cellar' | 'snare';

export interface RescueScenario {
  id: RescueScenarioId;
  /** The investigation hook noun the player must engage to fire the
   *  rescue. The hook nouns are added to roomInvestigationTable on
   *  matching scene archetypes. */
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
  /** Scene archetypes where this hook is eligible to spawn. Matched
   *  against location.tags. */
  archetypes: string[];
  /** Arbiter beat shown to the player when the captor falls. */
  victoryLine: string;
  /** Captor name shown in the combat log. */
  captorName: string;
}

export const RESCUE_SCENARIOS: Record<RescueScenarioId, RescueScenario> = {
  smelter: {
    id: 'smelter',
    hookNouns: ['cage', 'chain', 'anvil post', 'smelter', 'forge ruin'],
    captorFactionId: 'reclaimers',
    defaultBreed: 'mongrel',
    startingProfile: 'mongrel',
    archetypes: ['ruin', 'forge', 'industrial', 'wasteland'],
    captorName: 'Reclaimer Deserter',
    victoryLine:
      'The Reclaimer deserter falls into the slag. The dog is still chained, watching you with the wary level look of an animal that has read its odds. They were keeping the dog illegally. No faction reckoning falls on you for this.',
  },
  wagon: {
    id: 'wagon',
    hookNouns: ['wagon', 'wagon wheel', 'wheel', 'roadside camp', 'overturned wagon'],
    captorFactionId: 'mud_monarchs',
    defaultBreed: 'shepherd',
    startingProfile: 'shepherd',
    archetypes: ['road', 'wasteland', 'camp'],
    captorName: 'Mud Monarch Enforcer',
    victoryLine:
      'The enforcer breathes wet, then not at all. The shepherd lashed to the wheel finally stops growling at you — starts watching you instead. They were keeping the dog illegally. No faction reckoning falls on you for this.',
  },
  cellar: {
    id: 'cellar',
    hookNouns: ['cellar door', 'cellar', 'trapdoor', 'buried structure', 'hatch'],
    captorFactionId: 'aetherborn',
    defaultBreed: 'hound',
    startingProfile: 'hound',
    archetypes: ['ruin', 'dungeon', 'buried', 'wasteland'],
    captorName: 'Aetherborn Scavenger',
    victoryLine:
      'The scavenger crumples into the dark below. Up through the cellar floor comes a hound, lean and quiet, that pauses to look you over before it commits. They were keeping the dog illegally. No faction reckoning falls on you for this.',
  },
  snare: {
    id: 'snare',
    hookNouns: ['snare pit', 'snare', 'pit', 'trapper camp', 'trap'],
    captorFactionId: null, // unaligned — always available as fallback
    defaultBreed: 'mutt',
    startingProfile: 'mutt',
    archetypes: ['wilderness', 'wasteland', 'camp'],
    captorName: 'Unaligned Poacher',
    victoryLine:
      'The poacher folds over the line of their own snare. The mutt in the pit stops snarling, settles. They were keeping the dog illegally. No faction reckoning falls on you for this.',
  },
};

// ----- Captor factory --------------------------------------------------

/** Build an Enemy record for the rescue captor. Always sets
 *  factionNeutralFight=true so the kill-handling site skips the
 *  faction-standing delta and the witness-cascade pass. */
export function spawnRescueCaptor(
  scenarioId: RescueScenarioId,
  playerFactionId: string | null | undefined,
): Enemy {
  const scenario = RESCUE_SCENARIOS[scenarioId];
  // If the captor's faction matches the player's faction, fall back
  // to the unaligned poacher template so we never make the player
  // fight one of their own under the neutral-kill flag.
  const useFallback =
    scenario.captorFactionId !== null &&
    scenario.captorFactionId === playerFactionId;
  const captorName = useFallback
    ? RESCUE_SCENARIOS.snare.captorName
    : scenario.captorName;
  return {
    name: captorName,
    type: 'humanoid',
    abilityPoint: 'Strength 4',
    attack: '4',
    damage: '1d6+1',
    hp: 14,
    rarity: 'Uncommon' as Rarity,
    loot: ['Scrap Metal', 'Hardtack', 'Mud Cloth'],
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

// OTA-979 — the ONE way to answer "which inventory instance is the vest the dog
// is wearing?". Owner: "dog vests don't show which one is equipped in the
// inventory." The screen used to re-derive this ad hoc: the badge required
// item.kind === 'dog_armor' exactly (fused/odd-kind vests fell through the
// name fallback) and the slot label compared by NAME (broken the moment a
// still-cooling Crucible vest got renamed by the settle). Resolution order:
// exact instance id, then name match on anything that IS dog armor by kind
// OR by uniqueStats.kind. Returns null when no dog / nothing worn / vest gone.
export function wornDogVestInstanceId(player: {
  dog?: { status?: string; equipped?: { vest?: string | null; vestId?: string | null } } | null;
  inventory?: ReadonlyArray<{ id: string; name: string; kind?: string; quantity?: number; uniqueStats?: { kind?: string } }>;
}): string | null {
  const dog = player.dog;
  if (!dog || dog.status === 'dead' || dog.status === 'abandoned') return null;
  const vestName = dog.equipped?.vest ?? null;
  const vestId = dog.equipped?.vestId ?? null;
  const inv = player.inventory ?? [];
  if (vestId) {
    const byId = inv.find((it) => it.id === vestId && (it.quantity ?? 1) > 0);
    if (byId) return byId.id;
  }
  if (!vestName) return null;
  const isDogArmor = (it: { kind?: string; uniqueStats?: { kind?: string } }): boolean =>
    it.kind === 'dog_armor' || it.uniqueStats?.kind === 'dog_armor';
  const byName = inv.find((it) => isDogArmor(it) && it.name === vestName && (it.quantity ?? 1) > 0);
  return byName?.id ?? null;
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
// OTA-800 — hard training ceiling, mirroring the player's MAX_TRAINED_STAT
// (statTraining.ts). Without it a dog stat trained forever (0.1/use at 22+), so
// a companion could be ground past the player and past sane damage/AC scaling.
const DOG_MAX_TRAINED_STAT = 30;

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
  // OTA-800 — ceiling reached: stop training (see DOG_MAX_TRAINED_STAT).
  if (baseStat >= DOG_MAX_TRAINED_STAT) return { dog, leveled: null };
  const award = dogProgressAwardFor(baseStat);
  if (award <= 0) return { dog, leveled: null };
  const prev = dog.statProgress[stat];
  let progress = prev + award;
  let next = baseStat;
  let leveled: DogTrainResult['leveled'] = null;
  while (progress >= DOG_LEVEL_UP_THRESHOLD && next < DOG_MAX_TRAINED_STAT) {
    progress -= DOG_LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  if (next >= DOG_MAX_TRAINED_STAT) progress = 0;
  return {
    dog: {
      ...dog,
      stats: { ...dog.stats, [stat]: next },
      statProgress: { ...dog.statProgress, [stat]: progress },
    },
    leveled,
  };
}
