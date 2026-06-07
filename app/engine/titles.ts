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
  languageLearned: 0,
  labyrinthCleanRuns: 0,
  settlementsDefended: 0,
  trapCleanDives: 0,
  relicsPreserved: 0,
  alliancesBrokered: 0,
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
}

export const EMPTY_TITLE_PERKS: TitlePerks = {
  investigationBonus: 0, loreBonus: 0, tradeBonus: 0, repairBonus: 0,
  socialBonus: 0, leadershipBonus: 0, mechanicalDamageDice: 0,
  golemEdge: false, ethericDamageResist: false, envHazardSaveBonus: 0,
  corruptionResist: false, ethericShield: false, ethericSurge: false,
  ruinsDefenseBonus: 0, diplomacyBonus: 0, stealthBonus: 0,
  pathfinder: false, machineSpeech: false,
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
    earned: (_pl, p) => p.stormsSurvived >= 1,
    perk: (a) => { a.envHazardSaveBonus += 2; },
  },
  {
    id: 'survivor_of_aetherstone',
    // prolonged exposure: reached a high corruption load and lived.
    earned: (_pl, p) => p.maxCorruption >= 25,
    perk: (a) => { a.corruptionResist = true; },
  },
  {
    id: 'scion_of_the_giants',
    earned: (pl) => pl.raceId === 'tartarian_giant' && GIANT_RESPECTING_FACTIONS.has(pl.factionId),
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
    earned: (pl) => !!pl.golem,
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
    earned: (_pl, p) => p.repairsCompleted >= 1,
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
    earned: (_pl, p) => p.stormsSurvived >= 1 || p.maxCorruption >= 5,
    perk: (a) => { a.ethericDamageResist = true; },
  },
  {
    id: 'stormcaller',
    earned: (_pl, p) => p.stormsSurvivedWithCompanion >= 1,
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
    perk: (a) => { a.pathfinder = true; },
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
];

export const WIRED_TITLE_IDS: ReadonlySet<string> = new Set(WIRED_TITLES.map((t) => t.id));

// arb-fix — the canon `arbiter-titles.json` perk strings are tabletop lore
// ("Once per day, …") and DON'T match the shipped implementation (passive,
// always-on). This map is what the CharacterScreen shows for an EARNED title:
// an honest, present-tense description of the PASSIVE effect the engine now
// applies. Titles absent here fall back to the canon string.
export const TITLE_PASSIVE_PERK: Record<string, string> = {
  bane_of_sentinels: 'Passive: +1d6 damage against mechanical foes (automatons, sentinels, drones).',
  seeker_of_lost_relics: 'Passive: +2 to Investigate checks.',
  relic_trader: 'Passive: relics sell for more (≈+10%).',
  etherbound_survivor: 'Passive: shrugs off some damage from falls and elemental/environmental hits.',
  survivor_of_aetherstone: 'Passive: halves corruption gained from Etheric weather.',
  scion_of_the_giants: 'Passive: +2 to social (diplomacy) checks.',
  etheric_explorer: 'Passive: +1 to social (diplomacy) checks.',
  golem_whisperer: 'Passive: golems you summon come out tougher (+30% HP, one larger attack die).',
  master_of_aethercraft: 'Passive: golems you summon come out tougher (+30% HP, one larger attack die).',
  architects_eye: 'Passive: ancient / relic repairs cost less (≈−10%).',
  aetherborn_awakened: 'Passive: once per fight, your first hit detonates an Aetheric surge (+1d8 damage).',
  scholar_of_forgotten_lore: 'Passive: +2 to Investigate / lore checks.',
  aetheric_attuned: 'Passive: halves incoming Aetheric damage — in combat AND from Etheric weather.',
  stormcaller: 'Passive: halves incoming Aetheric damage — in combat AND from Etheric weather.',
  // Tier-C (earnable once those challenges go live):
  guild_broker: 'Passive: +1 to social (diplomacy) checks.',
  shadow_diver: 'Passive: +1 to Stealth checks.',
  protector_of_the_forgotten: 'Passive: +1 AC while in ruins / constructed places (stacks with Warden).',
  warden_of_the_old_world: 'Passive: +1 AC while in ruins / constructed places (stacks with Protector).',
  speaker_of_forgotten_tongues: 'Passive: +2 when investigating relics & Tartarian machines.',
  wayfarer_of_the_lost_paths: 'Passive: cardinal travel costs less stamina (2 → 1.5).',
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
