// titles — the Arbiter-assigned title earning engine. OTA-236 shipped the
// character-page DISPLAY (`player.earnedTitles` + locked/earned rows) but
// nothing ever wrote to it, so all 20 titles were unearnable. This wires
// the earning: a counter model (`TitleProgress`), award predicates for the
// 14 Tier-A/B titles, and a passive-perk aggregator so an earned title
// actually does something.
//
// arb45 — scope is Tier A + B (14 titles). The 6 Tier-C titles
// (speaker_of_forgotten_tongues, wayfarer_of_the_lost_paths, guild_broker,
// protector_of_the_forgotten, shadow_diver, warden_of_the_old_world) are a
// later design pass and intentionally NOT wired here.
//
// Design: requirements map to real mechanics. Where the lore requirement had
// no mechanic, it's mapped to the closest shipped one (e.g. "control an
// Aether Golem" → recruit the golem companion; "create an Aether Golem" →
// complete a fusion). Perks are passive (always-on) so no activation UI is
// needed; "once per day" lore perks become balanced passives.

import type { PlayerCharacter } from './types';
import { getDayPeriod } from './timeOfDay';

/** OTA-848 — human-readable earn-date for a title, from its titleLog entry.
 *  In-game "Day N (period)" is the primary, immersive date; the real wall-clock
 *  date is appended as the literal answer. Titles earned before provenance was
 *  recorded (no entry) get an honest fallback, never a fabricated date.
 *  Exported + pure so it's unit-testable and reused by the Character screen. */
export function describeTitleEarned(entry?: { atHours: number; atMs: number }): string {
  if (!entry) return 'Earned earlier in your journey (before this was recorded).';
  const day = Math.floor((entry.atHours ?? 0) / 24) + 1;
  const period = getDayPeriod(entry.atHours);
  const d = new Date(entry.atMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const real = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `Earned: Day ${day} (${period}) · ${real}`;
}

/** Running counters that title predicates read. Lives on the player as
 *  `player.titleProgress`; absent fields default to 0 via EMPTY. */
export interface TitleProgress {
  /** Distinct relic-kind items discovered (investigation / loot). */
  relicsFound: number;
  /** Architectural Sentinels defeated in combat. */
  sentinelsDefeated: number;
  /** Relic-kind items sold / bartered to vendors. */
  relicsTraded: number;
  /** Aetheric-storm weather ticks survived (storm + still standing). */
  stormsSurvived: number;
  /** Fusions completed (the OTA-195 fusion gate). */
  fusionsCompleted: number;
  /** Ancient/relic items repaired. */
  repairsCompleted: number;
  /** Lore texts read (collectables / Ask-the-Arbiter lore hits). */
  loreRead: number;
  /** Highest corruption value ever reached (prolonged Aetherstone). */
  maxCorruption: number;
  /** Storms survived while a companion (dog/golem) was alive. */
  stormsSurvivedWithCompanion: number;
  /** OTA-1070 — strikes your golem has LANDED. golem_whisperer's canon is
   *  "successfully control an Aether Golem"; merely having one stand beside
   *  you was never control. */
  golemStrikesLanded: number;
  // ── Tier-C challenge counters (arb46) ─────────────────────────────────
  // These only increment from the location-challenge completion sites,
  // which are gated OFF behind locationChallenges.TIER_C_ENABLED — so these
  // titles cannot award until the challenges go live.
  /** Speaker of Forgotten Tongues — Tartarian language learned (0/1). */
  languageLearned: number;
  /** Wayfarer of the Lost Paths — clean Labyrinth runs. */
  labyrinthCleanRuns: number;
  /** Protector of the Forgotten — settlements defended. */
  settlementsDefended: number;
  /** Shadow Diver — trap-free ruin dives. */
  trapCleanDives: number;
  /** Warden of the Old World — relics/buildings preserved. */
  relicsPreserved: number;
  /** Guild Broker — faction alliances brokered. */
  alliancesBrokered: number;
  // ── Skyreacher (OTA-910) ──────────────────────────────────────────────
  /** Distinct great climbs crested (of 5). At 5 the Skyreacher title lands
   *  and the Skyreacher armor set is complete. */
  greatClimbsCompleted: number;
  /** OTA-1206 — collectible character-stories fully assembled (of 10). At 10 the
   *  Historian title lands. ⚠ Counts COMPLETED STORIES, not fragments: 57 fragments
   *  spread unevenly across 10 stories (5–7 each), so a fragment count would make the
   *  last story worth the same as the first and the title would land early. */
  collectableStoriesCompleted: number;
}

export const EMPTY_TITLE_PROGRESS: TitleProgress = {
  relicsFound: 0,
  sentinelsDefeated: 0,
  relicsTraded: 0,
  stormsSurvived: 0,
  fusionsCompleted: 0,
  repairsCompleted: 0,
  loreRead: 0,
  maxCorruption: 0,
  stormsSurvivedWithCompanion: 0,
  golemStrikesLanded: 0,
  languageLearned: 0,
  labyrinthCleanRuns: 0,
  settlementsDefended: 0,
  trapCleanDives: 0,
  relicsPreserved: 0,
  alliancesBrokered: 0,
  greatClimbsCompleted: 0,
  collectableStoriesCompleted: 0,
};

export function withTitleProgress(p?: Partial<TitleProgress>): TitleProgress {
  return { ...EMPTY_TITLE_PROGRESS, ...(p ?? {}) };
}

/** Aggregated passive perks from earned titles. All additive/flags so they
 *  compose cleanly and can be injected at the relevant resolution points. */
export interface TitlePerks {
  // passive numeric check bonuses
  investigationBonus: number;   // Seeker of Lost Relics  (+2)
  loreBonus: number;            // Scholar of Forgotten Lore (+2)
  tradeBonus: number;           // Relic Trader (+2 persuasion on trades)
  repairBonus: number;          // Architect's Eye (+2)
  socialBonus: number;          // Scion of the Giants (+2 CHA-ish)
  leadershipBonus: number;      // Etheric Explorer (+1)
  // combat
  mechanicalDamageDice: number; // Bane of Sentinels (+1 die vs mechanical)
  golemEdge: boolean;           // Golem Whisperer / Master of Aethercraft
  // mitigation (passive forms of the "1/day" lore perks)
  ethericDamageResist: boolean; // Aetheric Attuned
  envHazardSaveBonus: number;   // Etherbound Survivor (+2 vs environmental)
  corruptionResist: boolean;    // Survivor of Aetherstone (CON adv vs corruption)
  ethericShield: boolean;       // Stormcaller (deflect a sliver of energy dmg)
  ethericSurge: boolean;        // Aetherborn Awakened
  // ── Tier-C perks (arb46) ──────────────────────────────────────────────
  ruinsDefenseBonus: number;    // Protector + Warden (+Defense in/around ruins)
  diplomacyBonus: number;       // Guild Broker (+1 Diplomacy)
  stealthBonus: number;         // Shadow Diver (+1 Stealth)
  pathfinder: boolean;          // Wayfarer (read the true path)
  machineSpeech: boolean;       // Speaker (commune with Tartarian machines/relics)
  // ── Skyreacher (OTA-910) ──────────────────────────────────────────────
  climbFallHalved: boolean;     // Skyreacher — halves climb-fall damage
  dexterityBonus: number;       // Skyreacher — passive +DEX (folds into effectiveStats)
}

export const EMPTY_TITLE_PERKS: TitlePerks = {
  investigationBonus: 0, loreBonus: 0, tradeBonus: 0, repairBonus: 0,
  socialBonus: 0, leadershipBonus: 0, mechanicalDamageDice: 0,
  golemEdge: false, ethericDamageResist: false, envHazardSaveBonus: 0,
  corruptionResist: false, ethericShield: false, ethericSurge: false,
  ruinsDefenseBonus: 0, diplomacyBonus: 0, stealthBonus: 0,
  pathfinder: false, machineSpeech: false,
  climbFallHalved: false, dexterityBonus: 0,
};

interface TitleDef {
  id: string;
  /** True when the player meets the requirement right now. */
  earned: (player: PlayerCharacter, p: TitleProgress) => boolean;
  /** Folds this title's perk into the running aggregate. */
  perk: (acc: TitlePerks) => void;
}

const GIANT_RESPECTING_FACTIONS = new Set([
  'servants_of_giants', 'true_tartarians', 'tartarian_revivalists', 'stone_builders',
]);

function hasCompanion(player: PlayerCharacter): boolean {
  return !!(player.dog || player.golem);
}

/** The 14 wired titles (Tier A + B). */
export const WIRED_TITLES: TitleDef[] = [
  // ── Tier A ────────────────────────────────────────────────────────────
  {
    id: 'bane_of_sentinels',
    earned: (_pl, p) => p.sentinelsDefeated >= 5,
    perk: (a) => { a.mechanicalDamageDice += 1; },
  },
  {
    id: 'seeker_of_lost_relics',
    earned: (_pl, p) => p.relicsFound >= 3,
    perk: (a) => { a.investigationBonus += 2; },
  },
  {
    id: 'relic_trader',
    earned: (_pl, p) => p.relicsTraded >= 5,
    perk: (a) => { a.tradeBonus += 2; },
  },
  {
    id: 'etherbound_survivor',
    // OTA-350 — a survivor of the wastes has learned to keep to cover. (perk below)
    // OTA-1069 — was >= 1, which one ambient weather tick satisfied.
    earned: (_pl, p) => p.stormsSurvived >= STORM_TICKS_FOR_SURVIVOR,
    perk: (a) => { a.envHazardSaveBonus += 2; a.stealthBonus += 1; },
  },
  {
    id: 'survivor_of_aetherstone',
    // prolonged exposure: reached a high corruption load and lived.
    earned: (_pl, p) => p.maxCorruption >= 25,
    perk: (a) => { a.corruptionResist = true; },
  },
  {
    id: 'scion_of_the_giants',
    // OTA-1070 — was descent alone, both fields set at character creation.
    // Descent is the prerequisite; standing is the proof.
    earned: (pl) => pl.raceId === 'tartarian_giant'
      && GIANT_RESPECTING_FACTIONS.has(pl.factionId)
      && provenToGiantKin(pl),
    perk: (a) => { a.socialBonus += 2; },
  },
  {
    id: 'etheric_explorer',
    // "Lead an expedition deep into unexplored ruins" → clear a Lost Capital
    // (a deep, guardian-held buried ruin = the canonical deep expedition).
    earned: (pl) => (pl.mainQuest?.coresRecovered?.length ?? 0) >= 1,
    perk: (a) => { a.leadershipBonus += 1; },
  },
  {
    id: 'golem_whisperer',
    // OTA-1070 — was `!!pl.golem`: summon once, hold the title. Canon asks for
    // CONTROL, so the golem has to have fought for you. Deliberately NOT also
    // gated on a golem being alive right now — the title is a record of what
    // you did, and it should not blink out when a golem falls.
    earned: (_pl, p) => p.golemStrikesLanded >= GOLEM_STRIKES_FOR_WHISPERER,
    perk: (a) => { a.golemEdge = true; },
  },
  // ── Tier B (substitute mappings) ──────────────────────────────────────
  {
    id: 'master_of_aethercraft',
    earned: (_pl, p) => p.fusionsCompleted >= 1,
    perk: (a) => { a.golemEdge = true; },
  },
  {
    id: 'architects_eye',
    // OTA-1070 — was 1. One patch job is not an eye for architecture.
    earned: (_pl, p) => p.repairsCompleted >= REPAIRS_FOR_ARCHITECTS_EYE,
    perk: (a) => { a.repairBonus += 2; },
  },
  {
    id: 'aetherborn_awakened',
    earned: (pl) => pl.raceId === 'aetherborn' && (pl.corruption ?? 0) >= 10,
    perk: (a) => { a.ethericSurge = true; },
  },
  {
    id: 'scholar_of_forgotten_lore',
    earned: (_pl, p) => p.loreRead >= 3,
    perk: (a) => { a.loreBonus += 2; },
  },
  {
    id: 'aetheric_attuned',
    // survive a direct brush with an Etheric anomaly (a storm tick counts).
    // OTA-1069 — was `>= 1 || maxCorruption >= 5`. BOTH branches were free: one
    // ambient tick, or the couple of corruption a few ticks hand you. This perk
    // halves all Aetheric damage, so it is pitched highest of the three.
    earned: (_pl, p) => p.stormsSurvived >= STORM_TICKS_FOR_ATTUNED
      || p.maxCorruption >= CORRUPTION_FOR_ATTUNED,
    perk: (a) => { a.ethericDamageResist = true; },
  },
  {
    id: 'stormcaller',
    // OTA-1069 — was >= 1: one tick with a dog or golem alive.
    earned: (_pl, p) => p.stormsSurvivedWithCompanion >= STORM_TICKS_FOR_STORMCALLER,
    perk: (a) => { a.ethericShield = true; },
  },
  // ── Tier C (arb46 — location challenges; counters increment only from the
  //    OFF-by-default challenge completion sites, so these stay unearnable
  //    until locationChallenges.TIER_C_ENABLED + the per-challenge flag flips).
  {
    id: 'speaker_of_forgotten_tongues',
    earned: (_pl, p) => p.languageLearned >= 1,
    perk: (a) => { a.machineSpeech = true; },
  },
  {
    id: 'wayfarer_of_the_lost_paths',
    earned: (_pl, p) => p.labyrinthCleanRuns >= 1,
    // OTA-350 — one who reads the unseen paths also moves along them unseen.
    perk: (a) => { a.pathfinder = true; a.stealthBonus += 1; },
  },
  // ⚠ OTA-1206 — THE 22nd TITLE, AND THE FIRST NOT FROM THE OWNER'S CANON DOCX.
  // `data/lore/arbiter-titles.json` was ingested verbatim from
  // Arbiter_Assigned_Titles_for_Players.docx and held exactly 21, all of them wired.
  // This one is new, added on the owner's instruction (2026-08-09): *"you should get a
  // title for completing all of them, some types of historian title."* Named from the
  // game's own established phrase — "the buried world" runs through the narration — but
  // the NAME IS THE OWNER'S TO CHANGE; only the id is load-bearing.
  {
    id: 'historian_of_the_buried_world',
    earned: (_pl, p) => p.collectableStoriesCompleted >= 10,
    // Ten lives read end to end. The perk matches what the doing of it teaches: you know
    // where people leave things, and you know what you are looking at when you find it.
    perk: (a) => { a.loreBonus += 2; a.investigationBonus += 1; },
  },
  {
    id: 'guild_broker',
    earned: (_pl, p) => p.alliancesBrokered >= 1,
    perk: (a) => { a.diplomacyBonus += 1; },
  },
  {
    id: 'protector_of_the_forgotten',
    earned: (_pl, p) => p.settlementsDefended >= 1,
    perk: (a) => { a.ruinsDefenseBonus += 1; },
  },
  {
    id: 'shadow_diver',
    earned: (_pl, p) => p.trapCleanDives >= 3,
    perk: (a) => { a.stealthBonus += 1; },
  },
  {
    id: 'warden_of_the_old_world',
    earned: (_pl, p) => p.relicsPreserved >= 1,
    perk: (a) => { a.ruinsDefenseBonus += 1; },
  },
  // ── Skyreacher (OTA-910) — top all five great climbs (11–15 tiers) to
  //    complete the Skyreacher armor set and earn the name. The perk is a
  //    climber's mastery of height: falls hurt half as much, and the hands
  //    that made those summits are quicker (+2 DEX, always on). Earnable on
  //    HAL + golem, where the great climbs live.
  {
    id: 'skyreacher',
    earned: (_pl, p) => p.greatClimbsCompleted >= 5,
    perk: (a) => { a.climbFallHalved = true; a.dexterityBonus += 2; },
  },
];

export const WIRED_TITLE_IDS: ReadonlySet<string> = new Set(WIRED_TITLES.map((t) => t.id));

// OTA-915 — HIDDEN titles: shown on the titles screen as an undiscovered "?" until
// the player has run into the questline that can earn them (so a fresh character
// doesn't see a spoiler goal they've never heard of). Skyreacher is hidden until you
// find your first Skyreacher Chart (see greatClimbs.greatClimbLoreDiscovered). An
// earned title is always shown regardless.
export const HIDDEN_TITLE_IDS: ReadonlySet<string> = new Set(['skyreacher']);

/** True if this title is hidden until its questline is discovered. */
export function isHiddenTitle(id: string): boolean {
  return HIDDEN_TITLE_IDS.has(id);
}

// arb-fix — the canon `arbiter-titles.json` perk strings are tabletop lore
// ("Once per day, …") and DON'T match the shipped implementation (passive,
// always-on). This map is what the CharacterScreen shows for an EARNED title:
// an honest, present-tense description of the PASSIVE effect the engine now
// applies. Titles absent here fall back to the canon string.
// ---------------------------------------------------------------------------
// OTA-1069 — STORM-TITLE THRESHOLDS.
//
// Owner: "you shouldn't be able to earn titles in the tutorial. what titles are
// so easy to get that you earn them in the tutorial? they should take effort."
//
// They were right, and the numbers were the reason. etherbound_survivor and
// aetheric_attuned both awarded at `stormsSurvived >= 1`, and stormsSurvived
// incremented on ANY tick of Etheric weather -- ambient scenery the player
// neither sought nor answered. One line of black rain in the tutorial room
// therefore handed out TWO titles at once, before the player had finished the
// scripted climb. Nothing was earned; the weather simply happened near them.
//
// Two changes, both needed:
//   1. A tick only counts if the storm actually BIT (raw hp loss or corruption
//      gain). Standing in decorative weather is not survival. Measured on the
//      RAW delta, not the post-resist one, so owning the resist perk doesn't
//      stall progress toward the companion title.
//   2. Real thresholds. "Survive an Aetheric storm" should mean you lived in
//      the weather, not that you saw it once.
//
// aetheric_attuned is pitched highest of the three because its perk is the
// strongest: it HALVES all Aetheric damage, in combat and from weather.
// ---------------------------------------------------------------------------
// OTA-1070 — the last three free titles.
//
// OTA-1069 raised the storm family and flagged these as still cheap. The owner:
// "fix the other three." Each was checked against its own canon requirement in
// arbiter-titles.json, and in all three cases the code was not testing what the
// canon actually asks for:
//
//   scion_of_the_giants  canon: "PROVE direct descent from the Tartarian Giants"
//     was: raceId === 'tartarian_giant' && a giant-respecting faction. That is
//     the DESCENT half and nothing else -- both values are set at character
//     creation, so the title landed before the player had acted at all. Descent
//     is now the prerequisite and the PROOF is standing: the faction that
//     honours the Giants has to actually honour YOU. 25 is the codebase's
//     existing "they really like you" tier (gameStore ~8081).
//
//   golem_whisperer      canon: "Successfully CONTROL an Aether Golem"
//     was: `!!player.golem` -- a golem standing next to you is not control. Now
//     the golem has to have fought for you: landed strikes, counted at the
//     golem's own hit site.
//
//   architects_eye       canon: "Repair or restore a piece of ancient Tartarian
//     architecture" -- was ONE repair. A single patch job is not an eye for
//     architecture; ten is a body of work.
export const STANDING_FOR_SCION = 25;
export const GOLEM_STRIKES_FOR_WHISPERER = 15;
export const REPAIRS_FOR_ARCHITECTS_EYE = 10;

/** True when any Giant-respecting faction holds the player in real regard.
 *  The "prove" half of scion_of_the_giants. */
function provenToGiantKin(pl: PlayerCharacter): boolean {
  const standings = pl.factionStanding ?? [];
  return standings.some(
    (fs) => GIANT_RESPECTING_FACTIONS.has(fs.factionId) && fs.standing >= STANDING_FOR_SCION,
  );
}

export const STORM_TICKS_FOR_SURVIVOR = 12;
export const STORM_TICKS_FOR_ATTUNED = 20;
export const STORM_TICKS_FOR_STORMCALLER = 10;
/** Corruption high-water alternative for aetheric_attuned. Was 5 -- reachable
 *  from a couple of ambient ticks, which made the || branch as free as the
 *  count branch it was meant to complement. */
export const CORRUPTION_FOR_ATTUNED = 15;

export const TITLE_PASSIVE_PERK: Record<string, string> = {
  bane_of_sentinels: 'Passive: +1d6 damage against mechanical foes (automatons, sentinels, drones).',
  seeker_of_lost_relics: 'Passive: +2 to Investigate checks.',
  relic_trader: 'Passive: relics sell for more (≈+10%).',
  etherbound_survivor: 'Passive: shrugs off some damage from falls and elemental/environmental hits; +1 Stealth (you\'ve learned to keep to cover).',
  survivor_of_aetherstone: 'Passive: halves corruption gained from Etheric weather.',
  scion_of_the_giants: 'Passive: +2 to social (diplomacy) checks.',
  etheric_explorer: 'Passive: +1 to social (diplomacy) checks.',
  golem_whisperer: 'Passive: golems you summon come out tougher (+30% HP, one larger attack die).',
  master_of_aethercraft: 'Passive: golems you summon come out tougher (+30% HP, one larger attack die).',
  architects_eye: 'Passive: ancient / relic repairs cost less (≈−10%).',
  aetherborn_awakened: 'Passive: once per fight, your first hit detonates an Aetheric surge (+1d8 damage).',
  scholar_of_forgotten_lore: 'Passive: +2 to Investigate / lore checks.',
  aetheric_attuned: 'Passive: halves incoming Aetheric damage — in combat AND from Etheric weather.',
  // arb-fix — was a copy of Aetheric Attuned's line. Stormcaller's perk sets
  // ethericShield, which ALSO halves electrical damage in combat (OTA-835) — so
  // the description must state its distinct effect, not duplicate the other title.
  stormcaller: 'Passive: halves incoming Aetheric damage (in combat AND from Etheric weather) — and halves incoming electrical damage in combat.',
  // Tier-C (earnable once those challenges go live):
  guild_broker: 'Passive: +1 to social (diplomacy) checks.',
  shadow_diver: 'Passive: +1 to Stealth checks.',
  protector_of_the_forgotten: 'Passive: +1 AC while in ruins / constructed places (stacks with Warden).',
  warden_of_the_old_world: 'Passive: +1 AC while in ruins / constructed places (stacks with Protector).',
  speaker_of_forgotten_tongues: 'Passive: +2 when investigating relics & Tartarian machines.',
  wayfarer_of_the_lost_paths: 'Passive: cardinal travel costs less stamina (2 → 1.5); +1 Stealth (you move the lost paths unseen).',
  // OTA-910 — Skyreacher (top all five great climbs).
  skyreacher: 'Passive: climbing falls deal half damage; +2 DEX, always on (the surest hands in the Reaches).',
};

/** Every wired title whose requirement the player currently meets. */
export function evaluateEarnedTitles(player: PlayerCharacter): string[] {
  const p = withTitleProgress(player.titleProgress);
  return WIRED_TITLES.filter((t) => t.earned(player, p)).map((t) => t.id);
}

/** Titles earned *now* that aren't already in player.earnedTitles. */
export function newlyEarnedTitles(player: PlayerCharacter): string[] {
  const already = new Set(player.earnedTitles ?? []);
  return evaluateEarnedTitles(player).filter((id) => !already.has(id));
}

/** Aggregate passive perks from the player's earned titles. */
export function titlePerkModifiers(player: PlayerCharacter): TitlePerks {
  const acc: TitlePerks = { ...EMPTY_TITLE_PERKS };
  const earned = new Set(player.earnedTitles ?? []);
  for (const t of WIRED_TITLES) {
    if (earned.has(t.id)) t.perk(acc);
  }
  return acc;
}
