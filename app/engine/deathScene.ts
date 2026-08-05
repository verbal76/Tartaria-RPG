// OTA-1133 — THE DEATH SCENE. Owner: "The second my HP hits 0 for whatever
// reason there should be a crossfade between the game screen and a new screen
// like the intro screen that gives a brief description of my death lore style
// and how it ties to my reason for entering the mud world."
//
// The opening crawl (story.ts / intro.json) asks why you came down. Until now
// nothing ever answered it: death was three log lines and a 3.5-second pause
// on the exploration screen before the app dropped you back at the slot list.
// The run ended; the story of it did not close.
//
// So the ending is built from the SAME motive the opening was: an exile dies
// differently from a scholar, and the text says which. Three variants per
// motive, deterministic per death (see the seed below) so the same death never
// re-rolls its own words mid-read, but two deaths on the same character read
// differently.
//
// Pure module — no store, no React, no persistence. The overlay renders what
// this returns; the store only decides WHEN.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEATH = require('../data/story/death.json') as DeathData;

interface DeathData {
  opening: string[];
  motives: Record<string, string[]>;
  fallback: string[];
  closing: string[];
}

export interface DeathSceneInput {
  name: string;
  /** Where they fell — the scene's location name. */
  placeName: string;
  /** One of engine/story's five motive ids. Unknown / absent → the fallback
   *  pool, which reads as a life whose reasons were never written down. */
  storyMotive?: string;
  /** In-game days survived (hoursElapsed / 24, floored, minimum 1). */
  days: number;
  /** Lifetime kills. */
  kills: number;
}

export interface DeathScene {
  /** The name, alone, as the heading. */
  title: string;
  /** The three beats, in order: the fall, the motive's answer, the ledger. */
  paragraphs: string[];
  /** The Arbiter's last line, held apart from the body text. */
  closing: string;
  /** Which pool the middle paragraph came from — 'debt' / 'record' / … or
   *  'unwritten' when the character has no motive on file. Diagnostics and
   *  tests; never rendered. */
  motiveKey: string;
}

/** Deterministic small hash so one death keeps one set of words. Re-rendering
 *  the overlay (a re-mount, a rotation, a re-read) must not reshuffle the text
 *  under the player mid-sentence — which is exactly what Math.random() here
 *  would do. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickFrom(pool: readonly string[], seed: number, salt: number): string {
  if (pool.length === 0) return '';
  return pool[(seed + salt) % pool.length]!;
}

function fill(template: string, i: DeathSceneInput): string {
  return template
    .replace(/\{name\}/g, i.name)
    .replace(/\{place\}/g, i.placeName)
    .replace(/\{days\}/g, String(i.days))
    .replace(/\{kills\}/g, String(i.kills));
}

/** The ledger line — plain numbers, no adjectives. It is the one part of the
 *  screen that is purely factual, which is what makes the rest land. */
function ledgerLine(i: DeathSceneInput): string {
  const d = `${i.days} ${i.days === 1 ? 'day' : 'days'} below`;
  const k = i.kills === 0
    ? 'nothing put down'
    : `${i.kills} ${i.kills === 1 ? 'thing' : 'things'} put down`;
  return `${d}. ${k}. The buried world keeps the count.`;
}

/** Build the closing scene for a fallen character.
 *
 *  `deathId` should be unique per death (the death timestamp works) — it seeds
 *  which variant is drawn. Same id in, same words out, every render. */
export function buildDeathScene(input: DeathSceneInput, deathId: string): DeathScene {
  const seed = seedOf(`${input.name}|${input.storyMotive ?? ''}|${deathId}`);
  const motiveKey = input.storyMotive && DEATH.motives[input.storyMotive]
    ? input.storyMotive
    : 'unwritten';
  const body = motiveKey === 'unwritten'
    ? DEATH.fallback
    : DEATH.motives[motiveKey]!;
  return {
    title: input.name,
    paragraphs: [
      fill(pickFrom(DEATH.opening, seed, 0), input),
      fill(pickFrom(body, seed, 1), input),
      ledgerLine(input),
    ],
    closing: fill(pickFrom(DEATH.closing, seed, 2), input),
    motiveKey,
  };
}

/** Days-below from raw hours, floored, never less than 1 — a character who
 *  dies in the first hour still died on their first day, not their zeroth. */
export function daysBelow(hoursElapsed: number | undefined): number {
  return Math.max(1, Math.floor((hoursElapsed ?? 0) / 24) + 1);
}
