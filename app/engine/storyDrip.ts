// OTA-1044 — THE MOTIVE DRIP (golem-line story feature, phase 3 of 3).
//
// Owner: "we need to keep updating the player as they play." Phases 1-2 made
// the story speak at the big landmarks (the crawl, the chapter cards, the
// epilogue). This module fills the long quiet between them: five authored
// BEATS per motive, dripped into the feed at travel arrivals as game-hours
// accumulate and Cores land — a runner with the recalculated debt, a
// registry mark three years old, a warrant gone soft with mud-damp. Strict
// order, one-shot each (player.storyBeatsSeen), gated on hoursElapsed and
// coresRecovered so the drip paces itself to the run.
//
// THE MISSING SIDE-THREAD: for the 'missing' motive the drip is a trail, and
// the trail has an END. Once all five beats are seen and three Cores are
// carried, the next Lost Capital arrival answers the intro's own question —
// "the grave, the lie, or the thing that walks" — with one of three authored
// resolutions, dealt deterministically from the character's identity:
//   grave  — a bivouac, a cairn, and a message meant to be found.
//   lie    — they are ALIVE, and the letters were embroidery.
//   walker — a Hollowed wearing their face keeps a dead room; a boss fight
//            (spawned via the same scene shape the revenant events use), and
//            rest is yours to give at the defeat.
// Each resolution carries a keepsake item and its own EndingScreen epilogue
// override (the standard 'missing' epilogues assume the question is open).
//
// All authored text lives in app/data/story/drip.json ({name} is replaced
// with the missing person's dealt name) — same contract as intro/chapters.

import dripData from '../data/story/drip.json';
import { motiveById } from './story';
import { REVENANT_TRAIT } from './fallenRevenants';
import type { PlayerCharacter, Enemy } from './types';

export interface DripBeat {
  id: string;
  minHours: number;
  minCores: number;
  speaker: 'world' | 'arbiter';
  text: string;
}

interface ResolutionLine { speaker: 'world' | 'arbiter'; text: string }
interface MissingResolutionBlock {
  arrival: ResolutionLine[];
  defeat?: ResolutionLine[];
  keepsake: { name: string; description: string };
  epilogue: string;
}

interface DripData {
  beats: Record<string, DripBeat[]>;
  /** ⚠⚠ OTA-1246 — keyed by MOTIVE now, not just the one. Every motive has
   *  three authored answers; exactly one of the three carries `defeat` lines
   *  and is therefore the boss variant. */
  resolutions: Record<string, Record<string, MissingResolutionBlock>>;
}

const data = dripData as unknown as DripData;

export type MissingResolutionKind = 'grave' | 'lie' | 'walker';
export const MISSING_RESOLUTION_KINDS: readonly MissingResolutionKind[] = ['grave', 'lie', 'walker'] as const;

/** ⚠⚠ OTA-1246 — EVERY MOTIVE ENDS SOMEWHERE. The Missing's trail was the only
 *  reason-you-came-down with an in-world payoff scene; Debt, Exile, Calling and
 *  Record got five drip beats, two forks, and an epilogue paragraph — but never
 *  the moment where the thing you came for is finally in front of you. Owner's
 *  call after the arc read: bring the other four up to the standard the best one
 *  already sets. Same machine throughout — three authored answers per motive,
 *  dealt from the character's identity, one of the three a boss fight, each with
 *  a keepsake and its own EndingScreen override. */
export function resolutionKindsFor(motiveId: string | undefined): string[] {
  const motive = motiveById(motiveId);
  const blocks = data.resolutions[motive.id];
  if (!blocks) throw new Error(`story/drip.json is missing resolutions for motive '${motive.id}'`);
  return Object.keys(blocks);
}

/** The one answer per motive that is a FIGHT — the block carrying defeat lines.
 *  Derived, never hand-listed, so authoring a boss into a new answer is enough. */
export function bossKindFor(motiveId: string | undefined): string | null {
  const motive = motiveById(motiveId);
  const blocks = data.resolutions[motive.id] ?? {};
  return Object.keys(blocks).find((k) => (blocks[k]!.defeat?.length ?? 0) > 0) ?? null;
}

/** Trait marking the Missing walker boss; the kill path keys its closing
 *  beats + keepsake grant on this, the way isRevenant keys the Hollowed's. */
export const MISSING_WALKER_TRAIT = 'missing_walker';

export function isMissingWalker(enemy: { traits?: string[] } | null | undefined): boolean {
  return !!enemy?.traits?.includes(MISSING_WALKER_TRAIT);
}

/** ⚠⚠ OTA-1246 — the general marker. `motive_resolution:<motive>:<kind>` carries
 *  everything the defeat hook needs to close the thread and grant the keepsake,
 *  so the four new boss answers need no per-motive plumbing in the store. The
 *  Missing walker keeps MISSING_WALKER_TRAIT as well — its own tests, and any
 *  save mid-fight across the update, still read exactly as before. */
export const MOTIVE_BOSS_TRAIT_PREFIX = 'motive_resolution:';

export function isMotiveBoss(enemy: { traits?: readonly string[] } | null | undefined): boolean {
  return (enemy?.traits ?? []).some((t) => String(t).startsWith(MOTIVE_BOSS_TRAIT_PREFIX));
}

/** Recover which motive+answer a defeated boss closes, or null. */
export function motiveBossFromEnemy(
  enemy: { traits?: readonly string[] } | null | undefined,
): { motive: string; kind: string } | null {
  const t = (enemy?.traits ?? []).map(String).find((x) => x.startsWith(MOTIVE_BOSS_TRAIT_PREFIX));
  if (!t) return null;
  const [motive, kind] = t.slice(MOTIVE_BOSS_TRAIT_PREFIX.length).split(':');
  return motive && kind ? { motive, kind } : null;
}

/** Per-motive identity for the boss answer. The Missing walker's row reproduces
 *  its original enemy verbatim so that fight is untouched. */
const BOSS_IDENTITY: Record<string, {
  name: (figure: string) => string;
  type: string;
  attack: string;
  damage: string;
  revenant: boolean;
  flavor: (figure: string) => string;
}> = {
  missing: {
    name: (f) => `${f}, Hollowed`,
    type: 'Hollowed Revenant', attack: 'Remembered Blade', damage: '2d8', revenant: true,
    flavor: (f) => `Three years below, and the mud kept everything except what mattered. It sets its feet the way ${f} did. It says your name the way a door says it.`,
  },
  debt: {
    name: (f) => `The ${f} Collector`,
    type: 'Hollowed Revenant', attack: 'Ledger-Weighted Cane', damage: '2d8', revenant: true,
    flavor: (f) => `A good coat gone to silt, a satchel still strapped correctly, and a route with no end on it. The ${f} house sent him down and never sent for him back. He is still working.`,
  },
  exile: {
    name: (f) => `Magistrate ${f}, Hollowed`,
    type: 'Hollowed Revenant', attack: 'Rail-Iron Gavel', damage: '2d8', revenant: true,
    flavor: (f) => `The collar of office over three years of mud. ${f} rebuilt a court down here out of benches and salvaged rail, and holds session for an audience of nobody, on a docket of one.`,
  },
  calling: {
    name: () => 'The Answering',
    type: 'Aetheric Horror', attack: 'Knitting Reach', damage: '2d8', revenant: false,
    flavor: () => `Plate, cable and bone-white Aetherstone knitted into a shape walking toward the idea of a body. It called until something came. It wants the part of you that could hear it.`,
  },
  record: {
    name: () => 'The Censor',
    type: 'Hollowed Revenant', attack: 'Unwriting Hands', damage: '2d8', revenant: true,
    flavor: () => `An archivist worn down to the function. It takes the words off a page and stacks the blank sheet neatly, and it has been doing so for a hundred years. It is looking at your satchel.`,
  },
};

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** The character's identity seed — same formula everywhere so the person,
 *  the resolution, and the beats all agree across sessions. */
export function storySeed(p: Pick<PlayerCharacter, 'name' | 'raceId' | 'factionId'>): string {
  return `${p.name}|${p.raceId}|${p.factionId}`;
}

// The one who went down before you. Dealt from the identity seed so the
// name is stable across sessions but different across characters. Neutral
// names — the intro never fixes who they were to you, and neither do we.
const MISSING_NAMES = ['Maren', 'Joska', 'Edda', 'Tam', 'Veyra', 'Coll', 'Isen', 'Rhoda'] as const;

/** OTA-1246 — the figure at the centre of each motive's ending, dealt the same
 *  way the missing person always was: the creditor house, the magistrate who
 *  signed, the one who heard the hum first, the other chronicler. Stable per
 *  character, different across characters, filled into {name} in the authored
 *  text exactly as the Missing's name always has been. */
const MOTIVE_FIGURE_NAMES: Record<string, readonly string[]> = {
  missing: MISSING_NAMES,
  debt: ['Halbrecht', 'Sarn', 'Oduva', 'Kestrel', 'Vantel', 'Brill', 'Marrow', 'Sedge'],
  exile: ['Orsic', 'Vell', 'Kadran', 'Thessa', 'Lorn', 'Amberg', 'Riss', 'Dovin'],
  calling: ['Sennet', 'Aurel', 'Bosk', 'Tarn', 'Yeva', 'Idris', 'Panu', 'Rell'],
  record: ['Wessel', 'Anka', 'Corrin', 'Delph', 'Ilva', 'Roque', 'Sabin', 'Tova'],
};

export function missingPersonName(seed: string): string {
  return MISSING_NAMES[hash(`${seed}|person`) % MISSING_NAMES.length]!;
}

/** The dealt figure name for any motive. Missing keeps its original formula
 *  verbatim, so every existing character's person is unchanged. */
export function motiveFigureName(motiveId: string | undefined, seed: string): string {
  const motive = motiveById(motiveId);
  if (motive.id === 'missing') return missingPersonName(seed);
  const pool = MOTIVE_FIGURE_NAMES[motive.id] ?? MISSING_NAMES;
  return pool[hash(`${seed}|figure|${motive.id}`) % pool.length]!;
}

/** Which of the three answers this character's trail ends in. */
export function missingResolutionFor(seed: string): MissingResolutionKind {
  return MISSING_RESOLUTION_KINDS[hash(`${seed}|resolution`) % MISSING_RESOLUTION_KINDS.length]!;
}

/** Which answer THIS character gets, for any motive. Missing keeps its original
 *  formula so no existing character's ending changes under them. */
export function resolutionKindFor(motiveId: string | undefined, seed: string): string {
  const motive = motiveById(motiveId);
  if (motive.id === 'missing') return missingResolutionFor(seed);
  const kinds = resolutionKindsFor(motive.id);
  return kinds[hash(`${seed}|resolution|${motive.id}`) % kinds.length]!;
}

function fill(text: string, personName: string): string {
  return text.split('{name}').join(personName);
}

/** All beats for a motive, in drip order. Hard-fails if the JSON drops a
 *  motive — a missing pool is authoring breakage (same contract as story.ts). */
export function beatsForMotive(motiveId: string | undefined): DripBeat[] {
  const motive = motiveById(motiveId);
  const pool = data.beats[motive.id];
  if (!pool || pool.length === 0) throw new Error(`story/drip.json is missing beats for motive '${motive.id}'`);
  return pool;
}

/** The next beat DUE for this character, or null. STRICT order: only the
 *  first unseen beat is ever considered — a later beat never jumps the
 *  queue, so the thread always reads in sequence. */
export function nextDripBeat(
  p: Pick<PlayerCharacter, 'name' | 'raceId' | 'factionId' | 'storyMotive' | 'storyBeatsSeen' | 'hoursElapsed' | 'mainQuest'>,
): DripBeat | null {
  const seen = p.storyBeatsSeen ?? [];
  const pool = beatsForMotive(p.storyMotive);
  const next = pool.find((b) => !seen.includes(b.id));
  if (!next) return null;
  const hours = p.hoursElapsed ?? 0;
  const cores = p.mainQuest?.coresRecovered?.length ?? 0;
  if (hours < next.minHours || cores < next.minCores) return null;
  const person = missingPersonName(storySeed(p));
  return { ...next, text: fill(next.text, person) };
}

/** True when the Missing trail is ready to END: motive is 'missing', all
 *  five trail beats seen, three Cores carried, not yet resolved. The caller
 *  fires it on the next Lost Capital arrival. */
export function missingResolutionDue(
  p: Pick<PlayerCharacter, 'storyMotive' | 'storyBeatsSeen' | 'missingResolved' | 'mainQuest'>,
): boolean {
  if (p.storyMotive !== 'missing') return false;
  return resolutionDue(p);
}

/** ⚠⚠ OTA-1246 — the general gate, for every motive: all five of this motive's
 *  drip beats seen, three Cores carried, not yet resolved. The caller fires it
 *  on the next Lost Capital arrival. Identical pacing to the Missing trail —
 *  the reason you came down answers itself in the last third of the run, once
 *  the world has had time to make the question matter. */
export function resolutionDue(
  p: Pick<PlayerCharacter, 'storyMotive' | 'storyBeatsSeen' | 'missingResolved' | 'motiveResolved' | 'mainQuest'>,
): boolean {
  if (resolvedKindOf(p)) return false;
  const seen = p.storyBeatsSeen ?? [];
  const pool = beatsForMotive(p.storyMotive);
  if (!pool.every((b) => seen.includes(b.id))) return false;
  return (p.mainQuest?.coresRecovered?.length ?? 0) >= 3;
}

/** What this character's motive resolved to, if it has. `missingResolved` is the
 *  ORIGINAL field and stays authoritative for the Missing motive — a save that
 *  finished that trail before OTA-1246 reads correctly with no migration. */
export function resolvedKindOf(
  p: Pick<PlayerCharacter, 'storyMotive' | 'missingResolved' | 'motiveResolved'>,
): string | null {
  if (p.storyMotive === 'missing') return p.missingResolved ?? p.motiveResolved ?? null;
  return p.motiveResolved ?? null;
}

/** The authored block for a resolution, with {name} filled in. */
export function missingResolution(kind: MissingResolutionKind, personName: string): MissingResolutionBlock {
  return resolutionBlock('missing', kind, personName);
}

/** The authored block for any motive's answer, with {name} filled in. */
export function resolutionBlock(motiveId: string | undefined, kind: string, figureName: string): MissingResolutionBlock {
  const motive = motiveById(motiveId);
  const block = data.resolutions[motive.id]?.[kind];
  if (!block) throw new Error(`story/drip.json is missing resolution '${motive.id}/${kind}'`);
  const personName = figureName;
  return {
    arrival: block.arrival.map((l) => ({ ...l, text: fill(l.text, personName) })),
    defeat: block.defeat?.map((l) => ({ ...l, text: fill(l.text, personName) })),
    // ⚠ OTA-1246 — the KEEPSAKE gets filled too. It never was: the original
    // three Missing keepsakes happened to carry no {name}, so the omission was
    // invisible until an authored keepsake used one — at which point the raw
    // token would have shipped inside an item the player keeps forever. The
    // audit in ota1246 pins every field of every block against the token.
    keepsake: {
      name: fill(block.keepsake.name, personName),
      description: fill(block.keepsake.description, personName),
    },
    epilogue: fill(block.epilogue, personName),
  };
}

/** EndingScreen override: once the thread resolved, the standard 'missing'
 *  epilogues (which assume the question is still open) give way to the
 *  resolution's own closing. Null when not applicable. */
export function missingResolvedEpilogue(
  p: Pick<PlayerCharacter, 'name' | 'raceId' | 'factionId' | 'storyMotive' | 'missingResolved' | 'motiveResolved'>,
): string | null {
  return resolvedEpilogue(p);
}

/** ⚠ OTA-1246 — EndingScreen override for EVERY motive: once the reason you came
 *  down has been answered in the world, the standard epilogue (which assumes the
 *  question is still open) gives way to the resolution's own closing. Null when
 *  the character never reached their answer — those still read the open-question
 *  epilogue, which remains true for them. */
export function resolvedEpilogue(
  p: Pick<PlayerCharacter, 'name' | 'raceId' | 'factionId' | 'storyMotive' | 'missingResolved' | 'motiveResolved'>,
): string | null {
  const kind = resolvedKindOf(p);
  if (!kind) return null;
  const motive = motiveById(p.storyMotive);
  const block = data.resolutions[motive.id]?.[kind];
  if (!block) return null;
  return fill(block.epilogue, motiveFigureName(motive.id, storySeed(p)));
}

/** The walker itself — banded off the player's frame the same way the
 *  Hollowed revenants are (fallenRevenants.revenantFromFallen), so the
 *  fight lands as a boss without outscaling the run. No loot table: the
 *  keepsake is granted by the defeat hook, guaranteed, never a dice roll. */
export function missingWalkerEnemy(playerHpMax: number, personName: string): Enemy {
  return resolutionBossEnemy('missing', playerHpMax, personName);
}

/** The boss answer for any motive, banded off the player's frame the same way
 *  the Hollowed revenants are, so the fight lands as a boss without outscaling
 *  the run. No loot table anywhere: the keepsake is granted by the defeat hook,
 *  guaranteed, never a dice roll. */
export function resolutionBossEnemy(motiveId: string | undefined, playerHpMax: number, figureName: string): Enemy {
  const motive = motiveById(motiveId);
  const kind = bossKindFor(motive.id);
  const id = BOSS_IDENTITY[motive.id] ?? BOSS_IDENTITY.missing!;
  const hp = Math.max(60, Math.min(Math.round(Math.max(40, playerHpMax) * 2.5), 140));
  const traits: string[] = [`${MOTIVE_BOSS_TRAIT_PREFIX}${motive.id}:${kind ?? ''}`, 'boss'];
  if (id.revenant) traits.push(REVENANT_TRAIT);
  // The Missing keeps its original marker too — its own suite keys on it.
  if (motive.id === 'missing') traits.unshift(MISSING_WALKER_TRAIT);
  return {
    name: id.name(figureName),
    type: id.type,
    abilityPoint: 'Strength 6',
    attack: id.attack,
    damage: id.damage,
    hp,
    rarity: 'Legendary',
    loot: [],
    boss: true,
    traits,
    flavor: id.flavor(figureName),
  } as Enemy;
}
