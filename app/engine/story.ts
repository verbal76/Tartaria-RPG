// OTA-1041 — THE REASON YOU CAME DOWN (golem-line story feature, phase 1 of 3).
//
// Owner: "we have a ton of lore, a living civilization and economy, but no real
// story. Why is the player there, why are you going on the main quest. We need a
// scrolling text intro akin to the Skyrim criminal-in-a-cart intro... and we
// need to keep updating the player as they play."
//
// This module is the spine of that feature:
//   • Five STORY MOTIVES — the personal reason this character went below.
//     Picked at character creation (step 3), or dealt deterministically to
//     saves that predate the feature.
//   • The OPENING CRAWL — a paged, full-screen intro assembled from
//     app/data/story/intro.json: three universal pages (the flood, the
//     thousand years, the nine hearts), two pages for YOUR motive, one page
//     for the faction that took you in, and a closing page that hands the
//     player their first step.
//
// Phase 2 (chapter cards on every main-quest transition) and phase 3 (the
// motive drip + side-threads + per-motive endings) build on the motive id
// stored here. All authored text lives in the JSON so the writing can be
// revised without touching logic.

import introData from '../data/story/intro.json';

export type StoryMotiveId = 'debt' | 'missing' | 'exile' | 'calling' | 'record';

export interface StoryMotive {
  id: StoryMotiveId;
  /** Display title, e.g. "The Debt". */
  title: string;
  /** One-line pitch shown on the character-creation picker card. */
  blurb: string;
  /** The motive's two crawl pages. */
  pages: string[];
}

interface IntroData {
  universal: string[];
  motives: Record<string, { title: string; blurb: string; pages: string[] }>;
  factions: Record<string, string>;
  closing: string;
}

const data = introData as IntroData;

export const STORY_MOTIVE_IDS: readonly StoryMotiveId[] = [
  'debt',
  'missing',
  'exile',
  'calling',
  'record',
] as const;

/** All five motives, in picker order. Hard-fails at module load if the JSON
 *  ever drops one — a missing motive is authoring breakage, not a runtime
 *  condition to limp through. */
export function getStoryMotives(): StoryMotive[] {
  return STORY_MOTIVE_IDS.map((id) => {
    const m = data.motives[id];
    if (!m) throw new Error(`story/intro.json is missing motive '${id}'`);
    return { id, title: m.title, blurb: m.blurb, pages: m.pages };
  });
}

export function motiveById(id: string | undefined | null): StoryMotive {
  const motives = getStoryMotives();
  return motives.find((m) => m.id === id) ?? motives[0]!;
}

/** True when the string names a real motive. */
export function isStoryMotiveId(id: string | undefined | null): id is StoryMotiveId {
  return !!id && (STORY_MOTIVE_IDS as readonly string[]).includes(id);
}

/** Deterministic motive for characters that never picked one (saves that
 *  predate the feature, or callers that omit it — sims, old tests). Hashing
 *  the character's identity means the same save always resolves to the same
 *  motive, so the phase-2/3 story beats stay consistent across sessions. */
export function assignMotive(seed: string): StoryMotiveId {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return STORY_MOTIVE_IDS[h % STORY_MOTIVE_IDS.length]!;
}

/** Assemble the full opening crawl for a character: universal pages, the
 *  motive's pages, the faction paragraph, and the closing page. Unknown
 *  factions get no faction page rather than a wrong one. */
export function introPagesFor(motiveId: string | undefined, factionId: string | undefined): string[] {
  const motive = motiveById(motiveId);
  const pages: string[] = [...data.universal, ...motive.pages];
  const factionPage = factionId ? data.factions[factionId] : undefined;
  if (factionPage) pages.push(factionPage);
  pages.push(data.closing);
  return pages;
}

/** The faction paragraphs, exposed for tests (all 9 must exist). */
export function introFactionIds(): string[] {
  return Object.keys(data.factions);
}
