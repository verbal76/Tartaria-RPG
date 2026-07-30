// OTA-1021 — THE MOTIVE DRIP (golem-line story feature, phase 3 of 3).
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
  missingResolution: Record<string, MissingResolutionBlock>;
}

const data = dripData as unknown as DripData;

export type MissingResolutionKind = 'grave' | 'lie' | 'walker';
export const MISSING_RESOLUTION_KINDS: readonly MissingResolutionKind[] = ['grave', 'lie', 'walker'] as const;

/** Trait marking the Missing walker boss; the kill path keys its closing
 *  beats + keepsake grant on this, the way isRevenant keys the Hollowed's. */
export const MISSING_WALKER_TRAIT = 'missing_walker';

export function isMissingWalker(enemy: { traits?: string[] } | null | undefined): boolean {
  return !!enemy?.traits?.includes(MISSING_WALKER_TRAIT);
}

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

export function missingPersonName(seed: string): string {
  return MISSING_NAMES[hash(`${seed}|person`) % MISSING_NAMES.length]!;
}

/** Which of the three answers this character's trail ends in. */
export function missingResolutionFor(seed: string): MissingResolutionKind {
  return MISSING_RESOLUTION_KINDS[hash(`${seed}|resolution`) % MISSING_RESOLUTION_KINDS.length]!;
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
  if (p.missingResolved) return false;
  const seen = p.storyBeatsSeen ?? [];
  const pool = data.beats.missing ?? [];
  if (!pool.every((b) => seen.includes(b.id))) return false;
  return (p.mainQuest?.coresRecovered?.length ?? 0) >= 3;
}

/** The authored block for a resolution, with {name} filled in. */
export function missingResolution(kind: MissingResolutionKind, personName: string): MissingResolutionBlock {
  const block = data.missingResolution[kind];
  if (!block) throw new Error(`story/drip.json is missing resolution '${kind}'`);
  return {
    arrival: block.arrival.map((l) => ({ ...l, text: fill(l.text, personName) })),
    defeat: block.defeat?.map((l) => ({ ...l, text: fill(l.text, personName) })),
    keepsake: { ...block.keepsake },
    epilogue: fill(block.epilogue, personName),
  };
}

/** EndingScreen override: once the thread resolved, the standard 'missing'
 *  epilogues (which assume the question is still open) give way to the
 *  resolution's own closing. Null when not applicable. */
export function missingResolvedEpilogue(
  p: Pick<PlayerCharacter, 'name' | 'raceId' | 'factionId' | 'storyMotive' | 'missingResolved'>,
): string | null {
  if (p.storyMotive !== 'missing' || !p.missingResolved) return null;
  const block = data.missingResolution[p.missingResolved];
  if (!block) return null;
  return fill(block.epilogue, missingPersonName(storySeed(p)));
}

/** The walker itself — banded off the player's frame the same way the
 *  Hollowed revenants are (fallenRevenants.revenantFromFallen), so the
 *  fight lands as a boss without outscaling the run. No loot table: the
 *  keepsake is granted by the defeat hook, guaranteed, never a dice roll. */
export function missingWalkerEnemy(playerHpMax: number, personName: string): Enemy {
  const hp = Math.max(60, Math.min(Math.round(Math.max(40, playerHpMax) * 2.5), 140));
  return {
    name: `${personName}, Hollowed`,
    type: 'Hollowed Revenant',
    abilityPoint: 'Strength 6',
    attack: 'Remembered Blade',
    damage: '2d8',
    hp,
    rarity: 'Legendary',
    loot: [],
    boss: true,
    // Carries REVENANT_TRAIT too: it IS a Hollowed revenant, so the
    // revenant rules apply (no reverence dock for the mercy, no talk-down)
    // — and every activeRevenant-dependent revenant block no-ops safely
    // because this walker never sets worldMemory.activeRevenant.
    traits: [MISSING_WALKER_TRAIT, REVENANT_TRAIT, 'boss'],
    flavor: `Three years below, and the mud kept everything except what mattered. It sets its feet the way ${personName} did. It says your name the way a door says it.`,
  } as Enemy;
}
