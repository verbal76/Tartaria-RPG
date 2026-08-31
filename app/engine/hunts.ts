import { findByTitle } from './titleMatch';
import { firstActionableStage, type StageBinding } from './questStage';
// Hunt engine — long-form, multi-stage monster hunts (5-9 prep stages + a
// final boss combat). Hunts are accepted from vendors or from beast-sign
// hooks, scale the target enemy to the player's current power level, and
// pay out big once turned in.

import huntsData from '../data/quests/hunts.json';
import type { PlayerCharacter, Enemy } from './types';
import enemiesData from '../data/enemies/enemies.json';
// OTA-1167 — the shared over-level curve, so a hunt boss reads the player the same way
// every other spawner does rather than inventing its own measure.
import { overLevelT } from './encounter';

export type HuntCheckKind =
  | null
  | 'investigate'
  | 'stealth'
  | 'diplomacy'
  | 'escape'
  | 'cast'
  | 'attack_provoke'
  | 'boss';

/** 2026-05-26 OTA-055 — narrative slot the stage occupies in the
 *  standardized templates. Two template families:
 *
 *  standard_7 (informant-driven, methodical):
 *    inciting_hook → first_friction → toll → favor → revelation →
 *    catalyst → apex
 *
 *  bait_switch_5 (urgent, subversive, action-heavy):
 *    urgent_dispatch → false_summit → investigation → gauntlet → apex
 *
 *  Optional — null/unset means "legacy stage with no template slot."
 *  The ContractsScreen renders the label only when stageType is set,
 *  so older hunts (or non-bounty quests) still display cleanly. */
export type HuntStageType =
  | 'inciting_hook'
  | 'first_friction'
  | 'toll'
  | 'favor'
  | 'revelation'
  | 'catalyst'
  | 'apex'
  | 'urgent_dispatch'
  | 'false_summit'
  | 'investigation'
  | 'gauntlet';

export interface HuntStageDef extends StageBinding {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
  /** 2026-05-26 OTA-055 — narrative slot in the standardized template.
   *  Surfaced as "Stage 3/7 — The Toll" in the ContractsScreen so the
   *  player knows what kind of beat they're on. */
  stageType?: HuntStageType;
}

/** 2026-05-26 OTA-055 — combined "how dangerous is this" tier surfaced
 *  to the player so they don't accept a hunt that'll kill them. The
 *  Arbiter warns on accept if the player is below recommendedHp AND
 *  wielding a weapon under recommendedWeaponRarity. */
export type HuntDifficultyTier = 1 | 2 | 3 | 4;
export type HuntDifficultyLabel = 'Greenhorn' | 'Seasoned' | 'Veteran' | 'Apex';
export type HuntWeaponRarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export interface HuntDef {
  id: string;
  title: string;
  posterText: string;
  /** Catalog name of the target — looked up in enemies.json when the boss spawns. */
  targetEnemyName: string;
  biomeTag: string;
  /** 2026-05-26 OTA-053 — explicit player-facing location name where
   *  the target hides out. Surfaced on accept ("Travel to X to
   *  begin.") and in the Contracts expanded view ("Location: X"),
   *  so the player isn't reduced to scanning posterText for a
   *  proper noun. Optional for backward compat with older hunt
   *  authoring; when missing, the engine falls back to the biomeTag
   *  → friendly-label table in gameStore. */
  targetLocationName?: string;
  /** 2026-05-26 OTA-055 — which template the hunt follows. Drives
   *  the "Stage N/M" total and the stageType label rendering.
   *  Optional for legacy hunts; missing = no template badge. */
  templateKind?: 'standard_7' | 'bait_switch_5';
  /** 2026-05-26 OTA-055 — combined difficulty. Optional but every
   *  authored hunt today carries it. The ContractsScreen renders
   *  "Tier 3 — Veteran" with color-coded urgency vs the player's
   *  current HP / weapon rarity. */
  difficultyTier?: HuntDifficultyTier;
  difficultyLabel?: HuntDifficultyLabel;
  recommendedHp?: number;
  recommendedWeaponRarity?: HuntWeaponRarity;
  minRep: number;
  factionId: string | null;
  rewardTc: number;
  rewardItem: string | null;
  rewardRep: number | null;
  /** Cosmetic name of the trophy that gets added to inventory on turn-in. */
  trophyName: string;
  stages: HuntStageDef[];
}

interface HuntDataShape {
  hunts: HuntDef[];
}

/** 2026-05-26 OTA-053 — player-facing label for the per-stage skill
 *  hint shown in the ContractsScreen. Internal checkKind values are
 *  systemic (`attack_provoke`, `cast`); these are the imperative
 *  the player should act on at this stage. Null = pure narration
 *  stage (auto-advance on any action). */
export function checkKindLabel(kind: HuntCheckKind): string | null {
  switch (kind) {
    case 'investigate': return 'investigate the area';
    case 'stealth': return 'use stealth';
    case 'diplomacy': return 'talk it out';
    case 'escape': return 'escape / disengage';
    case 'cast': return 'use Aethercraft';
    case 'attack_provoke': return 'attack to provoke';
    case 'boss': return 'defeat in combat';
    default: return null;
  }
}

/** 2026-05-26 OTA-053 — friendly label for a biomeTag when a hunt
 *  doesn't carry an explicit targetLocationName. Falls back to the
 *  tag itself title-cased if no mapping exists. */
const BIOME_LABELS: Record<string, string> = {
  mud_seas: 'the Mud Seas',
  buried_capital: 'a buried capital',
  sentinel_ward: 'a Sentinel Ward',
  outskirts: 'the Tartarian Outskirts',
  ruin: 'the buried ruins',
};
export function biomeLabel(biomeTag: string): string {
  const mapped = BIOME_LABELS[biomeTag];
  if (mapped) return mapped;
  return biomeTag
    .split(/[_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/** 2026-05-26 OTA-055 — player-facing label for each stage slot in
 *  the standardized hunt templates. Rendered as "Stage N/M — <label>"
 *  in the ContractsScreen. */
const STAGE_TYPE_LABELS: Record<HuntStageType, string> = {
  // standard_7
  inciting_hook: 'The Inciting Hook',
  first_friction: 'The First Friction',
  toll: 'The Toll',
  favor: 'The Favor',
  revelation: 'The Revelation & Approach',
  catalyst: 'The Catalyst',
  apex: 'The Apex',
  // bait_switch_5
  urgent_dispatch: 'The Urgent Dispatch',
  false_summit: 'The False Summit',
  investigation: 'The Investigation',
  gauntlet: 'The Gauntlet',
  // (apex reused — same label both templates)
};
export function stageTypeLabel(t: HuntStageType | undefined): string | null {
  if (!t) return null;
  return STAGE_TYPE_LABELS[t] ?? null;
}

/** 2026-05-26 OTA-055 — ordinal rank for the weapon rarities so
 *  recommendedWeaponRarity can be compared against the player's
 *  currently-equipped weapon. Same Common→Legendary ladder the
 *  catalog uses. */
const RARITY_RANK: Record<HuntWeaponRarity, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Legendary: 4,
};
export function weaponRarityMeets(have: string | undefined, need: HuntWeaponRarity): boolean {
  const haveRank = have && have in RARITY_RANK ? RARITY_RANK[have as HuntWeaponRarity] : 0;
  return haveRank >= RARITY_RANK[need];
}

export const HUNTS = (huntsData as HuntDataShape).hunts;

export function findHuntById(id: string): HuntDef | null {
  return HUNTS.find((h) => h.id === id) ?? null;
}

/** ⚠⚠ OTA-1219 — THE FIRST STAGE A VERB CAN PAY. Every hunt opens on a
 *  pure-narration stage (checkKind: null) whose text plays at ACCEPT — but the
 *  record used to START at that index, and the OTA-1213 verb matcher can never
 *  match a null kind. Mysteries and storylines auto-consume narration stages
 *  (OTA-871); hunts never got that loop, so every hunt accepted after 1236 was
 *  wedged at stage 0 forever — no verb, no dice, nothing could move it. The
 *  hunt walker found it on its first step. Accept starts the record HERE, and
 *  advanceHunt + the save backfill consume any nulls mid-chain.
 *
 *  ⚠⚠⚠ OTA-1582 — AND IT NO LONGER SKIPS A STAGE SOMEBODY IS STANDING IN. Every
 *  one of those opening stages NAMES A PERSON — the reeve with the bounty book,
 *  the Order envoy with the sealed reliquary — and skipping it is how the token
 *  came to be in the pack with nobody attached to it. The skip's real job is
 *  narrower than it was written: a stage NO VERB CAN MATCH must not wedge the
 *  chain. A stage with a person in it now carries a verb, so it wedges nothing,
 *  and it is not skipped. `firstActionableStage` is the one definition all three
 *  families share; this wrapper keeps the hunt-shaped signature its six call
 *  sites already use. */
export function firstActionableHuntStage(
  hunt: { stages: ReadonlyArray<{ checkKind: string | null; npcName?: string }> },
): number {
  return firstActionableStage(hunt.stages);
}

/** ⚠⚠ OTA-1450 — A CARRY CAP WAS BUILT HERE AND THEN REMOVED, DELIBERATELY.
 *
 *  The owner's log shows sixteen hunts signed in ten seconds, so the first cut
 *  of this OTA capped how many could be held. That was an over-reach and it is
 *  recorded rather than quietly dropped: OTA-972 had already decided this
 *  question on purpose — *"first contract goes LIVE; every later accept — any
 *  kind — parks"* — so the flood was already answered by TRACKING exactly one.
 *  The Arbiter's "you can only walk one road at a time" describes that rule and
 *  is accurate.
 *
 *  What the owner actually reported was what Tarek GIVES OUT, not what a player
 *  may hold, and that is the reach gate below. A cap would also have deleted a
 *  design two suites document. If a carry limit is ever wanted it is a balance
 *  decision for the owner, not a bug fix. */


/** ⚠⚠ OTA-1450 — THE CATALOGUE ALREADY KNEW, AND NOTHING ASKED IT.
 *
 *  Every hunt carries `recommendedHp` — authored, 30 to 65 across the eighteen —
 *  and no gate ever read it. `minRep` was the only filter, and SIXTEEN OF THE
 *  EIGHTEEN sit at minRep 0, so a character who had never left the outpost was
 *  posted the near-complete board: nine Veteran, five Elite, two Apex. Owner:
 *  *"Tarek the Tinkerer still gives out a ton of higher end missions in the
 *  outpost."*
 *
 *  Reputation answers "do they trust you with this", which is a different
 *  question from "can you live through it" — and the second had no gate at all.
 *  A hunt is posted when its recommended HP is within reach of yours, so the
 *  board opens as the character grows instead of arriving whole on day one.
 *
 *  ⚠ hpMax is OPTIONAL and omitting it keeps the old behaviour. The catalogue
 *  readers (the Contracts modal's "what exists" list, the walkers) mean
 *  something different by "available" than a vendor posting work at you, and a
 *  readiness filter applied there would hide content from the wrong surface.
 *  Every player-facing OFFER passes it. */
export function huntWithinReach(hunt: HuntDef, hpMax: number | undefined): boolean {
  if (hpMax === undefined) return true;
  return (hunt.recommendedHp ?? 0) <= hpMax;
}

/**
 * ⚠⚠⚠ OTA-1466 — WHY A BOUNTY IS NOT ON THE BOARD.
 *
 * The owner, typed into the game on 2026-08-24 after tapping a posting twelve
 * times in nine seconds and getting the same shrug every time:
 *
 *   "I couldn't accept the core ass mission from this vendor, but there was no
 *    pop-up telling me why. I'm imagining it's because either I've hit my cap of
 *    missions that I can have or I don't have enough standing but it doesn't say
 *    which. so either we need to have a pop-up or maybe like an angular set of
 *    writing like how they do, you know kind of faded, that says need standing
 *    or something like that?"
 *
 * ⚠⚠ HE HAD TO GUESS, AND BOTH HIS GUESSES WERE WRONG. There is no mission cap —
 * `anyTrackedContract` PARKS an extra contract, it never refuses one — and
 * standing is only one of FOUR reasons `availableHunts` can drop a posting. The
 * fourth, `huntWithinReach`, is almost certainly the one he hit and it is the one
 * nothing anywhere names.
 *
 * This is the-game-knows-and-does-not-say (OTA-1402) on the contracts board: the
 * filter has the answer at the moment it excludes the row, and then throws it
 * away and renders nothing.
 *
 * ⚠ ORDER IS THE ORDER OF FINALITY, most permanent first. A completed hunt is
 * never coming back; a rep gate might lift this evening. Reporting "you need
 * standing 3" about a contract the player finished last week would be true of
 * the number and useless as an answer.
 */
export type HuntBlock =
  | { kind: 'completed'; text: string }
  | { kind: 'active'; text: string }
  | { kind: 'faction'; text: string }
  | { kind: 'standing'; text: string; need: number; have: number }
  | { kind: 'reach'; text: string; need: number; have: number };

export function huntBlockReason(
  hunt: HuntDef,
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
  hpMax?: number,
): HuntBlock | null {
  if (completed.includes(hunt.id)) {
    return { kind: 'completed', text: 'already finished' };
  }
  if (active.includes(hunt.id)) {
    return { kind: 'active', text: 'already on your slate' };
  }
  // Mirrors the faction clause in `availableHunts` exactly: a vendor posts its
  // own work, plus open contracts (factionId === null) when it has a faction of
  // its own to post them alongside.
  if (!(hunt.factionId === factionId || (factionId !== null && hunt.factionId === null))) {
    return { kind: 'faction', text: 'posted by another faction' };
  }
  if (playerRep < hunt.minRep) {
    return {
      kind: 'standing',
      text: `need standing ${hunt.minRep} (you have ${playerRep})`,
      need: hunt.minRep, have: playerRep,
    };
  }
  if (!huntWithinReach(hunt, hpMax)) {
    const need = hunt.recommendedHp ?? 0;
    return {
      kind: 'reach',
      // ⚠ Phrased as the thing the player can change. "Recommended HP 80" is a
      // stat; "come back at 80 HP" is an instruction, and the difference is
      // whether he knows what to do about it.
      text: `come back at ${need} HP (you have ${hpMax ?? 0})`,
      need, have: hpMax ?? 0,
    };
  }
  return null;
}

/**
 * Every hunt this vendor COULD post, each with the reason it is not on the board
 * — or `null` when it is. Built from the same predicates `availableHunts`
 * filters on, so the two cannot drift: a hunt with a null reason here is exactly
 * a hunt that survives the filter there, and `huntBoardIsConsistent` asserts it.
 */
export function huntBoardWithReasons(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
  hpMax?: number,
): { hunt: HuntDef; blocked: HuntBlock | null }[] {
  return HUNTS
    .map((hunt) => ({
      hunt,
      blocked: huntBlockReason(hunt, factionId, playerRep, active, completed, hpMax),
    }))
    // A contract from a faction this vendor has nothing to do with is not
    // "locked", it is simply somebody else's business — showing it greyed on
    // every board would bury the four rows that matter under eighteen that
    // never will.
    .filter((r) => r.blocked?.kind !== 'faction');
}

/** ⚠⚠ THE TWO-DEFINITIONS GUARD. `availableHunts` decides what is offered and
 *  `huntBlockReason` explains what is not, and they are separate code. If they
 *  ever disagree the board shows a row it will refuse, or hides one it would
 *  accept — both worse than the silence this OTA replaced. Exported so the suite
 *  can assert it across the whole catalogue rather than trusting the reading. */
export function huntBoardIsConsistent(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
  hpMax?: number,
): boolean {
  const offered = new Set(
    availableHunts(factionId, playerRep, active, completed, hpMax).map((h) => h.id),
  );
  for (const h of HUNTS) {
    const blocked = huntBlockReason(h, factionId, playerRep, active, completed, hpMax);
    if (offered.has(h.id) !== (blocked === null)) return false;
  }
  return true;
}

// Available to a player from a given vendor or in general. Filters by
// faction (vendors aligned with a faction only post their own hunts —
// hunts with factionId=null are open contracts anyone can offer),
// minimum rep, already-active/completed lists, and — OTA-1450 — whether the
// character can plausibly survive the thing.
export function availableHunts(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
  hpMax?: number,
): HuntDef[] {
  return HUNTS.filter(
    (h) =>
      (h.factionId === factionId || (factionId !== null && h.factionId === null)) &&
      playerRep >= h.minRep &&
      huntWithinReach(h, hpMax) &&
      !active.includes(h.id) &&
      !completed.includes(h.id),
  );
}

// ⚠ OTA-1188 — delegates to the shared three-tier resolver. The first two tiers are
// the exact behaviour this function always had; the third catches the case the
// parser creates by stripping stop words ("fragment red tower" vs "Fragment of the
// Red Tower"), and only ever runs where this used to return null. See titleMatch.ts.
export function fuzzyFindHunt(text: string, pool: readonly HuntDef[]): HuntDef | null {
  return findByTitle(text, pool);
}

/** ⚠ OTA-1167 — ceiling on the boss HP multiplier at full over-level. The old curve
 *  topped out at an effective 1.6, driven by `hpMax` alone. */
export const HUNT_HP_CEILING = 2.2;
/** Over-level fraction at which the boss gains a damage die. Was `hpMax > 50`, which a
 *  heavily-armoured character at 40 HP never reached no matter what they swung. */
export const HUNT_DAMAGE_STEP_T = 0.5;

// Build a scaled clone of the target enemy.
//
// ⚠ OTA-1167 — IT USED TO SCALE ON `hpMax` AND NOTHING ELSE:
//     hpFactor = min(1.6, max(1.0, hpMax / 30))
// which is 1.0 — NO SCALING WHATSOEVER — for every character under 30 max HP, and blind
// to stats, weapon damage and AC. OTA-1159 built `enemyScalePower` precisely because
// "how strong is this character" had two different answers, and routed seven spawners
// through it. THIS WAS THE SPAWNER THAT GOT MISSED: a fully kitted character at 29 max
// HP fought exactly the boss a fresh arrival did.
//
// ⚠ `power` IS SUPPLIED BY THE CALLER, DELIBERATELY. The store's `scalePowerOf` wraps
// its gear read in a try/catch because `getEquippedWeapon` throws on an inventory-less
// player, and a throw here would abort the whole spawn — surfacing as an encounter that
// silently never happens. Re-deriving power inside this module would duplicate that
// hazard. Omitting it falls back to the old hpMax curve, so every legacy caller works.
export function scaleHuntBoss(player: PlayerCharacter, def: HuntDef, power?: number): Enemy | null {
  const base = (enemiesData as Enemy[]).find((e) => e.name === def.targetEnemyName);
  if (!base) return null;
  // 0 at a fresh arrival → 1 at end-game; the same term every other spawner reads.
  const t = power === undefined ? null : overLevelT(power);
  const hpFactor = t === null
    ? Math.min(1.6, Math.max(1.0, player.hpMax / 30))
    : 1 + t * (HUNT_HP_CEILING - 1);
  const hp = Math.round(base.hp * hpFactor);
  // Bump damage by adding one die to the lowest die-count if the player
  // is well-established. Format like "4D10" → "5D10".
  let damage = String(base.damage);
  const dangerous = t === null ? player.hpMax > 50 : t >= HUNT_DAMAGE_STEP_T;
  if (dangerous) {
    damage = damage.replace(/(\d+)([dD]\d+)/, (_m, c, rest) => `${parseInt(c, 10) + 1}${rest}`);
  }
  return {
    ...base,
    name: `${base.name} (hunted)`,
    hp,
    damage,
  };
}

/**
 * ⚠⚠⚠ OTA-1576 — THE ESCORT A STAGE NAMES FOR ITSELF. `scaleHuntBoss` always
 * reads `HuntDef.targetEnemyName`, so every boss stage in a hunt produced the
 * same single creature no matter what its own prose said — which turned both
 * `false_summit` stages in the game into the opposite of the beat they were
 * written for. See `HuntStageDef.spawn`.
 *
 * ⚠⚠ SCALED LIKE A BOSS BUT NOT NAMED LIKE ONE. It rides the identical HP curve
 * so a pack authored at tier 2 still bites at end-game, and deliberately does
 * NOT take the "(hunted)" suffix — three of them are a fight, not three bosses,
 * and the suffix is how the player reads "this is the one you came for".
 *
 * ⚠ HP is spread, not multiplied: `count` bodies of the catalog creature, each
 * at its own scaled HP. Three raiders at 34 is a real fight for a tier-2 hunt;
 * three at a boss's 310 would be a wall.
 */
export function scaleHuntEscort(
  player: PlayerCharacter,
  enemyName: string,
  power?: number,
  count = 1,
): Enemy[] {
  const base = (enemiesData as Enemy[]).find((e) => e.name === enemyName);
  if (!base) return [];
  const t = power === undefined ? null : overLevelT(power);
  const hpFactor = t === null
    ? Math.min(1.6, Math.max(1.0, player.hpMax / 30))
    : 1 + t * (HUNT_HP_CEILING - 1);
  const hp = Math.round(base.hp * hpFactor);
  let damage = String(base.damage);
  const dangerous = t === null ? player.hpMax > 50 : t >= HUNT_DAMAGE_STEP_T;
  if (dangerous) {
    damage = damage.replace(/(\d+)([dD]\d+)/, (_m, c, rest) => `${parseInt(c, 10) + 1}${rest}`);
  }
  const n = Math.max(1, Math.min(5, Math.floor(count)));
  return Array.from({ length: n }, () => ({ ...base, hp, damage }));
}

// Player-side hunt progress record stored on the player.
export interface ActiveHunt {
  id: string;
  stage: number;
  /** ID of the vendor / faction that posted the hunt (used to validate turn-in). */
  postedByFaction: string | null;
  acceptedAt: number;
}

/**
 * ⚠⚠⚠ OTA-1474 — AN EMPTY BOARD IS THE ONE CASE OTA-1466 LEFT SILENT.
 *
 * THE OWNER, 4.32.11, at the Hidden Market armor stall. Twelve taps in nine
 * seconds, and the log for all twelve:
 *
 *   00:14:05.959  Korash of the Deep shakes their head. "No bounties for you
 *                 right now."
 *   00:14:07.690  dedup: suppressed arbiter repeat — "Korash of the Deep …"
 *   …             ×10 more
 *
 * Then, at 00:14:52:
 *
 *   "I couldn't accept the core ass mission from this vendor, but there was no
 *    pop-up telling me why. I'm imagining it's because either I've hit my cap
 *    of missions that I can have or I don't have enough standing but it doesn't
 *    say which. so either we need to have a pop-up or maybe like an angular set
 *    of writing like how they do, you know kind of faded, that says need
 *    standing or something like that"
 *
 * ⚠⚠ OTA-1466 ANSWERED THE OTHER TWO BRANCHES AND NOT THIS ONE. Its fix names a
 * specific posting when he asks for one, and lists what IS posted when he asks
 * for something that is not. Both need the board to have something on it. When
 * `availableHunts` comes back empty for every faction the vendor searches, the
 * code falls through to a bare shrug — and that is precisely the moment the
 * player has the least information and the most reason to keep tapping.
 *
 * ⚠ The reasons were never missing. `huntBlockReason` can say, for every hunt in
 * the catalogue, exactly why it is not on offer. The empty case just threw them
 * all away. Nothing new is computed here; the same verdicts are counted instead
 * of discarded.
 *
 * ⚠⚠ AND HIS TWO GUESSES WERE BOTH WRONG, which is the real cost of the shrug:
 * there is no mission cap (an extra contract PARKS, it is never refused), and
 * standing is one of four reasons. He spent the guess because we made him.
 */
export interface EmptyBoardTally {
  standing: number;
  reach: number;
  active: number;
  completed: number;
}

/** Count why nothing is posted, across every faction this vendor searches. Each
 *  hunt is counted ONCE, under the reason that actually blocked it — the same
 *  ordering `huntBlockReason` uses, so the tally and the row agree.
 *
 *  ⚠ A hunt blocked for one faction but OPEN for another is not blocked at all:
 *  a broker searches every pool, and reporting it as withheld would be a second
 *  definition of "offered" disagreeing with `availableHunts`. */
export function emptyBoardTally(
  searchFactions: readonly (string | null)[],
  repFor: (factionId: string | null) => number,
  active: readonly string[],
  completed: readonly string[],
  hpMax?: number,
): EmptyBoardTally {
  const tally: EmptyBoardTally = { standing: 0, reach: 0, active: 0, completed: 0 };
  for (const hunt of HUNTS) {
    let worst: HuntBlock | null = null;
    let openSomewhere = false;
    for (const fid of searchFactions) {
      const b = huntBlockReason(hunt, fid, repFor(fid), active, completed, hpMax);
      if (b === null) { openSomewhere = true; break; }
      // Prefer a substantive reason over "somebody else's business" — the same
      // preference the spoken refusal makes.
      if (worst === null || (worst.kind === 'faction' && b.kind !== 'faction')) worst = b;
    }
    if (openSomewhere || worst === null || worst.kind === 'faction') continue;
    tally[worst.kind] += 1;
  }
  return tally;
}

const PLURAL = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * ⚠ WHAT HE IS TOLD WHEN THE BOARD IS BARE. It owes him the same three things
 * every refusal in this game owes: what is happening, why, and what would change
 * it. Written as a trader talking, not as a tally — but every number in it is
 * real, which is the whole difference from the shrug it replaces.
 */
export function emptyBoardLine(vendorName: string, t: EmptyBoardTally): string {
  const parts: string[] = [];
  if (t.standing > 0) {
    parts.push(`${t.standing} ${PLURAL(t.standing, 'wants', 'want')} standing you have not earned yet`);
  }
  if (t.reach > 0) {
    parts.push(`${t.reach} ${PLURAL(t.reach, 'is', 'are')} further out than you can carry yourself`);
  }
  if (t.active > 0) {
    parts.push(`${t.active} ${PLURAL(t.active, 'is', 'are')} already on your slate`);
  }
  if (t.completed > 0) {
    parts.push(`${t.completed} ${PLURAL(t.completed, 'is', 'are')} finished`);
  }
  if (parts.length === 0) {
    // Nothing withheld and nothing offered — the pools genuinely have nothing
    // for this vendor's factions. Say THAT, rather than implying a gate.
    return `${vendorName} turns the empty board around. "Nothing posted here — not withheld, just nothing. `
      + `Try a vendor of another colour, or come back when the road has stirred something up."`;
  }
  const list = parts.length === 1
    ? parts[0]!
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  return `${vendorName} turns the board around so you can see it. "Nothing I can post you today — ${list}. `
    + `There is no limit on how many you carry; a second one simply waits its turn."`;
}
